/**
 * IngredientDetailScreen — fiche ingrédient INCI complète.
 *
 * Miroir mobile de CosmetWiki app/i/[slug]/page.tsx :
 *   - hero (nom joli + chip de tolérance ColorBadge + CAS)
 *   - cartes stats (tolérance, prévalence, fonctions, statut réglementaire)
 *   - bloc IA ExplainIngredient (Edge Functions, dégradation gracieuse)
 *   - "À savoir" (description ou fallback selon la couleur)
 *   - Fonctions INCI détaillées
 *   - Répartition par catégorie de produit (barres)
 *   - Informations techniques (INCI, CAS, EINECS, origine, classification, FR)
 *   - Autres langues
 *   - colonne "Présent dans X produits" (cosme_check_products_for_ingredient)
 *
 * Données chargées via RPC `cosme_check_get_ingredient` puis
 * `cosme_check_products_for_ingredient`, chacune bornée par un Promise.race
 * (timeout dur), comme le web. États : chargement · introuvable · prêt.
 */

import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { ColorBadge } from '@/components/design/ColorBadge'
import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { ExplainIngredient } from '@/components/ingredient/ExplainIngredient'
import { IngredientProductRow } from '@/components/ingredient/IngredientProductRow'
import { StatCard } from '@/components/ingredient/StatCard'
import type { IngredientDetail, IngredientProductHit } from '@/components/ingredient/types'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { normalizeColor, type ColorRating } from '@/lib/analysis/types'
import { supabase } from '@/lib/supabase/client'

const RPC_TIMEOUT_MS = 6000
const PRODUCTS_VISIBLE = 4
const HELP_URL = 'https://www.cosme-check.com/comment-ca-marche'

const RATING_LABEL: Record<ColorRating, string> = {
  vert: 'Sans risque connu',
  jaune: 'Pénalité légère',
  orange: 'Pénalité moyenne',
  rouge: 'Pénalité forte',
}

const RATING_DESCRIPTION: Record<ColorRating, (n: string) => string> = {
  vert: (n) =>
    `${n} ne présente pas de pénalité connue. Considéré comme sûr aux usages cosmétiques courants.`,
  jaune: (n) =>
    `${n} présente une tolérance variable selon la concentration ou le profil cutané. Souvent réglementé en Annexe III pour limiter sa concentration. À surveiller en cas de peau sensible.`,
  orange: (n) =>
    `${n} fait l'objet d'une pénalité moyenne. Souvent issu de la pétrochimie ou de la chimie lourde, avec un impact non négligeable sur l'environnement. Préférer des alternatives quand la formule le permet.`,
  rouge: (n) =>
    `${n} est fortement déconseillé ou réglementé. Une controverse sérieuse existe autour de cet ingrédient — à éviter dans la mesure du possible.`,
}

/** Capitalise chaque mot d'un nom INCI ("aqua" → "Aqua"). */
function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Sous-titre dérivé : fonctions principales, sinon classification. */
function inferSubtitle(ing: IngredientDetail): string | null {
  if (ing.functions && ing.functions.length > 0) {
    return ing.functions
      .slice(0, 3)
      .map((f) => f.name)
      .join(', ')
  }
  if (ing.classification && ing.classification.length > 0) {
    return ing.classification.slice(0, 3).join(', ')
  }
  return null
}

type RaceResult<T> = { data: T | null; error: string | null }
type RpcLike<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>

/**
 * Appelle une RPC `cosme_check_*` publique. Les types générés (lib/supabase/
 * types.ts) ne déclarent que quelques RPC ; celles de la fiche ingrédient
 * (get_ingredient / products_for_ingredient) ne le sont pas. On passe donc
 * par un cast `as unknown` ciblé (le retour est validé/typé en aval).
 */
function callRpc<T>(name: string, args: Record<string, unknown>): RpcLike<T> {
  return (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => RpcLike<T>)(
    name,
    args,
  )
}

