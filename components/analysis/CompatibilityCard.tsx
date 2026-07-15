/**
 * CompatibilityCard — carte « Score de compatibilité » : % du produit vs le
 * profil de l'utilisateur, généré par l'Edge Function `personal-insights`
 * (MÊME appel que les 3 blocs, 1 crédit à la génération).
 *
 * Layout (validé produit, juil 2026) :
 *   - Titre « Score de compatibilité » en gros, en tête de carte.
 *   - Anneau 132px À GAUCHE (taille non négociable), textes À DROITE
 *     (eyebrow Pour toi/Qualité, chip label tonal, sous-titre IA, « Ce qu'il
 *     faut retenir » → modal 3 blocs + détail du calcul).
 *   - Calcul en cours : anneau ROTATIF (formes, pas de spinner texte) +
 *     barres skeleton pulsantes à droite.
 *   - Apparition : l'arc se REMPLIT de 0 au score (900 ms), le chiffre compte
 *     en même temps, les textes fondent (FadeInRight).
 *
 * États : ready / locked (429 → /offre) / profileIncomplete (→ section exacte
 * de l'onboarding, 0 crédit) / loading / error. La ligne restrictions
 * (déterministe) est TOUJOURS affichée sous le score.
 */

import { type FC, useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useRouter, type Href } from 'expo-router'
import Animated, {
  Easing,
  FadeIn,
  FadeInRight,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'
import {
  PersonalBlocksList,
  PERSONAL_BLOCKS_VERSION,
  type PersonalBlocks,
} from './PersonalInsightsCards'

// Miroir du type renvoyé par l'edge (supabase/functions/personal-insights/lib.ts).
export type CompatTone = 'rouge' | 'orange' | 'jaune' | 'vert'
export type CompatLine = { label: string; points: number }
export type CompatBreakdown = { base: number; lines: CompatLine[] }
export type Compatibility = {
  score: number
  label: string
  tone: CompatTone
  subtitle: string
  relevance: 'personal' | 'product_only'
  /** Détail affichable du calcul (absent sur d'anciens scores persistés). */
  breakdown?: CompatBreakdown
}

type MissingSection = 'skin' | 'hair'

const TONE_COLOR: Record<CompatTone, { ring: string; text: string; bg: string }> = {
  vert: { ring: colors.rating.vert.DEFAULT, text: colors.rating.vert.text, bg: colors.rating.vert.bg },
  jaune: { ring: colors.rating.jaune.DEFAULT, text: colors.rating.jaune.text, bg: colors.rating.jaune.bg },
  orange: { ring: colors.rating.orange.DEFAULT, text: colors.rating.orange.text, bg: colors.rating.orange.bg },
  rouge: { ring: colors.rating.rouge.DEFAULT, text: colors.rating.rouge.text, bg: colors.rating.rouge.bg },
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; blocks: PersonalBlocks; compatibility: Compatibility | null }
  | { status: 'locked' }
  | { status: 'profileIncomplete'; missingSection: MissingSection }
  | { status: 'error' }

interface Props {
  analysisId?: string
  initialCompatibility?: Compatibility | null
  initialBlocks?: PersonalBlocks | null
  initialBlocksKey?: string | null
  /** Ligne restrictions (déterministe, toujours affichée). */
  restrictedCount?: number
  onManageRestrictions?: () => void
  onShowRestrictedFamilies?: () => void
  /** Appelé une fois quand le score/les blocs deviennent visibles (engagement). */
  onReady?: () => void
}

const RING_SIZE = 132
const RING_STROKE = 11
const FILL_MS = 900

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Compteur 0 → target, easing cubic-out, synchronisé avec l'arc. */
function useCountUp(target: number, duration = FILL_MS): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf: number
    const t0 = Date.now()
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// ── Anneau REMPLI animé (0 → score) + compteur central ───────────────────────
const FillRing: FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = (RING_SIZE - RING_STROKE) / 2
  const c = 2 * Math.PI * r
  const progress = useSharedValue(0)
  const shown = useCountUp(Math.round(score))

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, score)) / 100, {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    })
  }, [score, progress])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
  }))

  return (
    <View style={styles.ringBox}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          stroke={colors.gray200}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringScore}>{shown}</Text>
        <Text style={styles.ringPct}>%</Text>
      </View>
    </View>
  )
}

