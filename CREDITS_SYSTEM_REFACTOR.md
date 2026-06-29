# Refactoring du système de crédits — Documentation complète

**Date:** 2026-07-02
**Statut:** Implementation complete, tests pending

## Résumé exécutif

Le système de crédits a été **complètement refactorisé** pour supporter des **périodes de renouvellement modulables** (daily, weekly, monthly, yearly, one_time) au lieu de la structure fixe précédente (jour/daily_limit seulement).

### Améliorations clés
- ✅ Périodes flexibles par tier (Free, Premium)
- ✅ Overrides individuels par utilisateur avec audit
- ✅ Admin interface complète (3 onglets)
- ✅ Polling automatique mobile (10s) pour détecter changements admin
- ✅ Types TypeScript mis à jour
- ✅ Migration SQL complète avec RLS

---

## Architecture complète

### Avant (ancienne structure)
```
user_credits(user_id, day, used, daily_limit)
↓
RPC cosme_check_get_credits() → { ok, used, limit, remaining }
↓
useCredits() hook (staleTime 60s)
```

**Limitation:** Tous les crédits renouvellent **quotidiennement** (hardcoded). Impossible d'avoir mensuel/yearly.

### Après (nouvelle structure)
```
credit_tiers(tier, credit_amount, renewal_period, renewal_interval_days)
user_credits_override(user_id, credit_amount, renewal_period, active)
user_credits(user_id, day, used, daily_limit, renewal_period, renewal_interval_days)
↓
6 RPCs:
  - cosme_check_get_credits() [rewrite]
  - cosme_check_admin_get_credit_tiers()
  - cosme_check_admin_update_credit_tier()
  - cosme_check_admin_get_user_overrides()
  - cosme_check_admin_set_user_override()
  - cosme_check_admin_get_user_credits_config()
↓
useCredits() hook (staleTime 30s, polling 10s)
Admin CreditsPageClient (3 onglets)
```

---

## Fichiers modifiés / créés

### 1. Base de données
- **Créé:** `supabase/migrations/20260702_refactor_credits_system.sql` (350 lignes)
  - Tables: `credit_tiers`, `user_credits_override`
  - Colonnes ajoutées à `user_credits`: renewal_period, renewal_interval_days, last_renewal_at
  - RPCs: 6 nouvelles + 1 rewrite
  - RLS policies, indexes, grants

### 2. Types TypeScript
- **Modifié:** `lib/supabase/types.ts`
  - Ajout `RenewalPeriod` type
  - Mise à jour `Credits` interface (+ renewal_period, renewal_interval_days)
  - Nouvelles tables: `credit_tiers`, `user_credits_override`
  - Colonnes mises à jour: `user_credits`

### 3. Mobile App
- **Modifié:** `hooks/useCredits.ts` (90 lignes)
  - Polling 10s automatique (setInterval)
  - Retour renewal_period, renewal_interval_days
  - staleTime réduit 60s → 30s
  - useEffect pour polling, cleanup correct

### 4. Admin Interface (CosmeCheckAdmin)
- **Modifié:** `app/(dashboard)/settings/credits/page.tsx`
  - Types à jour: renewal_period (one_time | daily | weekly | monthly | yearly)
  
- **Modifié:** `app/(dashboard)/settings/credits/CreditsPageClient.tsx`
  - Types à jour
  
- **Modifié:** `app/(dashboard)/settings/credits/CreditTiersManager.tsx`
  - Labels à jour avec icônes (✨ 📅 📆 📊 📈)
  - Suppression du "custom interval" (auto-calculé par RPC)
  - Interaction identique pour user
  
- **Modifié:** `app/(dashboard)/settings/credits/UserCreditsOverride.tsx`
  - Labels à jour
  - Mapping corrigé pour API response
  - Suppression du champ "custom interval"
  
- **Modifié:** `app/api/credits/actions/route.ts`
  - Appels RPC corrigés:
    - `cosme_check_admin_update_credit_tier` (au lieu de cosme_check_update_credit_tier)
    - `cosme_check_admin_set_user_override` (au lieu de cosme_check_set_user_credit_override)
  - Paramètre `p_active: true` ajouté pour set_override
  
