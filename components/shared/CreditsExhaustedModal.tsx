/**
 * CreditsExhaustedModal : feuille « Plus de crédits aujourd'hui », qui monte
 * du bas de l'écran quand une fonction IA est refusée faute de crédits.
 *
 * Refonte du 28/09/2026 (maquette validée) : poignée, éclair barré, titre,
 * deux lignes (« Tes 5 crédits reviennent à 2 h. » / « Premium en donne 50 par
 * jour. »), bouton noir « Voir Premium », « Plus tard ». Remplace l'ancienne
 * carte centrée, qui promettait des « analyses illimitées » (faux).
 *
 *   - Chiffres LUS, jamais écrits : quota de la personne (payload du 429, sinon
 *     `useCredits`), quota Premium dans `credit_tiers` (`useCreditTiers`).
 *   - Heure de retour réelle : minuit UTC converti en heure locale
 *     (`lib/credits/resetLabel.ts`).
 *   - Membre Premium : pas d'upsell, un simple « Compris ».
 *   - Fermeture : « Plus tard », tap sur le fond, retour Android, ou glisser la
 *     feuille vers le bas. On reste sur l'écran en cours.
 *   - Motion : timings seulement (pas de ressort), ReduceMotion.System.
 *
 * Pilotée par `useExhaustedStore` (lib/credits/exhaustedStore.ts), qui écoute
 * l'évènement 'cosmecheck:credits-exhausted'. Montée une fois à la racine
 * (app/_layout.tsx).
 */

import { useEffect, useState, type FC } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
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
import { useCredits } from '@/hooks/useCredits'
import { periodLabel, useCreditTiers } from '@/hooks/useCreditTiers'
import { useProfile } from '@/hooks/useProfile'
import { haptic } from '@/lib/haptics'
import { creditsResetLabel } from '@/lib/credits/resetLabel'
import { useExhaustedStore } from '@/lib/credits/exhaustedStore'

/** Hors écran : assez pour cacher la feuille, quelle que soit sa hauteur. */
const HIDDEN_Y = 520
const OPEN = { duration: 280, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }
const DISMISS_DISTANCE = 90
const DISMISS_VELOCITY = 900

export const CreditsExhaustedModal: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const open = useExhaustedStore((s) => s.open)
  const payload = useExhaustedStore((s) => s.payload)
  const hide = useExhaustedStore((s) => s.hide)
  const { limit: myLimit } = useCredits()
  const { data: tiers } = useCreditTiers()
  const { profile } = useProfile()
  const isPremium = profile?.tier === 'premium'

  // Gardée montée le temps de l'animation de fermeture.
  const [mounted, setMounted] = useState(false)
  const translateY = useSharedValue(HIDDEN_Y)
  const backdrop = useSharedValue(0)

  useEffect(() => {
    if (open) {
      setMounted(true)
      haptic.warning()
      // La pastille crédits doit afficher 0 dès maintenant.
      void queryClient.invalidateQueries({ queryKey: ['credits'] })
      translateY.value = HIDDEN_Y
      backdrop.value = withTiming(1, OPEN)
      translateY.value = withTiming(0, OPEN)
    } else if (mounted) {
      backdrop.value = withTiming(0, CLOSE)
      // Démonter seulement si la fermeture est allée au bout (pas si on rouvre).
      translateY.value = withTiming(HIDDEN_Y, CLOSE, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const myTier = isPremium ? tiers?.premium : tiers?.free
  const quota = payload.limit ?? (myLimit > 0 ? myLimit : myTier?.amount ?? null)
  const period = myTier?.period ?? 'daily'
  const resetsAt = creditsResetLabel(period)
  const premium = tiers?.premium

  const title = period === 'daily' ? "Plus de crédits aujourd'hui" : 'Plus de crédits pour le moment'
  const backLine =
    quota && resetsAt
      ? `Tes ${quota} crédits reviennent ${resetsAt}.`
      : resetsAt
        ? `Tes crédits reviennent ${resetsAt}.`
        : 'Tes crédits reviennent à la prochaine période.'
  const premiumPer = premium ? periodLabel(premium.period) : ''
  const premiumLine =
    !isPremium && premium ? `Premium en donne ${premium.amount}${premiumPer ? ` ${premiumPer}` : ''}.` : null

  const close = () => hide()

  const goPremium = () => {
    haptic.press()
    hide()
    router.push(ROUTES.OFFRE.INDEX)
  }

  // Glisser la feuille vers le bas pour la fermer.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY)
    })
    .onEnd((e) => {
      if (translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(hide)()
      } else {
        translateY.value = withTiming(0, OPEN)
      }
    })

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))

  if (!mounted) return null

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            haptic="none"
            pressScale={false}
            accessibilityLabel="Fermer"
          />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }, sheetStyle]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />

            <Feather name="zap-off" size={44} color={colors.ink} style={styles.icon} />

            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.body}>
              {backLine}
              {premiumLine ? `\n${premiumLine}` : ''}
            </Text>

            <Pressable
              onPress={isPremium ? close : goPremium}
              haptic={isPremium ? 'secondary' : 'none'}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>{isPremium ? 'Compris' : 'Voir Premium'}</Text>
            </Pressable>

            {!isPremium ? (
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.secondaryLabel}>Plus tard</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
    boxShadow: '0px -8px 24px rgba(15, 23, 42, 0.18)',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray300,
    marginBottom: spacing.xl,
  },
  icon: { marginBottom: spacing.lg },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  primary: {
    alignSelf: 'stretch',
    height: 54,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  primaryLabel: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.surface },
  secondary: { paddingVertical: spacing.md, marginTop: spacing.xs },
  secondaryLabel: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  pressed: { opacity: 0.7 },
})
