# Pourquoi les utilisateurs iPhone n'arrivent pas à s'abonner

**Constats du 07/09/2026 — enquête terminée côté consoles et côté code.**

---

## Réponse courte

Deux causes, aucune côté magasin.

1. **La quasi-totalité des iPhone tourne encore sur le binaire 1.0.0**, dont le JS vient
   d'une mise à jour OTA publiée **il y a 17 jours** — donc **avant** le correctif du
   paywall du 04/09. Ces gens voient l'ancien écran mort : deux « … » et un bouton figé.
   Impossible d'acheter, littéralement. Et **aucune mise à jour OTA n'a jamais été publiée
   pour la runtime `1.0.1`**.
2. **Une course dans le code** : `initRevenueCat()` est lancé sans attendre
   (`void initRevenueCat()`), et `usePurchases()` interroge le SDK **sans vérifier qu'il est
   configuré**. Quand le paywall s'ouvre avant la fin de `Purchases.configure()`, le SDK
   lève `UninitializedPurchasesError` (« There is no singleton instance »), les trois
   niveaux de la cascade échouent en silence, et l'écran tombe sur le repli en dollars —
   où l'achat est **refusé par conception** (`canPurchase === false`).

Et non, **les abonnements de test ne gênent rien** (§4).

---

## Les preuves que le magasin est en ordre

| Vérification | Résultat |
|---|---|
| `premium_yearly` dans RevenueCat | **Store Status : Approved** |
| Entitlement | `premium` attaché aux deux produits |
| Offering | `default` → `$rc_annual` + `$rc_monthly`, produits App Store **et** Play Store |
| App Store Connect | Groupe « Cosme Check Premium » + les 2 abonnements : **Approuvé** |
| Page publique App Store (FR) | **Version 1.0.1 en ligne depuis 1 jour**, « Achats intégrés : Oui », description qui annonce **9,99 €/mois et 59,99 €/an** |
| In-app purchase key (StoreKit 2) | `LB29V5CKG8.p8` — *Valid credentials* |
| Notifications serveur Apple | « configured correctly », dernière reçue **aujourd'hui 11:13 UTC** |
| Clé `appl_` dans EAS `production` | présente, et le build 1.0.1 (7) date d'**après** son ajout |

Rien à corriger là. La table de prix générée dans le code (59,99 € / 9,99 €) correspond
même exactement à ce qu'Apple affiche publiquement.

---

## La preuve que le SDK se configure — mais trop tard

Un vrai client iOS dans RevenueCat, vu le 05/09 :

```
Last Seen App Version   : 1.0.0
Last Seen Platform      : iOS 26.6.1 (Build 23G83)
Last Seen Sdk Version   : react-native (iOS SDK 5.78.0)
Last Seen Locale        : fr-FR
Last Seen Storefront    : FRA        ← StoreKit a bien répondu… à un moment
Current offering        : default    ← l'offering est bien servi
```

Donc `Purchases.configure()` **s'exécute** sur iPhone, RevenueCat reçoit la storefront
française et sert l'offering. Le SDK n'est pas privé de clé.

Mais sur le produit App Store `premium_yearly`, RevenueCat affiche :

```
Recent Transactions : No transactions yet
```

**Zéro transaction iOS depuis toujours, pas même en sandbox.** Sur 161 clients, 1 seul
abonné payant — et il vient du **Play Store**.

Le SDK marche, le magasin marche, et pourtant pas un achat : c'est la signature d'un
paywall qui interroge le SDK **avant** qu'il soit prêt, puis qui s'interdit lui-même de
vendre.

---

## Cause n°1 — les iPhone sont restés sur l'ancien JS

`expo.dev → Over-the-air updates` ne contient **qu'une seule** mise à jour :

| Update | Canal | Runtime | Commit | Date |
|---|---|---|---|---|
| « fix(analyse): les etoiles Qualite ne contredisent plus les couleurs » | `production` | **1.0.0** | `b117bdf` | il y a **17 jours** |

