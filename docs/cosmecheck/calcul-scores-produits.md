# Comment on calcule la note et la pastille d'un produit

À partir des **couleurs des ingrédients** (voir [classification-ingredients.md](./classification-ingredients.md)) et de leur **position** dans la liste INCI, on calcule une **pastille** (5 niveaux) puis une **note sur 20**.

## Les 5 pastilles
| Pastille | Sens | Note /20 |
|---|---|---|
| 🟢 Cœur — très douce | que du vert | 17 à 20 |
| 🟢 Feuille — saine | vert dominant | 13 à 17 |
| 🟡 Œil — à surveiller | équilibre moyen | 9 à 13 |
| 🟠 Triangle — moyenne | préoccupations présentes | 5 à 9 |
| 🔴 Stop — à examiner | problèmes marqués | 0 à 5 |

Le **barème couleur est unique partout** (mobile, web, base) : **≥13 = vert**, ≥9 = jaune, ≥5 = orange, <5 = rouge. C'est essentiel : un même score doit donner la même couleur sur tous les écrans.

## La logique (pastille)
On trie les ingrédients par position et on distingue 3 zones : **Tête** (rangs 1-5, poids fort), **Corps** (jusqu'à 60 %), **Queue** (le reste).

**Branche douce** — s'il n'y a **aucun** orange ni rouge :
- que du vert → cœur ; jaunes > verts → œil ; sinon → feuille.

**Branche sévère** — dès **1 orange ou rouge** : on prend **le pire** de deux critères :
1. **Position** : un rouge en tête pèse plus qu'en queue (plafond).
2. **Composition** : proportion de vert (le jaune compte à moitié), pondérée par la position.

Règles importantes (réglage « V2 », plus juste) :
- un **orange isolé** ne fait pas chuter en orange (il plafonne à jaune) ;
- **sans aucun rouge**, un produit ne peut pas être « rouge/danger » (au pire orange) — un produit 100 % orange reste orange, pas rouge.

## De la pastille à la note /20
La pastille est convertie en note dans sa bande (ex. « saine » → 13-17), affinée par la proportion de vert pour un tri stable. La note et la pastille sont donc **toujours cohérentes**.

## Où vit ce calcul (à garder en parité)
La même logique existe en **3 copies identiques** :
- mobile : `lib/analysis/pastille.ts`
- edge (serveur) : `supabase/functions/analyser/score.ts`
- web : `lib/analysis/pastille.ts`

⚠️ **Si on change le calcul, il faut modifier les 3 copies à l'identique**, redéployer l'edge, et recalculer les produits.

## Produit connu vs produit inconnu
- **Produit du catalogue** (EAN connu) : on sert la note officielle stockée (`catalog.score`). On ne recalcule pas à la volée.
- **Produit internet / scan sans EAN** : on calcule à la volée avec la même formule.

Moyenne actuelle du catalogue : ~10,5/20 (positionnement exigeant mais juste).
