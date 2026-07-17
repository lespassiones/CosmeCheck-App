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
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AnalysisResultPanel } from '@/components/analysis/AnalysisResultPanel'
import { Star3D } from '@/components/analysis/Star3D'
import { STARS_BY_TONE, STAR_PALETTE_BY_TONE, STAR_EMPTY_PALETTE } from '@/lib/analysis/qualityStars'
import { PromesseFlowModal } from '@/components/promesses/PromesseFlowModal'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { applyRestrictions, getAnalysisById } from '@/lib/analysis/analyser'
import { decodeHtml } from '@/lib/decodeHtml'
import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { db } from '@/lib/supabase/client'
import { isProductCategory } from '@/lib/ai/categorize'
import { categoryLabel } from '@/lib/categoryLabel'
import { computeEssentiel, verdictToneFromScore, type EssentielData, type VerdictTone } from '@/lib/essentiel/engine'
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
import { useAppConfig } from '@/hooks/useAppConfig'

/** Base du lien de partage web (page publique /a/[id] sur le twin web). */
const SHARE_BASE_URL = 'https://cosme-check.com'

// Barème étoiles « Qualité de la formule » (STARS_BY_TONE / STAR_PALETTE_BY_TONE /
// STAR_EMPTY_PALETTE) extrait dans lib/analysis/qualityStars.ts — partagé avec la
// carte d'aperçu scan (ScanPreviewCard). Miroir exact du web.

