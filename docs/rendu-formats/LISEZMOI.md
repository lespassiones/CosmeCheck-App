# Rendu de l'app aux géométries des surfaces Apple

Captures produites le 31/08/2026 sur émulateur Android, à partir du **binaire de
release** (`app-release.apk`), en forçant l'écran aux géométries réelles.

## Pourquoi un émulateur Android pour juger un rendu iPad

Ce qui casse une mise en page, c'est le **rapport de forme** et la **largeur en
points**, pas la marque de l'appareil. Le moteur de disposition est le même
Yoga sur les deux systèmes, `contentFit` s'y comporte pareil, et les marges
sûres sont le même mécanisme. Aucun simulateur iOS ne tourne sous Windows.

Deux limites, et elles vont dans le sens de la prudence : l'émulateur n'a ni
encoche ni indicateur d'accueil, donc les marges sûres y valent zéro alors
qu'un iPad en réserve ; et le lissage des polices diffère, sans effet sur la
géométrie.

## La géométrie qui compte

⚠️ **Une app iPhone ne tourne pas en plein écran sur un iPad.** Elle tourne dans
une fenêtre de compatibilité. Mesurée sur les captures fournies par Apple
(zone blanche de ~1274 x 2300 px dans un écran de 1640 x 2360), cette fenêtre
fait environ **637 x 1150 points**, soit un rapport de 0,554 et **50 % plus
large qu'un iPhone 15 Plus** (430 pt).

Se tromper de géométrie, c'est se tromper de conclusion. Juger le rendu à
820 ou 1180 points, c'est juger une surface que l'app n'obtient jamais tant que
`ios.supportsTablet` vaut `false`.

| Préfixe | Géométrie | Rapport | Réalité |
|---|---|---|---|
| `E01`..`E08` | 637 x 1150 dp | 0,554 | **la fenêtre iPad réelle**, après connexion |
| `V1`..`V4` | 637 x 1150 dp | 0,554 | **la fenêtre iPad réelle**, carrousel de présentation |
| `R1` | 820 x 1180 dp | 0,695 | iPad plein écran, **après redimensionnement à chaud** |
| `R2` | 1180 x 820 dp | 1,439 | iPad paysage |
| `D1`,`D2`,`D6` | 360 / 820 / 1180 dp | — | premières captures, géométries non représentatives |

`R1` et `R2` ne correspondent à aucune surface actuelle. Ils sont là pour deux
raisons : éprouver le recalage du carrousel au changement de taille de fenêtre,
geste que la fenêtre de compatibilité autorise ; et documenter ce que
deviendrait la mise en page si `supportsTablet` passait un jour à `true`.

## Ce que ces captures établissent

- Le carrousel corrigé affiche l'illustration **entière** et le texte **complet**
  aux deux géométries, là où Apple l'avait vu tronqué et recouvert.
- Le recalage fonctionne : après redimensionnement, on reste proprement cadré
  sur la diapositive courante.
- Après connexion, à la géométrie réelle, **rien n'est cassé ni tronqué**.
  Le tableau de bord, le profil, l'offre et le conseiller tiennent la largeur.

## Comment les reproduire

    bash scratchpad/audit.sh   # voir l'historique de la session

En substance : `adb shell wm size 1274x2300`, `adb shell wm density 320`,
puis navigation par liens profonds (`cosmecheck:///profile`) plutôt que par
taps sur des coordonnées, et `adb shell wm size reset` à la fin.
