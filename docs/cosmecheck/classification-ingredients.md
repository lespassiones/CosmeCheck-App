# Comment on classe les ingrédients (les couleurs)

Chaque ingrédient a **une couleur** parmi 4. C'est la brique de base de toute la notation.

| Couleur | Sens |
|---|---|
| 🟢 **Vert** | Rien à signaler dans nos références |
| 🟡 **Jaune** | À surveiller (précaution, allergène de parfum, faible risque) |
| 🟠 **Orange** | Préoccupation moyenne |
| 🔴 **Rouge** | Interdit ou à éviter |

## Sur quoi on se base (sources publiques uniquement)
Les couleurs sont dérivées de la **réglementation cosmétique européenne** et de données de sécurité officielles :
- **Règlement (CE) n° 1223/2009** et ses annexes :
  - **Annexe II** = substances **interdites** → 🔴 rouge.
  - **Annexe III** = substances à **restrictions** + les **26 allergènes de parfum** → 🟡/🟠.
  - **Annexes IV / V / VI** = colorants / conservateurs / filtres UV autorisés avec limites.
- **Substances CMR** (cancérogènes, mutagènes, reprotoxiques) et classifications **CLP/ECHA** → 🔴/🟠.
- **Perturbateurs endocriniens** (listes officielles) → 🟠/🔴.

Ce n'est **pas** repris d'un service de notation tiers : c'est notre lecture de la loi et des avis officiels.

## La source de vérité
- Un **fichier maître** (classeur des ingrédients) donne la couleur de référence de chaque ingrédient. C'est LUI qui fait foi.
- Il alimente la table `cosme_check.ingredients` (colonne `color_rating`).
- Les substances **interdites (Annexe II)** ayant un nom INCI y sont ajoutées en rouge, même si elles n'apparaissent jamais dans un vrai produit (sécurité : si l'une apparaît dans un scan, elle est signalée).

## Choix de bon sens (pour rester juste)
On ne pénalise pas par pur principe. Exemples de règles retenues :
- Les **ingrédients inertes** très courants (silicones, épaississants, chélateurs type EDTA, phénoxyéthanol) sont en **jaune**, pas orange : ils sont bénins toxicologiquement, seule une précaution est justifiée.
- La **pierre d'alun** (déodorant naturel) est en orange, pas rouge (moins problématique que les sels d'aluminium anti-transpirants type chlorohydrate, eux en rouge).
- On garde orange les vrais motifs : SLS/SLES, éthoxylés (trace de 1,4-dioxane), paraffine/huile minérale (MOAH), microplastiques, TEA (nitrosamines), filtres UV allergènes.

## Quand on met à jour les couleurs
On modifie le fichier maître, puis on ré-applique sur la base. **Toute modification des couleurs impose de recalculer les produits** (voir [calcul-scores-produits.md](./calcul-scores-produits.md) et [push-produits-supabase.md](./push-produits-supabase.md)).
