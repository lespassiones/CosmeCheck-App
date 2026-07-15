/**
 * AnalysisResultPanel — orchestrateur du résultat d'analyse INCI, port mobile
 * du web AnalyseResultPanel.tsx (CosmetWiki).
 *
 * Ordre des sections (miroir mobile du web) :
 *   1. EssentielView      (3 cartes déterministes — engine.computeEssentiel ;
 *                          la ligne « restrictions » vit dans la carte L'ESSENTIEL)
 *   2. BigScore           (IngredientBlob + ratio reconnu)
 *   4. PenaltyStrip       (le verdict en chiffres)
 *   5. IngredientSpectrum (tap d'un carré → scroll jusqu'à l'ingrédient)
 *   6. Observations       (tags présents / absents, dépliables)
 *   7. Allergènes UE      (chips rouges, ou état « aucun »)
 *   8. Synthèse           (result_json.synthesis ; stub gracieux si null)
 *   9. Liste complète     (ProductRow par ingrédient, filtres couleur)
 *
 * Les primitives visuelles (IngredientBlob, VerdictGauge, IngredientSpectrum)
 * sont IMPORTÉES — non réimplémentées ici.
 *
 * L'en-tête produit (titre + catégorie + VerdictGauge) est rendu par l'écran
 * parent (app/analyse/[id].tsx) au-dessus du panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import { getEuFragranceAllergen } from '@/lib/euAllergens'
import {
  getColorRatingFromScore,
  normalizeColor,
  toneToColorRating,
  type AnalyseItem,
  type AnalyseResponse,
  type ColorRating,
} from '@/lib/analysis/types'
import { checkRestrictions } from '@/lib/restrictions/check'

import { BigScoreCard } from './BigScoreCard'
import { EssentielToggleButton } from './EssentielView'
import { IngredientSpectrum } from './IngredientSpectrum'
import { ObservationsCard } from './ObservationsCard'
import { PenaltySummaryStrip } from './PenaltySummaryStrip'
import { ProductRow } from './ProductRow'
import { type PersonalBlocks } from './PersonalInsightsCards'
import { CompatibilityCard, type Compatibility } from './CompatibilityCard'
import { ReviewPromptCard } from '@/components/review/ReviewPromptCard'
import { loadReviewState, saveReviewState } from '@/lib/review/storage'
import { markDone, markShown, shouldAskReview } from '@/lib/review/prompt'
import { NotifPromptCard } from '@/components/notifications/NotifPromptCard'
import {
  markNotifPromptGranted,
  markNotifPromptSkipped,
  shouldReaskNotifications,
} from '@/lib/notifications/optInPrompt'
import { loadNotifPromptState, readScanCount, saveNotifPromptState } from '@/lib/notifications/optInStorage'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import { requestPermission } from '@/lib/notifications/scheduler'
import { registerPushToken } from '@/lib/notifications/pushToken'
import { AlternativesCarousel } from './AlternativesCarousel'
import { ProductToolsSection } from './ProductToolsSection'
import { supabase } from '@/lib/supabase/client'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import { useAlternatives } from '@/hooks/useAlternatives'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'
import { useProfile } from '@/hooks/useProfile'
import { useIngredientFamilies } from '@/hooks/useIngredientFamilies'
import type { EssentielData } from '@/lib/essentiel/engine'

interface Props {
  /** ID de l'analyse Supabase — nécessaire pour générer la synthèse lazy. */
  analysisId?: string
  result: AnalyseResponse
  essentiel: EssentielData
  /** Navigue vers la fiche ingrédient (/ingredient/[slug]). */
  onIngredientPress: (slug: string) => void
  /** Navigue vers /profile/restrictions. */
  onViewRestrictionsPress: () => void
  /** Le parent fournit un scroll vers une coordonnée Y (dans le panel) — utilisé
   *  par le spectre pour amener l'ingrédient ciblé à l'écran. */
  onRequestScrollTo?: (y: number) => void
  reduceMotion?: boolean
  /** URL de l'image produit (catalogue / OBF / web). Passée à BigScoreCard. */
  productImageUrl?: string | null
  /** Marque + nom du produit — servent à résoudre les alternatives (catalogue). */
  brand?: string | null
  productName?: string | null
  /** Score global (notation propriétaire CosmeCheck) - pour que la pastille L'ESSENTIEL soit
   *  identique à la jauge du verdict. */
  verdictScore?: number | null
  /** Nombre d'ingrédients pénalisants (orange + rouge) — affiché dans la phrase. */
  penalizingCount?: number
  /** EAN catalogue du produit (pour la section Outils : signalement / photo). */
  productEan?: string | null
  /** Slug de catégorie catalogue (pour rattacher une photo soumise). */
  category?: string | null
}

