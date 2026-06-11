/**
 * AnalysisResultPanel — orchestrateur du résultat d'analyse INCI, port mobile
 * du web AnalyseResultPanel.tsx (CosmetWiki).
 *
 * Ordre des sections (miroir mobile du web) :
 *   1. EssentielView      (3 cartes déterministes — engine.computeEssentiel)
 *   2. BigScore           (IngredientBlob + score/20 + ColorBadge)
 *   3. RestrictionWarning (si des items sont restreints)
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
import type { AnalyseItemWithRestriction } from '@/lib/analysis/analyser'

import { BigScoreCard } from './BigScoreCard'
import { EssentielView, EssentielToggleButton } from './EssentielView'
import { IngredientSpectrum } from './IngredientSpectrum'
import { ObservationsCard } from './ObservationsCard'
import { PenaltySummaryStrip } from './PenaltySummaryStrip'
import { ProductRow } from './ProductRow'
import { RestrictionWarning, RestrictionsOkBadge } from './RestrictionWarning'
import { SynthesisCard } from './SynthesisCard'
import { supabase } from '@/lib/supabase/client'
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
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [filter, setFilter] = useState<TabKey>('all')
  const [listModalOpen, setListModalOpen] = useState(false)
  const modalScrollRef = useRef<ScrollView>(null)

  // ── Synthèse lazy ─────────────────────────────────────────────────────
  // result.synthesis peut être déjà présent (analyses récentes / générées
  // précédemment) → on l'utilise. Sinon, on la génère à la demande au moment
  // où l'utilisateur déplie "Voir l'analyse complète".
  const [lazySynthesis, setLazySynthesis] = useState<string | null>(null)
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const synthesisFetchedRef = useRef(false)

  // Synthèse effective : celle stockée dans result_json, ou celle qu'on vient
  // de générer dynamiquement. Sinon null → SynthesisCard montre l'état "indisponible".
  const effectiveSynthesis = result.synthesis ?? lazySynthesis

  // Déclenche la génération à la première ouverture du détail, si on n'a pas
  // déjà la synthèse en row ET qu'on a un analysisId.
  useEffect(() => {
    if (!detailsExpanded) return
    if (effectiveSynthesis) return
    if (synthesisFetchedRef.current) return
    if (!analysisId) return
    synthesisFetchedRef.current = true
    setSynthesisLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('synthesis', {
          body: { analysisId },
        })
        if (error) return
        const res = data as { synthesis?: string | null } | null
        if (res?.synthesis) {
          setLazySynthesis(res.synthesis)
        }
      } catch {
        // Best-effort : erreur silencieuse, l'UI continue d'afficher
        // "Synthèse indisponible" avec le bouton de retry.
      } finally {
        setSynthesisLoading(false)
      }
    })()
  }, [detailsExpanded, analysisId, effectiveSynthesis])

  /** Bouton "Réessayer" dans SynthesisCard quand l'auto-trigger a échoué. */
  const handleRequestSynthesis = useCallback(() => {
    if (!analysisId || synthesisLoading) return
    synthesisFetchedRef.current = false
    // Re-déclencher : on remet le flag à false → l'effet re-tirera l'appel
    // au prochain render (puisque effectiveSynthesis est toujours null).
    setSynthesisLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('synthesis', {
          body: { analysisId },
        })
        if (error) return
        const res = data as { synthesis?: string | null } | null
        if (res?.synthesis) setLazySynthesis(res.synthesis)
      } catch {
        /* silent */
      } finally {
        setSynthesisLoading(false)
      }
    })()
  }, [analysisId, synthesisLoading])

  // Couleur tonale du score (seuils web : tone du serveur prioritaire, sinon
  // dérivé du score).
  const rating: ColorRating = result.scoreTone
    ? toneToColorRating(result.scoreTone)
    : getColorRatingFromScore(result.score)

  // Items restreints (flag `is_restricted` posé par applyRestrictions côté
  // analyser ; pour une analyse rechargée depuis la DB le flag peut être absent).
  const restrictedItems = useMemo(
    () => (result.items as AnalyseItemWithRestriction[]).filter((it) => it.is_restricted),
    [result.items],
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

  return (
    <View style={styles.root}>
      {/* 1. Essentiel — 3 cartes (toggle rendu séparément en dessous) */}
      <EssentielView
        data={essentiel}
        expanded={detailsExpanded}
        onToggle={() => setDetailsExpanded((v) => !v)}
        hideToggle
      />

      <View style={styles.toggleWrap}>
        <EssentielToggleButton
          expanded={detailsExpanded}
          onToggle={() => setDetailsExpanded((v) => !v)}
        />
      </View>

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
            imageUrl={productImageUrl}
            reduceMotion={reduceMotion}
          />

          {/* 3. Restrictions — bandeau rose si un ingrédient matche tes
              restrictions, sinon pilule verte « tout va bien » qui renvoie
              quand même à la page Gérer. */}
          {restrictedItems.length > 0 ? (
            <RestrictionWarning
              restrictedIngredients={restrictedItems}
              onIngredientPress={onIngredientPress}
              onViewRestrictionsPress={onViewRestrictionsPress}
            />
          ) : (
            <RestrictionsOkBadge onPress={onViewRestrictionsPress} />
          )}

          {/* 4. Le verdict en chiffres */}
          <PenaltySummaryStrip counts={counts} />

          {/* 5. Synthèse — générée lazy au déploiement du détail */}
          <SynthesisCard
            synthesis={effectiveSynthesis}
            items={result.items}
            loading={synthesisLoading}
            onRequestSynthesis={handleRequestSynthesis}
            onIngredientPress={onIngredientPress}
          />

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
        </View>
      ) : null}

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
                    isRestricted={(item as AnalyseItemWithRestriction).is_restricted}
                  />
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
})
