/**
 * RoutineSectionList — orchestre les deux sections MATIN / SOIR de la routine.
 *
 * - Dérive les lignes de chaque section depuis useRoutine().items (un produit
 *   'both' apparaît dans les DEUX sections).
 * - Drag intra-section : recalcule les positions via normalizeSectionOrder puis
 *   persiste (optimiste) via reorderItems.
 * - reorganize() (exposée au parent) : moteur déterministe organizeRoutine +
 *   computePositions -> reorderItems. L'animation (LinearTransition +
 *   Fade entre sections) est portée par RoutineSection : le patch optimiste du
 *   cache suffit à déclencher le mouvement.
 *
 * Aucune note produit chiffrée affichée (règle éditoriale).
 */

import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react'
import { View } from 'react-native'

import { parseAnalyseResponse, type AnalyseResponse } from '@/lib/analysis/types'
import { decodeHtml } from '@/lib/decodeHtml'
import {
  organizeRoutine,
  computePositions,
  normalizeSectionOrder,
  type OrganizeInput,
  type RoutinePositionRow,
} from '@/lib/routine/organize'
import type { RoutineItem, RoutineReorderUpdate } from '@/hooks/useRoutine'
import type { BlobCounts } from '@/components/design/IngredientBlob'
import {
  RoutineSection,
  type RoutineSectionKey,
  type RoutineSectionRow,
} from '@/components/routine/RoutineSection'

function titleFor(item: RoutineItem): string {
  return (
    decodeHtml(item.analysis?.product_label?.trim() || item.analysis?.name?.trim()) || 'Produit'
  )
}

function countsOf(item: RoutineItem): BlobCounts | null {
  const parsed = item.analysis?.result_json
    ? (parseAnalyseResponse(item.analysis.result_json) as AnalyseResponse | null)
    : null
  const c = parsed?.counts
  return c ? { vert: c.vert, jaune: c.jaune, orange: c.orange, rouge: c.rouge } : null
}

function toSectionRow(item: RoutineItem): RoutineSectionRow {
  const fallback =
    item.analysis?.result_json && typeof item.analysis.result_json === 'object'
      ? ((item.analysis.result_json as { imageUrl?: string }).imageUrl ?? null)
      : null
  return {
    itemId: item.id,
    analysisId: item.analysis_id,
    name: titleFor(item),
    brand: item.analysis?.brand ?? null,
    ean: item.analysis?.ean ?? null,
    fallbackImageUrl: fallback,
    counts: countsOf(item),
    frequency: item.frequency,
    timeOfDay: item.time_of_day,
  }
}

/** Placement matin/soir renvoyé par l'IA (ou une autre source). */
export interface OrganizePlacementInput {
  itemId: string
  timeOfDay: 'morning' | 'evening'
}

export interface RoutineSectionListHandle {
  /** Applique le moteur déterministe local et persiste. Retourne le nb déplacés. */
  reorganize: () => number
  /**
   * Applique des placements matin/soir venus de l'IA (positions recalculées,
   * animation via patch optimiste). Retourne le nb de produits ayant changé de
   * section.
   */
  applyPlacements: (placements: OrganizePlacementInput[]) => number
}

interface Props {
  items: RoutineItem[]
  /** Tap sur une carte -> sous-page de l'item (id = routine_items.id). */
  onPressItem: (itemId: string) => void
  reorderItems: (updates: RoutineReorderUpdate[]) => Promise<void>
  onDragStateChange: (dragging: boolean) => void
}