- **Modifié:** `app/api/credits/users/route.ts`
  - Appel RPC `cosme_check_admin_get_user_credits_config` (nouvelle)
  - Mapping corrigé: creditAmount, renewalPeriod, renewalIntervalDays
  - Response structure: { data: [...] }

### 5. Documentation
- **Créé:** `CREDITS_SYSTEM_TEST.md` (400+ lignes)
  - Plan de test complet 6 phases
  - Scenario par scenario avec vérifications DB/UI
  - Edge cases
  - Rollback procedure
  
- **Créé:** `CREDITS_SYSTEM_REFACTOR.md` (ce fichier)
  - Architecture
  - Fichiers modifiés
  - Comment utiliser le système
  - Déploiement

---

## Comment utiliser le système

### 1. Admin: Modifier le tier FREE

```
Naviguer à: http://admin.cosme-check.com/dashboard/settings/credits
→ Onglet "Tiers (Free/Premium)" [déjà actif]
→ Cliquer "Modifier" sur la carte "Free"
→ Montant: 5 → 10
→ Période: "Par jour" → "Par semaine"
→ Cliquer "Sauvegarder"
```

**Résultat:**
- Tous les nouveaux utilisateurs FREE ont 10 crédits/semaine
- Users actuels reçoivent le changement dans 10s (polling)

### 2. Admin: Créer un override pour USER

```
→ Onglet "Overrides utilisateurs"
→ Chercher "USER@EMAIL.COM"
→ Cliquer "Modifier"
→ Montant: 100
→ Période: "Par jour"
→ Cliquer "Appliquer"
```

**Résultat:**
- USER a 100 crédits/jour (indépendant du tier)
- Persisté dans `user_credits_override` pour audit
- Mobile détecte dans 10s

### 3. Mobile: Afficher les crédits

**Code:**
```typescript
import { useCredits } from '@/hooks/useCredits'

export function ShowCredits() {
  const { limit, used, remaining, renewalPeriod, renewalIntervalDays } = useCredits()

  return (
    <div>
      <p>{remaining} / {limit} crédits</p>
      <p>Renouvellement: {renewalPeriod}</p>
    </div>
  )
}
```

**Output:**
```
10 / 10 crédits
Renouvellement: weekly
```

### 4. Mobile: Détecter changements admin

```typescript
const { credits, refresh } = useCredits()

// Automatique: polling 10s
// Ou manuel:
<button onClick={refresh}>Actualiser</button>
```

---

## Types TypeScript

### RenewalPeriod
```typescript
export type RenewalPeriod = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'yearly'
```

### Credits (retourné par RPC)
```typescript
export interface Credits {
  ok: boolean
  used?: number
  limit?: number
  remaining?: number
  renewal_period?: RenewalPeriod
  renewal_interval_days?: number
  error?: string
}
```

### useCredits() return
```typescript
interface UseCreditsReturn {
  credits: Credits | null
  remaining: number
  limit: number
  used: number
  renewalPeriod: RenewalPeriod | null
  renewalIntervalDays: number | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}
```

---

## RPC Reference

### cosme_check_get_credits()
**Args:** none
**Returns:** Credits (jsonb)
**Comportement:**
1. Récupère le tier de l'utilisateur
2. Cherche un override actif
3. Si override: utilise les valeurs de l'override
4. Si pas override: utilise les valeurs du tier
5. Calcule `remaining = limit - used`

**Exemple:**
```typescript
const { data } = await supabase.rpc('cosme_check_get_credits')
// {
//   ok: true,
//   used: 2,
//   limit: 10,
//   remaining: 8,
//   renewal_period: 'weekly',
//   renewal_interval_days: 7
// }
```

### cosme_check_admin_get_credit_tiers()
**Args:** none
**Returns:** Table(tier, credit_amount, renewal_period, renewal_interval_days)
**Utilisé par:** Admin page, API /api/credits/tiers

### cosme_check_admin_update_credit_tier(tier, credit_amount, renewal_period, renewal_interval_days)
**Args:**
- tier: 'free' | 'premium'
- credit_amount: INT (0-10000)
- renewal_period: 'one_time' | 'daily' | 'weekly' | 'monthly' | 'yearly'
- renewal_interval_days: INT (auto-calculé, peut être NULL)