/** Taille des étoiles (≈2× l'ancienne taille Ionicons de 30). */
const STAR_SIZE = 54

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
      favori: boolean
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
  // Nombre de lignes rendues par le titre produit (mesuré via onTextLayout).
  // Pilote la disposition marque/sous-catégorie : titre sur 3 lignes → méta sur
  // UNE ligne (place comptée) ; titre sur 1-2 lignes → méta empilée.
  const [titleLines, setTitleLines] = useState(2)
  // Score catalogue propriétaire CosmeCheck (catalog.score) + dernière sous-catégorie,
  // résolus depuis le catalogue par marque+nom. catalog.score est la SOURCE DE VÉRITÉ
  // du score (l'écran doit l'afficher, pas le score calculé de result_json).
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
  const { config: appConfig } = useAppConfig()
  const [routinePending, setRoutinePending] = useState(false)

  // Champs stables extraits de l'état « ready » : les deux effets de résolution
  // catalogue ci-dessous en dépendent au lieu de l'objet `state` entier (qui
  // change 2x par ouverture : cache-ready puis réseau-ready) → pas de re-run
  // quand les valeurs n'ont pas bougé.
  const isReady = state.status === 'ready'
  const productEan = state.status === 'ready' ? state.ean : null
  const productBrand = state.status === 'ready' ? state.brand : null
  const productName = state.status === 'ready' ? state.productLabel : null

  // Hydrate l'URL image produit :
  //   1. cache AsyncStorage (instantané, mis en place au pick depuis catalogue
  //      / lien / web)
  //   2. EAN si disponible (source de vérité déterministe)
  //   3. fallback catalogue via brand+name (RPC ILIKE) → 1 seul appel DB par
  //      analyse historique, puis re-cachée pour les prochaines fois
  // Le schéma `analyses` n'a pas de colonne image_url, d'où ce mécanisme.
  useEffect(() => {
    if (!id || !isReady) return
    let cancelled = false
    void resolveAndCacheProductImage(id, productEan, productBrand, productName).then(
      (url) => {
        if (!cancelled) setProductImageUrl(url)
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, isReady, productEan, productBrand, productName])

  // Résout le score catalogue CosmeCheck (catalog.score) + la dernière sous-catégorie
  // depuis le catalogue (par marque+nom). Si le produit n'est pas au catalogue
  // (saisie manuelle / internet), catalogScore reste null - on garde le score
  // calculé de result_json.
  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    void resolveCatalogIdentity(productBrand, productName, productEan).then((info) => {
      if (cancelled || !info) return
      setCatalogScore(info.score)
      setLeafCategory(leafLabelFromCategorySlug(info.category))
      setCatalogEan(info.ean)
      setCatalogCategorySlug(info.category)
    })
    return () => {
      cancelled = true
    }
  }, [isReady, productEan, productBrand, productName])

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
        favori: (row as { favori?: boolean | null }).favori ?? false,
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
    let servedFromCache = false
    try {
      const cached = await getCachedAnalysisRow(id)
      if (cached) {
        setState(buildReadyState(cached))
        servedFromCache = true
        // PAS de return : on revalide en arrière-plan. Le serveur a pu enrichir
        // la ligne après coup (ex. backfill de l'EAN d'une analyse créée sur web)
        // → sinon l'image (EAN-only) et les alternatives resteraient vides ici
        // alors qu'elles marchent sur le web qui lit toujours frais.
      }
    } catch {
      // AsyncStorage indisponible : on tombe sur la branche réseau.
    }
    // 2. Fetch DB (frais). Si on a déjà rendu le cache, c'est une revalidation
    // silencieuse : on ne bascule en erreur que si on n'avait rien à afficher.
    try {
      const row = await getAnalysisById(id)
      if (!row) {
        if (!servedFromCache) {
          setState({ status: 'error', message: "Cette analyse est introuvable." })
        }
        return
      }
      const ready = buildReadyState(row)
      setState(ready)
      if (ready.status === 'ready') {
        // Best-effort : on n'attend pas la fin de l'écriture pour répondre.
        void cacheAnalysisRow(row).catch(() => {})
      }
    } catch (e) {
      if (!servedFromCache) {
        setState({
          status: 'error',
          message:
            e instanceof Error ? e.message : "Impossible de charger l'analyse.",
        })
      }
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

  // Pastille / étoiles « Qualité » = LECTURE DIRECTE de catalog.score (source de
  // vérité, déjà plafonnée par le moteur pastille V2 : le ceiling orange/rouge
  // est CUIT dans la note → verdictToneFromScore retombe pile sur la pastille).
  // Sinon result_json (produit hors catalogue). AUCUN applyColorCap ici : la note
  // est déjà correcte ; re-plafonner avec des compteurs (souvent périmés/faux)
  // ne ferait que DÉSYNCHRONISER l'affichage (audit 16 juil 2026 : 99,6 % des
  // notes catalog == V2, 0 « faux vert » ; le vrai bug était le plafond client).
  const { effectiveVerdictScore, penalizingCount } = useMemo(() => {
    if (state.status !== 'ready') return { effectiveVerdictScore: null as number | null, penalizingCount: 0 }
    const nOrange = state.result.counts.orange ?? 0
    const nRouge = state.result.counts.rouge ?? 0
    const effectiveVerdictScore = catalogScore ?? state.result.score
    return { effectiveVerdictScore, penalizingCount: nOrange + nRouge }
  }, [state, catalogScore])

  const verdictTone = useMemo(
    () => (effectiveVerdictScore == null ? 'unknown' : verdictToneFromScore(effectiveVerdictScore)),
    [effectiveVerdictScore],
  )

  const alreadyInRoutine = id ? isInRoutine(id) : false

  // Tap sur « Ajouter à ma routine » : ajout direct (liste unifiée, aucun choix
  // de bloc). Parité avec le web.
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
    // Garde feature flag (Paramètres admin) : partage public désactivé.
    if (!appConfig.flag_public_share) return
    const url = `${SHARE_BASE_URL}/a/${id}`
    // Rend l'analyse lisible publiquement (lecture seule) sur la page /a/[id].
    // IMPORTANT : on ATTEND l'update (sinon en fire-and-forget il ne se termine
    // pas avant l'ouverture de la feuille de partage → flag jamais persisté →
    // lien partagé en 404). RLS : le propriétaire peut flagger sa ligne.
    try {
      await db().from('analyses').update({ shared: true }).eq('id', id)
    } catch {
      /* best-effort : on partage quand même */
    }
    try {
      await Share.share({
        message: `${state.title} — analyse CosmeCheck\n${url}`,
        url,
      })
    } catch {
      /* user cancelled */
    }
  }, [state, id, appConfig.flag_public_share])

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
          {/* En-tête produit : image + titre (image à gauche, titre à droite),
              puis catégorie/marque, CTAs, partage + jauge */}
          <View style={styles.header}>
            <WhiteCard padding={spacing.md}>
              <View style={styles.headerCardInner}>
            <View style={styles.titleRow}>
              <View style={styles.titleImageSlot}>
                {productImageUrl ? (
                  <Image
                    source={{ uri: productImageUrl }}
                    style={styles.titleImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={styles.titleImagePlaceholder}>
                    <Ionicons name="image-outline" size={28} color={colors.inkLight} />
                  </View>
                )}
              </View>
              {/* Colonne droite : titre, puis marque + sous-catégorie SOUS le
                  titre (l'image à gauche remplit la hauteur de cette colonne). */}
              <View style={styles.titleTextCol}>
                <Text
                  style={styles.title}
                  numberOfLines={3}
                  onTextLayout={(e) => {
                    const n = e.nativeEvent.lines.length
                    if (n > 0 && n !== titleLines) setTitleLines(n)
                  }}
                >
                  {state.title}
                </Text>
                {(() => {
                  // Priorité à la catégorie précise (famille/sous/feuille) pour
                  // les produits analysés, sinon la feuille catalogue, sinon l'enum.
                  const preciseLeaf = state.categoryPrecise
                    ? leafLabelFromCategorySlug(state.categoryPrecise)
                    : null
                  const chipLabel = leafCategory || preciseLeaf || state.categoryText
                  if (!chipLabel && !state.brand) return null
                  const chip = chipLabel ? (
                    <View style={styles.categoryChip}>
                      <Text style={styles.categoryText} numberOfLines={1}>
                        {chipLabel}
                      </Text>
                    </View>
                  ) : null
                  const brand = state.brand ? (
                    <View style={styles.brandChip}>
                      <Text style={styles.brandChipText} numberOfLines={1}>{state.brand}</Text>
                    </View>
                  ) : null
                  // Titre sur 3 lignes → sous-catégorie + marque sur la MÊME ligne.
                  // Titre sur 1-2 lignes → empilé : marque sous le titre, sous-catégorie en bas.
                  return titleLines >= 3 ? (
                    <View style={styles.metaRow}>
                      {chip}
                      {brand}
                    </View>
                  ) : (
                    <View style={styles.metaStack}>
                      {brand}
                      {chip}
                    </View>
                  )
                })()}
              </View>
            </View>

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
                  Analyse de la promesse
                </Text>
              </Pressable>

              <Pressable
                onPress={handleAddRoutine}
                disabled={alreadyInRoutine || routinePending}
                style={({ pressed }) => [
                  styles.ctaBtn,
                  styles.ctaBtnGreen,
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
              </View>
            </WhiteCard>

            {/* Qualité de la formule — note en étoiles (remplace les pastilles).
                Partager en haut à droite, sur la ligne du titre. */}
            <WhiteCard padding={16} style={styles.qualityCard}>
              <View style={styles.qualityHeader}>
                <Text style={styles.qualityTitle}>Qualité de la formule</Text>
                {/* Partage public : masqué si le flag admin est OFF (Paramètres). */}
                {appConfig.flag_public_share && (
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
                )}
              </View>
              <Text style={styles.qualitySubtitle}>Évaluation générale de la formule</Text>
              <View style={styles.starsRow}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star3D
                    key={i}
                    gradientId={`qstar-${i}`}
                    size={STAR_SIZE}
                    palette={
                      i < STARS_BY_TONE[verdictTone]
                        ? STAR_PALETTE_BY_TONE[verdictTone]
                        : STAR_EMPTY_PALETTE
                    }
                  />
                ))}
              </View>
            </WhiteCard>
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
  // Contenu interne de la carte commune (image+titre / marque+catégorie / CTAs).
  headerCardInner: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
  },
  titleImageSlot: {
    // Taille FIXE (bornée) : image agrandie qui occupe la hauteur du bloc
    // titre + marque/sous-cat, sans dépendre du contenu (évite tout
    // débordement). Plus large/haute que l'ancien 76×76.
    width: 104,
    height: 118,
    flexShrink: 0,
  },
  titleImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
  },
  titleImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Colonne droite : titre + (sous-cat / marque) empilés sous le titre.
  titleTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Méta empilée (titre court, 1-2 lignes) : marque au-dessus, sous-cat en bas.
  metaStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
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
  // Marque en petit badge DORÉ (même forme que la sous-catégorie, teinte or).
  brandChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#FBF3DF',
    borderWidth: 1,
    borderColor: 'rgba(180,138,42,0.35)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 1,
  },
  brandChipText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    color: '#8B6B21',
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
    paddingVertical: 9,
    // Rectangle arrondi (mockup) : coins arrondis mais avec un segment
    // vertical droit sur les côtés, PAS une pilule pleine (radius.full).
    borderRadius: radius.lg,
  },
  ctaBtnGreen: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaBtnRose: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaBtnDisabled: { opacity: 0.7 },
  ctaText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  // Bloc « Qualité de la formule » — note en étoiles (remplace les pastilles).
  qualityCard: {},
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  qualityTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  qualitySubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkLight,
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    flexShrink: 0,
  },
  shareText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.inkMuted,
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