type TabKey = 'all' | ColorRating | 'unknown'

const TAB_LABELS: Record<TabKey, string> = {
  all: 'Tous',
  vert: 'Vert',
  jaune: 'Jaune',
  orange: 'Orange',
  rouge: 'Rouge',
  unknown: 'Non reconnu',
}

export const AnalysisResultPanel: FC<Props> = ({
  analysisId,
  result,
  essentiel,
  onIngredientPress,
  onViewRestrictionsPress,
  onRequestScrollTo,
  reduceMotion,
  productImageUrl,
  brand,
  productName,
  verdictScore,
  penalizingCount,
  productEan,
  category,
}) => {
  const router = useRouter()
  const { restrictions, profile, updateProfile } = useProfile()
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [filter, setFilter] = useState<TabKey>('all')
  const [showReview, setShowReview] = useState(false)
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)
  const reviewCheckedRef = useRef(false)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [familiesModalOpen, setFamiliesModalOpen] = useState(false)
  const modalScrollRef = useRef<ScrollView>(null)

  // ── Cartes de sollicitation au pic d'engagement ────────────────────────────
  // Déclenchées quand les 3 blocs IA viennent d'apparaître (scan réussi).
  // ARBITRAGE : jamais deux cartes en même temps. La re-demande notifications
  // (2e scan, onboarding passé) est prioritaire sur l'avis store : la permission
  // vaut plus tôt, et l'avis se re-propose de lui-même à J+1.
  const handleBlocksReady = useCallback(() => {
    if (reviewCheckedRef.current) return
    reviewCheckedRef.current = true
    void (async () => {
      // 1. Re-demande notifications (dernière sollicitation, consommée à l'affichage).
      const prefs = readNotificationPrefs(
        (profile?.preferences as Record<string, unknown> | null | undefined)
          ?.notifications as Record<string, unknown> | null | undefined,
      )
      const notifState = await loadNotifPromptState()
      const scans = await readScanCount()
      if (shouldReaskNotifications(notifState, scans, prefs.enabled)) {
        await saveNotifPromptState(markNotifPromptSkipped(notifState))
        setShowNotifPrompt(true)
        return
      }
      // 2. Sinon : avis store (fréquence gérée par lib/review/prompt.ts).
      const now = Date.now()
      const st = await loadReviewState()
      if (!shouldAskReview(st, now)) return
      await saveReviewState(markShown(st, now))
      setShowReview(true)
    })()
  }, [profile?.preferences])

  const handleNotifAccept = useCallback(() => {
    setShowNotifPrompt(false)
    void (async () => {
      try {
        const granted = await requestPermission()
        const prefs = readNotificationPrefs(
          (profile?.preferences as Record<string, unknown> | null | undefined)
            ?.notifications as Record<string, unknown> | null | undefined,
        )
        await updateProfile({ notifications: { ...prefs, enabled: true, promptSeen: true } })
        if (granted) await registerPushToken()
        await saveNotifPromptState(markNotifPromptGranted(await loadNotifPromptState()))
      } catch {
        // best-effort
      }
    })()
  }, [profile?.preferences, updateProfile])

  const handleNotifDismiss = useCallback(() => {
    // La sollicitation a déjà été consommée à l'affichage : on ferme simplement.
    setShowNotifPrompt(false)
  }, [])

  const handleReviewAccept = useCallback(() => {
    setShowReview(false)
    void (async () => {
      const st = await loadReviewState()
      await saveReviewState(markDone(st))
    })()
  }, [])

  const handleReviewDismiss = useCallback(() => {
    setShowReview(false)
  }, [])

  // ── Alternatives (recommandations same-category, filtrées restrictions/profil) ──
  // On passe l'EAN stocké en priorité : la résolution par marque+nom échoue pour
  // les noms de niche (ex. « Typologie … »), ce qui laissait le carrousel vide.
  // `category` sert de repli quand le produit n'a pas d'EAN (trouvé sur internet,
  // absent du catalogue) → alternatives de la même catégorie via l'index inversé.
  const alternatives = useAlternatives({
    ean: productEan,
    brand,
    productName,
    category,
    // Graine = ID de l'analyse → alternatives mélangées DANS chaque tier de
    // pastille, différentes à chaque analyse mais stables pour celle-ci.
    seed: analysisId ?? null,
    initialCount: 10,
    step: 10,
  })
  const { analyze, isAnalyzing } = useLaunchAlternative()

  // Synthèse SUPPRIMÉE : remplacée par les 3 blocs IA personnalisés
  // (<PersonalInsightsCards/>, rendus juste sous L'ESSENTIEL). « Voir l'analyse
  // complète » ne génère plus d'IA → gratuit, déroule uniquement le détail
  // déterministe (liste d'ingrédients, observations, spectre).
  const personalBlocks =
    (result as { personalBlocks?: PersonalBlocks | null }).personalBlocks ?? null
  const personalBlocksKey =
    (result as { personalBlocksKey?: string | null }).personalBlocksKey ?? null
  const compatibility =
    (result as { compatibility?: Compatibility | null }).compatibility ?? null

  // Couleur dérivée UNIQUEMENT du score (source unique ; jamais du scoreTone
  // stocké) → la même pastille partout (analyse = reco = recherche = browse).
  const rating: ColorRating = getColorRatingFromScore(result.score)

  // Items restreints — recalculés en temps réel depuis les restrictions actuelles
  // du profil (pas le flag `is_restricted` stocké à l'analyse, qui peut être
  // périmé si l'utilisateur a modifié ses restrictions après l'analyse).
  // DÉTECTION PAR TAG (parité EXACTE avec le web + le backend analyser) : on
  // matche item.tags[] contre ingredient_families.tag_slug. Garantit que mobile
  // et web affichent les MÊMES familles réellement présentes dans le produit
  // (fini l'ancienne heuristique slice(0,N) qui montrait les mauvaises familles).
  const { data: families = [] } = useIngredientFamilies()

  const restrictionMatches = useMemo(
    () => checkRestrictions(result.items, restrictions, families),
    [result.items, restrictions, families],
  )

  // Familles RÉELLEMENT présentes dans le produit (objets IngredientFamily,
  // pour afficher le vrai nom DB, pas le slug brut).
  const restrictedFamilies = useMemo(() => {
    const familySlugsPresent = new Set(
      restrictionMatches.filter((m) => m.kind === 'family').map((m) => m.slug),
    )
    return families
      .filter((f) => familySlugsPresent.has(f.slug))
      .map((f) => f.name)
      .sort()
  }, [restrictionMatches, families])

  // Compte = familles uniques + ingrédients restreints uniques présents.
  // Même formule que le web → "Contient N de tes restrictions" identique.
  const restrictedCount = useMemo(() => {
    const fam = new Set(
      restrictionMatches.filter((m) => m.kind === 'family').map((m) => m.slug),
    )
    const ing = new Set(
      restrictionMatches.filter((m) => m.kind === 'ingredient').map((m) => m.slug),
    )
    return fam.size + ing.size
  }, [restrictionMatches])

  // Positions des items restreints (pour le badge rouge dans la liste).
  const restrictedPositions = useMemo(
    () => new Set(restrictionMatches.map((m) => m.position)),
    [restrictionMatches],
  )

  // Map nom-d'ingrédient → slug pour les liens dans les observations.
  const slugByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of result.items) {
      if (!it.slug) continue
      if (it.name) m.set(it.name.toLowerCase(), it.slug)
      if (it.input) m.set(it.input.toLowerCase(), it.slug)
    }
    return m
  }, [result.items])

  // Allergènes UE détectés (depuis euFragranceAllergens si fourni, sinon
  // re-scan local des items contre la liste des 26).
  const euAllergens = useMemo(() => {
    if (result.euFragranceAllergens?.detected?.length) {
      return result.euFragranceAllergens.detected.map((d) => ({
        label: d.label,
        note: d.note,
      }))
    }
    const found: { label: string; note?: string }[] = []
    const seen = new Set<string>()
    for (const it of result.items) {
      const a = getEuFragranceAllergen(it.name ?? it.input ?? '')
      if (a && !seen.has(a.inciName)) {
        seen.add(a.inciName)
        found.push({ label: a.label, note: a.note })
      }
    }
    return found
  }, [result.euFragranceAllergens, result.items])

  // Couleur résolue d'un ingrédient : colorRating prioritaire, fallback sur
  // dbColorRating (ingrédient trouvé en DB via un match "suggestion").
  // Cohérent avec le fallback déjà utilisé dans ProductRow pour l'affichage.
  const resolvedColor = useCallback(
    (i: AnalyseItem): ColorRating | null =>
      normalizeColor((i.colorRating ?? i.dbColorRating) as string | null),
    [],
  )

  // Compteurs dérivés des items (source de vérité unique avec resolvedColor).
  // Remplace result.counts pour les tabs et le filtre, ce qui évite
  // l'incohérence entre la couleur affichée et la catégorie comptée.
  const itemCounts = useMemo(() => {
    const c = { vert: 0, jaune: 0, orange: 0, rouge: 0, unknown: 0 }
    for (const item of result.items) {
      const rc = resolvedColor(item)
      if (!rc) c.unknown++
      else c[rc]++
    }
    return c
  }, [result.items, resolvedColor])

  // Liste filtrée pour la section « Liste des ingrédients ».
  const filteredItems = useMemo(() => {
    if (filter === 'all') return result.items
    if (filter === 'unknown') return result.items.filter((i) => resolvedColor(i) == null)
    return result.items.filter((i) => resolvedColor(i) === filter)
  }, [result.items, filter, resolvedColor])

  // ── Scroll-to-item depuis le spectre ────────────────────────────────────
  // On mémorise le Y de chaque ligne (relatif au panel) via onLayout, et la
  // position Y du conteneur de la liste, pour calculer la coordonnée absolue.
  const itemOffsets = useRef<Map<number, number>>(new Map())
  const listTop = useRef(0)

  function handleListLayout(e: LayoutChangeEvent) {
    listTop.current = e.nativeEvent.layout.y
  }

  function registerItemOffset(position: number, y: number) {
    itemOffsets.current.set(position, y)
  }

  function handleSpectrumPress(position: number) {
    // Ouvre la modale "Liste des ingrédients" et scrolle vers la ligne ciblée
    // (au prochain frame pour laisser le layout interne de la modale se faire).
    if (!detailsExpanded) setDetailsExpanded(true)
    setListModalOpen(true)
    requestAnimationFrame(() => {
      const y = itemOffsets.current.get(position)
      if (y != null) {
        modalScrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true })
      }
    })
  }

  const counts = result.counts
  const tabs: TabKey[] = ['all', 'vert', 'jaune', 'orange', 'rouge']
  if (itemCounts.unknown > 0) tabs.push('unknown')

  // Carrousel d'alternatives — rendu soit replié (sous le bouton), soit déplié
  // (tout en bas après la liste d'ingrédients). Une seule branche monte à la fois.
  const altCarousel = (
    <AlternativesCarousel
      products={alternatives.products}
      isInitialLoading={alternatives.isInitialLoading}
      isEmpty={alternatives.isEmpty}
      analyzing={isAnalyzing}
      showSeeAll={alternatives.hasMore && !!alternatives.currentEan}
      onSelect={(p) => void analyze(p)}
      onSeeAll={() => {
        if (alternatives.currentEan) {
          // Forme objet (idiome expo-router pour route dynamique) — robuste vs typegen.
          router.push({
            pathname: '/alternatives/[ean]',
            params: { ean: alternatives.currentEan },
          })
        }
      }}
    />
  )

  // Bloc « Outils » — rendu tout en bas, APRÈS les alternatives (dans les deux
  // états replié/déplié). hasImage masque l'outil photo si le produit a déjà
  // une image.
  const toolsSection = (
    <ProductToolsSection
      productEan={productEan ?? null}
      brand={brand ?? null}
      productName={productName ?? null}
      category={category ?? null}
      hasImage={!!productImageUrl}
      score={verdictScore ?? null}
      counts={itemCounts}
    />
  )

  return (
    <View style={styles.root}>
      {/* Score de compatibilité (« Pour toi ») — MÊME appel IA que les 3 blocs
          (1 crédit à la génération, gratuit en relecture). Le tap ouvre le modal
          « Ce qu'il faut retenir » (les 3 blocs). La ligne restrictions vit dans
          cette carte. Verrous : /offre si 0 crédit ; « compléter le profil »
          (deep-link section exacte) si l'axe requis n'est pas renseigné. */}
      <CompatibilityCard
        analysisId={analysisId}
        initialCompatibility={compatibility}
        initialBlocks={personalBlocks}
        initialBlocksKey={personalBlocksKey}
        restrictedCount={restrictedCount}
        onManageRestrictions={onViewRestrictionsPress}
        onShowRestrictedFamilies={() => setFamiliesModalOpen(true)}
        onReady={handleBlocksReady}
      />

      {/* Cartes de sollicitation (exclusives, cf. handleBlocksReady) : re-demande
          notifications (prioritaire) OU avis store. */}
      {showNotifPrompt ? (
        <NotifPromptCard onAccept={handleNotifAccept} onDismiss={handleNotifDismiss} />
      ) : showReview ? (
        <ReviewPromptCard onAccept={handleReviewAccept} onDismiss={handleReviewDismiss} />
      ) : null}

      <View style={styles.toggleWrap}>
        <EssentielToggleButton
          expanded={detailsExpanded}
          onToggle={() => setDetailsExpanded((v) => !v)}
        />
      </View>

      {/* Replié : alternatives juste sous le bouton (façon Yuka) */}
      {!detailsExpanded ? altCarousel : null}

      {detailsExpanded ? (
        <View style={styles.details}>
          {/* 2. BigScore */}
          <BigScoreCard
            counts={{
              vert: counts.vert,
              jaune: counts.jaune,
              orange: counts.orange,
              rouge: counts.rouge,
            }}
            matched={counts.matched}
            total={counts.total}
            score={result.score}
            scoreLabel={result.scoreLabel}
            rating={rating}
            reduceMotion={reduceMotion}
          />

          {/* 3. (Restrictions désormais affichées dans L'ESSENTIEL en haut) */}

          {/* 4. Le verdict en chiffres */}
          <PenaltySummaryStrip counts={counts} />

          {/* 5. (Synthèse supprimée — remplacée par les blocs IA en haut) */}

          {/* 6. Spectre positionnel */}
          {result.spectrum ? (
            <IngredientSpectrum
              spectrum={result.spectrum}
              items={result.items}
              onPositionClick={handleSpectrumPress}
            />
          ) : null}

          {/* 7. Observations */}
          <ObservationsCard
            observations={result.observations}
            slugByName={slugByName}
            onIngredientPress={onIngredientPress}
          />

          {/* 8. Allergènes de contact UE */}
          <EuAllergensCard allergens={euAllergens} />

          {/* 9. Liste complète — preview qui ouvre la modale dédiée */}
          <Pressable
            onPress={() => setListModalOpen(true)}
            style={({ pressed }) => pressed && styles.previewPressed}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la liste des ingrédients"
          >
            <WhiteCard padding={spacing.lg}>
              <View style={styles.previewRow}>
                <View style={styles.previewText}>
                  <Text style={styles.listTitle}>Liste des ingrédients</Text>
                  <Text style={styles.previewSubtitle}>
                    Voir les <Text style={styles.previewStrong}>{counts.total}</Text> ingrédients
                    avec couleur, fonction et fiche détaillée.
                  </Text>
                </View>
                <View style={styles.previewArrow}>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              </View>
            </WhiteCard>
          </Pressable>

          {/* 10. Déplié : alternatives tout en bas, après la liste d'ingrédients */}
          {altCarousel}
        </View>
      ) : null}

      {/* 11. Outils — tout en bas, après les alternatives (les deux états) */}
      {toolsSection}

      {/* Modale plein écran : liste complète des ingrédients */}
      <Modal
        visible={listModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setListModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Liste des ingrédients</Text>
            <Pressable
              onPress={() => setListModalOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={styles.modalClose}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.modalTabs} onLayout={handleListLayout}>
            <View style={styles.tabs}>
              {tabs.map((t) => {
                const active = t === filter
                const count = tabCount(counts, t, itemCounts)
                return (
                  <FilterChip
                    key={t}
                    label={TAB_LABELS[t]}
                    count={count}
                    active={active}
                    tone={t}
                    onPress={() => setFilter(t)}
                  />
                )
              })}
            </View>
          </View>

          <ScrollView
            ref={modalScrollRef}
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
          >
            {filteredItems.length === 0 ? (
              <Text style={styles.emptyList}>
                Aucun ingrédient ne correspond à ce filtre.
              </Text>
            ) : (
              filteredItems.map((item) => (
                <View
                  key={`${item.position}-${item.input}`}
                  onLayout={(e) => registerItemOffset(item.position, e.nativeEvent.layout.y)}
                >
                  <ProductRow
                    item={item}
                    onPress={(slug) => {
                      setListModalOpen(false)
                      onIngredientPress(slug)
                    }}
                    isRestricted={restrictedPositions.has(item.position)}
                  />
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modale : familles restreintes du produit */}
      {restrictedFamilies.length > 0 ? (
        <Modal
          visible={familiesModalOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setFamiliesModalOpen(false)}
        >
          <Pressable
            style={styles.familiesModalOverlay}
            onPress={() => setFamiliesModalOpen(false)}
            accessible={false}
          >
            <View style={styles.familiesModalContent}>
              <View style={styles.familiesModalHeader}>
                <Text style={styles.familiesModalTitle}>Familles restreintes</Text>
                <Pressable
                  onPress={() => setFamiliesModalOpen(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView style={styles.familiesListContainer}>
                <View style={styles.familiesList}>
                  {restrictedFamilies.map((family, i) => (
                    <View key={i} style={styles.familyItem}>
                      <Ionicons
                        name="shield-half"
                        size={16}
                        color={colors.rating.rouge.text}
                        style={styles.familyIcon}
                      />
                      <Text style={styles.familyName}>{family}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Pressable
                style={styles.familiesModalButton}
                onPress={() => {
                  setFamiliesModalOpen(false)
                  onViewRestrictionsPress()
                }}
                accessibilityRole="button"
                accessibilityLabel="Voir toutes mes familles"
              >
                <Text style={styles.familiesModalButtonText}>Voir toutes mes familles</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {/* Overlay pendant l'analyse d'une alternative choisie */}
      <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
    </View>
  )
}

// ── EU allergens (inline) ────────────────────────────────────────────────────

function EuAllergensCard({ allergens }: { allergens: { label: string; note?: string }[] }) {
  const has = allergens.length > 0
  return (
    <WhiteCard padding={spacing.lg}>
      <Text style={styles.listTitle}>Allergènes de contact UE</Text>
      {has ? (
        <View style={styles.allergenChips}>
          {allergens.map((a, i) => (
            <View key={i} style={styles.allergenChip}>
              <Text style={styles.allergenText} numberOfLines={1}>
                {a.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.allergenNone}>Aucun allergène de contact UE détecté.</Text>
      )}
    </WhiteCard>
  )
}

// ── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string
  count: number
  active: boolean
  tone: TabKey
  onPress: () => void
}) {
  const activeBg =
    tone === 'all' || tone === 'unknown' ? colors.ink : colors.rating[tone].DEFAULT
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: activeBg },
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
      <View style={[styles.chipCount, active && styles.chipCountActive]}>
        <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{count}</Text>
      </View>
    </Pressable>
  )
}

function tabCount(
  counts: AnalyseResponse['counts'],
  t: TabKey,
  derived: { vert: number; jaune: number; orange: number; rouge: number; unknown: number },
): number {
  switch (t) {
    case 'all':     return counts.total
    // Couleurs et "non reconnu" : source dérivée (cohérente avec resolvedColor)
    case 'vert':    return derived.vert
    case 'jaune':   return derived.jaune
    case 'orange':  return derived.orange
    case 'rouge':   return derived.rouge
    case 'unknown': return derived.unknown
  }
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.base,
  },
  toggleWrap: {
    alignItems: 'center',
  },
  details: {
    gap: spacing.base,
  },
  // Preview "Liste des ingrédients" (carte qui ouvre la modale)
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewText: { flex: 1, minWidth: 0 },
  previewSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 4,
  },
  previewStrong: { fontFamily: fontFamilies.semiBold, color: colors.ink },
  previewArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  previewPressed: { opacity: 0.85 },
  // Modale liste des ingrédients
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
  modalTabs: { padding: spacing.base },
  modalScroll: { flex: 1 },
  modalContent: { paddingBottom: spacing.xl },
  listTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gray100,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.inkMuted,
  },
  chipLabelActive: {
    color: colors.surface,
  },
  chipCount: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 9999,
    paddingHorizontal: 6,
    minWidth: 18,
    alignItems: 'center',
  },
  chipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  chipCountText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  chipCountTextActive: {
    color: colors.surface,
  },
  emptyList: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.base,
  },
  allergenChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  allergenChip: {
    backgroundColor: colors.rating.rouge.bg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  allergenText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.rating.rouge.text,
  },
  allergenNone: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.rating.vert.text,
    marginTop: spacing.sm,
  },
  familiesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  familiesModalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 340,
    paddingTop: spacing.lg,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  familiesListContainer: {
    maxHeight: 250,
    marginBottom: spacing.base,
  },
  familiesList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  familiesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  familiesModalTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  familyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  familyIcon: {
    marginRight: 4,
  },
  familyName: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  familiesModalButton: {
    backgroundColor: colors.rating.rouge.bg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  familiesModalButtonText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.rating.rouge.text,
  },
})
