/**
 * A16 : « Ton premier scan ».
 *
 * Le moment où la personne voit l'app marcher sur SON produit, avant tout
 * paiement. Trois portes, toutes utilisables sans compte :
 *   - la caméra (code-barres) → `cosme_check.catalog` par EAN ;
 *   - « Chercher par son nom » → `cosme_check_search_catalog` ;
 *   - « Je n'ai rien sous la main » → quelques produits très répandus.
 * Aucun crédit n'est consommé. Si tout échoue (réseau, produit inconnu),
 * l'étape reste passable : le parcours ne doit jamais se bloquer ici.
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import type { ScannedProduct } from '@/lib/onboarding/draft'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { haptic } from '@/lib/haptics'
import {
  BARCODE_RE,
  fetchPopularProducts,
  fetchProductByEan,
  searchProducts,
} from '@/lib/onboarding/productLookup'
import {
  Eyebrow,
  FLOW_MAX_WIDTH,
  GUTTER,
  Gap,
  PerleBubble,
  PrimaryButton,
  SecondaryButton,
  StepLayout,
  TextLink,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const PRODUCT_BLUR = require('../../../../assets/images/onboarding/scan-product-blur.webp')

// ── Ligne de scan animée ─────────────────────────────────────────────────

const ScanLine: FC<{ height: number }> = ({ height }) => {
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(height, { duration: 1400, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      ),
      -1,
    )
  }, [height, y])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[styles.scanLine, style]} />
}

const Viewfinder: FC<{ size?: number }> = ({ size = 170 }) => (
  <View style={[styles.frame, { width: size, height: size * 0.7 }]} pointerEvents="none">
    {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
      <View key={c} style={[styles.corner, styles[`corner_${c}`]]} />
    ))}
    <ScanLine height={size * 0.7 - 4} />
  </View>
)

// ── Caméra ───────────────────────────────────────────────────────────────

type CamState =
  | { kind: 'scanning' }
  | { kind: 'looking-up'; ean: string }
  | { kind: 'not-found'; ean: string }

const CameraSheet: FC<{
  visible: boolean
  onClose: () => void
  onFound: (p: ScannedProduct) => void
  onSearch: () => void
}> = ({ visible, onClose, onFound, onSearch }) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [state, setState] = useState<CamState>({ kind: 'scanning' })
  const locked = useRef(false)

  useEffect(() => {
    if (!visible) return
    locked.current = false
    setState({ kind: 'scanning' })
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const onScan = useCallback(
    async (res: BarcodeScanningResult) => {
      const ean = res.data?.trim()
      if (locked.current || !ean || !BARCODE_RE.test(ean)) return
      locked.current = true
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setState({ kind: 'looking-up', ean })
      const product = await fetchProductByEan(ean)
      if (product) {
        onFound(product)
        return
      }
      setState({ kind: 'not-found', ean })
    },
    [onFound],
  )

  const retry = () => {
    locked.current = false
    setState({ kind: 'scanning' })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.camRoot}>
        {permission?.granted && state.kind === 'scanning' ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={onScan}
          />
        ) : null}
        <SafeAreaView style={styles.camSafe} edges={['top', 'bottom']}>
          <View style={styles.camTop}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.camClose}>
              <Ionicons name="close" size={24} color={colors.surface} />
            </Pressable>
          </View>
          <Text style={styles.camTitle}>Vise le code-barres</Text>
          <Text style={styles.camSub}>On s'occupe du reste.</Text>
          <View style={styles.camCenter}>
            {permission && !permission.granted ? (
              <View style={styles.camPanel}>
                <Text style={styles.camPanelTitle}>La caméra est désactivée</Text>
                <Text style={styles.camPanelText}>
                  Autorise-la dans les réglages, ou cherche ton produit par son nom.
                </Text>
                <PrimaryButton
                  label="Ouvrir les réglages"
                  onPress={() => {
                    if (permission.canAskAgain) void requestPermission()
                    else void Linking.openSettings()
                  }}
                />
                <TextLink label="Chercher par son nom" onPress={onSearch} />
              </View>
            ) : state.kind === 'looking-up' ? (
              <View style={styles.camPanel}>
                <ActivityIndicator color={colors.rose} />
                <Text style={styles.camPanelText}>Je cherche ce produit…</Text>
              </View>
            ) : state.kind === 'not-found' ? (
              <View style={styles.camPanel}>
                <Text style={styles.camPanelTitle}>Celui-là, je ne le connais pas encore.</Text>
                <Text style={styles.camPanelText}>
                  Essaie avec un autre, ou cherche-le par son nom.
                </Text>
                <PrimaryButton label="Scanner un autre produit" onPress={retry} />
                <TextLink label="Chercher par son nom" onPress={onSearch} />
              </View>
            ) : (
              <Viewfinder size={240} />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

// ── Recherche et produits populaires ─────────────────────────────────────

const ProductRow: FC<{ p: ScannedProduct; onPress: () => void }> = ({ p, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${p.brand ? `${p.brand}, ` : ''}${p.name}`}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.gray100 }]}
  >
    <View style={styles.rowThumb}>
      {p.imageUrl ? (
        <Image source={{ uri: p.imageUrl }} style={styles.rowImg} contentFit="contain" cachePolicy="memory-disk" />
      ) : (
        <Ionicons name="flask-outline" size={22} color={colors.inkLight} />
      )}
    </View>
    <View style={styles.flex}>
      {p.brand ? <Text style={styles.rowBrand} numberOfLines={1}>{p.brand}</Text> : null}
      <Text style={styles.rowName} numberOfLines={2}>{p.name}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
  </Pressable>
)

const PickerSheet: FC<{
  visible: boolean
  startWithPopular: boolean
  onClose: () => void
  onPick: (p: ScannedProduct) => void
  onSkip: () => void
}> = ({ visible, startWithPopular, onClose, onPick, onSkip }) => {
  // Une Modal a sa propre fenêtre : on réserve nous-mêmes la place du clavier
  // sous la liste, pour que les derniers résultats restent atteignables.
  const keyboardHeight = useKeyboardHeight()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScannedProduct[]>([])
  const [popular, setPopular] = useState<ScannedProduct[] | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible || popular !== null) return
    let alive = true
    void fetchPopularProducts(6).then((list) => {
      if (alive) setPopular(list)
    })
    return () => {
      alive = false
    }
  }, [visible, popular])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const list = await searchProducts(q, 12)
      setResults(list)
      setLoading(false)
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  const showPopular = query.trim().length < 2
  const data = showPopular ? popular ?? [] : results

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheetSafe} edges={['top', 'bottom']}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{startWithPopular && showPopular ? 'Choisis un produit' : 'Chercher un produit'}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.sheetClose}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.inkLight} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Marque ou nom du produit"
            placeholderTextColor={colors.inkLight}
            style={styles.searchInput}
            autoFocus={!startWithPopular}
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.textSelection}
            accessibilityLabel="Marque ou nom du produit"
          />
          {loading ? <ActivityIndicator size="small" color={colors.rose} /> : null}
        </View>
        <Text style={styles.listLabel}>
          {showPopular ? 'PRODUITS TRÈS RÉPANDUS' : results.length > 0 ? 'RÉSULTATS' : ''}
        </Text>
        <FlatList
          data={data}
          keyExtractor={(p, i) => `${p.ean ?? p.name}-${i}`}
          renderItem={({ item }) => <ProductRow p={item} onPress={() => onPick(item)} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, keyboardHeight > 0 && { paddingBottom: keyboardHeight + 24 }]}
          ListEmptyComponent={
            showPopular && popular === null ? (
              <ActivityIndicator style={styles.listEmpty} color={colors.rose} />
            ) : !showPopular && !loading ? (
              <Text style={styles.emptyText}>Aucun produit trouvé. Essaie avec la marque et le nom.</Text>
            ) : null
          }
          ListFooterComponent={<TextLink label="Passer cette étape" onPress={onSkip} />}
        />
      </SafeAreaView>
    </Modal>
  )
}

// ── Étape ────────────────────────────────────────────────────────────────

export const ScanStep: FC<StepProps> = ({ update, next, firstName }) => {
  const [camera, setCamera] = useState(false)
  const [picker, setPicker] = useState<null | 'search' | 'popular'>(null)

  const choose = useCallback(
    (p: ScannedProduct) => {
      haptic.success()
      setCamera(false)
      setPicker(null)
      update({ scanned: p })
      // Laisse les modales se fermer avant d'afficher le verdict.
      setTimeout(next, 250)
    },
    [update, next],
  )

  const skip = () => {
    setPicker(null)
    update({ scanned: null })
    setTimeout(next, 250)
  }

  return (
    <StepLayout
      footer={
        <>
          <PrimaryButton
            label="Scanner mon produit"
            onPress={() => setCamera(true)}
            leading={<Ionicons name="barcode-outline" size={22} color={colors.surface} />}
          />
          <SecondaryButton label="Chercher par son nom" onPress={() => setPicker('search')} />
          <TextLink label="Je n'ai rien sous la main" onPress={() => setPicker('popular')} />
        </>
      }
    >
      <Eyebrow>TON PREMIER SCAN</Eyebrow>
      <PerleBubble>
        {`À toi${firstName ? `, ${firstName}` : ''}. Attrape un produit que tu utilises, n'importe lequel. On le lit ensemble.`}
      </PerleBubble>
      <Gap h={18} />
      <Pressable
        onPress={() => setCamera(true)}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir la caméra pour scanner le code-barres"
        style={styles.card}
      >
        <Image source={PRODUCT_BLUR} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.cardShade} />
        <Viewfinder />
        <Text style={styles.cardCaption}>Vise le code-barres</Text>
      </Pressable>

      <CameraSheet
        visible={camera}
        onClose={() => setCamera(false)}
        onFound={choose}
        onSearch={() => {
          setCamera(false)
          setTimeout(() => setPicker('search'), 350)
        }}
      />
      <PickerSheet
        visible={picker !== null}
        startWithPopular={picker === 'popular'}
        onClose={() => setPicker(null)}
        onPick={choose}
        onSkip={skip}
      />
    </StepLayout>
  )
}

const CORNER = 30
const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    height: 300,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0F',
  },
  cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,15,0.35)' },
  cardCaption: {
    position: 'absolute',
    bottom: 18,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.surface,
  },
  frame: { alignItems: 'center', overflow: 'visible' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.surface },
  corner_tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  corner_tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  corner_bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  corner_br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanLine: {
    position: 'absolute',
    top: 2,
    left: -20,
    right: -20,
    height: 2,
    backgroundColor: colors.rose,
    shadowColor: colors.rose,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  camRoot: { flex: 1, backgroundColor: '#0B0B0F' },
  camSafe: { flex: 1 },
  camTop: { paddingHorizontal: GUTTER, paddingTop: 8 },
  camClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    color: colors.surface,
    textAlign: 'center',
    marginTop: 12,
  },
  camSub: { fontFamily: fontFamilies.regular, fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 4 },
  camCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  camPanel: {
    width: '100%',
    maxWidth: FLOW_MAX_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    gap: 12,
    alignItems: 'stretch',
  },
  camPanelTitle: { fontFamily: fontFamilies.bold, fontSize: 19, color: colors.ink, textAlign: 'center' },
  camPanelText: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21, color: colors.inkMuted, textAlign: 'center' },

  sheetSafe: { flex: 1, backgroundColor: colors.bg },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingVertical: 12,
  },
  sheetTitle: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.ink },
  sheetClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  listLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.inkLight,
    marginHorizontal: GUTTER,
    marginTop: 18,
    marginBottom: 6,
  },
  listContent: { paddingHorizontal: GUTTER - 8, paddingBottom: 24 },
  listEmpty: { marginTop: 24 },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowImg: { width: 50, height: 50 },
  rowBrand: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  rowName: { fontFamily: fontFamilies.semiBold, fontSize: 15.5, lineHeight: 20, color: colors.ink },
})
