# Plan d'implémentation — suite de l'audit (hors paiement)

> Phasé par priorité. Chaque item : **Approche** · **Test** (🧪 auto Jest / 🔬 éphémère SQL / 🖐️ manuel) · **Conformité**.
> Règle : 1 item = 1 commit, `npx tsc --noEmit` + `npx jest` verts avant de passer au suivant.

---

## PHASE 0 — Quick wins serveur + config (aucun risque, immédiat, pas de rebuild sauf app.json)

### 0.1 Nettoyer `app.json`
- **Approche** : retirer les doublons de `android.permissions` + `RECORD_AUDIO` (non utilisé, `recordAudioAndroid:false`). Ajouter `ios.buildNumber:"1"`, `android.versionCode:1`. (Pas besoin de `NSMicrophone` une fois RECORD_AUDIO retiré.)
- **Test** 🖐️ : `npx expo config --type public` → vérifier permissions = `[CAMERA, VIBRATE]`, buildNumber/versionCode présents. (rebuild requis pour effet natif)
- **Conformité** : Google Play data safety, Apple 2.1.

### 0.2 Durcissement DB (migrations)
- **Approche** : 
  - `REVOKE EXECUTE ON FUNCTION cosme_check.cleanup_* FROM anon, authenticated;`
  - `ALTER TABLE rate_limits / idempotency / error_log ENABLE ROW LEVEL SECURITY;` (deny-all, aucune policy → server-role only inchangé).
  - `CREATE INDEX CONCURRENTLY ON cosme_check.routine_items(analysis_id);`
  - `ALTER FUNCTION … SET search_path = cosme_check, public;` pour les 7 fonctions flaggées.
  - (optionnel) déplacer `pg_trgm` hors `public`.
