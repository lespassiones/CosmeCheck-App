# CosmeCheck — Guide de déploiement Google Play Store

**Mis à jour** : 8 juillet 2026
**État** : Blocages code résolus. Reste config console + secrets (côté toi).

> Ce guide ne concerne QUE la publication Android (Play Store). L'app web
> `cosme-check.com` partage la base Supabase mais n'est pas impactée par ce build.
> Apple Sign-In = bloqueur iOS uniquement, hors périmètre Play Store.

---

## ✅ Résolu côté code (fait, testé)

| Point | Détail | Preuve |
|---|---|---|
| **Signature release** | `android/app/build.gradle` : `signingConfigs.release` lit `android/keystore.properties` (gitignoré) ; fallback debug si absent. Keystore d'upload généré : `android/app/cosmecheck-upload.keystore`. | `gradlew signingReport` → variant `release` = config `release`, alias `cosmecheck-upload`. |
| **minSdk 26** | Figé à `minSdkVersion 26` + `targetSdkVersion 35` dans `build.gradle` (le défaut Expo SDK 54 était **24**). `app.json android.minSdkVersion` seul ne s'appliquait PAS. | — |
| **expo-build-properties** | Plugin ajouté à `app.json` (min26/compile35/target35) = source de vérité durable si `expo prebuild` est relancé un jour. | `expo config` OK. |
| RevenueCat | SDK + boot + login + paywall + webhook `revenucat-webhook` (flip tier) : déjà câblés. | Code présent. |
| Sentry runtime | `initSentry()` au boot, DSN EU en dur, désactivé en dev. | `lib/reporting/report.ts`. |
| Permissions | CAMERA, VIBRATE, POST_NOTIFICATIONS uniquement (aucune dangereuse). | `app.json`. |
| Icônes | adaptive-icon + splash + notification-icon présents. | `assets/images/`. |
| patch-package | patch whatwg-fetch (crash "Response status 0") appliqué au postinstall. | — |

### ⚠️ À savoir sur le dossier `android/`
Le dossier `android/` est **gitignoré** (non versionné). Les edits gradle ci-dessus,
le keystore et `keystore.properties` vivent **uniquement en local**. Conséquences :
- **Sauvegarde le keystore** (`cosmecheck-upload.keystore`) + son mot de passe **hors du repo**
  (gestionnaire de mots de passe / cloud privé). Sans lui, pas de re-signature possible
  avec la même clé (récupérable via Play App Signing, mais nécessite de ré-enregistrer le SHA).
- Si tu relances un jour `expo prebuild --clean`, le dossier `android/` est régénéré :
  `expo-build-properties` réapplique min26/target35, mais **le bloc signing et le keystore
  sont à re-déposer** (recopier `keystore.properties` + le `.keystore`). Le plus simple :
  ne pas régénérer `android/`, c'est ton artefact local persistant (comme tes fixes Play précédents).

---

## 🔴 Reste à faire — CÔTÉ TOI (secrets / dashboards, je ne peux pas)

### 1. RevenueCat — clé publique Android + produits
Sans la clé `goog_…`, le SDK ne s'initialise pas (garde anti-crash) → aucun achat en prod.
1. RevenueCat Dashboard → Project **Cosme Check** → API Keys → copie la clé publique **Google Play** (`goog_…`).
2. Ajoute-la dans `.env` (clés publiques, déjà committé) :
   ```
   EXPO_PUBLIC_REVENUCAT_ANDROID_KEY=goog_xxxxxxxxxxxxxxxx
   ```
3. Dashboard RC → Entitlements → vérifier qu'un entitlement **`premium`** existe (matche `user_profiles.tier`).
4. Créer les produits d'abonnement dans **Play Console** (mensuel/annuel + essai 3j), les rattacher à l'Offering `current` et à l'entitlement `premium`.
5. Dashboard RC → Webhooks → ajouter :
   `https://rogesnduejmqpxolhbif.supabase.co/functions/v1/revenucat-webhook`
   Events : `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`.

