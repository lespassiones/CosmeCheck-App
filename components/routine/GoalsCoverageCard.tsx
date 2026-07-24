/**
 * GoalsCoverageCard — bloc « Couverture de tes objectifs » (onglet Routine).
 *
 * Pour chaque objectif du profil, une jauge horizontale + %, calculée par l'edge
 * `goals-coverage` selon TOUS les produits de la routine et le profil. États :
 *   - no_goals      : verrouillé, CTA « Remplis tes objectifs » → /profile/objectives
 *   - empty_routine : invite à ajouter des produits
 *   - needs_eval    : bouton « Évaluer la couverture de mes objectifs » (3 crédits)
 *   - ready         : les jauges + bouton reload (grisé si routine inchangée)
 *   - crédits épuisés : upsell → /offre
 *
 * Le design suit la maquette validée (barres horizontales, libellés courts) et le
 * design system (WhiteCard, tokens rating). Épuré, une jauge par ligne.
 */

import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

import { WhiteCard } from '@/components/design/WhiteCard'
import { AnimatedGaugeFill, useCountUp } from '@/components/design/motion'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useGoalsCoverage } from '@/hooks/useGoalsCoverage'
import type { CoverageItem, CoverageTone } from '@/lib/routine/goalsCoverage'

/** Libellés COURTS pour les jauges (les libellés profil sont des phrases). */
const SHORT_GOAL_LABEL: Record<string, string> = {
  peau_douce: 'Peau douce',
  teint_uniforme: 'Teint uniforme',
  attenuer_boutons: 'Anti-imperfections',
  reduire_rides: 'Anti-âge',
  calmer_rougeurs: 'Anti-rougeurs',
  hydrater_profondeur: 'Hydratation',
  reduire_taches: 'Anti-taches',
  renforcer_barriere: 'Barrière cutanée',
  adoucir_corps: 'Douceur du corps',
  reduire_vergetures: 'Vergetures',
  proteger_soleil: 'Protection solaire',
  cheveux_brillants: 'Brillance cheveux',
  renforcer_cheveux: 'Cheveux renforcés',
  definir_boucles: 'Boucles définies',
  cuir_chevelu_sain: 'Cuir chevelu',
  reduire_chute: 'Anti-chute',
  simplifier_routine: 'Routine simple',
  decouvrir_clean: 'Produits clean',
  comprendre_produits: 'Comprendre',
  eviter_risques: 'Éviter les risques',
  alternatives_adaptees: 'Alternatives',
  construire_routine: 'Ma routine',
}

const TONE_COLOR: Record<CoverageTone, string> = {
  vert: colors.rating.vert.DEFAULT,
  jaune: colors.rating.jaune.DEFAULT,
  orange: colors.rating.orange.DEFAULT,
  rouge: colors.rating.rouge.DEFAULT,
}

function shortLabel(item: CoverageItem): string {
  if (item.isCustom) return item.label
  return SHORT_GOAL_LABEL[item.key] ?? item.label
}

