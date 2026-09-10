# Cosme Check — paywall iOS : ce que la fouille a établi le 07/09/2026

> Document de constats. Il **remplace le §0 du prompt d'audit** :
> les hypothèses H1, H2, H3, H4 y sont éliminées par des preuves.

---

## 1. Verdict provisoire

**La configuration n'est pas cassée.** RevenueCat, App Store Connect et EAS sont corrects
sur tous les points que j'ai pu vérifier. Le blocage est **entre l'appareil et StoreKit**,
pas dans les consoles.

Preuve la plus parlante : RevenueCat **reçoit** bien les appels de l'app iOS (des clients
sont créés, l'offering `default` est servi, les notifications serveur d'Apple arrivent),
mais **aucun produit StoreKit ne remonte** sur l'appareil. Autrement dit : le SDK est
configuré et parle à RevenueCat ; c'est le magasin local, sur le téléphone, qui reste muet.

---

## 2. Ce qui est vérifié et **correct**

### EAS / expo.dev (compte `brianbiendou`, projet `cosme-check`)

| Variable | Environnement | Valeur | Verdict |
|---|---|---|---|
| `EXPO_PUBLIC_REVENUCAT_IOS_KEY` | `production` | `appl_Nsylpaup…` (identique au `.env` local) | ✅ présente, ajoutée il y a 18 j |
| `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` (`test_…`) | — | **absente d'EAS** | ✅ la garde `test_` du code ne peut pas se déclencher |
| `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` | — | **absente d'EAS** | ⚠️ voir §4 |

Dernier build iOS : **1.0.1 (7)**, profil `production`, runtime `1.0.1`, canal `production`,
git `8a94b6f`, il y a **3 jours** — donc **après** l'ajout de la clé iOS. La clé est bien
dans le binaire.

→ **H1 et H2 éliminées.** Le SDK n'est pas privé de clé.

### RevenueCat (projet Cosme Check, `7962a3d7`)

- Deux apps : `Cosme Check (App Store)` et `Cosme Check (Play Store)`, **toutes deux avec
  le bundle ID `com.cosmecheck.app`** → ✅ aucune discordance.
- Clé publique iOS du dashboard = `appl_Nsylpaup…` = celle du build → ✅.
- **In-app purchase key** : `LB29V5CKG8.p8`, *Valid credentials* → ✅ (indispensable en
  StoreKit 2, elle est là).
- **App Store Connect API key** : `V8UJ847B48.p8`, *Valid credentials* → ✅.
- **Apple Server-to-Server notifications** : « configured correctly », **dernière reçue le
  2026-09-07 à 11:13 UTC** → ✅ le lien Apple ↔ RevenueCat est vivant *aujourd'hui*.
- **Produits** : App Store `premium_monthly` et `premium_yearly` (créés le 20/08/2026),
  chacun avec **1 entitlement** ; Play Store `premium_monthly:monthly` et
  `premium_yearly:yearly` → ✅ les identifiants du code sont les bons.
- **Offering `default`** (le seul, actif) : package `$rc_annual` → `premium_yearly`
  (App Store **et** Play Store) ; package `$rc_monthly` → `premium_monthly` (les deux
  magasins) → ✅ exactement ce que `findPlanPackage()` attend.
- **SDK compatibility** : iOS `react-native-purchases 10.4.0` — 100 %. Donc **des
  appareils iOS parlent bien à RevenueCat**.
