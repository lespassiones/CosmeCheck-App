/**
 * SuggestionsDeck — file de cartes feuilletable « Suggestions intelligentes »
 * (coverflow LINÉAIRE, défilement CONTINU).
 *
 * Modèle : une position flottante `scroll` (= index fractionnaire). Chaque carte est
 * placée selon `rel = indexAbsolu - scroll` ⇒ toutes les positions sont des fonctions
 * continues de `scroll`. Quand on valide un glissement, on ne réinitialise rien : la
 * pile entière glisse d'un cran (spring) et `setIndex` ne fait que recentrer la
 * fenêtre rendue, SANS aucun saut visuel (fini le « secouage »).
 *
 * Empilement : cartes DÉJÀ vues à GAUCHE, cartes RESTANTES à DROITE. Au début la
 * carte de devant penche à gauche (tout déborde à droite) ; à la fin elle penche à
 * droite (tout déborde à gauche) ; au milieu elle est centrée. Pas de boucle :
 * rubber-band aux deux bouts.
 *
 * Cartes du fond OPAQUES (pas de transparence) : chacune masque la suivante, on n'en
 * voit que le bord. Profondeur rendue par l'échelle, l'inclinaison et le z-index.
 *
 * La carte de devant ne touche jamais les bords ; les cartes du fond peuvent toucher.
 * Vrai flou (expo-blur, `experimentalBlurMethod` requis Android).
 */