/** Borne un appel RPC par un timeout dur (comme le web). */
function rpcWithTimeout<T>(rpc: RpcLike<T>, ms: number): Promise<RaceResult<T>> {
  const timeout = new Promise<RaceResult<T>>((resolve) =>
    setTimeout(() => resolve({ data: null, error: 'client_timeout' }), ms),
  )
  const wrapped = Promise.resolve(rpc).then<RaceResult<T>>((r) => ({
    data: r.data ?? null,
    error: r.error ? r.error.message : null,
  }))
  return Promise.race([wrapped, timeout])
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'ready'; ing: IngredientDetail; products: IngredientProductHit[] }

const IngredientDetailScreen: FC = () => {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!slug) {
      setState({ status: 'notfound' })
      return
    }
    setState({ status: 'loading' })

    const ingRes = await rpcWithTimeout<IngredientDetail[]>(
      callRpc<IngredientDetail[]>('cosme_check_get_ingredient', { p_slug: slug }),
      RPC_TIMEOUT_MS,
    )

    const ing = ingRes.error || !ingRes.data || ingRes.data.length === 0 ? null : ingRes.data[0]
    if (!ing) {
      setState({ status: 'notfound' })
      return
    }

    // Produits : best-effort, on n'échoue jamais la page là-dessus.
    const prodRes = await rpcWithTimeout<IngredientProductHit[]>(
      callRpc<IngredientProductHit[]>('cosme_check_products_for_ingredient', {
        p_ingredient_id: ing.id,
        p_limit: 12,
      }),
      RPC_TIMEOUT_MS,
    )
    const products = prodRes.error || !prodRes.data ? [] : prodRes.data

    setState({ status: 'ready', ing, products })
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundGlow variant="default" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Ingrédient
        </Text>
        <View style={styles.backBtn} />
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Chargement de la fiche…</Text>
        </View>
      ) : state.status === 'notfound' ? (
        <NotFound onRetry={() => void load()} />
      ) : (
        <ReadyView ing={state.ing} products={state.products} />
      )}
    </SafeAreaView>
  )
}

export default IngredientDetailScreen

// ── Vue "prête" ──────────────────────────────────────────────────────────────

