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
 *   9. Liste complète     (carte qui ouvre la page /analyse/ingredients/[id])
 *
 * Les primitives visuelles (IngredientBlob, VerdictGauge, IngredientSpectrum)
 * sont IMPORTÉES — non réimplémentées ici.
 *
 * L'en-tête produit (titre + catégorie + VerdictGauge) est rendu par l'écran
 * parent (app/analyse/[id].tsx) au-dessus du panel.
 */

import { useCallback, useMemo, useRef, useState, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, type Href } from 'expo-router'

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
import { groupRestrictionMatches } from '@/lib/restrictions/group'
import { putIngredientList } from '@/lib/analysis/ingredientListHandoff'
import { ROUTES } from '@/constants/routes'

import { BigScoreCard } from './BigScoreCard'
import { EssentielToggleButton } from './EssentielView'
import { IngredientSpectrum } from './IngredientSpectrum'
import { ObservationsCard } from './ObservationsCard'
import { PenaltySummaryStrip } from './PenaltySummaryStrip'
import { RestrictionsSheet } from './RestrictionsSheet'
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
  /** Type de produit détecté par l'analyseur (ex. « Nettoyant visage ») — signal
   *  fonctionnel robuste pour cibler les alternatives de la bonne catégorie. */
  productType?: string | null
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
  productType,
}) => {
  const router = useRouter()
  const { restrictions, profile, updateProfile } = useProfile()
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)
  const reviewCheckedRef = useRef(false)
  const [restrictionsSheetOpen, setRestrictionsSheetOpen] = useState(false)


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
  //
  // `sourceIngredients` : noms INCI de l'analyse triés par position, pour ne
  // proposer que des formules comparables (crème eau-première pour une crème
  // eau-première, jamais une huile ni un savon solide à la place d'un gel).
  const altSourceIngredients = useMemo(
    () =>
      [...result.items]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((it) => it.name || it.input)
        .filter((s): s is string => typeof s === 'string' && s.length > 0),
    [result.items],
  )
  const alternatives = useAlternatives({
    ean: productEan,
    brand,
    productName,
    productType,
    category,
    // Graine = ID de l'analyse → alternatives mélangées DANS chaque tier de
    // pastille, différentes à chaque analyse mais stables pour celle-ci.
    seed: analysisId ?? null,
    sourceIngredients: altSourceIngredients,
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

  // Une ligne par restriction présente (famille + ses ingrédients, ou ingrédient
  // restreint) pour la feuille « N de tes restrictions ».
  const restrictionGroups = useMemo(
    () => groupRestrictionMatches(restrictionMatches, result.items),
    [restrictionMatches, result.items],
  )

  // Compte = familles uniques + ingrédients restreints uniques présents.
  // Même formule que le web → "Contient N de tes restrictions" identique.
  const restrictedCount = restrictionGroups.length

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

  // Page « Liste des ingrédients » (une page de la pile, pas une modale) :
  // toucher un ingrédient pousse sa fiche, « retour » revient au tableau.
  // Le résultat est déposé dans le relais mémoire pour un affichage immédiat.
  const openIngredientList = (focusPosition?: number) => {
    if (!analysisId) return
    putIngredientList(analysisId, result)
    router.push(ROUTES.ANALYSE.INGREDIENTS(analysisId, focusPosition) as Href)
  }

  const counts = result.counts

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
        onShowRestrictedFamilies={() => setRestrictionsSheetOpen(true)}
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
            // 4. Le verdict en chiffres, empilé à droite du demi-donut (28/09/2026).
            aside={<PenaltySummaryStrip counts={counts} layout="column" bare />}
          />

          {/* 3. (Restrictions désormais affichées dans L'ESSENTIEL en haut) */}

          {/* 5. (Synthèse supprimée — remplacée par les blocs IA en haut) */}

          {/* 6. Spectre positionnel */}
          {result.spectrum ? (
            <IngredientSpectrum
              spectrum={result.spectrum}
              items={result.items}
              onPositionClick={(position) => openIngredientList(position)}
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

          {/* 9. Liste complète — carte qui ouvre la page dédiée */}
          <Pressable
            onPress={() => openIngredientList()}
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

      {/* Feuille : restrictions présentes dans le produit (familles + ingrédients) */}
      {restrictionGroups.length > 0 ? (
        <RestrictionsSheet
          visible={restrictionsSheetOpen}
          onClose={() => setRestrictionsSheetOpen(false)}
          groups={restrictionGroups}
          onIngredientPress={onIngredientPress}
          onManage={onViewRestrictionsPress}
        />
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
  listTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
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
})
