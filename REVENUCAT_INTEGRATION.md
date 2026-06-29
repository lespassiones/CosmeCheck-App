# RevenueCat Integration Plan

**Status**: Planning phase  
**Date**: 2026-06-29

## Overview
- **Paywall location**: After onboarding (when user completes profile)
- **Offers**: Monthly (4.99€, 100 credits/mo) + Yearly (49.99€)
- **Action on purchase**: Set `user_profiles.tier = 'premium'`, sync credits
- **Credit system**: 1 credit per AI operation (analyze, advisor chat, synthesis, etc.)

## Flow
```
Preonboarding → Auth (signup/signin) → Onboarding (profile) → PAYWALL → Home
```

## Tasks

### 1. RevenueCat Setup (Dashboard Manual)
- [ ] Login to RevenueCat Dashboard
- [ ] Create 2 products:
  - `cosmecheck_monthly`: 4.99€/mo, 100 credits
  - `cosmecheck_yearly`: 49.99€/year, 100 credits
- [ ] Create entitlement: `premium`
- [ ] Link products → entitlement
- [ ] Create offering: `default` with both products
- [ ] Get Google Play key + Apple key (already have public keys)
- [ ] Register webhook: `https://rogesnduejmqpxolhbif.supabase.co/functions/v1/revenucat-webhook`
- [ ] Enable events: INITIAL_PURCHASE, RENEWAL, CANCELLATION

### 2. SDK Installation
- [ ] `npx expo install react-native-purchases`
- [ ] Add plugin to app.json: `react-native-purchases/expo-plugin`

### 3. App Integration
- [ ] Boot SDK in `_layout.tsx`
- [ ] Create `lib/revenucat/client.ts` wrapper
- [ ] Create `hooks/usePurchases.ts` hook
- [ ] Add `paywall_shown` to `user_profiles` schema
- [ ] Modify `resolveAuthRoute` to route to paywall
- [ ] Create `/(paywall)` route with modal UI
- [ ] Create `components/paywall/PaywallModal.tsx`
- [ ] Create `components/paywall/OfferingCard.tsx` for each tier

### 4. Credits System
- [ ] Audit all IA calls: analyze, advisor, synthesis, coherence, etc.
- [ ] Add credit consumption tracking
- [ ] Create `lib/credits/consumeCredit.ts`
- [ ] Handle "out of credits" UX (modal + upsell)

### 5. Webhook
- [ ] Create `supabase/functions/revenucat-webhook`
- [ ] Handle: INITIAL_PURCHASE, RENEWAL, CANCELLATION
- [ ] Update `user_profiles.tier` on purchase/cancel
- [ ] Update `user_credits.daily_limit` on purchase

### 6. Testing
- [ ] Test sandbox purchase on real Android device
- [ ] Test sandbox purchase on iOS simulator/device
- [ ] Verify tier updates in Supabase
- [ ] Verify webhook logs
- [ ] Test credit consumption flow

## Files to Create/Modify

### New Files
- `lib/revenucat/client.ts`
- `hooks/usePurchases.ts`
- `app/(paywall)/_layout.tsx`
- `app/(paywall)/index.tsx` (modal)
- `components/paywall/PaywallModal.tsx`
- `components/paywall/OfferingCard.tsx`
- `supabase/functions/revenucat-webhook/index.ts`
- `lib/credits/consumeCredit.ts`

### Modified Files
- `app/_layout.tsx` (SDK boot)
- `app.json` (plugin + API level)
- `lib/navigation/authRoute.ts` (paywall route)
- `hooks/useProfile.ts` (paywall_shown flag)
- Edge Functions (all IA ones)

## Pricing Model
| Tier | Monthly | Yearly | Credits/month |
|------|---------|--------|---------------|
| Free | - | - | 0 (pay-per-use) |
| Premium | 4.99€ | 49.99€ | 100 |

## Credit Costs
| Operation | Cost |
|-----------|------|
| Scan + analyze | 1 |
| Advisor message | 1 |
| Synthesis | 1 |
| Coherence analyze | 1 |
| Product suggest | 1 |
| Deep search | 1 |

## Next Step
Start with SDK installation and dashboard setup.
