# Comparatif ligne à ligne — Cosme Check / Memory Pilot / Reveal Chat

Fouille du 07/09/2026 : expo.dev, RevenueCat, App Store Connect, App Store public, et
les trois dépôts. Rien n'est déduit : chaque case a été ouverte.

---

## ⚠️ Correction d'abord : mon hypothèse de « course » était fausse

J'ai écrit plus tôt que le paywall interrogeait le SDK avant la fin de
`Purchases.configure()`. **C'est faux, et la source du SDK le prouve** :

```
node_modules/react-native-purchases/dist/purchases.d.ts:243
    static configure(configuration: PurchasesConfiguration): void;
```

`configure()` est **synchrone**. Dans l'ancien code, aucun `await` ne le précédait :
l'appel partait donc dès l'exécution du `useEffect` de `RevenueCatInit`, qui est monté
**avant** `RootNavigator` dans l'arbre. Le SDK est configuré au lancement, bien avant
qu'un paywall soit atteignable. Et RevenueCat le confirme : il reçoit des clients iOS,
avec `Last Seen Storefront : FRA`.

Le correctif que j'ai écrit reste utile — il supprime le piège de la clé `test_`, il fait
parler les erreurs, il répare l'affichage en dollars — mais **il ne faut pas le vendre
comme la cause**. La cause n'est pas encore prouvée, et ce document dit exactement où
elle ne peut PAS être.

---

## 1. Clés RevenueCat — vérifiées caractère par caractère

| | Cosme Check | Memory Pilot | Reveal Chat |
|---|---|---|---|
| **Nom de la variable iOS** | `EXPO_PUBLIC_REVENU`**`CAT`**`_IOS_KEY` | `EXPO_PUBLIC_REVENUE`**`CAT`**`_IOS` | `EXPO_PUBLIC_REVENUE`**`CAT`**`_KEY_IOS` |
| Valeur dans le `.env` | `appl_Nsylpaup…` | `appl_yDTCVBF…` | `appl_QXQUiZo…` |
| Valeur dans EAS | `appl_NsylpaupRAOnsaGasEjlkdxsQUO` | `appl_yDTCVBFsQpKmvbyRoylBGynZkKE` | `appl_QXQUiZojQtkwlwEsCANkseZKhSZ` |
| Valeur dans RevenueCat | `appl_NsylpaupRAOnsaGasEjlkdxsQUO` | (non révélée, même app) | (non révélée, même app) |
| **Concordance iOS** | ✅ **les 3 identiques** | ✅ | ✅ |
| **Nom de la variable Android** | `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` | `EXPO_PUBLIC_REVENUECAT_ANDROID` | `EXPO_PUBLIC_REVENUECAT_KEY_ANDROID` |
| Valeur dans le `.env` | `goog_HHMoxvs…` | `goog_ismjiCN…` | `goog_wcqMFOV…` |
| Valeur dans RevenueCat | `goog_HHMoxvsZqOwujArietdajSJuuJS` | — | — |
| Valeur dans EAS | ❌ **ABSENTE** | `goog_ismjiCNSmRQjTiLDyUrHvtFIsbE` | `goog_wcqMFOVXpbTsvwbwaNlsBHaIJUf` |
| **Environnements EAS couverts** | ❌ `production` **seulement** | ✅ development + preview + **production** | ✅ development + preview + **production** |
| Clé de repli `test_` dans le code | ❌ **oui** (`EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY`) | ✅ non | ✅ non |

**Verdict clés : les bonnes clés sont aux bons endroits pour iOS, sur les trois apps.**
Ce n'est pas un problème de clé.

**Deux écarts réels quand même, à corriger** :

1. **La clé Android de Cosme Check n'est nulle part dans EAS.** Les achats Android ne
   marchent aujourd'hui que parce que tes AAB sortent de ta machine, avec le `.env` local.
   Le premier build lancé depuis un CI ou une autre machine tue les achats Android en
   silence. Memory Pilot et Reveal Chat, eux, ont leurs deux clés dans EAS.
2. **Cosme Check ne couvre que `production`.** Les deux autres couvrent les trois
   environnements, donc un build `preview` a aussi ses achats. Chez Cosme Check, un build
   `preview` n'a **aucune** clé — et l'ancien code retombait alors sur la clé `test_`.
3. **L'orthographe `REVENUCAT` (un seul `E`)** est propre à Cosme Check. Elle ne casse
   rien tant que tout le monde l'écrit pareil, mais c'est un piège : une variable créée un
   jour avec l'orthographe correcte ne serait **jamais lue**.

---

## 2. Configuration RevenueCat — écran par écran