- **Test** 🔬 : `SELECT proname,proacl FROM pg_proc WHERE proname LIKE 'cleanup_%'` (plus d'anon/authenticated) ; `get_advisors(security)` → les 3 ERROR + WARN cleanup disparaissent ; `EXPLAIN` sur une requête routine→analyse utilise l'index.
- **Conformité** : advisors Supabase au vert.

### 0.3 Auth settings (dashboard, manuel)
- **Approche** : activer **Leaked password protection** (HaveIBeenPwned) ; passer **Auth DB connections** en % (Settings → Auth).
- **Test** 🖐️ : `get_advisors` ne liste plus `auth_leaked_password_protection`.

---

## PHASE 1 — Stabilité & observabilité prod (avant GA)

### 1.1 Error Boundary racine
- **Approche** : composant classe `components/shared/AppErrorBoundary.tsx` (`componentDidCatch` → log + écran de repli « Une erreur est survenue, réessaie » + bouton reset). Monter autour de `RootNavigator` dans `app/_layout.tsx`. (expo-router expose aussi `ErrorBoundary` par route — option complémentaire.)
- **Test** 🧪 : test Jest d'un composant qui throw → la boundary rend le fallback (react-test-renderer). 🖐️ : forcer un throw dev → pas d'écran blanc.
- **Conformité** : robustesse (évite le crash type ObservationsCard).

### 1.2 Crash reporting (Sentry)
- **Approche** : `npx expo install @sentry/react-native` (ou sentry-expo) ; init dans `_layout.tsx` ; wrap l'Error Boundary pour `captureException`. DSN en variable EAS (pas dans le bundle public si possible, sinon `EXPO_PUBLIC_SENTRY_DSN` = acceptable car DSN public). Désactiver en `__DEV__`.
- **Test** 🖐️ : déclencher une erreur test → apparaît dans Sentry. 🧪 : un wrapper `reportError()` testable (no-op si pas de DSN).
- **Conformité** : ops/debug prod.

### 1.3 Cleanup au `signOut`
- **Approche** : dans `handleSignOut` (profil) / `useAuth.signOut`, après `supabase.auth.signOut()` : `queryClient.clear()` + purge AsyncStorage des clés `cosmecheck:*` (analyses, ai-cache, productImage, react-query-cache) — fonction `clearUserScopedCaches()` dans `lib/storage/`. NE PAS toucher au flag preonboarding (device-level).
- **Test** 🧪 : test de `clearUserScopedCaches()` avec AsyncStorage mocké → seules les bonnes clés sont supprimées, `preonboarding_done` conservé.
- **Conformité** : RGPD / vie privée (pas de fuite inter-comptes).

### 1.4 Validation env au boot
- **Approche** : `lib/config/env.ts` qui valide `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` au démarrage et lève une erreur claire (déjà partiellement dans client.ts). Centraliser.
- **Test** 🧪 : test pur — absent → throw avec message FR explicite.

---

## PHASE 2 — Bloqueurs conformité stores

### 2.1 🍎 Sign in with Apple (iOS) — voir « Guide IDs Apple » en bas
- **Approche** :
  1. `npx expo install expo-apple-authentication`.
  2. `app.json` : plugin `expo-apple-authentication` + `ios.usesAppleSignIn: true`.
  3. `lib/auth/apple.ts` : `AppleAuthentication.signInAsync({requestedScopes:[FULL_NAME,EMAIL]})` → `supabase.auth.signInWithIdToken({ provider:'apple', token: identityToken, nonce })`. Stamp `signup_platform:'mobile'` (via metadata si premier login). Gérer `ERR_REQUEST_CANCELED`.
  4. `components/auth/AppleAuthButton.tsx` (style officiel Apple) + l'afficher **uniquement sur iOS** (`Platform.OS==='ios' && AppleAuthentication.isAvailableAsync()`) dans sign-in/sign-up.
- **Test** 🖐️ : **toi** — uniquement sur **device iOS réel ou TestFlight** (ne marche PAS sur Android/Expo Go). Vérifier : 1er login crée le compte + profil, 2e login le retrouve, nom/email récupérés au 1er consentement seulement.
- **Conformité** : Apple §4.8 (bloqueur iOS).

### 2.2 Suppression de compte réelle (Edge Function `delete-account`)
- **Approche** : Edge Function gated (Bearer) qui, en **service-role**, supprime en cascade pour `auth.uid()` : `routine_items`, `coherence_analyses`, `analyses`, `user_credits`/crédits, `user_profiles`, puis `auth.admin.deleteUser(uid)`. Transaction + log dans `admin_audit_log`. Côté app : remplacer le `mailto` par l'appel + confirmation forte + signOut.
- **Test** 🔬 éphémère : sur un **compte de test jetable**, appeler la fonction puis `SELECT count(*)` sur chaque table = 0 + user absent de `auth.users`. (Faire sur compte test, pas un vrai.) 🧪 : test de la logique de cascade (ordre des deletes) si extraite.
- **Conformité** : Apple §5.1.1 + RGPD art. 17 (bloqueur).

### 2.3 Consentement explicite (RGPD données sensibles)
- **Approche** : checkbox obligatoire à l'inscription « J'accepte la Politique de confidentialité » (lien) + mention « allergies = données sensibles » près du champ allergies.
- **Test** 🧪 : validation form (submit désactivé sans checkbox). 🖐️ : visuel.
- **Conformité** : RGPD art. 6.1.a / 9.

---

## PHASE 3 — Robustesse données & UX

### 3.1 Feedback d'erreur sur mutations
- **Approche** : système de **toast** léger (`components/shared/Toast` + provider) ; ajouter `onError` aux mutations routine (add/remove/frequency), history (rename/delete), profil → toast « Échec, réessaie ». Profil : afficher l'erreur + bouton réessayer.
- **Test** 🧪 : hook de toast testable (file d'attente) ; 🖐️ : couper le réseau → toast.

### 3.2 Détection offline
- **Approche** : `@react-native-community/netinfo` → bannière « Hors ligne » globale ; désactiver les CTA réseau.
- **Test** 🖐️ : mode avion → bannière + CTAs grisés.

### 3.3 Timeout Compare + reprise pending-INCI
- **Approche** : `Promise.race` + timeout 12 s sur compare (état erreur). Au boot du scan, si `getPendingInci()` existe → proposer « Reprendre la dernière analyse ? ».
- **Test** 🧪 : util timeout testable ; logique resume testable (AsyncStorage mocké).

### 3.4 Expiration token mid-session
- **Approche** : sur 401 des Edge Functions, tenter `supabase.auth.refreshSession()` puis retry 1×, sinon rediriger login.
- **Test** 🖐️ : invalider la session → action → re-auth propre.

---

## PHASE 4 — Sécurité Edge Functions (durcissement)

### 4.1 Unifier le guard SSRF
- **Approche** : extraire `validateUserUrl()` d'`ecommerce-scrape` dans `_shared/ssrfGuard.ts` ; l'utiliser dans `deep-fetch` ET `promesse-fetch-description`.
- **Test** 🧪 : tests purs du guard (localhost, 169.254.169.254, 10/172.16/192.168, IPv6 ::1/fc00, user:pass@host → rejetés ; URL publique → ok).

### 4.2 Rate-limit + (option) auth sur endpoints LLM publics
- **Approche** : `deep-fetch`/`ecommerce-scrape` → resserrer le rate-limit IP + envisager Bearer requis (ils sont appelés depuis l'app authentifiée de toute façon).
- **Test** 🔬 : boucle d'appels > limite → 429.

### 4.3 Sanitization prompt + timeouts fetch
- **Approche** : neutraliser les sauts de ligne / délimiteurs dans `candidateName/brand/productType/INCI` avant injection prompt ; `AbortSignal.timeout()` sur les fetch de `webSearchComplete`.
- **Test** 🧪 : test du sanitizer (un input « ignore previous instructions… » est neutralisé/borné).

---

## PHASE 5 — Accessibilité (WCAG / stores)
- **Approche** : `accessibilityLabel`/`accessibilityRole` sur tous les `Pressable`/icônes-boutons clés (audit ~70 % manquants) ; vérifier contrastes `inkLight` (≥ 4.5:1) ; `BackHandler` Android sur modales/flux ; tester gros texte.
- **Test** 🖐️ : VoiceOver/TalkBack sur les écrans clés ; 🧪 : lint a11y si on ajoute `eslint-plugin-react-native-a11y`.

---

## PHASE 6 — Qualité / dette
- **6.1 Types Supabase** : `generate_typescript_types` (MCP) → remplacer les `as never`/`as any` sur les RPC. 🧪 tsc vert sans cast.
- **6.2 Tests critiques manquants** : AuthGuard (routing onboarding/dashboard), `analyser` scoring, profil save/merge, `completeOnboarding`. 🧪 Jest (extraire la logique pure des écrans).
- **6.3 Découpe** `ProductSearchMode` (1187 l.) et `AnalysisResultPanel` (643 l.) en sous-composants.
- **6.4** Cap d'entrées sur `aiCache` (LRU comme productImageCache). 🧪 test purge.
- **6.5** Bump deps Expo quand fenêtre dispo (non urgent).

---

## 🍎 Guide IDs Apple Sign-In (où chercher — developer.apple.com)
Compte **Apple Developer payant requis** ($99/an). Callback Supabase (déjà affiché) : `https://rogesnduejmqpxolhbif.supabase.co/auth/v1/callback`.

1. **Team ID** (10 car.) : Account → **Membership** (en haut à droite).
2. **App ID** : Certificates, IDs & Profiles → **Identifiers** → ton app `com.cosmecheck.app` → coche **Sign In with Apple**.
3. **Service ID** (UNIQUEMENT pour le flux web) : Identifiers → **Services IDs** → créer (ex. `com.cosmecheck.signin`) → configurer Sign In with Apple → Domain `rogesnduejmqpxolhbif.supabase.co` + Return URL = le Callback ci-dessus.
4. **Key + Key ID** (pour le secret OAuth web) : **Keys** → créer une clé avec **Sign In with Apple** → télécharger le **.p8** (1 seule fois) + noter le **Key ID** (10 car.).

**Dans l'écran Supabase (capture) :**
- **Client IDs** : pour le **mobile natif** (Expo) → mets le **Bundle ID** `com.cosmecheck.app`. Si tu actives aussi Apple sur le **web**, ajoute le **Service ID** (séparé par virgule).
- **Secret Key (for OAuth)** : nécessaire **seulement pour le web** (généré depuis .p8 + Team ID + Key ID + Service ID ; expire tous les 6 mois). **Pour le mobile natif seul, pas obligatoire** (Supabase valide l'`identityToken` via le Bundle ID des Client IDs).
- **Allow users without an email** : laisse OFF (on veut l'email).

➡️ **Mobile-only minimal** : enable + Client IDs = `com.cosmecheck.app` suffit. Le `.p8`/Service ID/Secret ne servent que si tu veux Apple Sign-In sur cosme-check.com aussi.

⚠️ Apple Sign-In ne se teste **que sur iOS réel / TestFlight** (pas Android, pas Expo Go).
