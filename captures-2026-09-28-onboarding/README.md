# L'entonnoir, écran par écran — 28 septembre 2026

Émulateur **Pixel 9 Pro**, dev build `com.memorypilot.app`, Metro sur **8082**,
app en français, installation sans compte. Parcouru au doigt de l'accroche
jusqu'à l'accueil, une capture par écran.

| | l'écran | ce qu'on y voit |
|---|---|---|
| `00` | témoin de suivi (dev) | la fenêtre qui **remplace** la boîte ATT d'Apple, impossible sur Android. Pastille « DÉVELOPPEMENT », un seul bouton |
| `01` · `02` | `welcome` | les deux pages de l'accroche, avec leurs points de pagination |
| `03` | `ConsentementDepart` | « Ce qui est envoyé, et à qui ». Bloquant : « Continue » inerte tant que la case est vide, « Skip » = refus |
| `04` | `name` | barre à **8 %** — l'amorce seule, comme prévu |
| `05` | `familier` | « Sois honnête, **Camille**. » Les cinq douleurs, chacune sur une ligne |
| `06` | `raison` | « Qu'est-ce qui t'amène ici ? », cinq lignes nues |
| `07` | `oublis` | sept familles avec leurs pastilles ; trois cochées ici |
| `08` | `endroits` | l'aveu. Un seul coché → l'écran suivant démentit celui-là |
| `09` | `verite` | « T'envoyer des messages, ce n'est pas un système. C'est une cachette. » Les trois puces reprennent les trois oublis cochés |
| `10` | `volume` | « Cinq ou six » choisi |
| `11` | `projection` | **312 oublis par an** = 6 × 52. Le chiffre suit la réponse |
| `12` | `plan` | la courbe, sans barre du haut, et les cinq puces arrivées en cascade |
| `13` · `13b` | `confier` | « TON PREMIER SOUVENIR », vide puis rempli ; la rangée du clavier met « Mémoriser » et le micro sur une ligne |
| `14` · `14b` | `range` | « Sauvegardé, ce n'est pas rangé. » L'**agent réel** rend « Sortir les poubelles », Rappel, **1 oct. 18:00** — jeudi prochain, heure respectée |
| `15` | `anniversaire` | « UNE DERNIÈRE CHOSE », les deux molettes |
| `16` · `16b` | `notifications` | barre pleine, puis la vraie boîte Android |
| `17` | `montage` | « Je monte ton second cerveau… », sans bouton, rend la main seul |
| `18` | `premium` | le paywall sombre : tableau, −72 %, « Passer » en haut à droite |
| `19` | `auth` | « On garde tout ça ? Ton second cerveau t'attend, **Camille**. » |
| `20` | `sign-up` | la création de compte, ses deux cases séparées |
| `21` | `sign-in` | la connexion |
| `22` | **`home`** | l'accueil : le salut, Bientôt, Derniers souvenirs, Tes catégories, les cinq places du sol |

## Ce qui diffère de ce que CLAUDE.md décrit

- **`consent` n'est plus dans `ORDRE`** et `ConsentementDepart` le remplace sur
  l'accroche : conforme à la section du 18 septembre.
- **`anniversaire` est de retour dans le parcours.** La section du
  10 septembre 2026 le donne pour masqué avec les trois autres questions de
  collecte ; il est traversé ici, entre `range` et `notifications`.
- **L'ordre réel est `volume → projection → plan → confier → range →
  anniversaire → notifications → montage → premium → auth`**, et non
  `volume → projection → notifications → montage → plan`.

## Ce que ça ne prouve pas

- **iOS.** Rien n'a été compilé ni regardé de ce côté.
- **L'achat.** Le bouton du paywall est inerte : le catalogue RevenueCat est
  vide sur l'émulateur, c'est l'état documenté.
- **Le premier lancement absolu.** L'app n'a pas été effacée (`pm clear`)
  avant la passe ; elle était simplement sans compte.

## Ce qui a été écrit, et défait

La connexion s'est faite avec le **compte de banc** `camille.test`, jamais
celui de l'éditeur. Les deux souvenirs que l'entonnoir a produits — « Sortir
les poubelles » et « Mon anniversaire » — ont été **supprimés par l'app**, et
le compte relu : il est revenu à ses 12 souvenirs du 9 septembre. Puis
déconnecté.

> ⚠️ **Un avertissement relevé au passage, et non corrigé** : la déconnexion
> lève `The action 'POP_TO_TOP' was not handled by any navigator`. Elle
> fonctionne — on arrive bien sur `auth` — mais un navigateur reçoit une action
> qu'il ne sait pas traiter. Hors du périmètre de cette passe.