| | Cosme Check | Memory Pilot | Reveal Chat |
|---|---|---|---|
| Projet | `7962a3d7` | `375fbe68` | `b7afdce0` |
| App iOS — Bundle ID | `com.cosmecheck.app` | `com.memorypilot.app` | `com.revealchat.app` |
| App Android — Bundle ID | `com.cosmecheck.app` | `com.memorypilot.app` | `com.revealchat.app` |
| Bundle ID = celui d'`app.json` | ✅ | ✅ | ✅ |
| **In-app purchase key** (obligatoire StoreKit 2) | `LB29V5CKG8.p8` — *Valid* | `9XJ8S22N7L.p8` — *Valid* | `LB29V5CKG8.p8` — *Valid* |
| **ASC API key** | `V8UJ847B48.p8` — *Valid* | `4N862TWCJ7.p8` — *Valid* | `4N862TWCJ7.p8` — *Valid* |
| Notifications serveur Apple | ✅ « configured correctly » — reçue **07/09 11:13 UTC** | ⚠️ « **No notifications received** » | ✅ reçue **07/09 15:17 UTC** |
| Offering | `default`, 2 packages | `default`, 2 packages | (consommables, pas d'offering utilisé) |
| Packages | `$rc_annual` + `$rc_monthly`, chacun avec le produit **App Store ET Play Store** | idem | — |
| Entitlement | `premium` | `premium` | — |
| SDK vu par RevenueCat (iOS) | `react-native-purchases 10.4.0` | `10.9.0` | `10.7.1` |
| Type de produits | **Abonnements** | **Abonnements** | **Consommables** |
| Produits Test Store résiduels | ⚠️ `cosmecheck_yearly`, `cosmecheck_monthly` (aucun entitlement, aucun offering) | — | — |

**Verdict RevenueCat : Cosme Check est configurée exactement comme Reveal Chat**, y
compris **la même** clé d'achat intégré (`LB29V5CKG8.p8`) et **la même** clé d'API ASC.
Or Reveal Chat encaisse sur l'App Store aujourd'hui même. Il n'y a donc **rien à corriger
dans RevenueCat**.

Les produits « Test Store » ne peuvent rien casser : le Test Store n'est servi qu'à une
app configurée avec une clé `test_…`, ils ne sont attachés à aucun entitlement et ne
figurent dans aucun offering. À supprimer par hygiène, pas pour réparer.

---

## 3. App Store Connect

| | Cosme Check | Memory Pilot | Reveal Chat |
|---|---|---|---|
| ASC App ID | `6803527040` | `6808763670` | `6803115828` |
| Apple Team | `7F96ZVZ4PC` | `7F96ZVZ4PC` | `7F96ZVZ4PC` |
| **En ligne sur l'App Store ?** | ✅ **oui, 1.0.1 depuis le 06/09** | ❌ **non** (fiche introuvable) | ✅ oui |
| Produits | `premium_yearly` + `premium_monthly`, groupe « Cosme Check Premium » | abonnements | consommables (packs) |
| État des produits | **Approuvé** (les deux) + groupe Approuvé | — | actifs |
| Localisation FR | ✅ nom + description | — | ✅ |
| Prix FR annoncés publiquement | **9,99 €/mois, 59,99 €/an** (dans la fiche App Store) | — | — |
| Essai gratuit | 3 jours | — | — |
| TestFlight | build 1.0.1 (7), groupe Interne, 1 invitation | — | — |

L'absence de notification Apple chez Memory Pilot n'est **pas** un symptôme : l'app n'est
pas publiée sur l'App Store, elle n'a donc aucun utilisateur iOS. Ne pas en tirer de
conclusion sur les abonnements.

---

## 4. Résultat commercial réel

| | Cosme Check | Memory Pilot | Reveal Chat |
|---|---|---|---|
| Clients RevenueCat | 161 | — | — |
| Abonnés payants | **1** (Play Store) | — | — |
| Transactions **App Store** sur `premium_yearly` | **« No transactions yet »** | — | plusieurs aujourd'hui (« 2 quiz », « 5 analyses »…) |
| Chiffre d'affaires 28 j (tous projets) | $55 | | |

**Le seul produit qui s'est jamais vendu sur l'App Store dans ce compte est un
consommable de Reveal Chat.** Aucun abonnement iOS n'a jamais abouti — mais la seule
autre app à abonnements n'est même pas publiée, donc l'échantillon est d'exactement
une app. Ce n'est pas une preuve, c'est une piste.

---

## 5. Le code, fonction par fonction

| Point | Cosme Check (avant) | Memory Pilot | Reveal Chat |
|---|---|---|---|
| Fichier unique qui parle au SDK | ✅ `lib/revenucat/client.ts` | ✅ `src/lib/achats.ts` | ✅ `src/lib/purchases.ts` |
| Vérifie que le module natif existe | ❌ | ✅ `NativeModules.RNPurchases != null` | ✅ `Constants.appOwnership` + `require` protégé |
| Distingue les causes d'échec | ❌ une seule « panne » | ✅ `sansNatif` / `sansCle` / `panne` | ✅ 5 codes d'erreur typés |
| Drapeau `configure` idempotent | ❌ | ✅ | ✅ |
| `setLogLevel` | ❌ **aucun journal** | ✅ | — |
| Configure **avec** l'identifiant | ❌ `appUserID: undefined` puis `logIn()` | ✅ `configure(appUserID)` | ✅ **refuse de configurer sans identifiant** |
| Vérifie l'identité **juste avant** d'ouvrir la caisse | ❌ | — | ✅ `getAppUserID()` puis `logIn()` si divergence |
| Nomme un offering en dur | ✅ non (`current`) | ✅ non (`current`) | — |
| Repli quand le magasin se tait | ✅ table de prix par pays | ✅ `app_config` | ✅ `app_config` |
| Remonte l'erreur réelle à l'écran | ❌ **avalée dans un `console.warn`** | ✅ | ✅ |

Le commentaire de Reveal Chat daté du **14/08/2026** décrit précisément le prix payé pour
l'avoir appris : un achat de 7,99 € encaissé sous un `$RCAnonymousID`, refusé à celui qui
l'avait payé, retrouvé à la main dans le tableau de bord. **Cosme Check a aujourd'hui
161 clients dont une large part en `$RCAnonymousID`** : la même fenêtre est ouverte.

---

## 6. Ce qui a été corrigé dans le code aujourd'hui

`lib/revenucat/client.ts`
- `initRevenueCat()` devient **une promesse mémorisée** + `ensureConfigured()` ; tous les
  appels au SDK passent par elle (`getOfferings`, `getProducts`, `getStorefront`,
  `getCustomerInfo`, `loginUser`, `logoutUser`).
- garde `nativeAvailable()` sur `NativeModules.RNPurchases`, comme Memory Pilot.
- **suppression du repli `EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY`** (la clé `test_`).
- `Purchases.setLogLevel(DEBUG en dev, INFO en release)`.
- `initDiagnostic()` et `storeDiagnostic()` : la raison de l'échec est **conservée**, avec
  le code d'erreur du SDK et l'appel fautif.

`hooks/usePurchases.ts`
- `STOREFRONT_TIMEOUT_MS` : 2 000 → **6 000 ms**.
- nouveau champ `diagnostic` dans l'état, renseigné à chaque échec, avec le nombre de
  packages, de produits et la storefront obtenue.

`lib/paywall/fallbackPrices.ts`
- table `CURRENCY_BY_REGION` (zone euro + 50 marchés) : quand `expo-localization` ne donne
  pas de devise, on la déduit du pays. **Fin des « 49,99 $US » à Toulouse.**

`app/offre/index.tsx`
- la ligne de diagnostic s'affiche sous le bandeau « prix indicatif », en petit, gris et
  sélectionnable.

`npx tsc --noEmit` : **aucune erreur** sur `app/`, `lib/`, `hooks/`, `components/`.

---

## 7. Ce qu'il reste à faire, et dans cet ordre

1. **`eas update --channel production`** depuis ton poste (le `.env` y est complet).
   Runtime **1.0.1** — c'est celle du binaire publié le 06/09.
2. **Rouvrir le paywall sur l'iPhone** et lire la petite ligne grise. Elle dira l'une de
   ces choses, et chacune désigne un coupable différent :
   - `SDK sans-natif` → le binaire n'embarque pas le module (impossible ici, mais on saura) ;
   - `SDK sans-cle` → la variable n'est pas dans le bundle installé ;
   - `getOfferings : CONFIGURATION_ERROR — …` → RevenueCat ne retrouve pas les produits ;
   - `getProducts : PRODUCT_NOT_AVAILABLE_FOR_PURCHASE` → **StoreKit refuse le produit**,
     c'est alors un sujet Apple/appareil ;
   - `magasin muet — offering: 2 package(s), produits: 0, storefront: FRA` → RevenueCat
     répond, StoreKit ne rend rien : sandbox, propagation, ou compte du magasin.
3. **Ajouter `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` dans EAS**, environnements
   `development` + `preview` + `production`, et **cocher aussi la clé iOS** pour les trois
   — comme Memory Pilot et Reveal Chat.
4. **Publier une seconde update pour la runtime `1.0.0`** si des iPhone y sont restés,
   sinon le correctif ne les atteindra jamais (`runtimeVersion: appVersion`).
5. **Supprimer les deux produits « Test Store »** dans RevenueCat.
6. **Reprendre le patron de Reveal Chat sur l'identité** : ne pas configurer sans
   identifiant, et vérifier `getAppUserID()` juste avant d'ouvrir la feuille de paiement.
   Ce n'est pas la panne du jour, mais c'est la panne qui coûte un remboursement.
