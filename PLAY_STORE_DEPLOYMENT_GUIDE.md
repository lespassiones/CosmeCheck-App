# CosmeCheck Play Store Deployment Guide

**Date**: 29 juin 2026  
**Status**: Pre-launch audit + checklist

---

## 🔴 BLOCKERS (MUST FIX BEFORE PLAY STORE)

### 1. Apple Sign-In MISSING (iOS only, but affects store review)
**Why**: Apple Guideline 4.8 requires Apple Sign-In when Google Sign-In is present  
**Impact**: iOS app will be **REJECTED** without this  
**Fix**:
```tsx
// In lib/auth/apple.ts (CREATE)
import * as AppleAuthentication from 'expo-apple-authentication';

export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    return await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
  } catch (err) {
    if (err.code === 'ERR_CANCELLED') return null;
    throw err;
  }
}
```
**Effort**: 2h (implement + test)  
**Priority**: 🔴 CRITICAL — do this FIRST

---

### 2. Privacy Policy URL Required (Both platforms)
**Why**: Play Store requires link to privacy policy on web  
**Current**: None configured in app.json  
**Fix**:
```json
{
  "extra": {
    "privacyUrl": "https://cosme-check.com/privacy"
  }
}
```
- Ensure `https://cosme-check.com/privacy` is publicly accessible
- Add full legal text (not just "legal" folder in-app)

---

### 3. Contact Email for Support
**Why**: Play Store support requires contact email  
**Current**: None  
**Fix**: Add to app.json + `constants/legal.ts`
```
contact@cosme-check.com (already in CLAUDE.md)
```

---

## 🟠 PLAY STORE SPECIFIC ISSUES

### 1. Content Rating Questionnaire
- Go to: Google Play Console → Your app → Store presence → Content ratings
- Fill out: Age-appropriate, medical content (cosmetics analysis)
- **CosmeCheck is**: educational, not medical device
- **Age rating likely**: 3+ or 7+ (low risk)

### 2. App Category
- **Set to**: Beauty or Lifestyle
- **NOT**: Medical (compliance issue)

### 3. Minimum API Level
- Current: API 24 (Android 7.0)
- **Change to**: API 26+ (Android 8.0)
- **Why**: Play Store now requires min 26+ as of August 2026
- **Fix** in app.json:
```json
{
  "android": {
    "minSdkVersion": 26
  }
}
```

### 4. Target API Level
- Must be within **2 releases of latest** (currently Android 15)
- **Set to**: 35 minimum
- **Fix**:
```json
{
  "android": {
    "compileSdkVersion": 35,
    "targetSdkVersion": 35
  }
}
```

### 5. SHA-256 Fingerprint for OAuth Redirect
- Google OAuth redirect `cosmecheck://` needs SHA-256 signing cert registered
- **Get cert fingerprint**:
```bash
# After first build, extract from APK:
keytool -printcert -jarfile app-release.apk | grep SHA256
```
- Register in Google Cloud Console + Firebase

---

## 🟡 REVENUCAT INTEGRATION (IN-APP PURCHASES)

### Installation & Setup

**1. Install SDK**:
```bash
npx expo install react-native-purchases
```

**2. Configure in app.json**:
```json
{
  "plugins": [
    "react-native-purchases/expo-plugin"
  ]
}
```

**3. Boot in `_layout.tsx`**:
```tsx
import Purchases from 'react-native-purchases';

export default function RootLayout() {
  useEffect(() => {
    async function initRevenueCat() {
      const apiKey = Purchases.isAndroid 
        ? Platform.select({
            android: 'goog_...',  // Play Store key
          })
        : 'appl_...';  // Apple key
      await Purchases.configure({ 
        apiKey,
        shouldLogIn: false,
      });
      // After user login:
      // await Purchases.logIn(userId);
    }
    initRevenueCat();
  }, []);
  // ...
}
```

**4. Keys from RevenueCat Dashboard**:
- Android: `goog_xxxxxxxxxxxxxxxx` (Google Play key)
- iOS: `appl_xxxxxxxxxxxxxxxx` (Apple key)
- Both in `.env.local` (not committed):
```
REVENUEAT_ANDROID_KEY=goog_...
REVENUEAT_APPLE_KEY=appl_...
```

**5. Wire Paywall in `app/offre/index.tsx`**:
```tsx
import Purchases from 'react-native-purchases';

export default function OffreScreen() {
  const handlePurchase = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages[0];
      if (!pkg) return;
      
      const result = await Purchases.purchasePackage(pkg);
      if (result.customerInfo.entitlements.active['premium']) {
        // Update user tier to 'premium' in Supabase
        await updateUserTier('premium');
      }
    } catch (err) {
      if (err.code === 'PurchaseCancelledError') return;
      console.error('Purchase failed:', err);
    }
  };
  
  return (
    <Button onPress={handlePurchase} title="Unlock Premium" />
  );
}
```

