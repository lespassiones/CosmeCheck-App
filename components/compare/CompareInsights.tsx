/**
 * CompareInsights — bloc narratif IA de la page Compare (deux portraits, « ce
 * qu'ils ont en commun », « comment choisir »). Port mobile de
 * CosmetWiki/components/compare/CompareInsights.tsx.
 *
 * Appelle l'Edge Function `compare-insights` via supabase.functions.invoke.
 * DÉGRADE EN DOUCEUR : tant que la fonction n'est pas déployée / renvoie une
 * erreur, on affiche un skeleton court puis on masque tout le bloc (le reste
 * de la page reste utile). Jamais de crash.
 *
 * Les noms de produits (courts) sont surlignés en bleu (A) / fuchsia (B) dans
 * la copie générée, comme sur le web.
 */

import { Fragment, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { ActivityIndicator, DeviceEventEmitter, StyleSheet, Text, View } from 'react-native'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'
import { CREDITS_EXHAUSTED_EVENT } from '@/lib/credits/exhaustedStore'
import {
  compareInsightsKey,
  readAiCache,
  writeAiCache,
  TTL_COMPARE_INSIGHTS_MS,
} from '@/lib/storage/aiCache'

type Insights = {
  portraitA: string
  portraitB: string
  common: string
  howToChoose: string
  /** Produit conseillé (badge vert). Absent des caches < v8 → fallback score. */
  winner?: 'A' | 'B'
}

/** Statut remonté au parent : pilote le badge (winner) + l'affichage du bouton
 *  « Voir l'analyse complète » et des blocs déterministes. */
export type CompareInsightsStatus = 'loading' | 'ready' | 'error'

const TONE_A = { bg: 'rgba(219,234,254,0.8)', text: '#1E40AF' } // bleu
const TONE_B = { bg: 'rgba(250,232,255,0.8)', text: '#86198F' } // fuchsia

interface Props {
  aId: string
  bId: string
  nameA: string
  nameB: string
  shortNameA: string
  shortNameB: string
  /** Quand false, seul « Comment choisir ? » est affiché (portraits + commun
   *  masqués, révélés par le bouton « Voir l'analyse complète » du parent). */
  showFull?: boolean
  /** Remonte statut + produit conseillé au parent (badge + bouton). */
  onResult?: (r: { status: CompareInsightsStatus; winner?: 'A' | 'B' }) => void
}

export const CompareInsights: FC<Props> = ({
  aId,
  bId,
  nameA,
  nameB,
  shortNameA,
  shortNameB,
  showFull = false,
  onResult,
}) => {
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  // Remonte le statut au parent (badge winner + visibilité bouton/blocs).
  useEffect(() => {
    const status: CompareInsightsStatus = error ? 'error' : data ? 'ready' : 'loading'
    onResult?.({ status, winner: data?.winner })
    // onResult est stable (setState du parent) ; on ne le met pas en dépendance
    // pour éviter une boucle si l'appelant recrée la fonction à chaque render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error])

  useEffect(() => {
    mounted.current = true
    setData(null)
    setError(false)
    const cacheKey = compareInsightsKey(aId, bId)
    void (async () => {
      try {
        // 1. Cache local (couple A→B, 30j).
        const cached = await readAiCache<Insights>(
          'compare-insights',
          cacheKey,
          TTL_COMPARE_INSIGHTS_MS,
        )
        if (cached && typeof cached.portraitA === 'string') {
          if (mounted.current) setData(cached)
          return
        }

        // 2. Miss → invoke.
        const { data: res, error: invokeError, response } = await supabase.functions.invoke<Insights>(
          'compare-insights',
          { body: { aId, bId } },
        )
        if (!mounted.current) return
        if (invokeError || !res || typeof res.portraitA !== 'string') {
          // 429 « crédits épuisés » → ouvre la modale globale (→ /offre).
          const httpRes: Response | undefined =
            response ?? ((invokeError as { context?: Response })?.context as Response | undefined)
          if (httpRes?.status === 429) {
            let used: number | undefined
            let limit: number | undefined
            try {
              const b = (await httpRes.json()) as { credits?: { used?: number; limit?: number } }
              used = b?.credits?.used
              limit = b?.credits?.limit
            } catch {
              /* corps illisible */
            }
            DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, { used, limit })
          }
          setError(true)
          return
        }
        setData(res)
        void writeAiCache('compare-insights', cacheKey, res)
      } catch {
        if (mounted.current) setError(true)
      }
    })()
    return () => {
      mounted.current = false
    }
  }, [aId, bId])

  // Post-traitement défensif : réécrit « produit A » résiduel, et remplace le
  // nom long par le nom court pour que les surlignages tombent juste.
  const cleaned = useMemo<Insights | null>(() => {
    if (!data) return null
    const fix = (s: string) => {
      let t = rewriteAB(s, shortNameA, shortNameB)
      if (nameA && nameA !== shortNameA) t = t.split(nameA).join(shortNameA)
      if (nameB && nameB !== shortNameB) t = t.split(nameB).join(shortNameB)
      return t
    }
    return {
      portraitA: fix(data.portraitA),
      portraitB: fix(data.portraitB),
      common: fix(data.common),
      howToChoose: fix(data.howToChoose),
    }
  }, [data, nameA, nameB, shortNameA, shortNameB])

  // Soft-fail : fonction indisponible → on masque le bloc.
  if (error) return null

  if (!cleaned) {
    return (
      <View style={styles.skeleton}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.skeletonText}>Comparaison narrative…</Text>
      </View>
    )
  }

  return (
    <View>
      {/* Comment choisir — le verdict d'abord, toujours visible. */}
      <GlassCard style={styles.block} padding={spacing.lg} opacity={0.8}>
        <Text style={[styles.blockLabel, { color: '#0369A1' }]}>COMMENT CHOISIR ?</Text>
        <Text style={styles.body}>
          {renderWithHighlights(cleaned.howToChoose, shortNameA, shortNameB)}
        </Text>
      </GlassCard>

      {/* Détail (portraits + points communs) — révélé via « Voir l'analyse
          complète » du parent. */}
      {showFull && (
        <>
          <Text style={styles.sectionTitle}>Portrait des deux produits</Text>
          <View style={styles.portraitGrid}>
            <Portrait shortName={shortNameA} text={cleaned.portraitA} tone="A" otherShortName={shortNameB} />
            <Portrait shortName={shortNameB} text={cleaned.portraitB} tone="B" otherShortName={shortNameA} />
          </View>

          <GlassCard style={styles.block} padding={spacing.lg}>
            <Text style={styles.blockLabel}>CE QU'ILS ONT EN COMMUN</Text>
            <Text style={styles.body}>{renderWithHighlights(cleaned.common, shortNameA, shortNameB)}</Text>
          </GlassCard>
        </>
      )}
    </View>
  )
}

const Portrait: FC<{
  shortName: string
  text: string
  tone: 'A' | 'B'
  otherShortName: string
}> = ({ shortName, text, tone, otherShortName }) => (
  <GlassCard style={styles.portraitCard} padding={spacing.lg}>
    <Text
      style={[styles.portraitTitle, { color: tone === 'A' ? TONE_A.text : TONE_B.text }]}
      numberOfLines={1}
    >
      {shortName}
    </Text>
    <Text style={styles.portraitBody}>
      {renderWithHighlights(text, shortName, otherShortName, tone)}
    </Text>
  </GlassCard>
)

// ─── Rendu : **bold** + surlignage des noms produits ─────────────────────────

function renderWithHighlights(
  text: string,
  shortNameA: string,
  shortNameB: string,
  forceTone?: 'A' | 'B',
): ReactNode {
  if (!text) return null
  const boldChunks = text.split(/(\*\*[^*]+\*\*)/g)
  return boldChunks.map((chunk, i) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <Text key={i} style={styles.bold}>
          {chunk.slice(2, -2)}
        </Text>
      )
    }
    return <Fragment key={i}>{highlightNames(chunk, shortNameA, shortNameB, forceTone)}</Fragment>
  })
}

