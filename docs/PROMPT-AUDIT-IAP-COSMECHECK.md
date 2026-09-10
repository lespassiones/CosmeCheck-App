# PROMPT — Audit complet de la chaîne d'achat in-app de Cosme Check (iOS)

> **Mode d'emploi** : copie tout ce qui suit (à partir de « MISSION ») dans une session
> Claude Code disposant de l'extension Chrome. Le navigateur doit être **déjà connecté**
> à App Store Connect, à RevenueCat et à expo.dev. L'agent travaille en **lecture seule**.

---

## MISSION

Sur **Cosme Check** (iOS), le paywall n'affiche jamais les tarifs du magasin. Il tombe
systématiquement sur les prix de repli codés dans l'app, marqués « Prix indicatif pour ta
région : App Store n'a pas répondu », et l'achat est **impossible** (le bouton devient
« Recharger les tarifs »). Deux autres apps du même compte Apple et du même compte
RevenueCat — **Memory Pilot** et **Reveal Chat** — vendent correctement.

Ta mission : **trouver la ou les causes exactes**, en comparant page par page la
configuration de Cosme Check à celle des deux apps qui fonctionnent, sur les trois
consoles concernées (RevenueCat, App Store Connect, Expo EAS) **et** dans le code local.

Tu ne modifies rien. Tu produis un rapport de constats + un plan de correction ordonné.

---

## 0. CE QUI EST DÉJÀ ÉTABLI — ne le redécouvre pas, sers-t'en

### 0.1 Symptôme précis (capture du 07/09/2026, iPhone, app en français)

- Deux prix affichés : **49,99 $US / an** et **8,99 $US / mois**, badge « ÉCONOMISE 54 % ».
- Bandeau : « Prix indicatif pour ta région : App Store n'a pas répondu. Recharge pour
  voir le tarif exact et t'abonner. »
- Bouton : « Recharger les tarifs » + « Tarif à confirmer par le magasin. »

**Lecture technique de ce symptôme** (fait, pas hypothèse) : dans
`hooks/usePurchases.ts`, la cascade est descendue jusqu'au **niveau 3** :

1. `Purchases.getOfferings()` → `current.availablePackages` vide (ou un seul plan) ;
2. `Purchases.getProducts(['premium_yearly','premium_monthly'], SUBSCRIPTION)` → **vide** ;
3. repli sur la table `lib/paywall/storePrices.generated.ts`.

Et **surtout** : les montants affichés (49,99 / 8,99 USD) correspondent au palier
`PRICES_BY_CURRENCY['USD']`, c'est-à-dire au cas `basis: 'default'` de
`resolveFallbackTier()`. Cela veut dire que **ni** `Purchases.getStorefront()` **ni**
`expo-localization` n'ont fourni de région/devise exploitable. Sur un iPhone français,
`getStorefront()` devrait rendre `FR` et le palier `EUR` [59,99 / 9,99] serait affiché.

→ **Le fait que `getStorefront()` n'ait rien rendu est le signal le plus fort de
l'enquête** : cet appel réussit dès que le SDK RevenueCat est configuré, même sans
aucun produit. Son échec suggère que **`Purchases.configure()` n'a jamais été appelé**
dans le build installé.

### 0.2 Le code contient une garde qui désactive silencieusement les achats

`lib/revenucat/client.ts`, fonction `initRevenueCat()` :

```ts
const API_KEY = {
  ios:     process.env.EXPO_PUBLIC_REVENUCAT_IOS_KEY
        || process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY || '',
  android: process.env.EXPO_PUBLIC_REVENUCAT_ANDROID_KEY
        || process.env.EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY || '',
}
...
const isTestKey = apiKey.startsWith('test_')
if (!apiKey || (isTestKey && !__DEV__)) {
  console.warn('[RevenueCat] non initialisé (clé de test en build release ou clé absente) — achats désactivés')
  return                      // ← le SDK n'est JAMAIS configuré, sans erreur visible
}
await Purchases.configure({ apiKey, appUserID: undefined })
```

Deux pièges structurels ici, tous deux compatibles avec le symptôme :

- **le repli `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY`** vaut `test_ZvJa…` dans le `.env` local.
  Si l'environnement de build fournit cette variable **mais pas** la variable iOS
  dédiée, `apiKey` vaut la clé de test → garde déclenchée → **aucun achat possible** ;
- **une variable absente** donne `''` → même issue.