export const RoutineSectionList = forwardRef<RoutineSectionListHandle, Props>(
  function RoutineSectionList(
    {
      items,
      onPressItem,
      reorderItems,
      onDragStateChange,
    },
    ref,
  ) {
    // Items exploitables (analyse jointe présente), triés par position (l'ordre
    // du cache est déjà position ASC, on garde cette source de vérité).
    const usable = useMemo(() => items.filter((it) => it.analysis), [items])

    const morningRows = useMemo(
      () => usable.filter((it) => it.time_of_day !== 'evening').map(toSectionRow),
      [usable],
    )
    const eveningRows = useMemo(
      () => usable.filter((it) => it.time_of_day !== 'morning').map(toSectionRow),
      [usable],
    )

    const positionRows = useMemo<RoutinePositionRow[]>(
      () =>
        usable.map((it) => ({
          itemId: it.id,
          timeOfDay: it.time_of_day,
          position: it.position,
        })),
      [usable],
    )

    const handleReorderSection = useCallback(
      (sectionKey: RoutineSectionKey, orderedItemIds: string[]) => {
        const updates = normalizeSectionOrder(positionRows, sectionKey, orderedItemIds)
        if (updates.length === 0) return
        void reorderItems(updates.map((u) => ({ id: u.id, position: u.position })))
      },
      [positionRows, reorderItems],
    )

    useImperativeHandle(
      ref,
      () => ({
        reorganize: () => {
          const inputs: OrganizeInput[] = usable.map((it) => {
            const parsed = it.analysis?.result_json
              ? (parseAnalyseResponse(it.analysis.result_json) as AnalyseResponse | null)
              : null
            const inciItems = Array.isArray(parsed?.items) ? parsed!.items : []
            return {
              itemId: it.id,
              currentTimeOfDay: it.time_of_day,
              currentPosition: it.position,
              name: titleFor(it),
              category: it.analysis?.category ?? null,
              categoryPrecise: it.analysis?.category_precise ?? null,
              items: inciItems.map((x) => ({
                slug: x.slug,
                tags: x.tags,
                name: x.name,
                input: x.input,
                position: x.position,
              })),
            }
          })

          const placements = organizeRoutine(inputs)
          const positioned = computePositions(placements, inputs)
          const byPlacement = new Map(placements.map((p) => [p.itemId, p]))
          const current = new Map(usable.map((it) => [it.id, it]))

          const updates: RoutineReorderUpdate[] = []
          let moved = 0
          for (const p of positioned) {
            const cur = current.get(p.itemId)
            if (!cur) continue
            const sectionChanged = byPlacement.get(p.itemId)?.changed === true
            const positionChanged = cur.position !== p.position
            if (sectionChanged || positionChanged) {
              updates.push({
                id: p.itemId,
                time_of_day: p.timeOfDay,
                position: p.position,
              })
            }
            if (sectionChanged) moved += 1
          }

          if (updates.length > 0) void reorderItems(updates)
          return moved
        },

        applyPlacements: (placements: OrganizePlacementInput[]) => {
          const byId = new Map(usable.map((it) => [it.id, it]))
          const wanted = new Map<string, 'morning' | 'evening'>()
          for (const p of placements) {
            if (byId.has(p.itemId)) wanted.set(p.itemId, p.timeOfDay)
          }
          if (wanted.size === 0) return 0

          // Nouvelle section de chaque item (défaut = section actuelle si l'IA
          // ne s'est pas prononcée). Un 'both' existant devient la section IA.
          const nextTod = (it: RoutineItem): 'morning' | 'evening' => {
            const w = wanted.get(it.id)
            if (w) return w
            return it.time_of_day === 'evening' ? 'evening' : 'morning'
          }

          // Positions : bloc matin puis bloc soir, chacun dans l'ordre courant
          // (stabilité visuelle), position globale séquentielle.
          const ordered = [...usable].sort((a, b) => a.position - b.position)
          const morning = ordered.filter((it) => nextTod(it) === 'morning')
          const evening = ordered.filter((it) => nextTod(it) === 'evening')

          const updates: RoutineReorderUpdate[] = []
          let moved = 0
          ;[...morning, ...evening].forEach((it, index) => {
            const tod = nextTod(it)
            const sectionChanged = it.time_of_day !== tod
            if (sectionChanged || it.position !== index) {
              updates.push({ id: it.id, time_of_day: tod, position: index })
            }
            if (sectionChanged) moved += 1
          })

          if (updates.length > 0) void reorderItems(updates)
          return moved
        },
      }),
      [usable, reorderItems],
    )

    return (
      <View>
        <RoutineSection
          sectionKey="morning"
          rows={morningRows}
          onPressItem={onPressItem}
          onReorder={handleReorderSection}
          onDragStateChange={onDragStateChange}
        />
        <RoutineSection
          sectionKey="evening"
          rows={eveningRows}
          onPressItem={onPressItem}
          onReorder={handleReorderSection}
          onDragStateChange={onDragStateChange}
        />
      </View>
    )
  },
)