### 2. SHA-256 du keystore d'upload → Google Cloud (OAuth Google)
Sinon Google Sign-In casse dès que l'app est signée avec la clé release.
- **SHA-256** (clé d'upload générée) :
  `38:F5:BB:44:9A:C9:BD:D6:2F:A2:74:B3:4E:8B:43:78:BE:9D:F2:D4:12:8A:CE:39:0E:8E:44:36:1D:0E:38:CE`
- **SHA-1** : `4C:E6:02:E4:DD:41:01:54:34:CB:CC:A5:5E:FD:CF:90:70:1D:27:D4`
- À enregistrer dans **Google Cloud Console** → OAuth client Android (package `com.cosmecheck.app`).
- ⚠️ Si tu actives **Play App Signing** (par défaut), Google **re-signe** l'app avec SA propre clé.
  Récupère aussi le **SHA-256 de la clé d'app** dans Play Console → *Configuration → Intégrité de l'app*
  et enregistre-le AUSSI dans Google Cloud (sinon OAuth casse sur les installs Play Store).

### 3. Sentry — slugs pour l'upload des source maps
Le runtime capture déjà (DSN OK). Sans les slugs, les stack traces prod sont illisibles (non-bloquant).
- `app.json` plugin `@sentry/react-native/expo` : remplacer
  `REMPLACER_PAR_TON_ORG_SLUG` et `REMPLACER_PAR_TON_PROJECT_SLUG` par tes vrais slugs
  (Sentry → Settings → org slug ; projet → slug).
- Fournir `SENTRY_AUTH_TOKEN` au build (variable d'env) pour l'upload.

### 4. Play Console (config, pas de code)
- **Privacy Policy** : confirmer que `https://cosme-check.com/privacy` est **publiquement accessible** (prérequis fiche store + Data Safety).
- **Data Safety** : remplir le formulaire (données collectées : email/auth, photos scannées, aucune localisation).
- **Content rating** : questionnaire → app éducative cosmétiques, non-médicale → 3+/7+.
- **Catégorie** : Beauté ou Lifestyle (PAS Médical).
- **play-service-account.json** : requis seulement si `eas submit`. Sinon upload manuel de l'AAB.

---

## 🏗️ Build de publication (ton workflow local)

> Rappel projet : **ne pas laisser l'agent auto-builder l'APK**. Étapes manuelles ci-dessous.

```bash
# AAB signé pour Play Store (recommandé) :
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab

# ou APK signé (test device) :
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
Vérifier la signature :
```bash
keytool -printcert -jarfile app-release.aab | grep -A1 SHA256
# doit matcher le SHA-256 ci-dessus (alias cosmecheck-upload)
```

**Test achats sandbox** : Play Console → Testing → Internal testers → ajoute ton compte Google,
installe via le lien de test, effectue un achat sandbox, vérifie `user_profiles.tier='premium'` en DB.

---

## 📋 Checklist finale

**Code (fait)**
- [x] Signature release = keystore d'upload (plus debug)
- [x] minSdk 26 / target 35 effectifs
- [x] expo-build-properties (durabilité prebuild)
- [x] RevenueCat SDK + webhook tier
- [x] Sentry runtime + expo-updates OTA
- [x] tsc app = 0 erreur, jest 698/698

**Toi (avant submission)**
- [ ] Clé `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY=goog_…` dans `.env`
- [ ] Produits Play + Offering + entitlement `premium` (RC)
- [ ] Webhook RC enregistré
- [ ] SHA-256 upload **+** SHA-256 Play App Signing → Google Cloud (OAuth)
- [ ] Slugs Sentry + `SENTRY_AUTH_TOKEN`
- [ ] Privacy URL publique confirmée + Data Safety rempli
- [ ] Content rating + catégorie Beauté/Lifestyle
- [ ] **Keystore + mot de passe sauvegardés hors repo**
- [ ] AAB signé buildé + testé sur device réel
- [ ] Achat sandbox testé (tier → premium en DB)

---

*Ce guide remplace la version du 29 juin, qui listait comme « à faire » des points
déjà livrés (privacyUrl, RevenueCat, min/target SDK, versionCode).*