**6. Create Edge Function Webhook for Receipt Validation**:
```deno
// supabase/functions/revenucat-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const payload = await req.json();
  
  if (payload.event.type === 'INITIAL_PURCHASE' || payload.event.type === 'RENEWAL') {
    const { app_user_id, product_identifier } = payload.event;
    
    const db = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );
    
    // Update user tier
    await db
      .from('cosme_check.user_profiles')
      .update({ tier: 'premium' })
      .eq('id', app_user_id);
  }
  
  if (payload.event.type === 'CANCELLATION') {
    // Downgrade user back to free
  }
  
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

**7. Deploy webhook**:
```bash
supabase functions deploy revenucat-webhook --project-ref rogesnduejmqpxolhbif
```

**8. Register webhook in RevenueCat Dashboard**:
- Dashboard → Webhooks → Add webhook
- URL: `https://rogesnduejmqpxolhbif.supabase.co/functions/v1/revenucat-webhook`
- Events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`

---

## ⚠️ COMMON PITFALLS TO AVOID

### 1. **NOT updating user tier after purchase**
- RevenueCat only validates entitlement, doesn't touch your DB
- **Always** create webhook + update `user_profiles.tier` on purchase
- Test: purchase in sandbox, verify `tier='premium'` in DB

### 2. **Hardcoding API keys in app code**
- **Use env vars** in `.env.local` (not committed)
- Load via `Deno.env.get()` at boot, never inline strings

### 3. **Forgetting credential linking**
- After email signup, user isn't linked to RevenueCat's `app_user_id`
- **Fix**: Call `Purchases.logIn(userId)` right after signup/login
```tsx
// In auth/session.ts after signUp/signIn
await Purchases.logIn(user.id);
```

### 4. **Not testing in sandbox**
- RevenueCat sandbox ≠ Play Store sandbox
- Set test mode before first purchase:
```tsx
await Purchases.setLogLevel(Purchases.LOG_LEVELS.DEBUG);
// For iOS: use sandbox tester account
// For Android: Google Play Console → [APK] → Testing → Internal testers
```

### 5. **Forgetting to activate entitlements in RevenueCat**
- Dashboard → Entitlements → Create `premium` entitlement
- Link to **products** (not just Offerings)
- Offering → Products → select `premium` product → link to `premium` entitlement

### 6. **Building APK without signing**
- Play Store requires **signed APK**
```bash
npx eas build -p android --release
# OR manually:
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA256 \
  -keystore my-release-key.jks app-release-unsigned.apk my-key-alias
```

### 7. **Not handling cancellation/downgrade**
- User cancels subscription → webhook fires
- You must downgrade `tier` back to `free`
- Otherwise user keeps premium access indefinitely

### 8. **Incorrect redirect URLs**
- OAuth redirect must match **exactly**:
  - Firebase Console → Authorized redirect URIs
  - Google Cloud OAuth consent screen
  - Supabase Dashboard → Authentication → Authorized redirect URLs
- All three need: `cosmecheck://` + web URLs for browser callback

### 9. **Missing version bump before store submission**
- Play Store requires `versionCode` increment
- Play Store/TestFlight require version uniqueness
```json
{
  "android": { "versionCode": 2 },  // bumped from 1
  "version": "0.2.0"
}
```

### 10. **Not pre-warming production builds**
- **Always** build APK locally + test on real device first
- Play Store can take 24h to review: don't rush
- Internal testing → Closed testing → Open testing → Production

---

## 📋 PRE-LAUNCH CHECKLIST

- [ ] Apple Sign-In implemented + tested
- [ ] Privacy policy URL public on cosme-check.com
- [ ] Contact email set (contact@cosme-check.com)
- [ ] App category set to Beauty/Lifestyle
- [ ] Min API 26, Target API 35
- [ ] RevenueCat keys configured (not in code)
- [ ] Purchase webhook deployed + registered
- [ ] User tier updates on purchase/cancellation
- [ ] Entitlements named `premium` in RevenueCat
- [ ] Sandbox testing completed (both Android + iOS)
- [ ] Signed APK built locally
- [ ] Version code bumped
- [ ] SHA-256 cert fingerprint registered in Google Cloud
- [ ] OAuth redirect URLs registered everywhere
- [ ] Legal screens tested (CGU, Privacy, Mentions, About)
- [ ] Camera + photo permissions requested correctly
- [ ] All tests passing (Jest: 374+)
- [ ] No console errors on main flows
- [ ] Barcode scan tested end-to-end
- [ ] Advisor chat tested with credits system
- [ ] Premium paywall tested (mock purchase)
- [ ] Onboarding flow tested (both paths: email + Google)
- [ ] Database backups configured (Supabase → Backups tab)
- [ ] Support email monitored (contact@cosme-check.com)

---

## 🚀 DEPLOYMENT TIMELINE

| Phase | Duration | Actions |
|-------|----------|---------|
| **1. Apple Sign-In** | 2h | Code + test |
| **2. RevenueCat** | 4h | SDK + webhook + test |
| **3. Testing** | 1-2d | Sandbox APK, real devices |
| **4. Play Store** | 30m | Upload signed APK |
| **5. Review** | 24-48h | Google review process |
| **6. iOS (optional)** | 24h+ | TestFlight review, then App Store |

**Total**: 2-3 days to production  
**Risk**: Low (mostly setup)  
**Rollback**: Can pause store listing during review

---

## 📞 SUPPORT & MONITORING

- Monitor `contact@cosme-check.com` for user reports
- RevenueCat Dashboard → Analytics → Revenue, Churn, LTV
- Supabase Dashboard → Database → Realtime → monitor `user_profiles` updates
- Google Play Console → Crash → monitor crashes + ANRs
- Set up Sentry or Crashlytics for crash reporting

---

Generated: 2026-06-29  
Status: Ready for implementation