import { type FC, useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { SuggestionCard } from './SuggestionCard'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

export interface DeckSuggestion {
  key: string
  productAnalysisId: string | null
  productTitle: string
  productScore: number | null
  productImageUrl?: string | null
  dangerLabel: string | null
  dangerColor: 'rouge' | 'orange' | null
  alternative: AlternativeProduct
  alternativeScore: number
  /** Justification IA « pourquoi pour toi » (personnalisée au profil). */
  reason?: string | null
}

interface Props {
  visible: boolean
  suggestions: DeckSuggestion[]
  keepingKey: string | null
  comparingKey: string | null
  keptKeys: Set<string>
  onClose: () => void
  onKeep: (s: DeckSuggestion) => void
  onCompare: (s: DeckSuggestion) => void
  onOpenAlternative: (s: DeckSuggestion) => void
}

/**
 * Part de la largeur de fenetre occupee par une carte.
 *
 * ⚠️ La largeur ET la position de la carte etaient calculees ICI, au
 * chargement du module, depuis `Dimensions.get('window')`. Une lecture unique
 * pour toute la vie du processus. Or `cardLayer` est en position absolue avec
 * `left: (W - CARD_W) / 2` : sur un appareil dont la fenetre change de taille,
 * et la fenetre de compatibilite d'un iPad se redimensionne d'un geste, les
 * cartes gardaient la largeur ET le centrage d'avant jusqu'au redemarrage de
 * l'app. Elles se retrouvaient donc decentrees. Meme erreur que celle qui a
 * coute le refus guideline 4 : une valeur figee la ou il faut une valeur
 * observee. Les deux sont desormais derivees au rendu.
 */
const CARD_RATIO = 0.84 // marge symétrique ⇒ ne touche pas les bords
const LEAN = 18 // décalage de la carte de devant vers le bord libre (début/fin)
const PEEK = 52 // débordement latéral de la 1ʳᵉ carte du fond
const PEEK_STEP = 16 // débordement supplémentaire de la 2ᵉ carte du fond
const DRAG_PER_CARD = 150 // pixels de glissement pour avancer d'une carte

// Bornes d'interpolation par position relative (-2 .. +2).
const REL_IN = [-2, -1, 0, 1, 2]
const TX_OUT = [-(PEEK + PEEK_STEP), -PEEK, 0, PEEK, PEEK + PEEK_STEP]
const SCALE_OUT = [0.84, 0.9, 1, 0.9, 0.84]
const ROT_OUT = [-4.5, -3, 0, 3, 4.5]

export const SuggestionsDeck: FC<Props> = ({
  visible,
  suggestions,
  keepingKey,
  comparingKey,
  keptKeys,
  onClose,
  onKeep,
  onCompare,
  onOpenAlternative,
}) => {
  const insets = useSafeAreaInsets()
  // Largeur et centrage derives de la fenetre A CHAQUE RENDU (cf. CARD_RATIO).
  const { width: screenW } = useWindowDimensions()
  const cardW = Math.round(screenW * CARD_RATIO)
  const cardGeom = { width: cardW, left: (screenW - cardW) / 2 }

  const [index, setIndex] = useState(0)
  const scroll = useSharedValue(0) // index fractionnaire
  const startScroll = useSharedValue(0)
  const n = suggestions.length

  // À l'ouverture : on repart de la 1ʳᵉ carte.
  useEffect(() => {
    if (visible) {
      setIndex(0)
      scroll.value = 0
    }
  }, [visible, scroll])

  const idx = Math.max(0, Math.min(index, n - 1))

  // Style d'un slot (offset fixe par rapport à la carte courante).
  // rel = position relative au centre ; lean = penchant global vers le bord libre.
  const useSlotStyle = (offset: number) =>
    useAnimatedStyle(() => {
      const rel = idx + offset - scroll.value
      const lean =
        -LEAN * Math.max(0, 1 - scroll.value) + LEAN * Math.max(0, scroll.value - (n - 2))
      return {
        transform: [
          { translateX: lean + interpolate(rel, REL_IN, TX_OUT, Extrapolation.CLAMP) },
          { scale: interpolate(rel, REL_IN, SCALE_OUT, Extrapolation.CLAMP) },
          { rotate: `${interpolate(rel, REL_IN, ROT_OUT, Extrapolation.CLAMP)}deg` },
        ],
        zIndex: Math.round(interpolate(Math.abs(rel), [0, 2], [100, 80], Extrapolation.CLAMP)),
      }
    })

  const styleM2 = useSlotStyle(-2)
  const styleM1 = useSlotStyle(-1)
  const style0 = useSlotStyle(0)
  const styleP1 = useSlotStyle(1)
  const styleP2 = useSlotStyle(2)

  const commit = (target: number) => setIndex(target)

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      startScroll.value = scroll.value
    })
    .onUpdate((e) => {
      let s = startScroll.value - e.translationX / DRAG_PER_CARD
      if (s < 0) s = s * 0.35 // rubber-band : rien avant la 1ʳᵉ
      else if (s > n - 1) s = n - 1 + (s - (n - 1)) * 0.35 // ni après la dernière
      scroll.value = s
    })
    .onEnd((e) => {
      const projected = scroll.value - e.velocityX / (DRAG_PER_CARD * 6)
      const base = Math.round(startScroll.value)
      let target = Math.round(projected)
      if (target > base + 1) target = base + 1
      if (target < base - 1) target = base - 1
      if (target < 0) target = 0
      if (target > n - 1) target = n - 1
      scroll.value = withSpring(target, { damping: 20, stiffness: 180 })
      runOnJS(commit)(target)
    })

  if (n === 0) return null
  const at = (i: number): DeckSuggestion | null => (i >= 0 && i < n ? suggestions[i] : null)

  const renderCard = (s: DeckSuggestion) => (
    <SuggestionCard
      productTitle={s.productTitle}
      productScore={s.productScore}
      productImageUrl={s.productImageUrl}
      dangerLabel={s.dangerLabel}
      dangerColor={s.dangerColor}
      alternative={s.alternative}
      alternativeScore={s.alternativeScore}
      reason={s.reason}
      keeping={keepingKey === s.key}
      comparing={comparingKey === s.key}
      kept={keptKeys.has(s.key)}
      onKeep={() => onKeep(s)}
      onCompare={() => onCompare(s)}
      onOpenAlternative={() => onOpenAlternative(s)}
    />
  )

  // Un slot par offset. CLÉ STABLE = identité de la suggestion (pas l'offset) :
  // quand une carte passe du fond au devant, l'élément est CONSERVÉ (pas de
  // démontage) → l'image ne se recharge pas (fini le clignotement). Seul le slot
  // de devant (offset 0) est interactif ; les autres laissent passer les touches.
  const slot = (offset: number, style: ReturnType<typeof useSlotStyle>) => {
    const s = at(idx + offset)
    if (!s) return null
    return (
      <Animated.View
        key={s.key}
        style={[styles.cardLayer, cardGeom, style]}
        pointerEvents={offset === 0 ? 'auto' : 'none'}
      >
        {renderCard(s)}
      </Animated.View>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <BlurView
          intensity={90}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          blurReductionFactor={4}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              <Text style={styles.headerTitle}>Suggestions intelligentes</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Fermer">
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.counter}>
            {idx + 1} / {n}{n > 1 ? ' · glisse horizontalement' : ''}
          </Text>

          {/* Geste sur tout le deck (pas sur une seule carte) : aucune carte n'est
              dans un élément à part ⇒ pas de démontage au feuilletage. La superposition
              est gérée par le z-index animé ; l'ordre de rendu suit les clés stables. */}
          <GestureDetector gesture={pan}>
            <View style={styles.deck}>
              {slot(-2, styleM2)}
              {slot(-1, styleM1)}
              {slot(0, style0)}
              {slot(1, styleP1)}
              {slot(2, styleP2)}
            </View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.22)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: spacing.xs,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  headerTitle: { ...typography.bodySemiBold, color: '#FFFFFF' },
  close: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: { ...typography.xs, color: 'rgba(255,255,255,0.9)', paddingHorizontal: 20, marginBottom: 28 },
  deck: { flex: 1 },
  // Carte centrée. Largeur et décalage gauche sont fournis au rendu, pas ici :
  // une feuille de styles est évaluée une seule fois, au chargement du module.
  cardLayer: { position: 'absolute', top: 10 },
})