Or le correctif du paywall est le commit **`b9ead54`** (« fix(paywall): afficher un prix de
repli par pays quand le magasin se tait »), postérieur. Il n'est donc **dans aucune update**.
Il n'existe que dans le binaire **1.0.1 (7)**, construit il y a 3 jours et publié sur l'App
Store **hier**.

Conséquence : tous les iPhone encore en 1.0.0 — et les clients RevenueCat le confirment,
`Last Seen App Version : 1.0.0` — exécutent le JS d'il y a 17 jours, celui de l'écran figé
sur « … ». Pour eux, s'abonner est impossible **quoi qu'on fasse côté magasin**.

`runtimeVersion` suit `appVersion` : une update publiée pour `1.0.1` ne descendra **jamais**
sur un binaire `1.0.0`. Il faut donc **deux** publications, une par runtime, ou attendre que
tout le monde passe en 1.0.1 par l'App Store.

---

## Cause n°2 — la course entre l'init du SDK et le paywall

`app/_layout.tsx`, lignes ~243-258 :

```tsx
function RevenueCatInit() {
  useEffect(() => {
    void initRevenueCat()      // ← lancé, jamais attendu
  }, [])
  ...
}
```

`RevenueCatInit` est monté **à côté** de `RootNavigator`, pas au-dessus :

```tsx
<CacheJanitor />
<RevenueCatInit />
<NotificationsInit />
<AuthGuard />
<RootNavigator />              // ← le paywall vit là-dedans
```

Et `hooks/usePurchases.ts` démarre sa cascade sans rien attendre :

```ts
useEffect(() => {
  void loadPrices()            // getOfferings() dès le montage
  void loadCustomer()
}, [loadPrices, loadCustomer])
```

Dans le SDK (`node_modules/react-native-purchases/dist/purchases.js`) :

```js
var isConfigured = await Purchases.isConfigured();
if (!isConfigured) {
  throw new UninitializedPurchasesError();   // "There is no singleton instance…"
}
```

Donc si le paywall se peint avant la fin de `configure()` :

- `getOfferings()` lève → `catch` → `console.warn` → **`null`** ;
- `getProductsDirect()` lève → `catch` → **`[]`** ;
- `getStorefrontCountry()` lève → `catch` → **`null`** ;
- niveau 3 : `resolveFallbackTier()` sans région ni devise → palier **`DEFAULT_CURRENCY = 'USD'`**
  → **49,99 $US / 8,99 $US**, badge 54 %. **Exactement ta capture.**
- et `canPurchase` vaut `false`, donc l'app **refuse elle-même la vente** et affiche
  « Recharger les tarifs ».

Le flux de navigation rend ça systématique pour un nouvel inscrit :
`Préonboarding → Auth → Onboarding → PAYWALL`. Le paywall arrive tôt, parfois quelques
secondes après le lancement.

**Pire** : le bouton « Recharger les tarifs » appelle `retry()`, qui rejoue `loadPrices()` et
`loadCustomer()` — mais **jamais `initRevenueCat()`**. Si l'init a échoué (et pas seulement
tardé), l'écran reste mort pour toute la session, quel que soit le nombre d'appuis.

Trois défauts de structure se cumulent ici, et Memory Pilot les a tous les trois résolus :
il vérifie `NativeModules.RNPurchases != null` avant chaque appel, il distingue
`sansNatif` / `sansCle` / `panne`, et il garde un drapeau `configure` idempotent.

---

## Le correctif

### a) Synchroniser l'init et le paywall (le cœur)

Dans `lib/revenucat/client.ts` : faire de `initRevenueCat()` une promesse **mémorisée**, et
exposer une garde.