Attention aussi à l'orthographe : ce dépôt écrit **`REVENUCAT`** (sans le second `E`),
alors que les deux autres apps écrivent **`REVENUECAT`**. Une variable créée dans EAS
avec la « bonne » orthographe ne serait **jamais lue** par ce code.

### 0.3 Identifiants et faits vérifiés dans le dépôt local

| | **Cosme Check** (KO) | **Memory Pilot** (OK) | **Reveal Chat** (OK) |
|---|---|---|---|
| Dossier | `C:\Projet\CosmeCheck-App` | `C:\Projet\Memory Pilot\Memory Pilot App` | `C:\Projet\Reveal Chat\RevealChat-App` |
| Bundle ID iOS | `com.cosmecheck.app` | `com.memorypilot.app` | `com.revealchat.app` |
| ASC App ID | `6803527040` | `6808763670` | `6803115828` |
| Apple Team | `7F96ZVZ4PC` | `7F96ZVZ4PC` | `7F96ZVZ4PC` |
| SDK | `react-native-purchases ^10.4.0` | `^10.9.0` | `^10.7.1` |
| Nom des variables | `EXPO_PUBLIC_REVENU**CAT**_IOS_KEY` / `_ANDROID_KEY` / `_PUBLIC_KEY` (`test_…`) | `EXPO_PUBLIC_REVENUE**CAT**_IOS` / `_ANDROID` | `EXPO_PUBLIC_REVENUE**CAT**_KEY_IOS` / `_KEY_ANDROID` |
| Clé iOS dans `.env` | `appl_Nsylpau…` | `appl_yDTCVBF…` | `appl_QXQUiZo…` |
| Produits attendus | `premium_yearly`, `premium_monthly` (abonnements) | abonnements, entitlement `premium` | **consommables** (packs de crédits) |
| Entitlement | `premium` | `premium` | — |
| Offering lu | `offerings.current` + repli `getProducts` | `offerings.current` **uniquement** | `getProducts` direct |
| `eas.json` prod → `environment` | **`"production"`** | `"production"` | **absent** |
| `.env` dans `.gitignore` | oui | oui | oui |
| Plugin config `react-native-purchases/expo-plugin` dans `app.json` | **non** | non | non |
| EAS project ID | `17bf525d-eff2-4a63-a42f-eaa886a7b8b8` | — | — |
| Webhook RC | `https://rogesnduejmqpxolhbif.supabase.co/functions/v1/revenucat-webhook` | fonction `abonnement` | — |
| iOS buildNumber / version | `7` / `1.0.1` | — | `15` |

Faits complémentaires :

