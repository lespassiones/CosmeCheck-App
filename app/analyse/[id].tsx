/**
 * AnalyseDetailScreen — écran de détail d'une analyse INCI.
 *
 * Charge la ligne `analyses` via getAnalysisById, parse `result_json` avec
 * parseAnalyseResponse, calcule l'« essentiel » (engine.computeEssentiel) puis
 * rend AnalysisResultPanel dans une ScrollView.
 *
 * En-tête produit (titre + catégorie + VerdictGauge) au-dessus du panel —
 * miroir mobile du TitleBar web.
 *
 * États : chargement (spinner) · erreur (carte + bouton accueil) · prêt.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AnalysisResultPanel } from '@/components/analysis/AnalysisResultPanel'
import { VerdictGauge } from '@/components/analysis/VerdictGauge'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { getAnalysisById } from '@/lib/analysis/analyser'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { isProductCategory } from '@/lib/ai/categorize'
import { categoryLabel } from '@/lib/categoryLabel'
import { computeEssentiel, type EssentielData } from '@/lib/essentiel/engine'
import { useRoutine } from '@/hooks/useRoutine'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      result: AnalyseResponse
      essentiel: EssentielData
      title: string
      categoryText: string | null
    }

const AnalyseDetailScreen: FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const scrollRef = useRef<ScrollView>(null)
  const reduceMotion = useReducedMotion()
  const { addToRoutine, isInRoutine } = useRoutine()
  const [routinePending, setRoutinePending] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: 'error', message: "Identifiant d'analyse manquant." })
      return
    }
    setState({ status: 'loading' })
    try {
      const row = await getAnalysisById(id)
      if (!row) {
        setState({ status: 'error', message: "Cette analyse est introuvable." })
        return
      }
      const result = parseAnalyseResponse(row.result_json)
      if (!result) {
        setState({ status: 'error', message: "Le résultat de cette analyse est illisible." })
        return
      }
      const category = isProductCategory(result.category) ? result.category : null
      const essentiel = computeEssentiel(result, {
        category,
        productType: row.product_type ?? result.productType ?? null,
      })
      const title = row.product_label?.trim() || row.name?.trim() || 'Analyse de votre liste'
      const categoryText = categoryLabel(category) ?? row.product_type ?? null
      setState({ status: 'ready', result, essentiel, title, categoryText })
    } catch (e) {
      setState({
        status: 'error',
        message:
          e instanceof Error ? e.message : "Impossible de charger l'analyse.",
      })
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const handleIngredientPress = useCallback((slug: string) => {
    router.push(ROUTES.INGREDIENT.DETAIL(slug))
  }, [])

  const handleViewRestrictions = useCallback(() => {
    router.push(ROUTES.PROFILE.RESTRICTIONS)
  }, [])

  const handleRequestScrollTo = useCallback((y: number) => {
    // y est relatif au contenu du panel ; le panel est rendu après l'en-tête,
    // mais ScrollView.scrollTo prend une coordonnée relative au contenu
    // scrollé. On approxime en ajoutant un offset d'en-tête fixe.
    scrollRef.current?.scrollTo({ y: y + HEADER_OFFSET, animated: !reduceMotion })
  }, [reduceMotion])

  const verdictTone = useMemo(
    () => (state.status === 'ready' ? state.essentiel.verdict.tone : 'unknown'),
    [state],
  )

  const alreadyInRoutine = id ? isInRoutine(id) : false

  const handleAddRoutine = useCallback(async () => {
    if (!id || alreadyInRoutine || routinePending) return
    setRoutinePending(true)
    try {
      await addToRoutine(id, 'daily')
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter ce produit à ta routine.")
    } finally {
      setRoutinePending(false)
    }
  }, [id, alreadyInRoutine, routinePending, addToRoutine])

  const handleVoirPromesse = useCallback(() => {
    router.push(ROUTES.PROMESSES.NOUVELLE)
  }, [])

  const handleShare = useCallback(async () => {
    if (state.status !== 'ready') return
    try {
      await Share.share({
        message: `${state.title} — analyse CosmeCheck`,
      })
    } catch {
      /* user cancelled */
    }
  }, [state])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundGlow variant="default" />

      {/* Barre supérieure : pilule "< Retour" à gauche, espace libre à droite */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backPill}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={16} color={colors.ink} />
          <Text style={styles.backPillText}>Retour</Text>
        </Pressable>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Chargement de l'analyse…</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <GlassCard style={styles.errorCard} padding={spacing['2xl']}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.rating.rouge.text} />
            </View>
            <Text style={styles.errorTitle}>Oups</Text>
            <Text style={styles.errorMsg}>{state.message}</Text>
            <View style={styles.errorActions}>
              <Pressable
                onPress={() => void load()}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Réessayer</Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace(ROUTES.TABS.HOME)}
                style={({ pressed }) => [styles.homeBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.homeText}>Accueil</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête produit : titre pleine largeur, catégorie, CTAs, partage + jauge */}
          <View style={styles.header}>
            <Text style={styles.title}>{state.title}</Text>
            {state.categoryText ? (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>{state.categoryText}</Text>
              </View>
            ) : null}

            <View style={styles.ctaRow}>
              <Pressable
                onPress={handleVoirPromesse}
                style={({ pressed }) => [
                  styles.ctaBtn,
                  styles.ctaBtnGreen,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
              >
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                <Text style={styles.ctaText} numberOfLines={1}>
                  Voir l&apos;analyse de la promesse
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAddRoutine}
                disabled={alreadyInRoutine || routinePending}
                style={({ pressed }) => [
                  styles.ctaBtn,
                  styles.ctaBtnRose,
                  (alreadyInRoutine || routinePending) && styles.ctaBtnDisabled,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
              >
                <Ionicons
                  name={alreadyInRoutine ? 'checkmark' : 'add'}
                  size={14}
                  color="#FFFFFF"
                />
                <Text style={styles.ctaText} numberOfLines={1}>
                  {alreadyInRoutine ? 'Dans ma routine' : 'Ajouter à ma routine'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.shareRow}>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.shareBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Partager"
                hitSlop={6}
              >
                <Ionicons name="share-social-outline" size={16} color={colors.inkMuted} />
                <Text style={styles.shareText}>Partager</Text>
              </Pressable>
              <VerdictGauge tone={verdictTone} orientation="horizontal" style={styles.gauge} />
            </View>
          </View>

          <AnalysisResultPanel
            result={state.result}
            essentiel={state.essentiel}
            onIngredientPress={handleIngredientPress}
            onViewRestrictionsPress={handleViewRestrictions}
            onRequestScrollTo={handleRequestScrollTo}
            reduceMotion={reduceMotion}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

export default AnalyseDetailScreen

/** Hauteur approximative de l'en-tête produit (titre + catégorie + jauge),
 *  ajoutée à l'offset des lignes d'ingrédients pour le scroll-to. */
const HEADER_OFFSET = 96

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  backPillText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.base,
  },
  loadingText: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.base,
  },
  header: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.ink,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: -spacing.xs,
  },
  categoryText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
    textTransform: 'capitalize',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.full,
  },
  ctaBtnGreen: { backgroundColor: colors.success },
  ctaBtnRose: { backgroundColor: colors.rose },
  ctaBtnDisabled: { opacity: 0.7 },
  ctaText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  // Pilule blanche regroupant "Partager" + la jauge des 5 pastilles
  // (NB : pas d'overflow:hidden — laisse le halo de la pastille active déborder).
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    flexShrink: 0,
  },
  shareText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.inkMuted,
  },
  gauge: {
    // La jauge prend la place restante et distribue les pastilles (flex+space-between
    // gérés en interne par VerdictGauge.styles.row).
  },
  errorCard: {
    alignItems: 'center',
    width: '100%',
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.rating.rouge.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  errorMsg: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    ...typography.button,
    color: colors.surface,
  },
  homeBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  homeText: {
    ...typography.button,
    color: colors.ink,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