// ── Anneau ROTATIF (calcul en cours) : un arc qui tourne en boucle ────────────
const SpinnerRing: FC = () => {
  const r = (RING_SIZE - RING_STROKE) / 2
  const c = 2 * Math.PI * r
  const rot = useSharedValue(0)

  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1)
  }, [rot])

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))

  return (
    <View style={styles.ringBox}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          stroke={colors.gray100}
          strokeWidth={RING_STROKE}
          fill="none"
        />
      </Svg>
      <Animated.View style={[styles.spinnerLayer, style]}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeDasharray={`${c * 0.22} ${c * 0.78}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
      </Animated.View>
    </View>
  )
}

// ── Barre skeleton pulsante (formes qui « respirent », pas de texte) ──────────
const PulseBar: FC<{ width: number; height?: number; round?: boolean }> = ({
  width,
  height = 12,
  round = false,
}) => {
  const o = useSharedValue(0.45)
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: round ? height / 2 : 6, backgroundColor: colors.gray200 },
        style,
      ]}
    />
  )
}

export const CompatibilityCard: FC<Props> = ({
  analysisId,
  initialCompatibility,
  initialBlocks,
  initialBlocksKey,
  restrictedCount = 0,
  onManageRestrictions,
  onShowRestrictedFamilies,
  onReady,
}) => {
  const router = useRouter()
  const hasInitial = Boolean(initialCompatibility && initialBlocks)
  const [state, setState] = useState<State>(
    hasInitial
      ? { status: 'ready', blocks: initialBlocks as PersonalBlocks, compatibility: initialCompatibility ?? null }
      : { status: 'loading' },
  )
  const [modalOpen, setModalOpen] = useState(false)
  const fetchedRef = useRef(false)
  const readyFiredRef = useRef(false)

  useEffect(() => {
    if (state.status === 'ready' && !readyFiredRef.current) {
      readyFiredRef.current = true
      onReady?.()
    }
  }, [state.status, onReady])

  // Blocs persistés sous un ANCIEN prompt → rafraîchissement silencieux (gratuit).
  const stale =
    hasInitial && (!initialBlocksKey || !initialBlocksKey.startsWith(`v${PERSONAL_BLOCKS_VERSION}:`))

  const run = (background = false) => {
    if (!analysisId) {
      if (!background) setState({ status: 'error' })
      return
    }
    if (!background) setState({ status: 'loading' })
    void (async () => {
      try {
        const { data, error, response } = await supabase.functions.invoke('personal-insights', {
          body: { analysisId, compat: true },
        })
        if (error) {
          if (background) return
          const res: Response | undefined =
            response ?? ((error as { context?: Response }).context as Response | undefined)
          if (res?.status === 429) {
            setState({ status: 'locked' })
            return
          }
          setState({ status: 'error' })
          return
        }
        const r = data as {
          blocks?: PersonalBlocks
          compatibility?: Compatibility | null
          profileIncomplete?: boolean
          missingSection?: MissingSection
        } | null
        if (r?.profileIncomplete) {
          if (background) return
          setState({ status: 'profileIncomplete', missingSection: r.missingSection ?? 'skin' })
          return
        }
        if (r?.blocks?.goals && r.blocks.skin && r.blocks.watch) {
          setState({ status: 'ready', blocks: r.blocks, compatibility: r.compatibility ?? null })
        } else if (!background) {
          setState({ status: 'error' })
        }
      } catch {
        if (!background) setState({ status: 'error' })
      }
    })()
  }

  useEffect(() => {
    if (fetchedRef.current) return
    if (!hasInitial) {
      fetchedRef.current = true
      run()
      return
    }
    if (stale) {
      fetchedRef.current = true
      run(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId])

  const goComplete = (section: MissingSection) => {
    router.push((`${ROUTES.ONBOARDING.INDEX}?section=${section}`) as Href)
  }

  // ── Ligne restrictions (toujours affichée) ─────────────────────────────────
  const hasRestriction = restrictedCount > 0
  const restrictionText = hasRestriction
    ? `Contient ${restrictedCount} de tes restrictions`
    : 'Ne contient aucune de tes restrictions'
  const restrictionTint = hasRestriction ? colors.rating.rouge.text : colors.rating.vert.text
  const restrictionLine = (
    <Pressable
      onPress={hasRestriction ? onShowRestrictedFamilies : onManageRestrictions}
      disabled={!(hasRestriction ? onShowRestrictedFamilies : onManageRestrictions)}
      accessibilityRole="button"
      accessibilityLabel={restrictionText}
      style={({ pressed }) => [styles.restrictionRow, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="heart" size={15} color={restrictionTint} />
      <Text style={[styles.restrictionText, { color: restrictionTint }]} numberOfLines={2}>
        {restrictionText}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={colors.inkLight} />
    </Pressable>
  )

  return (
    <WhiteCard padding={spacing.lg}>
      {/* Titre de carte, en gros — TOUJOURS le même (exigence user) : le cercle
          est un score de compatibilité au profil, jamais « de qualité ». */}
      <Text style={styles.cardTitle}>Score de compatibilité à ton profil</Text>

      {state.status === 'loading' ? (
        <View style={styles.row}>
          <SpinnerRing />
          <View style={styles.rightCol}>
            <PulseBar width={110} height={26} round />
            <PulseBar width={150} />
            <PulseBar width={120} />
          </View>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.centerArea}>
          <Text style={styles.errorText}>Compatibilité indisponible.</Text>
          <Pressable onPress={() => run()} hitSlop={8}>
            <Text style={styles.retry}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === 'profileIncomplete' ? (
        <Pressable
          onPress={() => goComplete(state.missingSection)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.centerArea, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.profileBadge}>
            <Ionicons name="person-add" size={22} color={colors.accent} />
          </View>
          <Text style={styles.lockTitle}>Complète ton profil</Text>
          <Text style={styles.lockSub}>
            {state.missingSection === 'hair'
              ? 'Renseigne tes cheveux pour voir ta compatibilité avec ce produit.'
              : 'Renseigne ta peau pour voir ta compatibilité avec ce produit.'}
          </Text>
          <View style={styles.ctaPill}>
            <Text style={styles.ctaPillText}>Compléter maintenant</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.surface} />
          </View>
        </Pressable>
      ) : null}

      {state.status === 'locked' ? (
        <Pressable
          onPress={() => router.push(ROUTES.OFFRE.INDEX)}
          accessibilityRole="button"
          accessibilityLabel="Débloquer ta compatibilité avec Premium"
          style={styles.lockedWrap}
        >
          <View style={styles.row} pointerEvents="none">
            <View style={styles.ringSkeleton} />
            <View style={styles.rightCol}>
              <View style={[styles.skelLine, { width: 110, height: 26, borderRadius: 13 }]} />
              <View style={[styles.skelLine, { width: 150 }]} />
            </View>
          </View>
          <BlurView intensity={16} tint="light" style={styles.lockBlur} pointerEvents="none" />
          <View style={styles.lockOverlay} pointerEvents="none">
            <View style={styles.profileBadge}>
              <Ionicons name="lock-closed" size={20} color={colors.accent} />
            </View>
            <Text style={styles.lockTitle}>Ta compatibilité</Text>
            <Text style={styles.lockSub}>Découvre à quel point ce produit te correspond.</Text>
            <View style={[styles.ctaPill, { backgroundColor: colors.accent }]}>
              <Ionicons name="sparkles" size={13} color={colors.surface} />
              <Text style={styles.ctaPillText}>Débloquer avec Premium</Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {state.status === 'ready' ? (
        state.compatibility ? (
          <Pressable
            onPress={() => setModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Voir ce qu'il faut retenir"
            style={({ pressed }) => pressed && { opacity: 0.9 }}
          >
            <View style={styles.row}>
              {/* Anneau à GAUCHE, taille pleine, remplissage animé */}
              <FillRing
                score={state.compatibility.score}
                color={TONE_COLOR[state.compatibility.tone].ring}
              />
              {/* Textes à DROITE, apparition en fondu */}
              <Animated.View
                entering={FadeInRight.duration(380).delay(120)}
                style={styles.rightCol}
              >
                <View
                  style={[styles.chip, { backgroundColor: TONE_COLOR[state.compatibility.tone].bg }]}
                >
                  <Text
                    style={[styles.chipText, { color: TONE_COLOR[state.compatibility.tone].text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {state.compatibility.label}
                  </Text>
                </View>
                {state.compatibility.subtitle ? (
                  <Animated.Text
                    entering={FadeIn.duration(420).delay(320)}
                    style={styles.subtitle}
                    numberOfLines={3}
                  >
                    {state.compatibility.subtitle}
                  </Animated.Text>
                ) : null}
                <Animated.View entering={FadeIn.duration(420).delay(460)} style={styles.retainRow}>
                  <Ionicons name="sparkles" size={13} color={colors.accent} />
                  <Text style={styles.retainText}>Ce qu'il faut retenir</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.inkLight} />
                </Animated.View>
              </Animated.View>
            </View>
          </Pressable>
        ) : (
          // Blocs présents mais score non produit (rare) : accès aux 3 blocs conservé.
          <Pressable onPress={() => setModalOpen(true)} accessibilityRole="button">
            <View style={styles.centerArea}>
              <View style={styles.profileBadge}>
                <Ionicons name="sparkles" size={20} color={colors.accent} />
              </View>
              <Text style={styles.lockTitle}>Analyse personnalisée</Text>
              <Text style={styles.lockSub}>Découvre ce qu'il faut retenir pour toi.</Text>
            </View>
            <View style={[styles.retainRow, styles.retainRowCentered]}>
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={styles.retainText}>Ce qu'il faut retenir</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.inkLight} />
            </View>
          </Pressable>
        )
      ) : null}

      {/* Ligne restrictions — toujours présente, sous le score */}
      <View style={styles.divider} />
      {restrictionLine}

      {/* Modal « Ce qu'il faut retenir » : détail du calcul + les 3 blocs IA */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ce qu'il faut retenir</Text>
            <Pressable
              onPress={() => setModalOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={styles.modalClose}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {state.status === 'ready' && state.compatibility?.breakdown ? (
              <BreakdownCard
                score={state.compatibility.score}
                tone={state.compatibility.tone}
                relevance={state.compatibility.relevance}
                breakdown={state.compatibility.breakdown}
              />
            ) : null}
            {state.status === 'ready' ? (
              <PersonalBlocksList
                blocks={state.blocks}
                // < 60 : pas de bloc « utilité » (mode d'emploi) sur un produit
                // peu compatible — il contredirait le verdict.
                hideSkin={(state.compatibility?.score ?? 100) < 60}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </WhiteCard>
  )
}

/** Une puce du détail : dot coloré + libellé court. SANS chiffres (choix user) :
 *  la couleur du dot porte le sens (vert = joue pour toi, rouge = joue contre). */
const BdBullet: FC<{ dot: string; label: string }> = ({ dot, label }) => (
  <View style={styles.bdRow}>
    <View style={[styles.bdDot, { backgroundColor: dot }]} />
    <Text style={styles.bdLabel} numberOfLines={2}>
      {label}
    </Text>
  </View>
)

/**
 * Détail du calcul en PUCES courtes et QUALITATIVES (demande user) : le
 * pourquoi du score sans étalage de chiffres ; seul le total est chiffré.
 */
const BreakdownCard: FC<{
  score: number
  tone: CompatTone
  relevance: Compatibility['relevance']
  breakdown: CompatBreakdown
}> = ({ score, tone, relevance, breakdown }) => {
  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.bdTitle}>Le calcul de ton score</Text>

      {/* 1. Le point de départ : la qualité de la formule (note du produit). */}
      <BdBullet dot={colors.ink} label="Point de départ : la qualité de la formule" />

      {/* 2. Pourquoi rien ne bouge, quand rien ne bouge. La puce « aucun actif »
          n'apparaît QUE si AUCUNE ligne ne suit (sinon elle contredirait la
          restriction/le plafond affichés juste en dessous). */}
      {relevance === 'product_only' ? (
        <BdBullet
          dot={colors.gray300}
          label="Produit du quotidien : le score suit la qualité de la formule"
        />
      ) : breakdown.lines.length === 0 ? (
        <BdBullet
          dot={colors.gray300}
          label="Aucun actif marquant pour ton profil : ni bonus ni malus"
        />
      ) : null}

      {/* 3. Les bonus / malus réels (matchs profil, plafond, restrictions). */}
      {breakdown.lines.map((l, i) => (
        <BdBullet
          key={i}
          dot={l.points >= 0 ? colors.rating.vert.DEFAULT : colors.rating.rouge.DEFAULT}
          label={l.label}
        />
      ))}

      <View style={styles.bdDivider} />
      <View style={styles.bdRow}>
        <Text style={styles.bdTotalLabel}>Ton score</Text>
        <Text style={[styles.bdTotal, { color: TONE_COLOR[tone].text }]}>{score}%</Text>
      </View>
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  // Rangée principale : anneau gauche + colonne texte droite
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    alignItems: 'flex-start',
  },
  ringBox: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  spinnerLayer: { ...StyleSheet.absoluteFillObject },
  ringCenter: { flexDirection: 'row', alignItems: 'baseline' },
  ringScore: { fontFamily: fontFamilies.bold, fontSize: 42, letterSpacing: -1, color: colors.gray900 },
  ringPct: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.gray900, marginLeft: 1 },
  eyebrow: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.inkMuted,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  chipText: { fontFamily: fontFamilies.semiBold, fontSize: 13 },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  retainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  retainRowCentered: { justifyContent: 'center', marginTop: spacing.md },
  retainText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  centerArea: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: spacing.md,
  },
  restrictionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restrictionText: { flex: 1, fontFamily: fontFamilies.semiBold, fontSize: 13 },
  // skeleton verrou
  ringSkeleton: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: colors.gray100,
    flexShrink: 0,
  },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: colors.gray100 },
  // error
  errorText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  retry: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.accent, marginTop: 6 },
  // profile / locked overlays
  profileBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockTitle: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, textAlign: 'center' },
  lockSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 2,
    maxWidth: 260,
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.base,
  },
  ctaPillText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.surface },
  lockedWrap: { position: 'relative' },
  lockBlur: { ...StyleSheet.absoluteFillObject, borderRadius: radius.lg, overflow: 'hidden' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // modal
  modalSafe: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  modalTitle: { fontFamily: fontFamilies.semiBold, fontSize: 18, color: colors.ink },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  modalScroll: { flex: 1 },
  modalContent: { padding: spacing.base, gap: spacing.md },
  // Breakdown (détail du calcul)
  bdTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  bdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
  },
  bdDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  bdLabel: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  bdBase: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  bdPoints: { fontFamily: fontFamilies.semiBold, fontSize: 14 },
  bdDivider: { height: 1, backgroundColor: colors.borderMuted, marginVertical: 6 },
  bdTotalLabel: { flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: colors.ink },
  bdTotal: { fontFamily: fontFamilies.bold, fontSize: 18 },
})
