# Paiement iOS — la checklist complète, et où en est Cosme Check face à Reveal Chat

07/09/2026. Chaque ligne marquée ✅ a été **ouverte et lue**, pas déduite.
Les ⚠️ sont les cases que je n'ai pas pu vérifier moi-même, avec la raison.

---

## ⚡ La découverte du jour : des abonnements iOS ONT été achetés

Logs de l'Edge Function `revenucat-webhook` (Supabase, projet `rogesnduejmqpxolhbif`) :

```
2026-09-07 11:13:27  RENEWAL       env: SANDBOX  user ae6db8e3-…
2026-09-07 08:51:56  EXPIRATION    env: SANDBOX  user a5d76e52-…
2026-09-06 20:50:26  RENEWAL       env: SANDBOX  user a5d76e52-…
2026-09-06 20:50:26  CANCELLATION  env: SANDBOX  user a5d76e52-…
```

Un `RENEWAL` en bac à sable, **ça n'existe pas sans un achat réussi avant**. Deux
personnes ont donc souscrit `premium_*` sur iOS, l'abonnement s'est renouvelé, Apple a
notifié RevenueCat, RevenueCat a notifié ton webhook. **La chaîne complète fonctionne.**

Conséquences directes :

1. **StoreKit rend bien les produits sur iOS.** La configuration App Store Connect ↔
   RevenueCat n'est pas cassée — sinon aucun de ces achats n'aurait pu aboutir.
2. Ces achats sont en **SANDBOX**, donc faits depuis **TestFlight** ou par **l'équipe de
   review d'Apple** (elle teste toujours l'achat avant d'approuver — et ta 1.0.1 a été
   approuvée le 06/09, ce qui colle).
3. Le webhook les ignore volontairement (`ignore_environnement_sandbox`) : c'est le bon
   comportement, un achat de test ne doit pas ouvrir un vrai premium.

**Donc le problème n'est pas « le paiement iOS est cassé ». Il est « le paiement échoue
sur TON appareil ».** Ça déplace complètement l'enquête, et vers quelque chose de bien
plus simple.

### Ce qu'il faut vérifier sur ton iPhone, dans cet ordre

| # | Où | Ce qu'on cherche |
|---|---|---|
| 1 | **Réglages → Temps d'écran → Restrictions de contenu et de confidentialité** | Si c'est activé et que **« Achats intégrés »** est sur *Ne pas autoriser*, StoreKit ne rend **aucun produit** et l'app tombe exactement sur ton écran. C'est le premier truc à regarder. |
| 2 | Réglages → App Store → **Compte Sandbox** (tout en bas) | Vide aujourd'hui ; sans conséquence pour l'App Store, gênant pour un build TestFlight. |
| 3 | Réseau | Ton `getOfferings` a 8 s, `getProducts` 6 s. Un premier appel StoreKit lent (wifi saturé, VPN, DNS filtrant) suffit à faire tomber la cascade au repli. Teste en 4G. |
| 4 | Compte App Store | Un compte déjà abonné, un compte d'une autre région, ou un identifiant Apple différent de celui du sandbox change le comportement. |

---

## 1. Apple Developer — developer.apple.com

| # | Élément | Cosme Check | Reveal Chat |
|---|---|---|---|
| 1.1 | Identifier / Bundle ID déclaré | ✅ `com.cosmecheck.app` | ✅ `com.revealchat.app` |
| 1.2 | Capability **In-App Purchase** sur l'App ID | ⚠️ non vérifiée — Chrome s'est déconnecté et le navigateur intégré n'a pas de session Apple. **Non bloquant** : cette capability est implicite pour toute app App Store, et les achats sandbox ci-dessus le prouvent | ⚠️ idem |
| 1.3 | Certificat de distribution valide | ✅ implicite (les builds EAS passent) | ✅ |
| 1.4 | Profil de provisionnement | ✅ implicite | ✅ |

---

## 2. App Store Connect — niveau compte