const ReadyView: FC<{ ing: IngredientDetail; products: IngredientProductHit[] }> = ({
  ing,
  products,
}) => {
  const rating = useMemo(() => normalizeColor(ing.color_rating), [ing.color_rating])
  const name = prettyName(ing.name)
  const subtitle = inferSubtitle(ing)

  const hasFunctions = (ing.functions?.length ?? 0) > 0
  const hasPrevalence = ing.prevalence_pct != null
  const hasDescription = !!ing.description && ing.description.trim().length > 4
  const hasRegulated = (ing.regulated_zones?.length ?? 0) > 0

  const breakdown = useMemo(() => {
    if (!ing.category_breakdown) return [] as [string, number][]
    return Object.entries(ing.category_breakdown)
      .map(([k, v]) => [k, Number(v)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [ing.category_breakdown])

  const otherTranslations = useMemo(() => {
    if (!ing.translations) return [] as [string, string][]
    return Object.entries(ing.translations).filter(([k]) => k !== 'fr')
  }, [ing.translations])

  const techRows = useMemo(() => {
    const rows: { label: string; value: string | null | undefined; mono?: boolean }[] = [
      { label: 'Nom INCI', value: ing.name },
      { label: 'CAS', value: ing.cas_number, mono: true },
      { label: 'EINECS', value: ing.einecs_number, mono: true },
      { label: 'Origine', value: ing.origin },
      { label: 'Classification', value: ing.classification?.join(', ') },
      { label: 'Français', value: ing.translations?.fr },
    ]
    return rows.filter(
      (r) => r.value && (typeof r.value !== 'string' || r.value.trim().length > 0),
    )
  }, [ing])

  const visibleProducts = products.slice(0, PRODUCTS_VISIBLE)
  const moreCount = Math.max(products.length - PRODUCTS_VISIBLE, 0)

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Reveal delay={0} stagger={70}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.name}>{name}</Text>
          {rating ? (
            <ColorBadge rating={rating} variant="chip" size="md" label={RATING_LABEL[rating]} />
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {ing.cas_number ? (
            <View style={styles.casRow}>
              <Text style={styles.casLabel}>CAS</Text>
              <Text style={styles.casValue}>{ing.cas_number}</Text>
            </View>
          ) : null}
        </View>

        {/* Cartes stats */}
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatCard label="Niveau de tolérance" cta="En savoir plus" href={HELP_URL}>
              {rating ? (
                <View style={styles.toleranceRow}>
                  <ColorBadge rating={rating} variant="dot" size="lg" />
                  <Text style={styles.statBig}>{RATING_LABEL[rating]}</Text>
                </View>
              ) : (
                <Text style={styles.statBig}>—</Text>
              )}
            </StatCard>

            {hasPrevalence ? (
              <StatCard label="Prévalence" cta="Méthodologie" href={HELP_URL}>
                <Text style={styles.statNumber}>
                  {Number(ing.prevalence_pct).toFixed(2)}
                  <Text style={styles.statPercent}> %</Text>
                </Text>
                <Text style={styles.statHint}>des cosmétiques contiennent cet ingrédient</Text>
              </StatCard>
            ) : (
              <View style={styles.statSpacer} />
            )}
          </View>

          <View style={styles.statRow}>
            {hasFunctions ? (
              <StatCard label="Fonctions principales">
                <View style={styles.fnList}>
                  {ing.functions!.slice(0, 3).map((f, i) => (
                    <Text key={i} style={styles.fnItem}>
                      {f.name}
                    </Text>
                  ))}
                </View>
              </StatCard>
            ) : (
              <View style={styles.statSpacer} />
            )}

            <StatCard label="Statut réglementaire">
              <Text style={styles.statHint}>
                {hasRegulated
                  ? `Réglementé dans : ${ing.regulated_zones!.join(', ')}.`
                  : 'Aucune restriction connue dans nos données.'}
              </Text>
            </StatCard>
          </View>
        </View>

        {/* À savoir */}
        <Section title="À savoir">
          <Text style={hasDescription ? styles.bodyText : styles.bodyMuted}>
            {hasDescription ? ing.description : RATING_DESCRIPTION[rating ?? 'jaune'](name)}
          </Text>
        </Section>

        {/* Bloc IA — Edge Functions, dégradation gracieuse */}
        <ExplainIngredient slug={ing.slug} />

        {/* Fonctions INCI détaillées */}
        {hasFunctions ? (
          <Section title="Fonctions INCI" divider>
            <View style={styles.fnDetailList}>
              {ing.functions!.map((f, i) => (
                <View key={i} style={styles.fnDetailCard}>
                  <Text style={styles.fnDetailName}>{f.name}</Text>
                  {f.description ? (
                    <Text style={styles.fnDetailDesc}>{f.description}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Répartition par catégorie */}
        {breakdown.length > 0 ? (
          <Section title="Répartition par catégorie de produit" divider>
            <View style={styles.breakdownList}>
              {breakdown.map(([cat, val]) => {
                const pct = val * 100
                return (
                  <View key={cat} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel} numberOfLines={1}>
                      {cat}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: rating
                              ? colors.rating[rating].DEFAULT
                              : colors.accent,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                  </View>
                )
              })}
            </View>
          </Section>
        ) : null}

        {/* Informations techniques */}
        {techRows.length > 0 ? (
          <Section title="Informations techniques" divider>
            <View style={styles.techGrid}>
              {techRows.map((r) => (
                <View key={r.label} style={styles.techRow}>
                  <Text style={styles.techLabel}>{r.label}</Text>
                  <Text style={[styles.techValue, r.mono && styles.techMono]}>{r.value}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Autres langues */}
        {otherTranslations.length > 0 ? (
          <Section title="Autres langues" divider>
            <View style={styles.langWrap}>
              {otherTranslations.map(([lang, v]) => {
                const showLabel = !lang.startsWith('alt_')
                return (
                  <View key={lang} style={styles.langPill}>
                    <Text style={styles.langText}>
                      {showLabel ? `${lang.toUpperCase()} · ${v}` : v}
                    </Text>
                  </View>
                )
              })}
            </View>
          </Section>
        ) : null}

        {/* Produits contenant cet ingrédient */}
        <Section
          title={
            products.length > 0
              ? `Présent dans ${products.length} produit${products.length > 1 ? 's' : ''}`
              : 'Produits'
          }
          divider
        >
          {products.length === 0 ? (
            <GlassCard style={styles.emptyCard} padding={spacing.xl} opacity={0.5}>
              <Text style={styles.emptyText}>
                {ing.details_scraped
                  ? 'Aucun produit indexé pour cet ingrédient.'
                  : 'Les produits seront indexés quand le pipeline aura enrichi cette fiche.'}
              </Text>
            </GlassCard>
          ) : (
            <View style={styles.productList}>
              {visibleProducts.map((p) => (
                <IngredientProductRow key={p.product_id} product={p} rating={rating} />
              ))}
              {moreCount > 0 ? (
                <Text style={styles.moreProducts}>
                  +{moreCount} autre{moreCount > 1 ? 's' : ''} produit
                  {moreCount > 1 ? 's' : ''} dans notre base
                </Text>
              ) : null}
            </View>
          )}
        </Section>
      </Reveal>
    </ScrollView>
  )
}

// ── Sous-composants locaux ───────────────────────────────────────────────────

const Section: FC<{ title: string; divider?: boolean; children: React.ReactNode }> = ({
  title,
  divider = false,
  children,
}) => (
  <View style={[styles.section, divider && styles.sectionDivider]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
)

const NotFound: FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <View style={styles.center}>
    <GlassCard style={styles.errorCard} padding={spacing['2xl']}>
      <View style={styles.errorIcon}>
        <Ionicons name="search-outline" size={32} color={colors.inkMuted} />
      </View>
      <Text style={styles.errorTitle}>Ingrédient introuvable</Text>
      <Text style={styles.errorMsg}>
        Cette fiche n'existe pas ou n'a pas pu être chargée.
      </Text>
      <View style={styles.errorActions}>
        <Pressable
          onPress={onRetry}
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
)

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    ...typography.h4,
    color: colors.ink,
  },
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
  },

  // Hero
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  name: {
    ...typography.h1,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
  },
  casRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  casLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.inkLight,
  },
  casValue: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },

  // Stat grid
  statGrid: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statSpacer: {
    flex: 1,
  },
  toleranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statBig: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
  },
  statNumber: {
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    color: colors.ink,
  },
  statPercent: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: colors.inkMuted,
  },
  statHint: {
    ...typography.xs,
    color: colors.inkMuted,
    marginTop: 4,
  },
  fnList: {
    gap: 2,
  },
  fnItem: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },

  // Sections
  section: {
    marginTop: spacing.xl,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.ink,
  },
  sectionBody: {
    marginTop: spacing.md,
  },
  bodyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.ink,
  },
  bodyMuted: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkMuted,
  },

  // Fonctions détaillées
  fnDetailList: {
    gap: spacing.sm,
  },
  fnDetailCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  fnDetailName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  fnDetailDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 2,
  },

  // Répartition
  breakdownList: {
    gap: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownLabel: {
    width: 110,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.ink,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownPct: {
    width: 50,
    textAlign: 'right',
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },

  // Infos techniques
  techGrid: {
    gap: 10,
  },
  techRow: {
    flexDirection: 'row',
    gap: 12,
  },
  techLabel: {
    width: 120,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkLight,
  },
  techValue: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.ink,
  },
  techMono: {
    fontFamily: fontFamilies.medium,
  },

  // Langues
  langWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  langText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.ink,
  },

  // Produits
  productList: {
    gap: spacing.sm,
  },
  moreProducts: {
    textAlign: 'center',
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: 6,
  },
  emptyCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
  },

  // Not found
  errorCard: {
    alignItems: 'center',
    width: '100%',
  },
  errorIcon: {
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.ink,
    textAlign: 'center',
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
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  retryText: {
    ...typography.buttonSmall,
    color: colors.accentDeep,
  },
  homeBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  homeText: {
    ...typography.buttonSmall,
    color: colors.surface,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
