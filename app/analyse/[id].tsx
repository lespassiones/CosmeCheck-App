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
import { PromesseFlowModal } from '@/components/promesses/PromesseFlowModal'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { applyRestrictions, getAnalysisById } from '@/lib/analysis/analyser'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { isProductCategory } from '@/lib/ai/categorize'
import { categoryLabel } from '@/lib/categoryLabel'
import { computeEssentiel, verdictToneFromScore, type EssentielData } from '@/lib/essentiel/engine'
import {
  cacheAnalysisRow,
  getCachedAnalysisRow,
} from '@/lib/storage/session'
import { resolveAndCacheProductImage } from '@/lib/storage/productImageCache'
import { resolveCatalogIdentity } from '@/lib/catalog/resolveCatalogIdentity'
import { leafLabelFromCategorySlug } from '@/constants/categories'
import type { AnalysisRow } from '@/lib/supabase/types'
import { useProfile } from '@/hooks/useProfile'
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
      /** Catégorie précise (slug famille/sous/feuille) pour produits analysés. */
      categoryPrecise: string | null
      brand: string | null
      productLabel: string | null
      productType: string | null
      inciText: string
      /** EAN stocké sur la ligne (scan / clic reco / recherche) — fiable pour les
       *  alternatives, contrairement à la résolution par marque+nom. */
      ean: string | null
    }