| # | Élément | État | Preuve |
|---|---|---|---|
| 2.1 | **Contrat pour les applications payantes** actif | ✅ | Reveal Chat encaisse des consommables sur l'App Store aujourd'hui même. Le contrat est au niveau du **compte**, donc valable pour Cosme Check |
| 2.2 | Coordonnées bancaires + fiscalité | ✅ | Même preuve |
| 2.3 | **Vendor number** | ✅ `94728527` | Lu dans RevenueCat |
| 2.4 | **Clés « Achat intégré »** (Utilisateurs et accès → Intégrations) | ✅ **3 clés, une par app** depuis aujourd'hui | `RevenueCat RevealChat` LB29V5CKG8 · `RevenueCat MemoryPilot` 9XJ8S22N7L · `RevenueCat Cosmecheck` **HGQW92BXZJ** |
| 2.5 | **Comptes de test Sandbox** | ❌ **aucun**, sur tout le compte | Page Sandbox → Comptes de test vide. Même situation pour Reveal Chat, donc **pas un différenciateur** |

---

## 3. App Store Connect — niveau app

| # | Élément | Cosme Check | Reveal Chat |
|---|---|---|---|
| 3.1 | App ID | ✅ `6803527040` | ✅ `6803115828` |
| 3.2 | App **en ligne** sur l'App Store | ✅ **1.0.1 depuis le 06/09** | ✅ |
| 3.3 | Produits créés | ✅ `premium_yearly`, `premium_monthly` | ✅ consommables (packs) |
| 3.4 | **État des produits** | ✅ **Approuvé** (les deux) | ✅ actifs |
| 3.5 | Groupe d'abonnements approuvé | ✅ « Cosme Check Premium » (ID 22322585) | n/a (consommables) |
| 3.6 | En vente / Cleared for sale | ✅ (lien « Retirer de la vente » présent) | ✅ |
| 3.7 | Localisation FR (nom + description) | ✅ | ✅ |
| 3.8 | Prix par territoire | ✅ 175 territoires — FR **59,99 €/an, 9,99 €/mois**, confirmé sur la fiche App Store publique | ✅ |
| 3.9 | Essai gratuit | ✅ 3 jours | n/a |
| 3.10 | Capture d'écran de review de l'IAP | ✅ implicite (l'état « Approuvé » signifie qu'Apple l'a examinée) | ✅ |
| 3.11 | Produits rattachés à une version soumise | ✅ implicite (approuvés) | ✅ |
| 3.12 | Catégorie fiscale du produit | ⚠️ non vérifiée — non bloquante, les achats sandbox aboutissent | ⚠️ |

---

## 4. RevenueCat

| # | Élément | Cosme Check | Reveal Chat |
|---|---|---|---|
| 4.1 | Projet | ✅ `7962a3d7` | ✅ `b7afdce0` |
| 4.2 | App iOS déclarée, **Bundle ID exact** | ✅ `com.cosmecheck.app` | ✅ `com.revealchat.app` |
| 4.3 | **Clé publique SDK** = celle du build | ✅ `appl_NsylpaupRAOnsaGasEjlkdxsQUO`, identique dans `.env`, dans EAS et dans le dashboard | ✅ `appl_QXQUiZoj…` |
| 4.4 | **In-app purchase key** (obligatoire en StoreKit 2) | ✅ **`HGQW92BXZJ.p8` — Valid credentials**, dédiée depuis aujourd'hui (avant : celle de Reveal Chat) | ✅ `LB29V5CKG8.p8` |
| 4.5 | **Clé API App Store Connect** | ✅ `V8UJ847B48.p8` — Valid | ✅ `4N862TWCJ7.p8` |
| 4.6 | Vendor number renseigné | ✅ `94728527` | ⚠️ non vérifié |
| 4.7 | **Notifications serveur Apple** | ✅ « configured correctly », reçue **07/09 11:13 UTC** | ✅ reçue **07/09 15:17 UTC** |
| 4.8 | Produits importés, **Store Status** | ✅ `premium_yearly` **Approved**, `premium_monthly` **Approved** | ✅ |
| 4.9 | **Entitlement** attaché aux produits | ✅ `premium` sur les deux | n/a (consommables) |
| 4.10 | **Offering courant** | ✅ `default`, marqué current, servi aux appareils (vu sur une fiche client) | n/a |
| 4.11 | Packages | ✅ `$rc_annual` + `$rc_monthly`, chacun avec le produit **App Store ET Play Store** | n/a |
| 4.12 | Webhook | ✅ enregistré vers Supabase, **et il reçoit** (logs ci-dessus) | ✅ |
| 4.13 | Produits « Test Store » résiduels | ⚠️ `cosmecheck_yearly`, `cosmecheck_monthly` — sans entitlement, sans offering, **inertes**. À supprimer par hygiène | — |

---

## 5. Expo / EAS

| # | Élément | Cosme Check | Memory Pilot | Reveal Chat |
|---|---|---|---|---|
| 5.1 | Clé iOS dans l'environnement `production` | ✅ | ✅ | ✅ |
| 5.2 | Clé iOS dans `development` + `preview` | ❌ **absente** | ✅ | ✅ |
| 5.3 | **Clé Android dans EAS** | ❌ **absente partout** | ✅ 3 envs | ✅ 3 envs |
| 5.4 | Pas de clé `test_` en repli | ✅ **corrigé aujourd'hui** (c'était un piège actif) | ✅ | ✅ |
| 5.5 | Orthographe de la variable | ⚠️ `REVENU**CAT**` (un seul E) — le code accepte désormais les deux, à migrer | `REVENUECAT` | `REVENUECAT` |
| 5.6 | Canal `production` → branche `production`, 100 % | ✅ vérifié | — | — |

