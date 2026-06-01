/**
 * SPEC — PromesseFlowModal
 *
 * RÔLE:
 *   Modal de saisie rapide pour lancer une nouvelle analyse de promesses marketing.
 *   Alternative à l'écran complet /promesses/nouvelle pour les cas simples.
 *   Peut être utilisé depuis le Dashboard ou la liste des promesses.
 *
 * PROPS:
 *   - isVisible: boolean
 *   - onClose: () => void
 *   - onAnalysisStarted: (coherenceAnalysisId: string) => void — après analyse réussie
 *   - initialProductName?: string — pré-rempli si lié à une analyse
 *
 * ÉTAT LOCAL:
 *   - productName: string
 *   - marketingClaims: string
 *   - isAnalyzing: boolean
 *   - error: string | null
 *
 * COMPORTEMENT:
 *   1. Champ "Nom du produit" (pré-rempli si initialProductName)
 *   2. Grand textarea "Texte marketing":
 *      placeholder + compteur chars + validation (min 20 chars)
 *   3. Bouton "Analyser":
 *      - Vérifie les crédits avant (cosme_check_use_credit)
 *      - Lance l'analyse vers /api/coherence
 *      - isAnalyzing = true (désactive les inputs + affiche loader)
 *      - Après succès: onAnalysisStarted(id) + onClose()
 *      - Après erreur: error = message
 *   4. Bouton "Annuler" → onClose()
 *   5. Si credits = 0 (Free): affiche un message d'upgrade
 *
 * DIFFÉRENCE AVEC /promesses/nouvelle:
 *   Ce composant est une version légère/modal pour accès rapide.
 *   L'écran complet /promesses/nouvelle a plus d'aide contextuelle, exemples,
 *   et gestion d'état plus riche.
 *
 * DESIGN:
 *   - BottomSheet ou Modal, maxHeight 75% écran
 *   - Titre "Analyser une promesse marketing"
 *   - Champs comme dans ManualInciInput (NeuInput style)
 *   - Bouton rose pleine largeur
 *   - Loading: ActivityIndicator + texte "Analyse en cours..."
 *   - Erreur: bandeau rouge
 */

import type { FC } from 'react'

interface Props {
  isVisible: boolean
  onClose: () => void
  onAnalysisStarted: (coherenceAnalysisId: string) => void
  initialProductName?: string
}

// IMPLÉMENTATION À VENIR
// Ce fichier est un blueprint — l'implémentation réelle sera ajoutée lors du développement
export const PromesseFlowModal: FC<Props> = () => null