// ── Ligne jauge (dépliable) ────────────────────────────────────────────────
// Repliée : libellé court + barre + %. Au tap → se déroule : nom COMPLET de
// l'objectif en haut, barre de progression + % en dessous.
const GaugeRow: FC<{ item: CoverageItem; index?: number; animateKey?: number }> = ({
  item,
  index = 0,
  animateKey = 0,
}) => {
  const color = TONE_COLOR[item.tone] ?? colors.rating.rouge.DEFAULT
  const [open, setOpen] = useState(false)
  // Remplissage animé + count-up du %, échelonnés par ligne. `animateKey`
  // change à chaque refresh → tout se re-remplit, même à valeurs identiques.
  const delay = 80 + Math.min(index, 10) * 60
  const shownPct = useCountUp(item.percent, animateKey, 700, delay)
  const fill = (
    <View style={styles.track}>
      <AnimatedGaugeFill percent={item.percent} color={color} animateKey={animateKey} delay={delay} />
    </View>
  )
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${item.label} : ${item.percent}%`}
    >
      <Animated.View layout={LinearTransition.duration(220)} style={styles.gaugeRowStacked}>
        {/* Nom de l'objectif en haut (pleine largeur, jamais tronqué). Tap →
            révèle le libellé complet ; sinon libellé court. */}
        <Text style={styles.gaugeLabelFull} numberOfLines={open ? undefined : 1}>
          {open ? item.label : shortLabel(item)}
        </Text>
        {/* Barre de niveau + % EN DESSOUS de l'objectif. */}
        <View style={styles.gaugeBarRow}>
          {fill}
          <Text style={[styles.percent, { color }]}>{shownPct}%</Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

// ── Carte ────────────────────────────────────────────────────────────────────
export const GoalsCoverageCard: FC = () => {
  const {
    state,
    coverage,
    goalsChanged,
    isEvaluating,
    noCredits,
    errored,
    evaluate,
  } = useGoalsCoverage()

  // « Voir tous mes objectifs » : par défaut on masque les objectifs à 0 % ;
  // déplié au tap, replié tout seul après 8 s (animation d'enroulement), mais le
  // minuteur se met en pause dès qu'on touche la zone dépliée.
  const [expanded, setExpanded] = useState(false)
  // Incrémenté à chaque tap sur « recharger » → les jauges se re-remplissent
  // depuis 0 (feedback visuel de recalcul), même si les valeurs sont les mêmes.
  const [refreshTick, setRefreshTick] = useState(0)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }, [])
  const scheduleCollapse = useCallback(() => {
    clearTimer()
    collapseTimer.current = setTimeout(() => setExpanded(false), 8000)
  }, [clearTimer])
  useEffect(() => {
    if (expanded) scheduleCollapse()
    else clearTimer()
    return clearTimer
  }, [expanded, scheduleCollapse, clearTimer])

  const showReload = state === 'ready'

  return (
    <WhiteCard padding={spacing.lg}>
      <View style={styles.header}>
        <Text style={styles.title}>Couverture de tes objectifs</Text>
        {showReload && (
          <Pressable
            onPress={() => {
              // Toujours actif : recharge sans forcer. Le serveur recalcule (3
              // crédits) SEULEMENT si la routine a changé (ou si la version du
              // calcul a bougé) ; sinon renvoie le cache en quelques ms, 0 crédit.
              if (!isEvaluating) {
                setRefreshTick((t) => t + 1)
                void evaluate(false)
              }
            }}
            disabled={isEvaluating}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Recharger la couverture"
            style={styles.reloadBtn}
          >
            {isEvaluating ? (
              <ActivityIndicator size="small" color={colors.rose} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.rose} />
            )}
          </Pressable>
        )}
      </View>

      {renderBody()}
    </WhiteCard>
  )

  function renderBody() {
    if (state === 'loading') {
      return (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.gaugeRow}>
              <View style={[styles.skelLabel]} />
              <View style={styles.track} />
              <View style={styles.skelPct} />
            </View>
          ))}
        </View>
      )
    }

    if (state === 'no_goals') {
      return (
        <Pressable style={styles.ctaBlock} onPress={() => router.push(ROUTES.PROFILE.OBJECTIVES)}>
          <View style={styles.lockIconWrap}>
            <Ionicons name="flag-outline" size={20} color={colors.accent} />
          </View>
          <Text style={styles.ctaText}>
            Remplis tes objectifs pour voir leur couverture par ta routine.
          </Text>
          <View style={styles.ctaLinkRow}>
            <Text style={styles.ctaLink}>Renseigner mes objectifs</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.accent} />
          </View>
        </Pressable>
      )
    }

    if (state === 'empty_routine') {
      return (
        <Text style={styles.hint}>
          Ajoute des produits à ta routine pour évaluer la couverture de tes objectifs.
        </Text>
      )
    }

    // goals + produits présents
    if (isEvaluating && state !== 'ready') {
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.rose} />
          <Text style={styles.loadingText}>Analyse de ta routine en cours…</Text>
        </View>
      )
    }

    if (noCredits) {
      return (
        <Pressable style={styles.ctaBlock} onPress={() => router.push(ROUTES.OFFRE.INDEX)}>
          <View style={[styles.lockIconWrap, { backgroundColor: colors.roseSoft }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.rose} />
          </View>
          <Text style={styles.ctaText}>
            Tu as utilisé tous tes crédits. Passe à Premium pour évaluer la couverture de tes objectifs.
          </Text>
          <View style={styles.ctaLinkRow}>
            <Text style={[styles.ctaLink, { color: colors.rose }]}>Voir l'offre</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.rose} />
          </View>
        </Pressable>
      )
    }

    if (state === 'ready') {
      const shown = coverage.filter((c) => c.percent > 0)
      const hidden = coverage.filter((c) => c.percent === 0)
      // Si rien n'est couvert, on affiche tout (ne pas replier un bloc vide).
      const base = shown.length > 0 ? shown : coverage
      const extra = shown.length > 0 ? hidden : []
      const hasExtra = extra.length > 0
      return (
        <Animated.View style={styles.gaugeList} layout={LinearTransition.duration(280)}>
          {base.map((item, i) => (
            <GaugeRow key={item.key} item={item} index={i} animateKey={refreshTick} />
          ))}
          {hasExtra && expanded && (
            <Animated.View
              entering={FadeInDown.duration(240)}
              exiting={FadeOutUp.duration(220)}
              style={styles.gaugeList}
              onTouchStart={scheduleCollapse}
            >
              {extra.map((item, i) => (
                <GaugeRow key={item.key} item={item} index={i} animateKey={refreshTick} />
              ))}
            </Animated.View>
          )}
          {hasExtra && (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              hitSlop={6}
              style={styles.moreBtn}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>
                {expanded ? 'Réduire' : `Voir tous mes objectifs (${extra.length} à 0 %)`}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.accent}
              />
            </Pressable>
          )}
        </Animated.View>
      )
    }

    // needs_eval
    return (
      <View style={styles.evalBlock}>
        <Text style={styles.evalIntro}>
          {goalsChanged
            ? 'Tes objectifs ont changé. Réévalue la couverture de ta routine.'
            : 'Découvre à quel point ta routine couvre chacun de tes objectifs.'}
        </Text>
        {errored && (
          <Text style={styles.errorText}>Un souci est survenu. Réessaie dans un instant.</Text>
        )}
        <Pressable
          style={({ pressed }) => [styles.evalBtn, pressed && styles.evalBtnPressed]}
          onPress={() => void evaluate(false)}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
          <Text style={styles.evalBtnText} numberOfLines={1} adjustsFontSizeToFit>
            Évaluer la couverture de mes objectifs
          </Text>
        </Pressable>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink, flex: 1 },
  reloadBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },

  // Jauges
  gaugeList: { gap: 12 },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
  },
  moreText: { fontFamily: fontFamilies.semiBold, fontSize: 12.5, color: colors.accent },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Ligne empilée (défaut) : nom de l'objectif au-dessus, barre + % en dessous.
  gaugeRowStacked: { gap: 7 },
  gaugeLabelFull: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13.5,
    color: colors.ink,
    lineHeight: 18,
  },
  gaugeBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  percent: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12.5,
    width: 40,
    textAlign: 'right',
  },

  // Skeleton
  skeletonWrap: { gap: 12, opacity: 0.5 },
  skelLabel: { width: 108, height: 12, borderRadius: 6, backgroundColor: colors.gray200 },
  skelPct: { width: 40, height: 12, borderRadius: 6, backgroundColor: colors.gray200 },

  // CTA / lock
  ctaBlock: { alignItems: 'center', gap: 8, paddingVertical: spacing.xs },
  lockIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  ctaLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  ctaLink: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.accent },

  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    lineHeight: 18,
  },

  // Évaluation
  evalBlock: { gap: spacing.md },
  evalIntro: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  evalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  evalBtnPressed: { backgroundColor: colors.successDeep },
  evalBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
  },

  centerBlock: { alignItems: 'center', gap: 8, paddingVertical: spacing.md },
  loadingText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  errorText: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.error },
})