- Un profil client ouvert au hasard (créé aujourd'hui 05:42 UTC) affiche
  « **Current offering : default** » → ✅ l'offering est bien servi aux appareils.

→ **H3 et H4 éliminées.**

### App Store Connect (app `6803527040`)

- Version **1.0.1 — « Prête pour la distribution »**.
- Groupe d'abonnements **« Cosme Check Premium »** (ID `22322585`) : **Approuvé**.
- `premium_yearly` (« Premium annuel », 1 an) : **Approuvé**, en vente.
- `premium_monthly` (« Premium mensuel », 1 mois) : **Approuvé**, en vente.
- Localisation française présente sur les deux (nom + description).
- La mention « 44 sur une sélection de 175 pays ou régions » concerne **uniquement la
  facturation à l'avance avec engagement 12 mois**, pas la disponibilité à la vente :
  **fausse piste, écartée**.

→ **H6 très affaiblie.** Les produits existent, sont approuvés et en vente.

---

## 3. Ce qui reste à trancher — les seules pistes encore ouvertes

Puisque RevenueCat répond mais que StoreKit ne rend aucun produit, il ne reste que des
causes **côté appareil / côté binaire installé** :

### P1 — Le binaire installé n'est pas celui qu'on croit (le plus probable)
Deux builds portent le **numéro 7** : `1.0.0 (7)` et `1.0.1 (7)`, construits le même jour.
Le canal `production` diffuse aussi des **mises à jour OTA**, et `runtimeVersion` suit
`appVersion` : une update publiée pour la runtime `1.0.1` ne s'applique **pas** à un
binaire `1.0.0`, et inversement une update publiée depuis une machine dont le `.env`
n'avait pas la clé iOS **écrase le JS avec un bundle sans clé** — les `EXPO_PUBLIC_*` sont
figées au moment du bundle, donc au moment du `eas update`, avec le `.env` **de la machine
qui publie**.

**À vérifier :** dans l'app installée, la version + build affichés dans les réglages, et
dans expo.dev → *Over-the-air updates*, la liste des updates du canal `production` avec
leur runtime et leur date. **Si une update a été publiée depuis une machine sans clé, on a
la cause.**

### P2 — StoreKit en environnement sandbox sans compte sandbox
Si l'app a été installée par **TestFlight**, StoreKit tourne en **sandbox**. Vérifier sur
l'iPhone : *Réglages → App Store → Compte sandbox* (en bas). Vide = comportement
imprévisible sur les requêtes produits, et achat impossible.

### P3 — Propagation Apple
Les produits App Store ont été créés/importés le **20/08** et la version est « prête pour
la distribution » depuis peu. Une app dont **aucune version n'a encore été réellement
publiée** sert ses IAP en sandbox uniquement, et Apple met parfois jusqu'à 24 h à propager
un abonnement fraîchement approuvé. À confirmer : **la version 1.0.1 est-elle publiée sur
l'App Store, ou simplement approuvée et en attente de publication manuelle ?**

### P4 — Le délai de 2 s sur `getStorefront()` est trop court
`STOREFRONT_TIMEOUT_MS = 2000` dans `hooks/usePurchases.ts`. Le premier appel StoreKit
après un démarrage à froid dépasse régulièrement 2 s. Résultat : `storefront = null`, puis
`deviceStoreContext()` rend `currencyCode: null` (c'est un cas normal d'`expo-localization`),
et comme **`FR` n'est pas dans `PRICES_BY_REGION`**, on tombe sur le palier
`DEFAULT_CURRENCY = 'USD'` → **49,99 $US / 8,99 $US**, exactement la capture.

→ **Ce point explique l'affichage en dollars à lui seul, indépendamment de la panne
d'achat.** Deux bugs distincts se superposent ; ne pas les confondre.

---

## 4. Dette réelle, à corriger quoi qu'il arrive

1. **`EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` n'existe pas dans EAS.** Les achats Android
   fonctionnent aujourd'hui (1 abonné payant Play Store, essai converti il y a 7 jours),
   donc les APK/AAB ont été produits avec un `.env` local. Le jour où un build Android part
   d'une autre machine ou d'un CI, **les achats Android tombent en silence**. À ajouter dans
   l'environnement `production`.
2. **Le repli `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` (`test_…`) dans `lib/revenucat/client.ts`
   est un piège.** Il suffit que quelqu'un ajoute cette variable dans EAS pour désactiver
   tous les achats en release, sans message d'erreur. À supprimer du code.
3. **`FR` absent de `PRICES_BY_REGION`** (29 régions, uniquement des dérogations exotiques).
   Ajouter la zone euro, ou déduire la devise depuis la région.
4. **`STOREFRONT_TIMEOUT_MS` à 2 s** : passer à 6–8 s, comme les autres appels.
5. **Aucun `Purchases.setLogLevel()`**, contrairement à Memory Pilot → aucune trace
   exploitable en production. À ajouter (niveau `INFO` en release, `DEBUG` en dev).
6. **Aucune garde `NativeModules.RNPurchases != null`**, contrairement à Memory Pilot →
   un module natif absent devient une « panne du magasin » indiscernable.
7. **Beaucoup de clients `$RCAnonymousID`** dans RevenueCat (161 clients, 1 payant). Reveal
   Chat a corrigé exactement ce défaut le 14/08/2026 en **ne configurant jamais sans
   identifiant**. Ici, `configure({ appUserID: undefined })` puis `logIn()` laisse une
   fenêtre pendant laquelle un achat serait attribué à un anonyme, et le webhook Supabase
   n'écrirait rien.
8. **La table de prix générée dit 59,99 €/9,99 € pour l'euro.** À reconfronter à App Store
   Connect avec `node scripts/fetch_appstore_prices.js` : si les tarifs ont changé, l'écran
   affiche un prix faux les jours où le magasin se tait.

---

## 5. Les trois gestes qui trancheront, dans l'ordre

1. **Sur l'iPhone** : noter la version + le build affichés par l'app, et vérifier
   *Réglages → App Store → Compte sandbox*.
2. **Dans expo.dev → Over-the-air updates**, canal `production` : lister les updates, leur
   runtime, leur date, et **depuis quelle machine** elles ont été publiées. Comparer à la
   date du build 1.0.1 (7).
3. **Brancher l'iPhone à un Mac** (Xcode → Devices → Open Console), filtrer `Purchases`,
   ouvrir le paywall, et lire. Trois issues possibles :
   - `[RevenueCat] non initialisé` → le bundle JS installé n'a pas la clé (P1 confirmée) ;
   - `None of the products registered in the RevenueCat dashboard could be fetched from
     App Store Connect` → StoreKit refuse (P2/P3) ;
   - rien du tout → le composant `RevenueCatInit` du `_layout.tsx` ne monte pas.

Sans Mac : ajouter `Purchases.setLogLevel(LOG_LEVEL.DEBUG)` + un événement PostHog portant
`priceSource`, publier une update, et lire les résultats côté PostHog. C'est plus lent mais
ça donne la même réponse, et sur tous les utilisateurs au lieu d'un seul appareil.
