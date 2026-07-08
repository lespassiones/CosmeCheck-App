# Notifications locales + rappels — Implémentation

_Livré le 7 juillet 2026. **REBUILD APK/AAB REQUIS** (voir bas de page)._

## But
- Rappel hebdo de bilan peau (« C'est l'heure de ton bilan peau de la semaine »).
- Alerte de conflit de routine (nouveau conflit high détecté).
- Permission demandée **après le PREMIER bilan** (carte « Rappels utiles »), JAMAIS au lancement de l'app.
- Réglages dans le profil (toggle maître + rappels bilan + suivi produit J+14 en stub).

## Dégradation douce (critique)
`expo-notifications` ajoute un module natif : une release **OTA poussée avant le rebuild ne doit pas crasher**. Tout accès passe par `lib/notifications/native.ts` (`getNotificationsModule()` = `require('expo-notifications')` paresseux en try/catch, mémoïsé, renvoie `null` si le module natif est absent). Aucun import top-level d'expo-notifications dans du code chargé au boot.

## Modules purs (testés, OTA-safe)
- `lib/notifications/prefs.ts` : `NotificationPrefs` (enabled false, bilanWeekday 7, bilanHour 18, conflictAlerts, suiviProduit, promptSeen), `readNotificationPrefs`, `shouldShowEnableCard`. Schéma stocké dans `user_profiles.preferences.notifications` (merge non destructif via `useProfile.updateProfile`, aucune migration DB).
- `lib/notifications/planner.ts` : `computeNextBilanTrigger` (weekly inexact, ou one-shot saute-semaine si bilan déjà fait), `isoWeekdayToExpo` (ISO 1=lundi → expo 1=dimanche), `conflictDedupKey`.
- `lib/notifications/deepLink.ts` : `routeForNotificationData` (allowlist `/peau`, `/(tabs)/routine`, `/(tabs)`).

## Natif (no-op si module absent)
- `native.ts`, `channels.ts` (3 canaux FR : bilan-hebdo, conflits, suivi-produit), `scheduler.ts` (setup handler, permission, `scheduleWeeklyBilan` trigger **inexact** — pas de SCHEDULE_EXACT_ALARM, `rescheduleAfterBilan`, `scheduleConflictAlert` avec dédup hebdo), `conflictAlert.ts` (`notifyConflictDetected`).

## UI / wiring
- `components/notifications/NotificationsInit.tsx` monté dans `app/_layout.tsx` (après `RevenueCatInit`) : setup handler + canaux + réconciliation idempotente + tap → route + abonnement `NEW_HIGH_CONFLICTS_EVENT` → alerte locale dédupliquée.
- `EnableNotificationsCard.tsx` rendue par `BilanResult` après le 1er bilan.
- `components/profile/NotificationSettings.tsx` inséré dans `app/profile/index.tsx`.
- `app.json` : plugin `["expo-notifications", { icon, color }]` + permission `android.permission.POST_NOTIFICATIONS`. Icône `assets/images/notification-icon.png` (monochrome blanc/transparent 96×96, générée par `scripts/gen-notification-icon.mjs` — placeholder cloche, à remplacer par un asset brandé).

## Tests
`lib/__tests__/notificationPlanner.test.ts` + `notificationPrefs.test.ts` + `notificationDeepLink.test.ts` (43) : frontières ISO du planner, conversion weekday expo, coercition des prefs, allowlist deep-link.

## ⚠️ Rebuild obligatoire
L'ajout d'`expo-notifications` modifie le binaire natif (plugin + module + permission POST_NOTIFICATIONS). Un **rebuild APK/AAB et IPA via EAS est OBLIGATOIRE** avant que les notifications fonctionnent : cette partie ne peut PAS être livrée en OTA. **Ne jamais lancer le build automatiquement** ; c'est une action manuelle de l'équipe. Le code est conçu pour qu'une OTA poussée AVANT le rebuild ne crashe pas (module absent = no-op + message dans les réglages).
