/**
 * Annuaire des ingrédients, écran « Ingrédients » du profil.
 *
 * Demandé par la bêta (Stela, 7 sept) : jusqu'ici un ingrédient n'était
 * atteignable QUE depuis la liste INCI d'une analyse, il fallait donc savoir
 * dans quel produit aller le chercher. Cet écran ouvre les 15 773 fiches en
 * accès direct.
 *
 * Deux modes dans une seule liste :
 *   - vide          : liste ALPHABÉTIQUE par sections (A, B, …, puis « # »
 *     pour les noms qui commencent par un chiffre), paginée par curseur
 *     (`cosme_check_list_ingredients_page`, pages de 60, scroll infini).
 *     L'index A-Z à droite repositionne la liste sur une lettre ;
 *   - ≥ 2 caractères : recherche au fil de la frappe
 *     (`cosme_check_search_ingredients`, index GIN trigram, insensible casse
 *     et accents), débouncée à 200 ms.
 *
 * La pagination alphabétique est par CURSEUR (dernier nom + slug vus) et non
 * par offset : le coût reste constant quelle que soit la profondeur de scroll.
 * Sections, phases de pagination et libellés : `components/ingredient/directory.ts`.
 *
 * Le tap ouvre la fiche existante `/ingredient/[slug]`.
 */
import { type FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { SearchBar } from '@/components/shared/SearchBar'
import { db, supabase } from '@/lib/supabase/client'
import { prettyInci } from '@/lib/inciCommonNames'
import {
  DIRECTORY_LETTERS,
  buildDirectoryItems,
  buildSearchItems,
  firstPageParam,
  formatCount,
  formatPrevalence,
  toDirectoryPage,
  type DirectoryItem,
  type DirectoryLetter,
  type DirectoryPage,
  type DirectoryRow,
} from '@/components/ingredient/directory'

const PAGE_SIZE = 60
const SEARCH_LIMIT = 40
/** En dessous de 2 caractères la recherche ne renvoie rien (garde côté RPC). */
const MIN_QUERY = 2
const DEBOUNCE_MS = 200
const DAY_MS = 24 * 60 * 60 * 1000
/** Largeur de la colonne de l'index A-Z (la liste s'arrête avant). */
const INDEX_WIDTH = 24
/** Hauteur max d'une lettre de l'index ; elle se tasse sur les petits écrans. */
const INDEX_LETTER_MAX = 18

type RatingKey = 'vert' | 'jaune' | 'orange' | 'rouge'
const RATING_KEY: Record<string, RatingKey> = {
  Vert: 'vert',
  Jaune: 'jaune',
  Orange: 'orange',
  Rouge: 'rouge',
}

/** Pastille de couleur de l'ingrédient (mêmes jetons que la liste INCI). */
const ColorDot: FC<{ rating: string | null }> = ({ rating }) => {
  const key = rating ? RATING_KEY[rating] : undefined
  const bg = key ? colors.rating[key].DEFAULT : colors.gray300
  return <View style={[styles.dot, { backgroundColor: bg }]} />
}

interface RowProps {
  row: DirectoryRow
  first: boolean
  last: boolean
  onPress: (slug: string) => void
}

const IngredientRowItem: FC<RowProps> = memo(({ row, first, last, onPress }) => {
  const name = prettyInci(row.name)
  const prevalence = formatPrevalence(row.prevalence_pct)
  const meta = prevalence ? `${prevalence} des produits` : null
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(row.slug)}
      accessibilityRole="button"
      accessibilityLabel={meta ? `${name}, ${meta}` : name}
    >
      {first ? null : <View style={styles.rowSep} />}
      <ColorDot rating={row.color_rating} />
      <Text style={styles.rowName} numberOfLines={3}>
        {name}
      </Text>
      {meta ? (
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
    </Pressable>
  )
})
IngredientRowItem.displayName = 'IngredientRowItem'

const SectionHeader: FC<{ letter: DirectoryLetter; first: boolean }> = ({ letter, first }) => (
  <View style={[styles.sectionHeader, first && styles.sectionHeaderFirst]}>
    <Text style={styles.sectionLetter}>{letter}</Text>
  </View>
)

/** Index A-Z à droite : un tap repositionne la liste sur la lettre. */
const LetterIndex: FC<{ onPick: (letter: DirectoryLetter) => void }> = ({ onPick }) => (
  <View style={styles.index} pointerEvents="box-none">
    <View style={styles.indexInner}>
      {DIRECTORY_LETTERS.map((letter) => (
        <Pressable
          key={letter}
          haptic="selection"
          pressScale={false}
          onPress={() => onPick(letter)}
          hitSlop={{ left: 10, right: 4 }}
          style={styles.indexLetter}
          accessibilityRole="button"
          accessibilityLabel={letter === '#' ? 'Aller aux noms commençant par un chiffre' : `Aller à la lettre ${letter}`}
        >
          <Text style={styles.indexLetterText}>{letter}</Text>
        </Pressable>
      ))}
    </View>
  </View>
)

const IngredientsIndexScreen: FC = () => {
  const router = useRouter()
  const listRef = useRef<FlatList<DirectoryItem>>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  /** Lettre où commence la liste alphabétique (A par défaut). */
  const [anchor, setAnchor] = useState<DirectoryLetter>('A')

  // Débounce : on ne tape pas une requête par caractère.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  const isSearching = debounced.length >= MIN_QUERY

  // ── Nombre de fiches (sous le titre) ──────────────────────────────────────
  const total = useQuery({
    queryKey: ['ingredientsCount'],
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    queryFn: async () => {
      const { count, error } = await db()
        .from('ingredients' as never)
        .select('slug', { count: 'exact', head: true })
      if (error) throw error
      return count ?? null
    },
  })

  // ── Liste alphabétique (curseur, à partir de la lettre choisie) ───────────
  const alpha = useInfiniteQuery({
    queryKey: ['ingredientsAlpha', anchor],
    enabled: !isSearching,
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    initialPageParam: firstPageParam(anchor),
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc(
        'cosme_check_list_ingredients_page' as never,
        {
          p_after_name: pageParam.after?.name ?? null,
          p_after_slug: pageParam.after?.slug ?? null,
          p_limit: PAGE_SIZE,
        } as never,
      )
      if (error) throw error
      return toDirectoryPage(pageParam, (data as DirectoryRow[] | null) ?? [], PAGE_SIZE)
    },
    getNextPageParam: (last: DirectoryPage) => last.next ?? undefined,
  })

  // ── Recherche au fil de la frappe ─────────────────────────────────────────
  const found = useQuery({
    queryKey: ['ingredientsSearch', debounced.toLowerCase()],
    enabled: isSearching,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'cosme_check_search_ingredients' as never,
        { p_query: debounced, p_limit: SEARCH_LIMIT, p_offset: 0 } as never,
      )
      if (error) throw error
      return (data as DirectoryRow[] | null) ?? []
    },
  })

  const items: DirectoryItem[] = useMemo(() => {
    if (isSearching) return buildSearchItems(found.data ?? [])
    return buildDirectoryItems(alpha.data?.pages ?? [], !alpha.hasNextPage)
  }, [isSearching, found.data, alpha.data, alpha.hasNextPage])

  const openIngredient = useCallback(
    (slug: string) => router.push(ROUTES.INGREDIENT.DETAIL(slug)),
    [router],
  )

  const jumpTo = useCallback((letter: DirectoryLetter) => {
    setAnchor(letter)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [])

  const loading = isSearching ? found.isLoading : alpha.isLoading
  const errored = isSearching ? found.isError : alpha.isError

  const onEndReached = useCallback(() => {
    if (isSearching) return
    if (alpha.hasNextPage && !alpha.isFetchingNextPage) void alpha.fetchNextPage()
  }, [isSearching, alpha])

  const renderItem = useCallback(
    ({ item, index }: { item: DirectoryItem; index: number }) =>
      item.kind === 'header' ? (
        <SectionHeader letter={item.letter} first={index === 0} />
      ) : (
        <IngredientRowItem
          row={item.row}
          first={item.first}
          last={item.last}
          onPress={openIngredient}
        />
      ),
    [openIngredient],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Ingrédients</Text>
            <Text style={styles.count}>
              {total.data ? `${formatCount(total.data)} fiches` : ' '}
            </Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            placeholder="Rechercher un ingrédient"
          />
          {search.length > 0 && search.trim().length < MIN_QUERY ? (
            <Text style={styles.hint}>Tape au moins {MIN_QUERY} caractères.</Text>
          ) : null}
        </View>

        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              !isSearching && styles.listContentWithIndex,
              items.length === 0 && (loading || errored) && styles.listContentCentered,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={onEndReached}
            onEndReachedThreshold={0.6}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={colors.rose} style={styles.center} />
              ) : errored ? (
                <Text style={styles.empty}>
                  Liste indisponible pour le moment. Réessaie dans un instant.
                </Text>
              ) : isSearching ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="search-outline" size={18} color={colors.inkLight} />
                  <Text style={styles.emptyCardText}>
                    Aucun ingrédient pour « {debounced} ».
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              !isSearching && alpha.isFetchingNextPage ? (
                <ActivityIndicator color={colors.rose} style={styles.footer} />
              ) : null
            }
          />
          {isSearching ? null : <LetterIndex onPick={jumpTo} />}
        </View>
      </SafeAreaView>
    </View>
  )
}