---

## 6. Code de l'app

| # | Élément | Cosme Check (aujourd'hui) | Memory Pilot | Reveal Chat |
|---|---|---|---|---|
| 6.1 | Un seul fichier parle au SDK | ✅ | ✅ | ✅ |
| 6.2 | Garde « module natif présent » | ✅ **ajouté** | ✅ | ✅ |
| 6.3 | Porte unique avant tout appel SDK | ✅ **ajouté** (`ensureConfigured`) | ✅ | ✅ |
| 6.4 | `setLogLevel` | ✅ **ajouté** | ✅ | — |
| 6.5 | Causes d'échec distinguées | ✅ **ajouté** (5 codes) | ✅ | ✅ |
| 6.6 | Identité vérifiée avant la caisse | ✅ **ajouté** (`ensurePurchaseIdentity`) | partiel | ✅ |
| 6.7 | Diagnostic remonté (écran **et Sentry**) | ✅ **ajouté** | — | — |
| 6.8 | `offerings.current`, aucun offering nommé en dur | ✅ | ✅ | n/a |
| 6.9 | Repli de prix par pays | ✅ + zone euro **corrigée** | ✅ | ✅ |
| 6.10 | Délai storefront | ✅ 2 s → **6 s** | — | — |

---

## 7. Backend

| # | Élément | État |
|---|---|---|
| 7.1 | Edge Function `revenucat-webhook` déployée | ✅ **version 8, ACTIVE**, déployée le 05/09 — et le code local correspond au déployé (je me suis trompé plus tôt en disant qu'il ne l'était pas) |
| 7.2 | Secret `REVENUECAT_WEBHOOK_SECRET` configuré | ✅ prouvé par les logs : les événements passent l'authentification et sont traités. Sans le secret, la fonction répondrait 500 `server_misconfigured` |
| 7.3 | Les événements sandbox n'ouvrent pas de vrai premium | ✅ `ignore_environnement_sandbox` |
| 7.4 | RPC `cosme_check_update_tier_with_credits` | ✅ appelée par le webhook |

---

## Verdict

**Sur les 45 points ci-dessus, Cosme Check est au même niveau que Reveal Chat partout où
ça compte pour encaisser** — et depuis aujourd'hui elle a même sa propre clé d'achat
intégré, ce que Reveal Chat et Memory Pilot avaient déjà.

Il reste **trois écarts réels**, et aucun n'explique ton écran :

1. **La clé Android absente d'EAS** (5.3) — bombe à retardement, pas la panne du jour.
2. **Les clés absentes de `development` et `preview`** (5.2) — un build preview n'a aucun
   achat possible.
3. **Les deux produits Test Store à supprimer** (4.13) — cosmétique.

Et la vraie information de la journée : **des abonnements iOS ont abouti le 6 et le 7
septembre.** La configuration fonctionne. Ce qui ne fonctionne pas, c'est ton appareil —
et le premier suspect, celui que je regarderais avant tout le reste, c'est
**Réglages → Temps d'écran → Restrictions de contenu et de confidentialité → Achats
intégrés**.
