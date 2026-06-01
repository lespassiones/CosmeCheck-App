/**
 * ProductSearchMode — recherche d'un produit dans le catalogue.
 *
 * Interroge la RPC LIVE supabase.rpc('cosme_check_search_catalog', { p_query,
 * p_limit }) en debounce. Chaque résultat porte éventuellement un
 * `ingredients_text` : si présent, on peut analyser directement (source
 * 'search'). Sinon, on tente l'Edge Function 'product-search' en repli, qui
 * peut être indisponible → message clair + bascule Manuel (degrade gracefully).
 *
 * Émet onInciReady(inci, productName?, brand?) au choix d'un produit.
 */

import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'

interface CatalogRow {
  ean: string | null
  brand: string | null
  name: string | null
  category: string | null
  image_url: string | null
  source_url: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  ingredients_text: string | null
}

interface Props {
  /** ean facultatif (catalogue) pour relier l'analyse au produit. */
  onInciReady: (
    inci: string,
    productName?: string,
    brand?: string,
    ean?: string,
  ) => void
  /** Bascule vers le mode Manuel (repli quand pas d'INCI exploitable). */
  onFallbackToManual: () => void
  disabled?: boolean
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 350

export const ProductSearchMode: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  // Repli en cours pour une ligne sans INCI (appel product-search).
  const [resolvingEan, setResolvingEan] = useState<string | null>(null)

  const reqIdRef = useRef(0)

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_QUERY) {
      setResults([])
      setSearched(false)
      setError(null)
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc(
        // RPC non typée dans Database → cast explicite.
        'cosme_check_search_catalog' as never,
        { p_query: trimmed, p_limit: 10 } as never,
      )
      if (reqId !== reqIdRef.current) return // réponse périmée
      if (rpcError) {
        setError('Recherche indisponible pour le moment.')
        setResults([])
      } else {
        setResults((data as CatalogRow[] | null) ?? [])
      }
    } catch {
      if (reqId !== reqIdRef.current) return
      setError('Connexion impossible. Réessaie.')
      setResults([])
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false)
        setSearched(true)
      }
    }
  }, [])

  // Debounce de la requête.
  useEffect(() => {
    const t = setTimeout(() => void search(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, search])

  /** Choix d'un produit : INCI direct si dispo, sinon repli Edge Function. */
  const pick = useCallback(
    async (row: CatalogRow) => {
      if (disabled) return
      const label = row.name ?? undefined
      const brand = row.brand ?? undefined
      const ean = row.ean ?? undefined

      const direct = row.ingredients_text?.trim()
      if (direct && direct.length >= 10) {
        onInciReady(direct, label, brand, ean)
        return
      }

      // Pas d'INCI en catalogue → repli Edge Function 'product-search'.
      setResolvingEan(ean ?? row.name ?? '')
      try {
        const queryStr = [brand, label].filter(Boolean).join(' ').trim()
        const { data, error: fnError } = await supabase.functions.invoke(
          'product-search',
          { body: { query: queryStr, ean } },
        )
        if (fnError) throw fnError
        const hit = data as
          | { found?: boolean; ingredientsText?: string; brand?: string | null; productName?: string | null }
          | null
        const inci = hit?.found ? hit.ingredientsText?.trim() : undefined
        if (inci && inci.length >= 10) {
          onInciReady(inci, hit?.productName ?? label, hit?.brand ?? brand, ean)
        } else {
          setError(
            'Composition introuvable pour ce produit. Tu peux coller la liste INCI manuellement.',
          )
        }
      } catch {
        // Fonction non déployée / erreur → degrade gracefully.
        setError(
          'Recherche produit indisponible. Colle la liste INCI manuellement.',
        )
      } finally {
        setResolvingEan(null)
      }
    },
    [disabled, onInciReady],
  )

  return (
    <View style={styles.root}>
      {/* SearchBar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Marque et nom du produit…"
          placeholderTextColor={colors.inkLight}
          selectionColor={colors.textSelection}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void search(query)}
        />
        {loading && <ActivityIndicator size="small" color={colors.rose} />}
        {!loading && query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.inkLight} />
          </Pressable>
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onFallbackToManual}>
            <Text style={styles.errorCta}>Coller la liste INCI</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item, i) => item.ean ?? `${item.name ?? 'row'}-${i}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const busy = resolvingEan != null && resolvingEan === (item.ean ?? item.name ?? '')
          return (
            <Pressable
              style={styles.resultRow}
              onPress={() => void pick(item)}
              disabled={disabled || resolvingEan != null}
            >
              <View style={styles.resultMain}>
                {item.brand && <Text style={styles.resultBrand}>{item.brand}</Text>}
                <Text style={styles.resultName} numberOfLines={2}>
                  {item.name ?? 'Produit'}
                </Text>
                {item.category && (
                  <Text style={styles.resultCat}>{item.category}</Text>
                )}
              </View>
              {busy ? (
                <ActivityIndicator size="small" color={colors.rose} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
              )}
            </Pressable>
          )
        }}
        ListEmptyComponent={
          searched && !loading && !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Aucun produit trouvé pour « {query.trim()} ».
              </Text>
              <Pressable onPress={onFallbackToManual}>
                <Text style={styles.emptyCta}>Coller la liste INCI</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  searchInput: { ...typography.body, color: colors.ink, flex: 1, padding: 0 },
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.sm,
  },
  errorText: { ...typography.xs, color: colors.roseDeep },
  errorCta: { ...typography.xsSemiBold, color: colors.roseDeep },
  list: { paddingTop: spacing.md, gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  resultMain: { flex: 1 },
  resultBrand: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
  resultName: { ...typography.smallSemiBold, color: colors.ink },
  resultCat: { ...typography.caption, color: colors.inkLight, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.inkMuted, textAlign: 'center' },
  emptyCta: { ...typography.smallSemiBold, color: colors.rose },
})