export default IngredientsIndexScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1 },
  title: { ...typography.h2, color: colors.ink },
  count: { ...typography.small, color: colors.inkMuted },
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  hint: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.xs, marginLeft: spacing.sm },
  listWrap: { flex: 1 },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl * 2 },
  listContentWithIndex: { paddingRight: INDEX_WIDTH + spacing.sm },
  listContentCentered: { flexGrow: 1, justifyContent: 'center' },
  sectionHeader: {
    backgroundColor: colors.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionHeaderFirst: { marginTop: 0 },
  sectionLetter: { ...typography.xsSemiBold, color: colors.inkMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    marginBottom: spacing.base,
  },
  rowPressed: { backgroundColor: colors.gray100 },
  // Filet entre deux lignes, aligné sur le nom (après la pastille).
  rowSep: {
    position: 'absolute',
    top: 0,
    left: 14 + 10 + spacing.md,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  rowName: { ...typography.body, color: colors.ink, flex: 1 },
  rowMeta: { ...typography.xs, color: colors.inkMuted, flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  index: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: spacing.xs,
    width: INDEX_WIDTH,
  },
  indexInner: {
    flex: 1,
    maxHeight: DIRECTORY_LETTERS.length * INDEX_LETTER_MAX,
  },
  indexLetter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  indexLetterText: { ...typography.caption, color: colors.inkMuted },
  center: { marginTop: spacing.xl },
  footer: { marginVertical: spacing.lg },
  empty: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  emptyCardText: { ...typography.small, color: colors.inkMuted, flex: 1 },
})

// Erreur de rendu : seule cette page est remplacée (pas toute l'app).
export { RouteErrorBoundary as ErrorBoundary } from '@/components/shared/RouteErrorBoundary'