function highlightNames(
  chunk: string,
  shortNameA: string,
  shortNameB: string,
  forceTone?: 'A' | 'B',
): ReactNode {
  type Range = { start: number; end: number; tone: 'A' | 'B' }
  const ranges: Range[] = []
  const targets: { name: string; tone: 'A' | 'B' }[] = []
  if (shortNameA) targets.push({ name: shortNameA, tone: 'A' })
  if (shortNameB) targets.push({ name: shortNameB, tone: 'B' })
  targets.sort((x, y) => y.name.length - x.name.length)

  for (const { name, tone } of targets) {
    if (!name) continue
    const lcChunk = chunk.toLowerCase()
    const lcName = name.toLowerCase()
    let from = 0
    while (true) {
      const idx = lcChunk.indexOf(lcName, from)
      if (idx === -1) break
      const collides = ranges.some((r) => !(idx + lcName.length <= r.start || idx >= r.end))
      if (!collides) ranges.push({ start: idx, end: idx + lcName.length, tone })
      from = idx + lcName.length
    }
  }

  if (ranges.length === 0) return chunk
  ranges.sort((x, y) => x.start - y.start)

  const out: ReactNode[] = []
  let cursor = 0
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push(chunk.slice(cursor, r.start))
    const useTone = i === 0 && forceTone ? forceTone : r.tone
    const tone = useTone === 'A' ? TONE_A : TONE_B
    out.push(
      <Text key={`${r.start}-${i}`} style={{ backgroundColor: tone.bg, color: tone.text, fontFamily: fontFamilies.semiBold }}>
        {chunk.slice(r.start, r.end)}
      </Text>,
    )
    cursor = r.end
  })
  if (cursor < chunk.length) out.push(chunk.slice(cursor))
  return out
}

// ─── Réécriture défensive A/B ────────────────────────────────────────────────

function rewriteAB(text: string, nameA: string, nameB: string): string {
  if (!text) return text
  let out = text
  out = out.replace(/\b(?:le |la )?produit\s+a\b/gi, nameA)
  out = out.replace(/\b(?:le |la )?produit\s+b\b/gi, nameB)
  out = out.replace(/["«]\s*A\s*["»]/g, nameA)
  out = out.replace(/["«]\s*B\s*["»]/g, nameB)
  const verbTail =
    "(?=\\s+(?:pourrait|peut|est|convient|correspond|conviendra|s'adresse|reste|sera|propose|offre|conviendrait|cible|vise))"
  out = out.replace(new RegExp(`\\bA\\b${verbTail}`, 'g'), nameA)
  out = out.replace(new RegExp(`\\bB\\b${verbTail}`, 'g'), nameB)
  return out
}

const styles = StyleSheet.create({
  skeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginBottom: spacing.base,
  },
  skeletonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.inkMuted,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  portraitGrid: {
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  portraitCard: {},
  portraitTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  portraitBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink,
  },
  block: {
    marginBottom: spacing.base,
  },
  blockLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
  bold: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
})