- `REVENUCAT_INTEGRATION.md` (plan d'origine) prévoyait les identifiants
  `cosmecheck_monthly` / `cosmecheck_yearly`. Le code livré utilise
  `premium_monthly` / `premium_yearly`. **Vérifier lequel existe réellement côté
  magasin et côté RevenueCat** : un décalage d'identifiant explique à lui seul un
  `getProducts` vide.
- L'en-tête de `lib/revenucat/client.ts` affirme qu'un relevé du 04/09/2026 via l'API
  App Store Connect donnait les deux abonnements du groupe « Cosme Check Premium » à
  l'état **APPROVED**, essai gratuit 3 jours, 175 territoires. **À reconfirmer dans
  l'interface** : « Approved » ne suffit pas à rendre un produit servi par StoreKit.
- Aucune des trois apps n'ajoute le plugin Expo de `react-native-purchases` : ce n'est
  donc **pas** le facteur différenciant.
- Bug secondaire **confirmé** dans le code : `PRICES_BY_REGION` ne contient pas `FR`
  (29 régions, uniquement des dérogations exotiques). Si
  `expo-localization.getLocales()[0].currencyCode` rend `null` — ce qui arrive — un
  iPhone français retombe sur le palier **USD**. C'est exactement l'affichage de la
  capture. À corriger, mais ce n'est **pas** la cause de l'impossibilité d'acheter.

### 0.4 Hypothèses, classées par probabilité

| # | Hypothèse | Où la vérifier | Signature attendue |
|---|---|---|---|
| **H1** | Clé RevenueCat iOS absente de l'environnement EAS `production` → `apiKey` vide ou `test_…` → SDK jamais configuré | expo.dev → Environment variables | log `[RevenueCat] non initialisé` |
| **H2** | Variable présente mais **mal orthographiée** (`REVENUECAT` au lieu de `REVENUCAT`) ou mauvaise visibilité/environnement | expo.dev | idem H1 |
| **H3** | App iOS mal déclarée dans RevenueCat : bundle ID ≠ `com.cosmecheck.app`, ou app rattachée au mauvais projet | RevenueCat → Project → Apps | offerings vides, storefront OK |
| **H4** | Produits non rattachés à l'entitlement `premium`, ou offering non marqué **Current**, ou packages hors `$rc_annual`/`$rc_monthly` | RevenueCat → Products / Entitlements / Offerings | offerings vides mais `getProducts` OK |
| **H5** | **Paid Applications Agreement** non actif, ou fiscalité/coordonnées bancaires incomplètes | ASC → Business / Agreements | StoreKit ne sert **aucun** produit, sur toutes les apps du compte |
| **H6** | Abonnements approuvés mais jamais **joints à une version soumise**, ou disponibilité territoriale restreinte | ASC → Subscriptions + page de la version | `getProducts` vide, storefront OK |
| **H7** | L'app testée est une **mise à jour OTA** (`expo-updates`, canal `production`) posée sur un binaire plus ancien : le JS attend des variables/modules que le binaire n'a pas | expo.dev → Updates + `runtimeVersion` | incohérences JS/natif |
| **H8** | Clé « In-App Purchase Key » (.p8) ou shared secret manquante côté RevenueCat → validation cassée (n'empêche pas les offerings, mais casse l'achat) | RevenueCat → App config iOS | achat qui échoue après la feuille de paiement |
| **H9** | Compte de test non sandbox / testeur sandbox absent | ASC → Users & Access → Sandbox | produits absents en TestFlight seulement |

**Le test décisif à faire en premier** (voir §5) : lire les logs de l'appareil et
chercher la chaîne `[RevenueCat] non initialisé`. Si elle est là → H1/H2, l'enquête
s'arrête presque là. Si elle n'est pas là → le SDK est configuré, et le problème est
côté RevenueCat/ASC (H3 → H6).

---

## 1. RÈGLES DE TRAVAIL — non négociables

1. **Lecture seule.** Tu ne cliques sur aucun bouton qui enregistre, soumet, supprime,
   accepte un contrat, publie, ou change un prix. Si une correction est nécessaire, tu
   l'écris dans le rapport et tu **demandes** avant d'agir.
2. **Jamais de secret dans le rapport.** Les clés (`appl_…`, `goog_…`, `sk_…`, `.p8`) ne
   sont notées que par leurs **8 premiers caractères** + longueur. Aucune capture d'écran
   ne doit contenir une clé complète.
3. **Aucun contrat, aucun accord accepté**, même si une bannière App Store Connect
   l'exige pour continuer : tu le signales, tu n'appuies pas.
4. **Tu compares systématiquement les trois apps** sur chaque écran. Le but n'est pas de
   juger Cosme Check dans l'absolu mais de trouver **ce qu'elle n'a pas** et que les deux
   autres ont.
5. **Tu notes tout littéralement** : identifiants exacts, états exacts, dates exactes.
   Pas de paraphrase (« ça a l'air bon » est inutile ; « `premium_yearly` — State:
   Approved — Cleared for Sale: Yes — 175 territoires » est utile).
6. Si une page refuse de charger ou demande une authentification à deux facteurs, tu
   **t'arrêtes et tu demandes**, tu ne contournes pas.

---

## 2. FOUILLE — RevenueCat (`app.revenuecat.com`)

Fais l'inventaire **des trois projets** (Cosme Check, Memory Pilot, Reveal Chat). Si les
trois ne sont pas dans le même compte, note-le.

### 2.1 Liste des projets
- Nom exact de chaque projet, et l'ID de projet visible dans l'URL.
- Pour chaque projet : combien d'apps, quelles plateformes.

### 2.2 Pour chaque projet → **Project settings → Apps → l'app iOS**
Relève, pour les trois apps :
- **App name** et **Bundle ID** → celui de Cosme Check doit être **exactement**
  `com.cosmecheck.app`. Une faute de casse, un `.ios` en trop, un espace : c'est la
  panne. **Compare caractère par caractère.**
- **Apple App Store Public API key / SDK key** (`appl_…`, 8 premiers caractères) →
  compare avec `appl_Nsylpau…` trouvé dans le `.env` de Cosme Check. **Si ça diffère,
  c'est la cause.**
- **App Store Connect App-Specific Shared Secret** : présent ? (oui/non)
- **In-App Purchase Key** (fichier `.p8` téléversé) : présent ? Quel Key ID ? Date
  d'expiration ? → **Note lequel des trois projets en a une et lequel n'en a pas.**
- **App Store Server Notifications / URL de notification** : configurée ?
- Tout bandeau rouge/orange d'avertissement, recopié mot pour mot.

### 2.3 Pour chaque projet → **Products** (ou Product catalog → Products)
- Liste **exhaustive** des produits : identifiant, store, type (subscription /
  non-consumable / consumable), état affiché par RevenueCat.
- Pour Cosme Check : `premium_yearly` et `premium_monthly` existent-ils ? Ou bien
  `cosmecheck_yearly` / `cosmecheck_monthly` (les identifiants du plan d'origine) ?
  Ou les deux ? Ou aucun ?
- **Chaque produit affiche-t-il un prix et un statut « found in App Store Connect » ?**
  RevenueCat marque les produits qu'il n'arrive pas à résoudre — recopie l'avertissement.

### 2.4 Pour chaque projet → **Entitlements**
- Nom exact de chaque entitlement. Cosme Check doit avoir **`premium`** (minuscules) —
  le code lit `customerInfo.entitlements.active['premium']`.
- **Quels produits sont attachés à cet entitlement ?** Les deux abonnements doivent y
  être. Un entitlement vide = un achat qui n'ouvre rien.
- Compare avec Memory Pilot (qui a aussi `premium`).

### 2.5 Pour chaque projet → **Offerings**
- Liste des offerings, avec leur identifiant.
- **Lequel porte le badge « Current » ?** Le code de Cosme Check lit
  `offerings.current` : si aucun offering n'est marqué courant, `current` est `null` et
  la cascade tombe au niveau 2 puis 3. **C'est un candidat très sérieux.**
- Dans l'offering courant : liste des **packages**, avec pour chacun l'identifiant
  (`$rc_annual`, `$rc_monthly`, ou un nom libre) et le produit attaché **par store**.
- ⚠️ Point précis : `lib/paywall/prices.ts` cherche `packageType === 'ANNUAL'` puis
  `'MONTHLY'`, avec repli sur les mots `annual/year/annuel` et `month/mensuel` dans
  l'identifiant. **Un package nommé par exemple `yearly_plan` avec un packageType
  personnalisé passerait le premier filtre mais pas forcément le second.** Note les noms
  exacts.
- **Le package a-t-il bien un produit App Store attaché, et pas seulement un produit
  Play Store ?** C'est une erreur fréquente et elle donne exactement ce symptôme sur iOS
  seulement.
- Y a-t-il un **Targeting / Placement / expérience A-B** actif qui pourrait masquer
  l'offering courant pour certains utilisateurs ? Note-le.

### 2.6 Pour Cosme Check → **Integrations / Webhooks**
- L'URL `https://rogesnduejmqpxolhbif.supabase.co/functions/v1/revenucat-webhook`
  est-elle enregistrée ? Quels événements ? Quel est le **taux d'erreur** des derniers
  envois ? (Ce n'est pas la cause du symptôme, mais un webhook en échec expliquerait
  qu'un achat réussi ne débloque rien.)

### 2.7 Pour Cosme Check → **Customers / Sandbox**
- Filtre sur les 30 derniers jours : y a-t-il **le moindre** événement (achat sandbox,
  `$RCAnonymousID`, requête) ? **Zéro trafic depuis l'app iOS = preuve que le SDK n'est
  jamais configuré côté appareil** (H1/H2 confirmée).
- Compare avec Memory Pilot / Reveal Chat, qui devraient montrer du trafic.

### 2.8 Overview / Charts
- Sur Cosme Check : la courbe « Active subscriptions » / « API requests » est-elle
  strictement plate ? Depuis quelle date ? Note la date : elle situe le moment de la
  régression.

---

## 3. FOUILLE — App Store Connect (`appstoreconnect.apple.com`)

### 3.1 Business / Agreements — **à faire en premier, c'est bloquant si c'est cassé**
`Business` (ex-« Agreements, Tax, and Banking ») :
- Statut du **Paid Applications Agreement** : Active / Pending / Action needed ?
- Coordonnées **bancaires** : renseignées et validées ?
- Formulaires **fiscaux** (US, et les autres régions) : complets ?
- Tout bandeau « Action needed », recopié mot pour mot.

> Si le Paid Applications Agreement n'est pas actif, **StoreKit ne sert aucun produit,
> pour aucune app**. Mais comme Memory Pilot et Reveal Chat vendent, ce serait
> surprenant — vérifie quand même : un contrat peut être repassé en « action needed »
> après un changement de conditions Apple, et l'effet est immédiat.

### 3.2 Pour **chacune des trois apps** → `Apps → <app> → Monetization → Subscriptions`
Cosme Check : App ID `6803527040`. Memory Pilot : `6808763670`.
Reveal Chat : `6803115828` (produits consommables, voir §3.4).

Pour Cosme Check, relève :
- Le ou les **groupes d'abonnement** : nom exact, **Reference Name**, et le nom de
  groupe visible par le client. Attendu : « Cosme Check Premium ».
- Pour **chaque** abonnement du groupe :
  - **Product ID exact** (attendu `premium_yearly`, `premium_monthly`) ;
  - **Reference Name** ;
  - **State / Status** : `Ready to Submit`, `Waiting for Review`, `In Review`,
    `Approved`, `Developer Action Needed`, `Rejected`, `Missing Metadata` ?
    → **`Missing Metadata` et `Developer Action Needed` rendent le produit invisible
    pour StoreKit.**
  - **Cleared for Sale / Availability** : combien de territoires ? La France est-elle
    dedans ?
  - **Prix** : le prix de base et la devise. Pour la France, on attend 59,99 € / 9,99 €
    d'après la table générée dans le code — **si l'interface montre autre chose, la
    table du code est périmée** (à noter dans le rapport).
  - **Localizations** : y a-t-il au moins une localisation avec nom d'affichage et
    description ? **Une localisation manquante bloque le produit en Missing Metadata.**
  - **Review Information** : capture d'écran de la localisation fournie ?
  - **Introductory Offers** : l'essai gratuit de 3 jours existe-t-il vraiment, sur
    quels territoires, à partir de quelle date ?
  - **Subscription duration**, **Subscription Level / rank** dans le groupe.
  - **Tax Category** renseignée ?
- **Compare ligne par ligne avec les abonnements de Memory Pilot** : le même tableau,
  rempli pour l'app qui fonctionne. La différence saute aux yeux dans ce format.

### 3.3 Cosme Check → la **version de l'app**
- Quelles versions existent (`1.0`, `1.0.1`…) et dans quel état
  (Prepare for Submission / Waiting for Review / Ready for Distribution / Rejected) ?
- **L'app a-t-elle déjà une version publiée sur l'App Store, ou est-elle encore
  uniquement en TestFlight ?** C'est déterminant : un abonnement en `Ready to Submit`
  n'est servi en sandbox que sous certaines conditions, et jamais en production tant
  qu'il n'a pas été approuvé **avec** une version.
- Sur la page de la version : la section **In-App Purchases / Subscriptions** liste-t-elle
  les deux abonnements comme joints à cette version ? (Bouton « + » de la section.)
  → **Un abonnement jamais joint à une soumission reste en `Ready to Submit` et
  StoreKit ne le renvoie pas.** Vérifie la même section pour Memory Pilot.

### 3.4 Reveal Chat → `Monetization → In-App Purchases`
- Liste des consommables (packs de crédits) : Product IDs exacts, états, prix.
- But : voir **quel état exact** portent des produits qui fonctionnent réellement,
  pour le comparer à ceux de Cosme Check.

### 3.5 TestFlight (les trois apps)
- Quel build est actuellement distribué ? Numéro de version et de build, date.
- Pour Cosme Check : le build distribué est-il bien le **build 7 / version 1.0.1** ?
  S'il est plus ancien, le JS testé peut venir d'une mise à jour OTA (H7).
- Statut du build : `Ready to Test`, `Processing`, `Missing Compliance` ?

### 3.6 Users and Access → Sandbox → Testers
- Y a-t-il un compte de test sandbox ? Lequel est utilisé sur l'iPhone de test ?
- **Sur l'iPhone** : `Réglages → App Store → Compte Sandbox` doit montrer ce testeur.
  Si l'achat est tenté avec le compte App Store principal, la feuille de paiement
  réagit différemment — mais **cela n'empêche pas `getProducts` de renvoyer les
  produits**. À noter, pas à surinterpréter.

### 3.7 App Information / General
- **Bundle ID** enregistré pour l'app Cosme Check : `com.cosmecheck.app` ? Compare-le
  au bundle ID déclaré dans RevenueCat (§2.2) **et** à celui de `app.json`.
- **Category**, **Content Rights**, **Age Rating** : un blocage ici met la version en
  « Missing Metadata » et gèle indirectement les IAP.

---

## 4. FOUILLE — Expo / EAS (`expo.dev`) — le cœur de H1 et H2

C'est la piste la plus probable. Sois exhaustif.

### 4.1 Variables d'environnement du projet Cosme Check
`expo.dev → Account → Projects → cosme-check → Environment variables`
(projet EAS `17bf525d-eff2-4a63-a42f-eaa886a7b8b8`)

Pour **chaque** environnement (`development`, `preview`, **`production`**), liste
**toutes** les variables dont le nom contient `REVENU` :

| Nom exact | Environnements cochés | Visibilité (Plain text / Sensitive / Secret) | 8 premiers car. de la valeur (si lisible) |
|---|---|---|---|

Vérifie **précisément** :
- `EXPO_PUBLIC_REVENUCAT_IOS_KEY` existe-t-elle, **avec cette orthographe exacte**
  (`REVENUCAT`, un seul `E`), dans l'environnement **`production`** ?
- Sa valeur commence-t-elle par **`appl_`** ? (et non `test_`, ni `goog_`)
- `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` commence-t-elle par `goog_` ?
- **`EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` est-elle présente dans `production` ?** Si oui
  **et** que la clé iOS manque, la garde `test_` du code s'est déclenchée : **cause
  trouvée**. Même si la clé iOS est présente, note l'existence de cette variable de
  repli comme dette à supprimer.
- Une variable marquée **`Secret`** n'est **pas** injectée dans le bundle JS lisible…
  mais surtout : une variable `EXPO_PUBLIC_*` en visibilité `Secret` reste utilisable au
  build. En revanche, vérifie qu'elle est bien **cochée pour `production`** : c'est
  l'oubli classique.

### 4.2 Comparaison avec les deux autres projets
Même tableau pour **Memory Pilot** et **Reveal Chat** (variables `EXPO_PUBLIC_REVENUECAT_*`).
Objectif : montrer noir sur blanc que les deux apps qui vendent ont leurs clés dans
`production` et que Cosme Check n'en a pas (ou pas la bonne).

Note aussi, pour Reveal Chat, que son profil `production` dans `eas.json` **ne déclare
aucun `environment`** : selon la version d'EAS CLI utilisée, les variables peuvent y
être injectées différemment. Si les clés de Reveal Chat **ne sont pas** dans EAS et que
l'app vend quand même, cela signifie que ses builds ont été faits **en local** ou avec
un `.env` embarqué — information capitale pour comprendre la différence de traitement.

### 4.3 Historique des builds Cosme Check
`Builds` :
- Dernier build **iOS production** : date, version, build number, profil utilisé,
  `runtimeVersion`, statut.
- Ouvre les **logs** de ce build et cherche :
  - la ligne d'**injection des variables d'environnement** (EAS liste les variables
    chargées, en masquant les valeurs) → **les variables `EXPO_PUBLIC_REVENUCAT_*`
    apparaissent-elles dans cette liste ?** C'est la preuve la plus directe qui existe ;
  - tout avertissement du genre « File specified via … is not checked in to your
    repository and won't be uploaded to the builder » ;
  - tout avertissement sur un `.env` ignoré.
- Compare avec les logs du dernier build iOS de Memory Pilot.

### 4.4 Mises à jour OTA (H7)
`Updates` / `Channels` :
- Le canal `production` porte-t-il des mises à jour plus récentes que le dernier build
  natif iOS ? Dates, `runtimeVersion` de chaque update.
- `app.json` fixe `runtimeVersion: { policy: 'appVersion' }` et `version: '1.0.1'`.
  **Une mise à jour publiée pour la runtime `1.0.1` alors que le binaire installé est
  en `1.0.0` ne s'applique pas** ; à l'inverse, si le binaire est bien en `1.0.1`, la
  mise à jour s'applique et **le JS peut attendre des variables que le binaire n'a
  pas** — car les `EXPO_PUBLIC_*` sont figées **au moment du bundle**, donc au moment
  de `eas update` pour une OTA, avec le `.env` **de la machine qui a publié**.
  → Note qui a publié la dernière update, depuis quelle machine, et si un `.env` y était
  présent.

### 4.5 Credentials
`Credentials → iOS → com.cosmecheck.app` :
- Distribution certificate et provisioning profile valides ?
- **Le provisioning profile inclut-il la capacité « In-App Purchase » ?** Recopie la
  liste des capabilities. Compare avec Memory Pilot.
- Sur le portail Apple Developer (`developer.apple.com → Identifiers →
  com.cosmecheck.app`) : la capability **In-App Purchase** est-elle cochée ? Compare
  avec `com.memorypilot.app` et `com.revealchat.app`.

---

## 5. LE TEST DÉCISIF — les logs de l'appareil

Avant, pendant ou après la fouille des consoles, obtiens **les logs de l'app sur
l'iPhone** au moment de l'ouverture du paywall. Trois voies, par ordre de préférence :

1. **Xcode → Window → Devices and Simulators → Open Console** (ou `Console.app` du Mac,
   appareil sélectionné), filtre sur `RevenueCat` puis sur `Purchases`.
2. Si un Mac n'est pas disponible : **Sentry**. Le projet est
   `biendou / cosme-check` sur `https://de.sentry.io/`. Cherche les
   **breadcrumbs console** et les événements des dernières 48 h contenant
   `RevenueCat`, `PAYWALL_STORE_UNAVAILABLE`, `getOfferings`, `getProducts`.
   Le hook lève `new Error('PAYWALL_STORE_UNAVAILABLE')` au niveau 3 : **cherche cette
   chaîne, elle date précisément chaque occurrence du bug.**
3. **PostHog** (`lib/analytics/posthog.ts`) : y a-t-il un événement de paywall qui
   porte `priceSource` ? Si oui, la répartition `offerings` / `products` / `fallback`
   par plateforme et par jour dit immédiatement si le problème est iOS-only et depuis
   quand.

**Ce que tu cherches, mot pour mot :**

| Chaîne trouvée dans les logs | Conclusion |
|---|---|
| `[RevenueCat] non initialisé (clé de test en build release ou clé absente)` | **H1/H2 confirmée.** Le SDK n'est pas configuré. Va directement au §4.1. |
| `[RevenueCat] init failed:` | `configure()` a été appelé et a échoué : lis l'erreur, c'est souvent une clé invalide ou un bundle ID discordant (H3). |
| `[RevenueCat] getOfferings failed:` | Le SDK est configuré. Erreur RevenueCat côté serveur ou configuration → §2.5. |
| `[RevenueCat] getProducts failed:` ou un retour vide sans erreur | StoreKit ne connaît pas ces identifiants → §3.2 (états des produits) et §2.3 (identifiants). |
| `There is a problem with your configuration. None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect` | Message canonique de RevenueCat : les identifiants du dashboard ne correspondent pas à ceux d'ASC, **ou** les produits ne sont pas encore servis par ASC. → §2.3 + §3.2. |
| `Invalid API key` / `401` | La clé du build n'appartient pas à ce projet RevenueCat → §2.2 + §4.1. |
| aucun log RevenueCat du tout | Le `RevenueCatInit` du `_layout.tsx` n'est peut-être pas monté, ou les logs ne sont pas activés. Note-le : le code n'appelle **pas** `Purchases.setLogLevel(LOG_LEVEL.DEBUG)`, contrairement à Memory Pilot — c'est une recommandation de correction à mettre dans le rapport. |

---

## 6. VÉRIFICATIONS CÔTÉ CODE LOCAL — à faire en parallèle

Depuis `C:\Projet` :

1. **Diff des trois intégrations RevenueCat**, en cherchant ce que Cosme Check ne fait
   pas et que les deux autres font :
   - `C:\Projet\CosmeCheck-App\lib\revenucat\client.ts`
   - `C:\Projet\Memory Pilot\Memory Pilot App\src\lib\achats.ts`
   - `C:\Projet\Reveal Chat\RevealChat-App\src\lib\purchases.ts`

   Points déjà repérés à confirmer et à chiffrer :
   - Memory Pilot vérifie `NativeModules.RNPurchases != null` **avant** tout appel, et
     distingue trois empêchements (`sansNatif` / `sansCle` / `panne`).
     Cosme Check ne le fait pas → un module natif absent devient une « panne du
     magasin » indiscernable.
   - Memory Pilot appelle `Purchases.setLogLevel(LOG_LEVEL…)`. Cosme Check non → aucune
     trace exploitable en production.
   - Memory Pilot passe l'`appUserID` **dès `configure()`**. Cosme Check configure avec
     `appUserID: undefined` puis appelle `logIn()`. Vérifie que `loginUser()` est bien
     appelé après authentification dans `app/_layout.tsx` (le composant
     `RevenueCatInit`, ligne ~243) : sans cela, RevenueCat attribue l'achat à un
     `$RCAnonymousID` et le webhook Supabase ne trouve pas l'utilisateur.
   - Reveal Chat ne configure **jamais** sans identifiant, et explique pourquoi dans un
     commentaire daté du 14/08/2026 (des clients anonymes créés à tort). Vérifie si
     Cosme Check souffre du même défaut, en regardant les customers RevenueCat (§2.7).

2. **`git log`** sur Cosme Check : le commit `b9ead54` (« fix(paywall): afficher un prix
   de repli par pays quand le magasin se tait ») est celui qui a **ajouté le repli**.
   Il ne cause pas le bug, il le rend visible. Regarde ce qui a changé **avant** dans
   `lib/revenucat/`, `app/_layout.tsx` et `.env` (`git log -p -- .env` ne montrera rien,
   le fichier est ignoré — regarde plutôt `git log -S EXPO_PUBLIC_REVENUCAT`).

3. **Cohérence de la table de prix** : `lib/paywall/storePrices.generated.ts` prétend
   avoir été générée le 2026-09-04 par `scripts/fetch_appstore_prices.js`. Lis ce script,
   relance-le si les identifiants ASC API sont disponibles
   (`AuthKey_V8UJ847B48.p8`, Key ID `V8UJ847B48`, Issuer
   `7ff0f8c5-16e0-4ba8-8dad-76b2a629c4e3`, à la racine du dépôt) et **compare sa sortie
   à ce que montre l'interface App Store Connect**. Ce script est aussi le moyen le plus
   rapide d'obtenir l'état réel des abonnements **par API**, sans dépendre de l'interface.

4. **Le bug `FR` manquant** : `PRICES_BY_REGION` ne contient pas `FR`, et le palier EUR
   n'est atteint que si `currencyCode` est non nul. Propose le correctif (soit ajouter
   les régions de la zone euro, soit déduire la devise de la région via une table
   région→devise) — mais **classe-le comme cosmétique**, il n'a aucun effet sur la
   capacité à acheter.

---

## 7. RAPPORT ATTENDU

Écris `C:\Projet\CosmeCheck-App\docs\AUDIT-IAP-2026-09.md`, structuré ainsi :

1. **Verdict en trois lignes** : la cause racine, la preuve qui l'établit, le correctif.
2. **Tableau comparatif des trois apps**, une ligne par point de configuration
   (§0.3 complété avec ce que tu as trouvé dans les consoles). Colonne « écart » qui
   dit explicitement ce que Cosme Check n'a pas.
3. **Chaîne de causalité** : de la variable d'environnement jusqu'au « 49,99 $US »
   affiché, étape par étape, chaque étape adossée à une preuve (log, capture, page).
4. **Hypothèses écartées**, avec la preuve de leur élimination. Aussi important que la
   cause : sans ça, le doute revient dans deux jours.
5. **Plan de correction ordonné**, chaque étape avec : ce qu'on change, où, l'effet
   attendu, comment on vérifie, et le risque. Sépare nettement :
   - ce qui se corrige **sans nouveau build** (variables EAS + `eas update`) ;
   - ce qui **exige un nouveau build natif** ;
   - ce qui **exige une action Apple** (soumission, contrat, approbation).
6. **Dette à solder**, même si elle n'est pas la cause : le repli `test_` dans
   `client.ts`, l'orthographe `REVENUCAT`, l'absence de `setLogLevel`, l'absence de
   garde `NativeModules`, la table de prix sans `FR`, les identifiants `cosmecheck_*`
   du plan initial vs `premium_*` du code.
7. **Annexe** : captures d'écran (sans secrets), copies littérales des messages
   d'erreur, extraits de logs horodatés.

Termine par **la question la plus utile** que tu n'as pas pu trancher, et ce qu'il
faudrait pour la trancher.

---

## 8. SI TU DOIS T'ARRÊTER

Tu t'arrêtes et tu demandes, sans insister, si :
- une console demande une authentification à deux facteurs ou un mot de passe ;
- une page exige d'accepter un contrat ou des conditions pour s'afficher ;
- la seule façon d'avancer est de **modifier** une configuration ;
- après deux tentatives, une page ne se charge pas ;
- tu découvres une divergence qui pourrait avoir des conséquences financières
  (un prix différent de celui affiché dans l'app, par exemple) : tu la signales
  **immédiatement**, avant de continuer la fouille.