**Returns:** jsonb { ok, tier, credit_amount, renewal_period, renewal_interval_days }

**Utilisé par:** API /api/credits/actions?action=update_tier

### cosme_check_admin_set_user_override(user_id, credit_amount, renewal_period, renewal_interval_days, active)
**Args:**
- user_id: UUID
- credit_amount: INT
- renewal_period: RenewalPeriod
- renewal_interval_days: INT (NULL ok)
- active: BOOLEAN (default true)

**Returns:** jsonb { ok, user_id, ... }

**Utilisé par:** API /api/credits/actions?action=set_override

### cosme_check_admin_get_user_credits_config(user_id)
**Args:** user_id UUID
**Returns:** Table(tier, credit_amount, renewal_period, renewal_interval_days, has_override, override_active)

**Utilisé par:** API /api/credits/users (pour afficher chaque user)

---

## Déploiement

### 1. Vérifier que tout compil
```bash
cd /d/MesApps/deploy/CosmeCheck-App
npx tsc --noEmit
# 0 erreur attendu
```

### 2. Appliquer la migration
```bash
supabase db push --project-ref rogesnduejmqpxolhbif
# ou via MCP: apply_migration name=refactor_credits_system
```

### 3. Rebuild + déployer l'app mobile
```bash
npx expo publish  # ou expo build
```

### 4. Rebuild + déployer l'admin
```bash
cd ../CosmeCheckAdmin
npm run build
npm run start  # ou vercel deploy
```

### 5. Tester avec la checklist en CREDITS_SYSTEM_TEST.md

---

## Sécurité & Audit

### RLS Policies
- `credit_tiers`: SELECT all, WRITE admin-only
- `user_credits_override`: SELECT self, WRITE admin-only

### Audit Trail
- Chaque modification de tier/override laisse une trace dans `user_credits_override.updated_at`
- Onglet "Journal d'audit" affiche l'historique

### Validation
- RPC valide `renewal_period` (whitelist 5 valeurs)
- RPC calcule automatiquement `renewal_interval_days` → pas d'erreur manual
- Montants validés: INT 0-10000

---

## Troubleshooting

### Problème: Mobile affiche toujours l'ancienne limite
**Cause:** Polling ne s'est pas déclenché ou RPC mauvais
**Vérifications:**
1. Console: `[Credits] Polling...` logs toutes les 10s?
2. RPC `cosme_check_get_credits()` retourne le bon `limit`?
3. `renewal_period` correct en DB?

**Fix:**
```bash
# Forcer un refresh
const { refresh } = useCredits()
refresh()

# Ou vérifier la RPC directement
supabase.rpc('cosme_check_get_credits').then(console.log)
```

### Problème: Admin ne peut pas sauvegarder les tiers
**Cause:** API call échoue
**Vérifications:**
```bash
curl -X POST http://admin/api/credits/actions \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_tier",
    "tier": "free",
    "creditAmount": 10,
    "renewalPeriod": "weekly",
    "renewalIntervalDays": null
  }'
```

**Vérifier:** Supabase server logs, RPC permissions

### Problème: Override n'apparaît pas sur mobile
**Cause:** RPC cherche override mais table est vide
**Vérifications:**
```sql
SELECT * FROM cosme_check.user_credits_override 
WHERE user_id = '[UUID]' AND active = true;
```

Si vide: admin n'a pas sauvegardé, ou API call échouée

---

## Roadmap future

1. **Renouvellement auto** : Cron job pour reset crédits selon la `renewal_period`
2. **Bonus de fidélité** : multiplicateur per-user
3. **Historique** : table `user_credits_history` avec tous les resets
4. **Dashboard** : graphique usage/quota
5. **Webhooks** : notifications sur épuisement

---

## Contact & Support

- **Migration:** `supabase/migrations/20260702_refactor_credits_system.sql`
- **Tests:** `CREDITS_SYSTEM_TEST.md`
- **Questions:** Consulter `CLAUDE.md` section Crédits

---

**Documentation v1.0 — 2026-07-02**
