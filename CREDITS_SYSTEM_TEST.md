# Plan de test complet — Système de crédits refactorisé

Date: 2026-07-02
Version: 1.0

## Overview

Le système de crédits a été complètement refactorisé pour supporter des périodes de renouvellement modulables (daily, weekly, monthly, yearly, one_time). Ce document décrit les tests à effectuer pour valider la migration.

## Architecture

### Schéma existant
```
user_credits(user_id, day, used, daily_limit)  [existante]
↓
cosme_check_get_credits() RPC [refactorisée]
↓
useCredits() hook [mise à jour]
```

### Schéma nouveau
```
credit_tiers(tier, credit_amount, renewal_period, renewal_interval_days)  [nouvelle]
user_credits_override(user_id, credit_amount, renewal_period, renewal_interval_days, active)  [nouvelle]
↓
cosme_check_get_credits() RPC [rewrite complet]
cosme_check_admin_get_credit_tiers() [nouvelle]
cosme_check_admin_update_credit_tier() [nouvelle]
cosme_check_admin_set_user_override() [nouvelle]
↓
useCredits() hook [polling 10s]
Admin CreditsPageClient [UI mise à jour]
```

---

## PHASE 1: DATABASE & MIGRATION

### Prérequis
- [ ] Migration `20260702_refactor_credits_system.sql` prête
- [ ] Sauvegarde de la base de production effectuée
- [ ] Terminal accès Supabase CLI configuré

### Test 1.1: Appliquer la migration

**Commande:**
```bash
supabase db push --project-ref rogesnduejmqpxolhbif
```

**Vérifications:**
- [ ] Pas d'erreur SQL
- [ ] Tables créées: `credit_tiers`, `user_credits_override`
- [ ] RPCs créées:
  - [ ] `cosme_check_admin_get_credit_tiers`
  - [ ] `cosme_check_admin_update_credit_tier`
  - [ ] `cosme_check_admin_get_user_overrides`
  - [ ] `cosme_check_admin_set_user_override`
  - [ ] `cosme_check_admin_get_user_credits_config`
  - [ ] `cosme_check_get_credits` (rewrite)
- [ ] Colonnes ajoutées à `user_credits`:
  - [ ] `renewal_period` VARCHAR
  - [ ] `renewal_interval_days` INT
  - [ ] `last_renewal_at` TIMESTAMP

**Commande de vérification:**
```sql
-- Vérifier les tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'cosme_check' 
AND table_name IN ('credit_tiers', 'user_credits_override');

-- Vérifier les RPCs
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'cosme_check' 
AND routine_name LIKE 'cosme_check_admin%';

-- Vérifier les colonnes user_credits
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_schema = 'cosme_check' 
AND table_name = 'user_credits' 
ORDER BY ordinal_position;
```

### Test 1.2: Données initiales

**Vérification:**
```sql
SELECT * FROM cosme_check.credit_tiers;
```

**Résultat attendu:**
```
tier     | credit_amount | renewal_period | renewal_interval_days
---------|---------------|----------------|---------------------
free     | 5             | daily          | 1
premium  | 100           | monthly        | 30
```

---

## PHASE 2: ADMIN INTERFACE (CosmeCheckAdmin)

### Prérequis
- [ ] Migration appliquée
- [ ] API routes vérifiées (`/api/credits/actions`, `/api/credits/tiers`, `/api/credits/users`)
- [ ] Admin web accessible sur `http://localhost:3000/dashboard/settings/credits`

### Test 2.1: Charger la page d'administration

**Actions:**
1. Ouvrir `http://localhost:3000/dashboard/settings/credits`
2. Attendre le chargement de la page

**Vérifications:**
- [ ] 3 onglets affichés: "Tiers (Free/Premium)", "Overrides utilisateurs", "Journal d'audit"
- [ ] Onglet "Tiers" actif par défaut
- [ ] Deux cartes affichées: "👤 Free (Gratuit)" et "⭐ Premium"
- [ ] Chaque carte affiche:
  - [ ] Nombre de crédits
  - [ ] Fréquence de renouvellement
  - [ ] Bouton "Modifier"

### Test 2.2: Modifier le tier FREE