const AnalyseDetailScreen: FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null)
  // Score INCI Beauty (catalog.score) + dernière sous-catégorie, résolus depuis
  // le catalogue par marque+nom. catalog.score est la SOURCE DE VÉRITÉ du score
  // (l'écran doit l'afficher, pas le score calculé de result_json).
  const [catalogScore, setCatalogScore] = useState<number | null>(null)
  const [leafCategory, setLeafCategory] = useState<string | null>(null)
  // EAN + slug de catégorie catalogue — pour la section Outils (signalement /
  // envoi de photo). Restent null si le produit n'est pas au catalogue.
  const [catalogEan, setCatalogEan] = useState<string | null>(null)
  const [catalogCategorySlug, setCatalogCategorySlug] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const reduceMotion = useReducedMotion()
  const { restrictions } = useProfile()
  const { addToRoutine, isInRoutine } = useRoutine()
  const [routinePending, setRoutinePending] = useState(false)

  // Hydrate l'URL image produit :
  //   1. cache AsyncStorage (instantané, mis en place au pick depuis catalogue
  //      / lien / web)
  //   2. fallback catalogue via brand+name (RPC ILIKE) → 1 seul appel DB par
  //      analyse historique, puis re-cachée pour les prochaines fois
  // Le schéma `analyses` n'a pas de colonne image_url, d'où ce mécanisme.
  useEffect(() => {
    if (!id || state.status !== 'ready') return
    let cancelled = false
    void resolveAndCacheProductImage(id, state.brand, state.productLabel).then(
      (url) => {
        if (!cancelled) setProductImageUrl(url)
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, state])

  // Résout le score INCI Beauty (catalog.score) + la dernière sous-catégorie
  // depuis le catalogue (par marque+nom). Si le produit n'est pas au catalogue
  // (saisie manuelle / internet), catalogScore reste null → on garde le score
  // calculé de result_json.
  useEffect(() => {
    if (state.status !== 'ready') return
    let cancelled = false
    void resolveCatalogIdentity(state.brand, state.productLabel).then((info) => {
      if (cancelled || !info) return
      setCatalogScore(info.score)
      setLeafCategory(leafLabelFromCategorySlug(info.category))
      setCatalogEan(info.ean)
      setCatalogCategorySlug(info.category)
    })
    return () => {
      cancelled = true
    }
  }, [state])

  const buildReadyState = useCallback(
    (row: AnalysisRow): LoadState => {
      const parsed = parseAnalyseResponse(row.result_json)
      if (!parsed) {
        return { status: 'error', message: "Le résultat de cette analyse est illisible." }
      }
      // Applique les restrictions de l'utilisateur (is_restricted sur chaque item).
      // Nécessaire au rechargement depuis la BD car le flag n'est pas persisté.
      const result = applyRestrictions(parsed, restrictions) as AnalyseResponse
      const category = isProductCategory(result.category) ? result.category : null
      const essentiel = computeEssentiel(result, {
        category,
        productType: row.product_type ?? result.productType ?? null,
      })
      const title = decodeHtml(row.product_label?.trim() || row.name?.trim()) || 'Analyse de votre liste'
      const categoryText = categoryLabel(category) ?? row.product_type ?? null
      return {
        status: 'ready',
        result,
        essentiel,
        title,
        categoryText,
        categoryPrecise: (row as { category_precise?: string | null }).category_precise ?? null,
        brand: decodeHtml(row.brand?.trim()) || null,
        productLabel: decodeHtml(row.product_label?.trim() || row.name?.trim()) || null,
        productType: row.product_type ?? result.productType ?? null,
        inciText: row.input_text ?? '',
        ean: (row as { ean?: string | null }).ean ?? null,
      }
    },
    [restrictions],
  )

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: 'error', message: "Identifiant d'analyse manquant." })
      return
    }
    setState({ status: 'loading' })
    // 1. Cache local d'abord (TTL 24h, hydrate instantanément).
    try {
      const cached = await getCachedAnalysisRow(id)
      if (cached) {
        setState(buildReadyState(cached))
        return
      }
    } catch {
      // AsyncStorage indisponible : on tombe sur la branche réseau.
    }
    // 2. Miss → fetch DB.
    try {
      const row = await getAnalysisById(id)
      if (!row) {
        setState({ status: 'error', message: "Cette analyse est introuvable." })
        return
      }
      const ready = buildReadyState(row)
      setState(ready)
      if (ready.status === 'ready') {
        // Best-effort : on n'attend pas la fin de l'écriture pour répondre.
        void cacheAnalysisRow(row).catch(() => {})
      }
    } catch (e) {
      setState({
        status: 'error',
        message:
          e instanceof Error ? e.message : "Impossible de charger l'analyse.",
      })
    }
  }, [id, buildReadyState])

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

  // Pastille du VerdictGauge dérivée du SCORE. SOURCE DE VÉRITÉ = catalog.score
  // (INCI Beauty) dès qu'il est résolu ; sinon le score de result_json (produit
  // hors catalogue / en attendant la résolution). Garantit que la pastille du
  // détail = celle des listes (recherche/alternatives).
  // Score affiché = score IB (catalog) sinon calculé, PLAFONNÉ par le plancher
  // couleur : ≥1 rouge OU ≥3 orange → pastille ≤ triangle (<9) ; 1-2 orange →
  // pastille ≤ œil (<13). + nombre d'ingrédients pénalisants (orange+rouge).
  const { effectiveVerdictScore, penalizingCount } = useMemo(() => {
    if (state.status !== 'ready') return { effectiveVerdictScore: null as number | null, penalizingCount: 0 }
    const nOrange = state.result.counts.orange ?? 0
    const nRouge = state.result.counts.rouge ?? 0
    const base = catalogScore ?? state.result.score
    let score = base
    if (base != null) {
      if (nRouge >= 1 || nOrange >= 3) score = Math.min(base, 8.9)
      else if (nOrange >= 1) score = Math.min(base, 12.9)
    }
    return { effectiveVerdictScore: score, penalizingCount: nOrange + nRouge }
  }, [state, catalogScore])

  const verdictTone = useMemo(
    () => (effectiveVerdictScore == null ? 'unknown' : verdictToneFromScore(effectiveVerdictScore)),
    [effectiveVerdictScore],
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

  const [promesseModalOpen, setPromesseModalOpen] = useState(false)

  const handleVoirPromesse = useCallback(() => {
    if (state.status !== 'ready') return
    setPromesseModalOpen(true)
  }, [state.status])

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
          onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.HOME))}
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
                onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.HOME))}
                style={({ pressed }) => [styles.homeBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.homeText}>Retour</Text>
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
            <Text style={styles.title} numberOfLines={3}>{state.title}</Text>
            {(() => {
              // Priorité à la catégorie précise (famille/sous/feuille) pour les
              // produits analysés, sinon la feuille catalogue, sinon l'enum.
              const preciseLeaf = state.categoryPrecise
                ? leafLabelFromCategorySlug(state.categoryPrecise)
                : null
              const chipLabel = leafCategory || preciseLeaf || state.categoryText
              return (chipLabel || state.brand) ? (
              <View style={styles.metaRow}>
                {chipLabel ? (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText} numberOfLines={1}>
                      {chipLabel}
                    </Text>
                  </View>
                ) : null}
                {state.brand ? (
                  <Text style={styles.brandText} numberOfLines={1}>{state.brand}</Text>
                ) : null}
              </View>
            ) : null
            })()}

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
            analysisId={id}
            result={state.result}
            essentiel={state.essentiel}
            onIngredientPress={handleIngredientPress}
            onViewRestrictionsPress={handleViewRestrictions}
            onRequestScrollTo={handleRequestScrollTo}
            reduceMotion={reduceMotion}
            productImageUrl={productImageUrl}
            brand={state.brand}
            productName={state.productLabel}
            verdictScore={effectiveVerdictScore}
            penalizingCount={penalizingCount}
            productEan={state.ean ?? catalogEan}
            category={catalogCategorySlug ?? state.categoryPrecise ?? state.categoryText}
          />
        </ScrollView>
      )}

      {/* Modale "Analyser la promesse" — flow auto identify→fetch→coherence. */}
      {state.status === 'ready' ? (
        <PromesseFlowModal
          visible={promesseModalOpen}
          onClose={() => setPromesseModalOpen(false)}
          inci={state.inciText}
          productLabel={state.productLabel}
          brand={state.brand}
          productType={state.productType}
          analysisId={id ?? null}
        />
      ) : null}
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
    textTransform: 'capitalize',
  },
  brandText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    color: colors.ink,
    flexShrink: 1,
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
