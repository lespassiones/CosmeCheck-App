# Cosme Check — ce qui a été corrigé, et ce qui manque encore

07/09/2026. Code modifié et compilé (`npx tsc --noEmit` : **0 erreur** sur `app/`, `lib/`,
`hooks/`, `components/`). Consoles fouillées.

---

## 1. La clé que Cosme Check n'a pas : le constat

App Store Connect → **Utilisateurs et accès → Intégrations → Achat intégré**.
Issuer ID `7ff0f8c5-16e0-4ba8-8dad-76b2a629c4e3`. **Deux clés actives, pas trois** :

| Nom | Key ID | Générée le |
|---|---|---|
| **RevenueCat RevealChat** | `LB29V5CKG8` | 20 août 2026 |
| **RevenueCat MemoryPilot** | `9XJ8S22N7L` | 4 sept. 2026 |

Il n'existe **aucune clé « RevenueCat CosmeCheck »**. Le projet RevenueCat de Cosme Check
utilise `LB29V5CKG8.p8` — **celle de Reveal Chat**.

Techniquement ça fonctionne (une clé d'achat intégré est valable pour toute l'équipe, pas
pour une app), et ce **n'est donc pas la cause de la panne**. Mais c'est une clé partagée
entre deux produits : le jour où tu la révoques pour Reveal Chat, tu éteins la validation
StoreKit 2 de Cosme Check sans t'en apercevoir. Une app, une clé — comme Memory Pilot,
qui a la sienne.

**Je ne peux pas la créer à ta place** : générer une clé Apple télécharge un `.p8`
privé (téléchargeable **une seule fois**), et il faut ensuite le téléverser dans
RevenueCat. Je ne manipule pas de fichiers de clés ni de secrets. La marche est courte :

1. App Store Connect → **Utilisateurs et accès → Intégrations → Achat intégré**
   → bouton **Modifier** / **+** → nom : `RevenueCat CosmeCheck` → **Générer**.
2. **Télécharge le `.p8` immédiatement** (Apple ne le repropose jamais) et range-le à côté
   des autres, dans `C:\Projet\CosmeCheck-App\`. Le `.gitignore` couvre bien `*.p8`
   (lignes 16 et 70) — vérifié, tu peux le poser là sans risque de commit.
3. Note le **Key ID** affiché et l'**Issuer ID** ci-dessus.
4. RevenueCat → projet **Cosme Check** → **Apps → Cosme Check (App Store)** →
   *In-app purchase key configuration* → **Add new key** → dépose le `.p8`, colle le
   Key ID et l'Issuer ID → **Save changes**.
5. Vérifie que la ligne affiche bien **« Valid credentials »** et que le nom du fichier
   n'est plus `LB29V5CKG8.p8`.

Aucun rebuild n'est nécessaire : cette clé sert côté serveur RevenueCat, pas dans l'app.

---

## 2. Les autres manques trouvés en fouillant

### a) La clé Android n'existe nulle part dans EAS
Memory Pilot et Reveal Chat ont leurs **deux** clés dans EAS, sur les **trois**
environnements. Cosme Check n'a que la clé iOS, et seulement en `production`. Tes achats
Android ne marchent que parce que les AAB sortent de ta machine avec le `.env` local.

Là encore je ne saisis pas de clé dans un formulaire. Deux commandes, depuis
`C:\Projet\CosmeCheck-App` :

```bash
npx eas env:create --scope project --name EXPO_PUBLIC_REVENUCAT_ANDROID_KEY \
  --value goog_HHMoxvsZqOwujArietdajSJuuJS \
  --environment development --environment preview --environment production \
  --visibility plaintext --type string

npx eas env:create --scope project --name EXPO_PUBLIC_REVENUCAT_IOS_KEY \
  --value appl_NsylpaupRAOnsaGasEjlkdxsQUO \
  --environment development --environment preview \
  --visibility plaintext --type string