**Actions:**
1. Cliquer "Modifier" sur la carte "Free"
2. Changer "Nombre de crédits": 5 → 10
3. Changer "Fréquence de renouvellement": "Par jour" → "Par semaine"
4. Cliquer "Sauvegarder"

**Vérifications DB (Supabase SQL):**
```sql
SELECT * FROM cosme_check.credit_tiers WHERE tier = 'free';
```

**Résultat attendu:**
```
tier | credit_amount | renewal_period | renewal_interval_days | updated_at
-----|---------------|-----------------|---------------------|-----------
free | 10            | weekly          | 7                      | [now]
```

**Vérifications UI:**
- [ ] Message de succès apparaît
- [ ] Carte "Free" mise à jour en temps réel:
  - [ ] "Crédits: 10"
  - [ ] "Renouvellement: 📆 Par semaine"

### Test 2.3: Modifier le tier PREMIUM

**Actions:**
1. Cliquer "Modifier" sur la carte "Premium"
2. Changer "Nombre de crédits": 100 → 500
3. Garder "Fréquence de renouvellement": "Par mois"
4. Cliquer "Sauvegarder"

**Vérifications DB:**
```sql
SELECT * FROM cosme_check.credit_tiers WHERE tier = 'premium';
```

**Résultat attendu:**
```
tier    | credit_amount | renewal_period | renewal_interval_days | updated_at
--------|---------------|-----------------|---------------------|-----------
premium | 500           | monthly        | 30                      | [now]
```

### Test 2.4: Onglet "Overrides utilisateurs"

**Actions:**
1. Cliquer sur l'onglet "Overrides utilisateurs"
2. Attendre le chargement de la table

**Vérifications UI:**
- [ ] Table affichée avec colonnes: Email, Tier, Crédits, Renouvellement, Aujourd'hui, Override, Actions
- [ ] Liste des utilisateurs affichée (au moins 2-3 si disponible)
- [ ] Colonne "Override": "Non" pour tous les utilisateurs au départ
- [ ] Champ recherche fonctionnel

### Test 2.5: Créer un override pour un utilisateur

**Actions:**
1. Chercher un utilisateur (ex: "BRIAN")
2. Cliquer "Modifier" sur cet utilisateur
3. Remplir le formulaire:
   - Crédits: 100
   - Renouvellement: Par jour
4. Cliquer "Appliquer"

**Vérifications DB:**
```sql
SELECT * FROM cosme_check.user_credits_override WHERE active = true;
```

**Résultat attendu (1 ligne):**
```
user_id         | credit_amount | renewal_period | renewal_interval_days | active | updated_at
----------------|---------------|-----------------|---------------------|---------|-----------
[UUID BRIAN]    | 100           | daily          | 1                      | true    | [now]
```

**Vérifications UI:**
- [ ] Message de succès: "Override appliqué avec succès"
- [ ] Formulaire ferme automatiquement
- [ ] Table se réactualise
- [ ] Colonne "Override" passe à "Oui" (badge orange)
- [ ] Colonne "Crédits" affiche 100 (non 5 du tier free)
- [ ] Colonne "Renouvellement" affiche "Par jour"

### Test 2.6: Supprimer l'override

**Actions:**
1. Cliquer à nouveau "Modifier" sur l'utilisateur avec override
2. Cliquer le bouton rouge avec icône corbeille "Supprimer"

**Vérifications DB:**
```sql
SELECT * FROM cosme_check.user_credits_override WHERE user_id = '[UUID BRIAN]';
```

**Résultat attendu:**
```
active = false  (la ligne persiste, mais inactive pour audit)
```

**Vérifications UI:**
- [ ] Message de succès: "Override supprimé"
- [ ] Colonne "Override" redevient "Non"
- [ ] Crédits affichés redeviennent ceux du tier

---

## PHASE 3: MOBILE APP (useCredits hook)

### Prérequis
- [ ] Migration appliquée
- [ ] Types TypeScript mis à jour (`lib/supabase/types.ts`)
- [ ] Hook mis à jour (`hooks/useCredits.ts`)
- [ ] App compilée et testée en dev

### Test 3.1: Hook retourne les bonnes données

