/**
 * PreOnboardingCarousel — carrousel de présentation au tout premier lancement.
 *
 * 4 illustrations plein écran (assets/images/PreOnboarding/ecran{1..4}.webp), les
 * titres/sous-titres étant DÉJÀ intégrés dans les images. On superpose seulement
 * les contrôles de navigation en bas (pastilles + bouton « Suivant », puis CTA
 * « Commencer » sur le dernier écran) et un « Passer » en haut à droite.
 *
 * Au « Commencer » / « Passer » : on marque le pré-onboarding comme vu (flag
 * device-level) puis on route vers l'inscription. L'AuthGuard prend le relais.
 */

import { useCallback, useRef, useState, type FC } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { markPreOnboardingDone } from '@/lib/storage/preOnboarding'

// require() renvoie un id d'asset (number) côté RN. Chemins relatifs pour rester
// robuste quel que soit le réglage d'alias du bundler.
const SLIDES = [
  require('../../assets/images/PreOnboarding/ecran1.webp'),
  require('../../assets/images/PreOnboarding/ecran2.webp'),
  require('../../assets/images/PreOnboarding/ecran3.webp'),
  require('../../assets/images/PreOnboarding/ecran4.webp'),
] as number[]

export const PreOnboardingCarousel: FC = () => {
  const router = useRouter()
  const { width, height } = useWindowDimensions()
  const listRef = useRef<FlatList<number>>(null)
  const [index, setIndex] = useState(0)
  const isLast = index === SLIDES.length - 1

  const finish = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    void markPreOnboardingDone()
    router.replace(ROUTES.AUTH.SIGN_UP)
  }, [router])

  const goNext = useCallback(() => {
    if (isLast) {
      finish()
      return
    }
    const next = index + 1
    Haptics.selectionAsync().catch(() => {})
    listRef.current?.scrollToIndex({ index: next, animated: true })
    setIndex(next)
  }, [index, isLast, finish])

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width)
      if (i !== index) setIndex(i)
    },
    [index, width],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<number>) => (
      <Image
        source={item}
        style={{ width, height, backgroundColor: colors.surface }}
        contentFit="cover"
        transition={150}
      />
    ),
    [width, height],
  )

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        renderItem={renderItem}
        keyExtractor={(_, i) => `slide-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={StyleSheet.absoluteFill}
      />

      {/* « Passer » en haut à droite (caché sur le dernier écran) */}
      <SafeAreaView style={styles.skipWrap} edges={['top']} pointerEvents="box-none">
        {!isLast && (
          <Pressable
            onPress={finish}
            hitSlop={10}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Passer l'introduction"
          >
            <Text style={styles.skipText}>Passer</Text>
          </Pressable>
        )}
      </SafeAreaView>

      {/* Contrôles en bas : pastilles + bouton */}
      <SafeAreaView style={styles.bottomWrap} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Commencer' : 'Écran suivant'}
        >
          <Text style={styles.ctaText}>{isLast ? 'Commencer' : 'Suivant'}</Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color={colors.surface} />}
        </Pressable>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  skipWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  skip: {
    margin: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  skipText: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  bottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.base,
    gap: spacing.base,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.gray300,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.rose,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 54,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaPressed: {
    backgroundColor: colors.successDeep,
  },
  ctaText: {
    ...typography.button,
    color: colors.surface,
  },
})
