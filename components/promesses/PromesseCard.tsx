/**
 * SPEC — PromesseCard
 *
 * RÔLE:
 *   Carte affichant une promesse marketing individuelle avec son verdict coloré
 *   et une explication. Supporte le mode accordéon (expandable).
 *
 * PROPS:
 *   - promise: PromiseVerdict — { claim, verdict, explanation, supporting_ingredients }
 *   - isExpanded: boolean — true = explication et ingrédients visibles
 *   - onToggle: () => void — toggle expanded/collapsed
 *
 * COMPORTEMENT:
 *   1. Header toujours visible: verdict badge + texte de la promesse + chevron
 *   2. Tap → onToggle() (gère par parent — accordion one-at-a-time)
 *   3. Quand isExpanded:
 *      - Affiche explanation (texte court)
 *      - Liste des ingrédients supporting/contradicting (chips)
 *      - Animation expand: AnimatedHeight (Reanimated layout animation)
 *   4. Chevron rotation animée: 0° quand collapsed, 90° quand expanded
 *
 * DESIGN:
 *   Container:
 *     - backgroundColor: fond clair selon verdict (opacity 0.04)
 *     - borderWidth: 1, borderColor: couleur verdict opacity 0.2
 *     - borderRadius: 16
 *     - overflow: hidden
 *
 *   Header:
 *     - flexDirection: row, alignItems: center, gap: 10
 *     - paddingHorizontal: 14, paddingVertical: 12
 *
 *   Badge verdict:
 *     - ColorBadge chip
 *     - Verdicts labels: Vert="Tenue" / Jaune="Partielle" / Orange="Douteuse" / Rouge="Fausse"
 *
 *   Texte promesse:
 *     - flex: 1
 *     - fontSize: 14, fontFamily: Inter-Medium, color: ink
 *     - numberOfLines: isExpanded ? undefined : 2
 *
 *   Chevron: Feather 'chevron-right', rotated 90° si expanded, animé
 *
 *   Section expanded:
 *     - paddingHorizontal: 14, paddingBottom: 12
 *     - borderTopWidth: 1, borderTopColor: couleur verdict opacity 0.15
 *
 *   Explication: fontSize 13, fontFamily Inter-Regular, color inkMuted, lineHeight 20
 *
 *   Ingrédients:
 *     - flexWrap: wrap, gap: 6, marginTop: 8
 *     - Chips: height 24, paddingHorizontal 8, borderRadius 12
 *     - Couleur selon rôle: vert si soutient la promesse, rouge si contredit
 *     - fontSize 11, fontFamily Inter-Medium
 *     - Préfixe: "✓" ou "✗"
 */

import type { FC } from 'react'
import type { PromiseVerdict } from '@/lib/supabase/types'

interface Props {
  promise: PromiseVerdict
  isExpanded: boolean
  onToggle: () => void
}

// IMPLÉMENTATION À VENIR
// Ce fichier est un blueprint — l'implémentation réelle sera ajoutée lors du développement
export const PromesseCard: FC<Props> = () => null
