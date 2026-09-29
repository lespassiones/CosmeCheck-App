/**
 * PromesseChooserSheet : feuille « Vérifier une promesse », qui monte du bas.
 *
 * Remplace l'ancienne page /promesses/choisir. Demande COMMENT identifier le
 * produit dont on veut vérifier la promesse :
 *   1. Rechercher le produit        → recherche catalogue (scan mode=search)
 *   2. Scanner le code-barres       → scan code-barres (scan mode=barcode)
 *   3. Choisir dans mon historique  → onglet Historique, liste Analyses
 *   4. Coller la promesse moi-même  → assistant manuel (/promesses/nouvelle)
 *
 * Entrée : fond qui s'assombrit + feuille qui glisse du bas. Sortie : la feuille
 * redescend. La navigation choisie part APRÈS la fermeture complète de la
 * feuille (sur iOS, présenter /promesses/nouvelle pendant qu'une Modal se
 * ferme peut échouer).
 *
 * `returnTo` : écran d'origine, que « Fermer » du scan et le retour de
 * l'historique retrouvent (naviguer vers un onglet retire sinon l'écran
 * d'origine de la pile).
 */
import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { Modal, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { StaggerItem } from '@/components/design/motion'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  visible: boolean
  onClose: () => void
  /** Écran d'origine (ex. ROUTES.TABS.HOME, ROUTES.TABS.PROMESSES). */
  returnTo: string
}

interface Choice {
  key: 'search' | 'barcode' | 'history' | 'paste'
  title: string
  subtitle: string
  icon: keyof typeof Ionicons.glyphMap
}

const CHOICES: Choice[] = [
  { key: 'search', title: 'Rechercher le produit', subtitle: 'Dans notre catalogue', icon: 'search-outline' },
  { key: 'barcode', title: 'Scanner le code-barres', subtitle: 'Avec ta caméra', icon: 'barcode-outline' },
  { key: 'history', title: 'Choisir dans mon historique', subtitle: 'Un produit déjà analysé', icon: 'time-outline' },
  { key: 'paste', title: 'Coller la promesse moi-même', subtitle: 'Le texte marketing du produit', icon: 'document-text-outline' },
]

/** Décalage de départ / d'arrivée de la feuille (hors écran). */
const OFFSCREEN = 800

export const PromesseChooserSheet: FC<Props> = ({ visible, onClose, returnTo }) => {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Compte neuf = aucune analyse -> pas d'option « historique » (rien à y choisir).
  const { data: hasHistory = false } = useQuery<boolean>({
    queryKey: ['has-analyses', userId],
    enabled: visible && Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return false
      const { count, error } = await db()
        .from('analyses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
  const choices = hasHistory ? CHOICES : CHOICES.filter((c) => c.key !== 'history')

  // ── Montage + animations d'entrée / sortie ────────────────────────────────
  const [mounted, setMounted] = useState(visible)
  const pending = useRef<(() => void) | null>(null)
  const translateY = useSharedValue(OFFSCREEN)
  const backdrop = useSharedValue(0)

  const runPending = useCallback(() => {
    const action = pending.current
    pending.current = null
    action?.()
  }, [])

  // Démonte à la fin de la fermeture MÊME interrompue (et par un minuteur de
  // secours) : démonter seulement sur `finished` laissait la Modal transparente
  // montée au-dessus de toute l'app, et son fond n'y pouvait rien (`visible`
  // déjà faux). Même règle que CreditsExhaustedModal.
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const closedRef = useRef(!visible)

  const finishClose = useCallback(() => {
    if (visibleRef.current || closedRef.current) return
    closedRef.current = true
    setMounted(false)
    // iOS : la navigation part dans onDismiss (Modal réellement retirée).
    // Android : pas de conflit de présentation, on enchaîne tout de suite.
    if (Platform.OS !== 'ios') setTimeout(runPending, 0)
    else setTimeout(runPending, 450) // filet si onDismiss ne venait pas
  }, [runPending])

  useEffect(() => {
    if (visible) {
      closedRef.current = false
      setMounted(true)
      backdrop.value = withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System })
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      })
    } else {
      backdrop.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System })
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 240, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System },
        () => {
          runOnJS(finishClose)()
        },
      )
      const fallback = setTimeout(finishClose, 340)
      return () => clearTimeout(fallback)
    }
    return undefined
  }, [visible, backdrop, translateY, finishClose])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))

  const choose = (key: Choice['key']) => {
    pending.current = () => {
      switch (key) {
        case 'search':
        case 'barcode':
          router.push({ pathname: ROUTES.TABS.SCAN, params: { mode: key, returnTo } })
          return
        case 'history':
          router.push({ pathname: ROUTES.TABS.HISTORY, params: { tab: 'analyses', returnTo } })
          return
        case 'paste':
          router.push(ROUTES.PROMESSES.NOUVELLE as Href)
          return
      }
    }
    onClose()
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={runPending}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            haptic="none"
            pressScale={false}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }, sheetStyle]}
        >
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            Vérifier une promesse
          </Text>
          <Text style={styles.subtitle}>
            Compare ce que promet l’emballage avec la vraie formule.
          </Text>

          <View style={styles.card}>
            {choices.map((c, i) => (
              <StaggerItem key={c.key} index={i}>
                <Pressable
                  onPress={() => choose(c.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.title}, ${c.subtitle}`}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Ionicons name={c.icon} size={26} color={colors.ink} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{c.title}</Text>
                    <Text style={styles.rowSub}>{c.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.ink} />
                </Pressable>
              </StaggerItem>
            ))}
          </View>

          <Text style={styles.footnote}>
            La vérification automatique utilise jusqu’à 3 crédits.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray300,
    marginBottom: spacing.lg,
  },
  title: { fontFamily: fontFamilies.bold, fontSize: 26, lineHeight: 32, color: colors.ink },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.gray50 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  rowSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 2,
  },
  footnote: {
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    color: colors.inkMuted,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
})