**Code de test (dans un composant debug):**
```typescript
import { useCredits } from '@/hooks/useCredits'

export function DebugCredits() {
  const { credits, remaining, limit, used, renewalPeriod, renewalIntervalDays } = useCredits()

  return (
    <div>
      <p>Used: {used}</p>
      <p>Limit: {limit}</p>
      <p>Remaining: {remaining}</p>
      <p>Renewal Period: {renewalPeriod}</p>
      <p>Renewal Interval Days: {renewalIntervalDays}</p>
      <p>Full: {JSON.stringify(credits, null, 2)}</p>
    </div>
  )
}
```

**Scénario A: Utilisateur FREE (pas d'override)**
- [ ] `limit` affiche 10 (valeur modifiée dans admin)
- [ ] `renewalPeriod` affiche "weekly"
- [ ] `renewalIntervalDays` affiche 7

**Scénario B: Utilisateur avec override (BRIAN)**
- [ ] `limit` affiche 100 (valeur de l'override, pas du tier)
- [ ] `renewalPeriod` affiche "daily"
- [ ] `renewalIntervalDays` affiche 1

### Test 3.2: Polling détecte les changements admin

**Étapes:**
1. Ouvrir l'app (utilisateur BRIAN actif)
2. Noter les crédits affichés: `limit = 100, renewalPeriod = daily`
3. **Sans fermer l'app**, aller dans l'admin et:
   - [ ] Modifier l'override BRIAN: 100 crédits → 50 crédits
   - [ ] Cliquer "Sauvegarder"
4. Revenir à l'app
5. Attendre 10-12 secondes (polling cycle)
6. Vérifier que les crédits se sont mis à jour

**Vérifications:**
- [ ] Après 10s, `limit` passe de 100 à 50 sans recharger l'app
- [ ] Pas de refresh/rechargement visible, mise à jour en arrière-plan
- [ ] CreditsPill (affichage des crédits) se met à jour

### Test 3.3: Refresh manuel fonctionne

**Code:**
```typescript
const { refresh } = useCredits()

// Appeler le refresh
refresh()
```

**Vérifications:**
- [ ] RPC `cosme_check_get_credits()` appelée immédiatement
- [ ] Données mises à jour
- [ ] Pas d'erreur console

---

## PHASE 4: INTÉGRATION GLOBALE

### Test 4.1: Flow complet admin → mobile

**Scenario: Admin change le tier FREE de 5→15 crédits/jour**

1. Admin:
   - [ ] Ouvrir page `/dashboard/settings/credits`
   - [ ] Cliquer "Modifier" sur "Free"
   - [ ] Changer 10 → 15
   - [ ] Cliquer "Sauvegarder"

2. Mobile (utilisateur FREE):
   - [ ] App ouverte, affiche 10 crédits
   - [ ] Attendre 10-12 secondes
   - [ ] Vérifier que l'affichage passe à 15 crédits
   - [ ] Vérifier que le `renewalPeriod` reste "weekly"

3. DB:
   - [ ] Vérifier que `credit_tiers.credit_amount = 15` pour `tier = 'free'`

### Test 4.2: Flow utilisateur avec override

**Scenario: Admin crée override pour USER2, puis le supprime**

1. Admin:
   - [ ] Aller à l'onglet "Overrides utilisateurs"
   - [ ] Chercher USER2
   - [ ] Cliquer "Modifier"
   - [ ] Remplir: 200 crédits, Par mois
   - [ ] Cliquer "Appliquer"

2. Mobile (USER2):
   - [ ] L'app affiche 200 crédits (override) au lieu du tier original
   - [ ] `renewalPeriod = 'monthly'`

3. Admin (même session):
   - [ ] Cliquer "Modifier" USER2
   - [ ] Cliquer le bouton corbeille "Supprimer"

4. Mobile (USER2):
   - [ ] Après ~10s, revenir aux crédits du tier original
   - [ ] RPC redevient conforme au `tier` de l'utilisateur

### Test 4.3: CreditsPill affiche la bonne période

**Vérifications visuelles (mobile):**

Pour utilisateur FREE:
- [ ] CreditsPill affiche: "10 crédits (par semaine)" ou équivalent
- [ ] Icône/couleur cohérente

Pour utilisateur PREMIUM:
- [ ] CreditsPill affiche: "500 crédits (par mois)"

Pour utilisateur avec override:
- [ ] CreditsPill affiche: "100 crédits (par jour)"

---

## PHASE 5: EDGE CASES & VALIDATION

### Test 5.1: Utilisateur sans profil (authentifié mais pas d'entrée user_profiles)

**RPC `cosme_check_get_credits()`:**
- [ ] Retourne une erreur gracieuse ou default
- [ ] Pas de crash

**Code à exécuter:**
```sql
-- Créer un test user sans profil
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'test-no-profile@example.com',
  crypt('password', gen_salt('bf')),
  now(),
  now(),
  now()
) RETURNING id;

-- Appeler la RPC avec cet ID
SELECT cosme_check_get_credits() AS result;
```

**Résultat attendu:** `{ "ok": false, "error": "..." }` ou NULL

### Test 5.2: Période one_time

**Admin:**
1. Créer override avec "Une seule fois"
2. Vérifier que `renewal_interval_days = NULL` en DB

**Mobile:**
- [ ] `renewalPeriod = 'one_time'`
- [ ] `renewalIntervalDays = null`

### Test 5.3: Montants extrêmes

**Admin:**
1. Mettre FREE à 0 crédits
2. Mettre PREMIUM à 10000 crédits

**Mobile:**
- [ ] FREE affiche 0 (remaining = 0)
- [ ] PREMIUM affiche 10000 (pas de débordement UI)

### Test 5.4: Périodes invalides (sécurité RPC)

**Code SQL direct:**
```sql
SELECT cosme_check_admin_update_credit_tier('free', 5, 'invalid_period', NULL);
```

**Résultat attendu:** `{ "ok": false, "error": "Invalid renewal_period" }`

---

## PHASE 6: AUDIT & MONITORING

### Test 6.1: Logs admin

**Vérifications:**
- [ ] Chaque changement de tier loggé
- [ ] Chaque override loggé
- [ ] Chaque suppression loggé

**Onglet "Journal d'audit":**
- [ ] Affiche la liste des changements
- [ ] Timestamps corrects
- [ ] Colonne "Action" claires

### Test 6.2: Performance

**Scenario:**
1. Admin modifie le tier PREMIUM
2. 10 utilisateurs PREMIUM utilisent l'app
3. Chacun appelle `useCredits()` immédiatement

**Vérifications:**
- [ ] Pas de timeout RPC
- [ ] Latence < 200ms pour chaque appel
- [ ] Aucun N+1 queries

---

## ROLLBACK (if needed)

**Commande:**
```bash
supabase db reset --project-ref rogesnduejmqpxolhbif
# ou
git revert [migration commit]
supabase db push
```

---

## Checklist finale

- [ ] Phase 1: Migration appliquée, RPCs créées ✓
- [ ] Phase 2: Admin UI fonctionnelle, tiers modifiables ✓
- [ ] Phase 3: Hook polling 10s détecte changements ✓
- [ ] Phase 4: Flow admin→mobile complet ✓
- [ ] Phase 5: Edge cases gérés ✓
- [ ] Phase 6: Logs et perf OK ✓
- [ ] Tous les tests passent ✓
- [ ] Code reviewé et mergé ✓
- [ ] Déployé en production ✓

---

## Notes de débogage

### Query RPC directement en dev
```typescript
// Dans une console mobile ou un composant test
const { data, error } = await supabase.rpc('cosme_check_get_credits')
console.log('Credits:', { data, error })
```

### Vérifier le polling
```typescript
// Ajouter un log dans useCredits
useEffect(() => {
  const interval = setInterval(() => {
    console.log('[Credits] Polling...', new Date())
    refetch()
  }, 10000)
  return () => clearInterval(interval)
}, [refetch])
```

### Inspecter les données Supabase
```bash
supabase db pull  # Sync locale
supabase start    # Lancer le serveur local
# Puis ouvrir http://localhost:54323 (Supabase Studio local)
```

---

**Document créé:** 2026-07-02
**Prochaines étapes:** Exécuter les tests phase par phase, documenter les résultats.