```

(La seconde n'ajoute que `development` et `preview` : `production` existe déjà.)

Vérification : `npx eas env:list --environment production`.

### b) Aucun compte de test Sandbox
App Store Connect → **Utilisateurs et accès → Sandbox → Comptes de test** : **la liste est
vide**. Ce n'est pas bloquant pour TestFlight (qui utilise ton vrai identifiant Apple en
mode bac à sable), mais dès que tu testeras un build lancé depuis Xcode ou une
distribution interne, tu ne pourras rien acheter. Un compte de test se crée en trente
secondes sur cette page.

### c) Deux produits « Test Store » résiduels dans RevenueCat
`cosmecheck_yearly` et `cosmecheck_monthly`, créés le 29/06, **aucun entitlement, aucun
offering**. Inertes (le Test Store n'est servi qu'aux apps en clé `test_…`), mais ils
brouillent la lecture du catalogue. À supprimer — je ne supprime pas de données dans tes
consoles.

---

## 3. Ce que j'ai changé dans le code

### `lib/revenucat/client.ts` (+270 lignes)

- **Porte unique `ensureConfigured()`**, promesse mémorisée : plus aucun appel au SDK
  (`getOfferings`, `getProducts`, `getStorefront`, `getCustomerInfo`, `loginUser`,
  `logoutUser`) ne peut partir avant que `configure()` ait eu lieu.
- **Garde `nativeAvailable()`** sur `NativeModules.RNPurchases`, comme Memory Pilot : un
  module natif absent se raconte comme tel, plus comme « panne du magasin ».
- **Repli `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` supprimé.** C'était une clé `test_…` : il
  suffisait qu'elle arrive un jour dans EAS pour éteindre tous les achats en release, sans
  un mot.
- **Les deux orthographes acceptées** : `EXPO_PUBLIC_REVENUECAT_*` (correcte, celle des
  deux autres apps) d'abord, `EXPO_PUBLIC_REVENUCAT_*` (historique, celle qui est dans EAS
  aujourd'hui) ensuite. Tu peux migrer EAS quand tu veux sans rien casser.
- **`Purchases.setLogLevel`** — DEBUG en dev, INFO en release. Tu n'avais aucun journal.
- **`initDiagnostic()` / `storeDiagnostic()`** : la raison de l'échec est conservée, avec
  le code d'erreur du SDK, l'appel fautif, la plateforme et une **empreinte de clé**
  (`appl_Nsylpa…(31)`) — jamais la clé entière.
- **`ensurePurchaseIdentity()`** : le dernier verrou de Reveal Chat. Avant d'ouvrir la
  feuille de paiement, on vérifie que `getAppUserID()` vaut bien l'identifiant Supabase,
  sinon `logIn()`, sinon **on refuse l'achat**. Tu as 161 clients dont beaucoup en
  `$RCAnonymousID` : c'est la fenêtre qui a coûté un achat de 7,99 € à Reveal Chat le
  14/08, retrouvé à la main dans le tableau de bord.
- L'en-tête du fichier **corrige ma propre erreur** : `Purchases.configure()` est
  synchrone (`static configure(...): void`), il n'y a jamais eu de course. C'est écrit
  noir sur blanc pour que personne ne réintroduise l'hypothèse.

### `hooks/usePurchases.ts` (+74)
- `ensureConfigured()` en niveau 0 de la cascade ; si le SDK n'est pas prêt, on sert le
  repli **en le disant**.
- `STOREFRONT_TIMEOUT_MS` : 2 000 → **6 000 ms**.
- Nouveau champ `diagnostic`, renseigné à chaque échec avec le nombre de packages, de
  produits, la storefront obtenue et l'empreinte de clé.
- Verrou d'identité branché avant chaque achat.

### `lib/paywall/fallbackPrices.ts` (+43)
- Table `CURRENCY_BY_REGION` (zone euro + ~50 marchés) : quand `expo-localization` ne
  donne pas de devise — cas normal, pas une panne — on la déduit du pays.
  **Fin des « 49,99 $US » à Toulouse.**

### `lib/paywall/purchaseError.ts` (+24)
- Deux cas nommés : `no_product` (« Tarif pas encore confirmé ») et `identity`
  (« Compte non confirmé »), au lieu du message générique.

### `app/offre/index.tsx` (+25)
- Sous le bandeau « prix indicatif », une ligne grise, petite et **sélectionnable**, qui
  dit **pourquoi**. Elle ne s'affiche que dans l'état de repli, qui est déjà un état
  d'échec.

---

## 4. L'ordre des opérations

1. `npx eas update --channel production` depuis ton poste (le `.env` y est complet).
   Runtime **1.0.1** — celle du binaire publié le 06/09.
2. Ouvre le paywall sur l'iPhone. **Lis la ligne grise.** Elle dira l'un de ceci :
   - `SDK sans-cle · ios · clé aucune` → la variable n'est pas dans le bundle installé ;
   - `getProducts : PRODUCT_NOT_AVAILABLE_FOR_PURCHASE · clé appl_Nsylpa…(31)` → StoreKit
     refuse le produit : sujet Apple/appareil, plus code ;
   - `magasin muet — offering: 2 package(s), produits: 0, storefront: FRA · clé appl_…`
     → RevenueCat répond, StoreKit ne rend rien.
3. Les deux commandes `eas env:create` du §2a.
4. La clé dédiée du §1.
5. Si des iPhone sont restés en 1.0.0, une **seconde** update pour cette runtime — sinon
   le correctif ne les atteindra jamais (`runtimeVersion: appVersion`).
6. Supprimer les deux produits Test Store.

Envoie-moi la ligne grise et on saura enfin.
