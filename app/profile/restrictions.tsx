/**
 * RestrictionsScreen — gestion des restrictions de l'utilisateur.
 *
 * Twin mobile de l'explorateur web (RestrictionsExplorer + actions.ts) :
 *   - Onglet « Familles » : liste des familles d'ingrédients (lues depuis
 *     cosme_check.ingredient_families) avec toggles on/off.
 *   - Onglet « Ingrédients » : recherche par RPC cosme_check_search puis ajout,
 *     plus la liste des ingrédients restreints (chips supprimables).
 *
 * Tout est persisté dans user_profiles.preferences.restrictions via un
 * read-modify-write non destructif des autres clés de preferences.
 */

import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { db, supabase } from '@/lib/supabase/client'
import { readRestrictions, type UserProfileRow } from '@/lib/supabase/types'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { NeuCard } from '@/components/design/NeuCard'

const MAX_FAMILIES = 60
const MAX_INGREDIENTS = 80
const SEARCH_DEBOUNCE_MS = 250

type Tab = 'families' | 'ingredients'

interface IngredientFamily {
  slug: string
  tagSlug: string | null
  name: string
}

interface SearchResult {
  slug: string
  name: string
  colorRating: string | null
}

/** Builder PostgREST minimal pour la table `ingredient_families` (non typée). */
interface FamiliesQuery {
  select: (cols: string) => FamiliesQuery
  eq: (col: string, val: unknown) => FamiliesQuery
  order: (col: string, opts: { ascending: boolean }) => FamiliesQuery
  then: PromiseLike<{ data: unknown; error: unknown }>['then']
}

function asPrefsObject(prefs: UserProfileRow['preferences'] | undefined): Record<string, unknown> {
  if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) {
    return prefs as Record<string, unknown>
  }
  return {}
}

const RestrictionsScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { profile, restrictions, refresh } = useProfile()

  const [tab, setTab] = useState<Tab>('families')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Catalogue des familles (chargé une fois).
  const [families, setFamilies] = useState<IngredientFamily[]>([])
  const [familiesLoading, setFamiliesLoading] = useState(true)

  // Recherche d'ingrédients.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const familySet = useMemo(() => new Set(restrictions.families), [restrictions.families])

  // ── Chargement du catalogue de familles ───────────────────────────
  useEffect(() => {
    let active = true
    setFamiliesLoading(true)
    void (async () => {
      try {
        // `ingredient_families` n'est pas typée dans Database → cast explicite.
        const { data, error: famErr } = await (
          db().from('ingredient_families' as never) as unknown as FamiliesQuery
        )
          .select('slug, tag_slug, name, sort_order')
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
        if (!active) return
        if (famErr || !data) {
          // Dégradation gracieuse : pas de catalogue → message dans l'onglet.
          setFamilies([])
        } else {
          setFamilies(
            (data as { slug: string; tag_slug: string | null; name: string }[]).map((r) => ({
              slug: r.slug,
              tagSlug: r.tag_slug,
              name: r.name,
            })),
          )
        }
      } catch {
        if (active) setFamilies([])
      } finally {
        if (active) setFamiliesLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Familles actives (avec tag) d'abord, puis « bientôt actives ».
  const sortedFamilies = useMemo(() => {
    const withTag = families.filter((f) => f.tagSlug)
    const without = families.filter((f) => !f.tagSlug)
    return [...withTag, ...without]
  }, [families])

  // ── Persistance read-modify-write ─────────────────────────────────
  const persist = useCallback(
    async (
      transform: (r: ReturnType<typeof readRestrictions>) => ReturnType<typeof readRestrictions>,
    ) => {
      if (!userId) return
      setIsSaving(true)
      setError(null)
      try {
        const prefs = asPrefsObject(profile?.preferences)
        const current = readRestrictions(prefs)
        const next = transform(current)
        const preferences: Record<string, unknown> = { ...prefs, restrictions: next }
        const { error: updateError } = await db()
          .from('user_profiles')
          .update({ preferences })
          .eq('id', userId)
        if (updateError) throw updateError
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
      } finally {
        setIsSaving(false)
      }
    },
    [userId, profile?.preferences, refresh],
  )

  const toggleFamily = useCallback(
    (slug: string) => {
      Haptics.selectionAsync().catch(() => {})
      persist((r) => {
        if (r.families.includes(slug)) {
          return { ...r, families: r.families.filter((f) => f !== slug) }
        }
        if (r.families.length >= MAX_FAMILIES) return r
        return { ...r, families: [...r.families, slug] }
      })
    },
    [persist],
  )

  const addIngredient = useCallback(
    (res: SearchResult) => {
      Haptics.selectionAsync().catch(() => {})
      setQuery('')
      setResults([])
      persist((r) => {
        if (r.ingredients.some((i) => i.slug === res.slug)) return r
        if (r.ingredients.length >= MAX_INGREDIENTS) return r
        return {
          ...r,
          ingredients: [...r.ingredients, { slug: res.slug, name: res.name }],
        }
      })
    },
    [persist],
  )

  const removeFamily = useCallback(
    (slug: string) => persist((r) => ({ ...r, families: r.families.filter((f) => f !== slug) })),
    [persist],
  )

  const removeIngredient = useCallback(
    (slug: string) =>
      persist((r) => ({ ...r, ingredients: r.ingredients.filter((i) => i.slug !== slug) })),
    [persist],
  )

  // ── Recherche débounce via RPC cosme_check_search ──────────────────
  const onChangeQuery = useCallback((value: string) => {
    setQuery(value)
    setError(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc(
          // RPC non typée dans Database → cast explicite (cf. ProductSearchMode).
          'cosme_check_search' as never,
          { q: trimmed, result_limit: 10 } as never,
        )
        if (rpcErr) throw rpcErr
        const rows = (data as { slug: string; name: string; color_rating: string | null }[] | null) ?? []
        setResults(
          rows
            .filter((r) => r && typeof r.slug === 'string' && typeof r.name === 'string')
            .map((r) => ({ slug: r.slug, name: r.name, colorRating: r.color_rating ?? null })),
        )
      } catch {
        // Dégradation gracieuse : recherche indisponible.
        setResults([])
      } finally {
        setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    },
    [],
  )

  const filteredResults = useMemo(
    () => results.filter((r) => !restrictions.ingredients.some((i) => i.slug === r.slug)),
    [results, restrictions.ingredients],
  )

  const familyName = useCallback(
    (slug: string) => families.find((f) => f.slug === slug)?.name ?? slug,
    [families],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Mes restrictions</Text>
          <View style={styles.backBtn}>
            {isSaving ? <ActivityIndicator size="small" color={colors.rose} /> : null}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Choisis les familles et les ingrédients précis que tu veux éviter. Cosme Check te
            préviendra à chaque analyse si un produit en contient.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* ── Onglets ──────────────────────────────────────── */}
          <View style={styles.tabs}>
            <TabButton
              label="Familles"
              count={restrictions.families.length}
              active={tab === 'families'}
              onPress={() => setTab('families')}
            />
            <TabButton
              label="Ingrédients"
              count={restrictions.ingredients.length}
              active={tab === 'ingredients'}
              onPress={() => setTab('ingredients')}
            />
          </View>

          {tab === 'families' ? (
            <FamiliesPanel
              families={sortedFamilies}
              loading={familiesLoading}
              selected={familySet}
              onToggle={toggleFamily}
              disabled={isSaving}
            />
          ) : (
            <IngredientsPanel
              query={query}
              onChangeQuery={onChangeQuery}
              searching={searching}
              results={filteredResults}
              onAdd={addIngredient}
              ingredients={restrictions.ingredients}
              onRemove={removeIngredient}
              disabled={isSaving}
            />
          )}

          {/* ── Familles sélectionnées (rappel + retrait rapide) ── */}
          {tab === 'families' && restrictions.families.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Familles à éviter</Text>
              <View style={styles.chips}>
                {restrictions.families.map((slug) => (
                  <View key={slug} style={styles.chip}>
                    <Text style={styles.chipText}>{familyName(slug)}</Text>
                    <Pressable
                      hitSlop={8}
                      disabled={isSaving}
                      onPress={() => void removeFamily(slug)}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${familyName(slug)}`}
                    >
                      <Ionicons name="close" size={16} color={colors.inkMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ─── Onglet ───────────────────────────────────────────────────────────

const TabButton: FC<{
  label: string
  count: number
  active: boolean
  onPress: () => void
}> = ({ label, count, active, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    style={[styles.tabBtn, active && styles.tabBtnActive]}
  >
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    {count > 0 ? (
      <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
        <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
      </View>
    ) : null}
  </Pressable>
)

// ─── Panneau familles ──────────────────────────────────────────────────

const FamiliesPanel: FC<{
  families: IngredientFamily[]
  loading: boolean
  selected: Set<string>
  onToggle: (slug: string) => void
  disabled: boolean
}> = ({ families, loading, selected, onToggle, disabled }) => {
  if (loading) {
    return (
      <NeuCard padding={spacing.lg} interactive={false} style={styles.card}>
        <ActivityIndicator size="small" color={colors.accent} />
      </NeuCard>
    )
  }
  if (families.length === 0) {
    return (
      <NeuCard padding={spacing.lg} interactive={false} style={styles.card}>
        <Text style={styles.emptyText}>
          La liste des familles est momentanément indisponible. Réessaie plus tard.
        </Text>
      </NeuCard>
    )
  }
  return (
    <NeuCard padding={0} interactive={false} style={styles.card}>
      {families.map((fam, i) => {
        const on = selected.has(fam.slug)
        return (
          <Pressable
            key={fam.slug}
            onPress={() => onToggle(fam.slug)}
            disabled={disabled}
            style={[styles.familyRow, i > 0 && styles.familyRowBorder]}
          >
            <View style={styles.familyInfo}>
              <Text style={styles.familyName}>{fam.name}</Text>
              {!fam.tagSlug ? (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Bientôt actif</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.toggle, on && styles.toggleOn]}>
              <View style={[styles.knob, on && styles.knobOn]} />
            </View>
          </Pressable>
        )
      })}
    </NeuCard>
  )
}

// ─── Panneau ingrédients ───────────────────────────────────────────────

const IngredientsPanel: FC<{
  query: string
  onChangeQuery: (v: string) => void
  searching: boolean
  results: SearchResult[]
  onAdd: (r: SearchResult) => void
  ingredients: { slug: string; name: string }[]
  onRemove: (slug: string) => void
  disabled: boolean
}> = ({ query, onChangeQuery, searching, results, onAdd, ingredients, onRemove, disabled }) => {
  const showResults = query.trim().length >= 2
  return (
    <View style={styles.ingPanel}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.inkLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Rechercher un ingrédient…"
          placeholderTextColor={colors.inkLight}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={colors.textSelection}
        />
      </View>

      {showResults ? (
        <NeuCard padding={0} interactive={false} style={styles.card}>
          {searching ? (
            <View style={styles.resultLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : results.length === 0 ? (
            <Text style={styles.resultEmpty}>Aucun ingrédient ne correspond.</Text>
          ) : (
            results.map((r, i) => (
              <View key={r.slug} style={[styles.resultRow, i > 0 && styles.familyRowBorder]}>
                <ColorDot color={r.colorRating} />
                <Text style={styles.resultName} numberOfLines={1}>
                  {r.name}
                </Text>
                <Pressable
                  onPress={() => onAdd(r)}
                  disabled={disabled}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
                >
                  <Text style={styles.addBtnText}>+ Ajouter</Text>
                </Pressable>
              </View>
            ))
          )}
        </NeuCard>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Ingrédients à éviter{ingredients.length > 0 ? ` (${ingredients.length})` : ''}
        </Text>
        {ingredients.length === 0 ? (
          <NeuCard padding={spacing.lg} interactive={false} style={styles.card}>
            <Text style={styles.emptyText}>
              Aucun ingrédient ajouté. Utilise la recherche ci-dessus pour en ajouter.
            </Text>
          </NeuCard>
        ) : (
          <View style={styles.chips}>
            {ingredients.map((ing) => (
              <View key={ing.slug} style={styles.chip}>
                <Text style={styles.chipText}>{ing.name}</Text>
                <Pressable
                  hitSlop={8}
                  disabled={disabled}
                  onPress={() => void onRemove(ing.slug)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${ing.name}`}
                >
                  <Ionicons name="close" size={16} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

const ColorDot: FC<{ color: string | null }> = ({ color }) => {
  const c =
    color === 'Vert'
      ? colors.rating.vert.DEFAULT
      : color === 'Jaune'
        ? colors.rating.jaune.DEFAULT
        : color === 'Orange'
          ? colors.rating.orange.DEFAULT
          : color === 'Rouge'
            ? colors.rating.rouge.DEFAULT
            : colors.gray300
  return <View style={[styles.dot, { backgroundColor: c }]} />
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h4, color: colors.ink },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.base, gap: spacing.lg },
  intro: { ...typography.small, color: colors.inkMuted },
  error: { ...typography.small, color: colors.error },

  // Onglets
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  tabBtnActive: { backgroundColor: colors.accentSoft },
  tabText: { ...typography.smallSemiBold, color: colors.inkMuted },
  tabTextActive: { color: colors.accentDeep },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: colors.accent },
  tabBadgeText: { ...typography.xsSemiBold, color: colors.gray700 },
  tabBadgeTextActive: { color: '#FFFFFF' },

  card: { borderRadius: radius.lg, overflow: 'hidden' },
  emptyText: { ...typography.small, color: colors.inkMuted },

  // Familles
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  familyRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  familyInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  familyName: { ...typography.bodyMedium, color: colors.ink },
  soonBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.warningSoft,
  },
  soonBadgeText: { ...typography.xsSemiBold, color: colors.warning },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gray300,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.accent },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  knobOn: { alignSelf: 'flex-end' },

  // Ingrédients
  ingPanel: { gap: spacing.lg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: spacing.md },
  resultLoading: { padding: spacing.lg, alignItems: 'center' },
  resultEmpty: { ...typography.small, color: colors.inkMuted, padding: spacing.lg },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  resultName: { ...typography.smallMedium, color: colors.ink, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  addBtnPressed: { opacity: 0.85 },
  addBtnText: { ...typography.xsSemiBold, color: '#FFFFFF' },

  // Sections / chips
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.smallSemiBold, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...typography.smallMedium, color: colors.ink },
})

export default RestrictionsScreen