```ts
let initPromise: Promise<boolean> | null = null

export function initRevenueCat(): Promise<boolean> {
  if (!initPromise) initPromise = doInit()
  return initPromise
}

async function doInit(): Promise<boolean> {
  if (NativeModules.RNPurchases == null) return false        // Expo Go, banc d'essai
  const apiKey = Platform.select({ ios: API_KEY.ios, android: API_KEY.android }) ?? ''
  if (!apiKey) return false
  try {
    if (await Purchases.isConfigured()) return true
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO)
    await Purchases.configure({ apiKey })
    return true
  } catch (err) {
    console.warn('[RevenueCat] init failed:', err)
    initPromise = null                                       // réessayable
    return false
  }
}

/** À appeler AVANT tout appel au SDK. */
export async function ensureConfigured(): Promise<boolean> {
  return initRevenueCat()
}
```

Puis, dans `hooks/usePurchases.ts`, en tête de `loadPrices()` **et** de `loadCustomer()` :

```ts
const ready = await ensureConfigured()
if (!ready) { /* niveau 3 directement, et le dire */ }
```

et faire pointer `retry()` sur `ensureConfigured()` aussi, pas seulement sur les deux
chargements.

### b) Supprimer le repli `test_` du calcul de la clé

`EXPO_PUBLIC_REVENUCAT_PUBLIC_KEY` vaut `test_…` dans le `.env` local. Il n'est pas dans EAS
aujourd'hui — mais le jour où quelqu'un l'y ajoute, **tous les achats en release
s'éteignent en silence**. À retirer de `lib/revenucat/client.ts`.

### c) Réparer l'affichage en dollars (bug distinct)

- `STOREFRONT_TIMEOUT_MS` : **2 000 → 6 000 ms**. Un premier appel StoreKit à froid dépasse
  couramment 2 s.
- **Ajouter `FR`** (et la zone euro) à `PRICES_BY_REGION`, ou déduire la devise depuis la
  région. Aujourd'hui `expo-localization` peut rendre `currencyCode: null`, et comme `FR`
  n'est pas dans la table des 29 régions, un iPhone français tombe sur le palier USD.

### d) Publier, dans le bon ordre

1. `eas update --channel production` **depuis un poste où le `.env` est complet** — cela
   sert la runtime **1.0.1** (les nouveaux installés d'hier).
2. Publier une **seconde** update pour la runtime **1.0.0**, sinon les iPhone pas encore
   mis à jour restent sur l'écran figé. (Vérifier que le JS reste compatible avec ce
   binaire ; sinon, pousser une 1.0.2 sur l'App Store et accepter le délai.)
3. **Ajouter `EXPO_PUBLIC_REVENUCAT_ANDROID_KEY` dans l'environnement EAS `production`** :
   elle n'y est **pas**. Android ne vend aujourd'hui que parce que les AAB sortent de ta
   machine avec le `.env` local. Le premier build lancé d'ailleurs tuera les achats Android
   sans un mot.

---

## 4. Et les abonnements de test ?

Ils sont toujours là, mais **ils ne peuvent rien casser** :

| Produit | Emplacement | Entitlement | Offering | Créé |
|---|---|---|---|---|
| `cosmecheck_yearly` (Yearly Premium) | **Test Store** de RevenueCat | **aucun** (bouton « Attach ») | aucun | 29/06/2026 |
| `cosmecheck_monthly` (Monthly Premium) | **Test Store** | **aucun** | aucun | 29/06/2026 |

Le Test Store de RevenueCat n'est servi qu'à une app configurée avec une clé **`test_…`**.
Le build de production utilise `appl_Nsylpaup…`, donc ces deux produits sont invisibles pour
l'app. Ils ne sont attachés à aucun entitlement et ne figurent dans aucun offering.

Ce sont les identifiants du plan d'origine (`REVENUCAT_INTEGRATION.md`), abandonnés au profit
de `premium_monthly` / `premium_yearly`. À supprimer pour ne plus jamais se poser la
question — mais ce n'est **pas** la cause de la panne.
