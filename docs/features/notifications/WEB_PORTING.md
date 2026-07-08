# Notifications — Portage web

## Partagé
- Le schéma `user_profiles.preferences.notifications` (jsonb) est portable : le web peut lire/écrire les mêmes prefs. Aucune migration DB.
- Les modules purs `lib/notifications/{prefs,planner,deepLink}.ts` sont copiables (le web réutilisera surtout `prefs.ts` et éventuellement la logique de planning).

## Équivalent web
- Les notifications locales natives n'ont pas d'équivalent direct côté web ; l'équivalent serait le **Web Push** (Service Worker + `Notification` API + abonnement push), hors périmètre de ce chantier.
- Le toggle et les préférences restent portables ; côté web, brancher le toggle sur un éventuel Web Push plus tard.

## Note
Aucune migration DB, aucune RPC : cette feature est purement client + config native mobile. Le portage web est optionnel et découplé.
