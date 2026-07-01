/**
 * TipCarousel — « Astuce du jour » en carrousel paginé horizontalement.
 *
 * Twin RN du web (CosmetWiki components/home/TipCarousel.tsx) :
 *  - en-tête « Astuce du jour » (violet) + compteur « i / total » tabular-nums,
 *  - astuce courante + illustration potion.webp (à droite), pagination dots,
 *  - autorotation ~10 s, pause au toucher (reprise après ~2 s),
 *  - dots cliquables (max 8 affichés, « … » au-delà) + flèches préc/suiv.
 *
 * Le tout posé sur une NeuCard (surface neumorphique, comme `.neu` du web).
 * Respecte reduce-motion : l'autorotation reste (ce n'est pas une animation
 * de mouvement perçue comme gênante), mais on désactive le défilement animé du
 * ScrollView si reduce-motion est actif.
 */

import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'

const AUTO_ROTATE_MS = 10_000
const RESUME_DELAY_MS = 2_000
const MAX_DOTS = 8

const POTION = require('@/assets/images/potion.webp')

interface Props {
  tips: string[]
}

export const TipCarousel: FC<Props> = ({ tips }) => {
  const total = tips.length

  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [width, setWidth] = useState(0)
  const reduceMotionRef = useRef(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (active) reduceMotionRef.current = rm
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const goTo = useCallback(
    (next: number, animated = true) => {
      if (total === 0 || width === 0) return
      const clamped = ((next % total) + total) % total
      setIndex(clamped)
      scrollRef.current?.scrollTo({
        x: clamped * width,
        animated: animated && !reduceMotionRef.current,
      })
    },
    [total, width],
  )

  // Autorotation toutes les 10 s, en pause si l'utilisateur interagit.
  useEffect(() => {
    if (paused || total <= 1 || width === 0) return
    const t = setTimeout(() => goTo(index + 1), AUTO_ROTATE_MS)
    return () => clearTimeout(t)
  }, [index, paused, total, width, goTo])

  // Nettoyage du timer de reprise au démontage.
  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    },
    [],
  )

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width)
  }, [])

  const onScrollBeginDrag = useCallback(() => {
    setPaused(true)
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
  }, [])

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width === 0) return
      const i = Math.round(e.nativeEvent.contentOffset.x / width)
      setIndex(((i % total) + total) % total)
      // Reprise différée pour laisser le temps de lire.
      resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY_MS)
    },
    [width, total],
  )

  if (total === 0) return null

  const dotsToShow = Math.min(total, MAX_DOTS)

  return (
    <WhiteCard style={styles.card} padding={spacing.base}>
      {/* En-tête */}
      <View style={styles.head}>
        <Text style={styles.kicker}>Astuce du jour</Text>
        <Text style={styles.counter}>
          {index + 1} / {total}
        </Text>
      </View>

      {/* Astuce + illustration */}
      <View style={styles.row}>
        <View style={styles.viewport} onLayout={onLayout}>
          {width > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScrollBeginDrag={onScrollBeginDrag}
              onMomentumScrollEnd={onMomentumEnd}
              scrollEventThrottle={16}
            >
              {tips.map((tip, i) => (
                <View key={i} style={[styles.slide, { width }]}>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        <Image source={POTION} style={styles.potion} resizeMode="contain" />
      </View>

      {/* Pagination + flèches */}
      {total > 1 && (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Astuce précédente"
            onPress={() => {
              setPaused(true)
              goTo(index - 1)
            }}
            style={styles.arrow}
          >
            <Ionicons name="chevron-back" size={16} color={colors.accentDeep} />
          </Pressable>

          <View style={styles.dots}>
            {tips.slice(0, dotsToShow).map((_, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Voir astuce ${i + 1}`}
                hitSlop={6}
                onPress={() => {
                  setPaused(true)
                  goTo(i)
                }}
                style={[i === index ? styles.dotActive : styles.dot]}
              />
            ))}
            {total > MAX_DOTS && <Text style={styles.dotsMore}>…</Text>}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Astuce suivante"
            onPress={() => {
              setPaused(true)
              goTo(index + 1)
            }}
            style={styles.arrow}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.accentDeep} />
          </Pressable>
        </View>
      )}
    </WhiteCard>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kicker: {
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#7C3AED', // violet-600
  },
  counter: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    color: 'rgba(109,40,217,0.7)', // violet-700/70
    fontVariant: ['tabular-nums'],
  },
  row: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  viewport: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    justifyContent: 'center',
  },
  slide: {
    justifyContent: 'center',
    paddingRight: spacing.xs,
  },
  tipText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'justify',
  },
  potion: {
    width: 64,
    height: 64,
    flexShrink: 0,
  },
  controls: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(196,181,253,0.7)', // violet-300/70
  },
  dotActive: {
    width: 16,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8B5CF6', // violet-500
  },
  dotsMore: {
    fontSize: 10,
    color: 'rgba(167,139,250,0.8)',
    marginLeft: 4,
  },
})
