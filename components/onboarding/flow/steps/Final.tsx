/**
 * A19 (alertes) et A20 (montage), les deux derniers écrans du parcours.
 *
 * Alertes : on montre une VRAIE notification d'exemple (les alertes de mélange
 * de la routine existent, `lib/notifications/conflictAlert.ts`) et la boîte du
 * système ne s'ouvre qu'après le oui. Aucune fausse boîte « Autoriser /
 * Refuser » n'est dessinée : Apple refuse les écrans qui imitent le système.
 *
 * Montage : 3 à 4 secondes pendant lesquelles chaque ligne cite une réponse.
 * À la place de l'avis de la maquette, un chiffre vérifiable : on n'affiche
 * aucun témoignage tant qu'on n'a pas de vrais avis, publiés avec accord.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { requestPermission } from '@/lib/notifications/scheduler'
import {
  loadNotifPromptState,
  saveNotifPromptState,
} from '@/lib/notifications/optInStorage'
import { markNotifPromptGranted, markNotifPromptSkipped } from '@/lib/notifications/optInPrompt'
import { CATALOG_SIZE_LABEL, RESTRICTION_OPTIONS, montageLines } from '@/lib/onboarding/content'
import { Sparkle } from '@/components/onboarding/flow/icons'
import { haptic } from '@/lib/haptics'
import { softScaleIn } from '@/components/onboarding/flow/motion'
import {
  Gap,
  PerleBubble,
  PrimaryButton,
  StepLayout,
  TextLink,
  Title,
  selfAnimated,
  useRevealDelay,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const APP_ICON = require('../../../../assets/images/icon.png')
const PERLE_LOUPE = require('../../../../assets/images/onboarding/perle-loupe.webp')
const LAUREL_L = require('../../../../assets/images/onboarding/laurel-left.webp')
const LAUREL_R = require('../../../../assets/images/onboarding/laurel-right.webp')

// ── A19 : alertes ────────────────────────────────────────────────────────

export const NotificationsStep: FC<StepProps> = ({ update, next }) => {
  const [busy, setBusy] = useState(false)

  const enable = async () => {
    if (busy) return
    setBusy(true)
    let granted = false
    try {
      granted = await requestPermission()
      await saveNotifPromptState(markNotifPromptGranted(await loadNotifPromptState()))
    } catch {
      // best-effort : la réponse du système ne doit jamais bloquer le parcours
    }
    if (granted) haptic.success()
    update({ notifications: granted ? 'granted' : 'denied' })
    setBusy(false)
    next()
  }

  const later = async () => {
    try {
      await saveNotifPromptState(markNotifPromptSkipped(await loadNotifPromptState()))
    } catch {
      // idem
    }
    update({ notifications: 'skipped' })
    next()
  }

  return (
    <StepLayout
      footer={
        <>
          <PrimaryButton label="Activer les alertes" iconRight="arrow-forward" onPress={() => void enable()} loading={busy} />
          <TextLink label="Plus tard" onPress={() => void later()} />
        </>
      }
    >
      <PerleBubble>
        Laisse-moi te prévenir. Si deux produits de ta routine ne font pas bon ménage, je te le dis tout de suite.
      </PerleBubble>
      <Gap h={28} />
      <Animated.View entering={FadeInDown.delay(200).duration(420)} style={styles.lock}>
        <Text style={styles.lockTime}>9:41</Text>
        <View style={styles.notif} accessible accessibilityLabel="Exemple de notification : Attention au mélange. Ton sérum au rétinol et ton exfoliant AHA ne vont pas ensemble le même soir.">
          <Image source={APP_ICON} style={styles.notifIcon} contentFit="cover" />
          <View style={styles.flex}>
            <View style={styles.notifHead}>
              <Text style={styles.notifApp}>CosmeCheck</Text>
              <Text style={styles.notifWhen}>maintenant</Text>
            </View>
            <Text style={styles.notifTitle}>Attention au mélange</Text>
            <Text style={styles.notifBody}>
              Ton sérum au rétinol et ton exfoliant AHA ne vont pas ensemble le même soir.
            </Text>
          </View>
        </View>
      </Animated.View>
      <Gap h={18} />
      <Text style={styles.noSpam}>Pas de spam. Juste ce qui compte pour ta peau.</Text>
    </StepLayout>
  )
}

// ── A20 : montage ────────────────────────────────────────────────────────

/** Une étincelle qui scintille, avec son propre rythme. */
const Twinkle: FC<{ size: number; delay: number; style: object }> = ({ size, delay, style }) => {
  const o = useSharedValue(0.25)
  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
          withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        ),
        -1,
      ),
    )
  }, [o, delay])
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.8 + o.value * 0.3 }] }))
  return (
    <Animated.View style={[styles.spark, style, anim]}>
      <Sparkle size={size} color="#FB7185" />
    </Animated.View>
  )
}

/** Perle flotte doucement pendant qu'elle lit. */
const FloatingPerle = selfAnimated<FC>(() => {
  const base = useRevealDelay()
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      ),
      -1,
    )
  }, [y])
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return (
    <Animated.View
      entering={softScaleIn(base, 0.9, 520)}
      style={styles.hero}
    >
      <Animated.View style={[styles.loupeWrap, float]}>
        <Image
          source={PERLE_LOUPE}
          style={styles.loupe}
          contentFit="contain"
          accessibilityLabel="Perle lit une longue liste d'ingrédients à la loupe"
        />
      </Animated.View>
      <Twinkle size={22} delay={0} style={{ top: '6%', left: '8%' }} />
      <Twinkle size={16} delay={450} style={{ top: '14%', right: '12%' }} />
      <Twinkle size={12} delay={900} style={{ bottom: '12%', left: '16%' }} />
    </Animated.View>
  )
})

const LINE_MS = 850

export const MontageStep: FC<StepProps> = ({ draft, next }) => {
  const shorts = draft.restrictions
    .map((k) => RESTRICTION_OPTIONS.find((o) => o.key === k)?.short)
    .filter((s): s is string => Boolean(s))
  const lines = montageLines({ skin: draft.skinTest ?? null, restrictionShorts: shorts })
  const [done, setDone] = useState(0)
  const finished = useRef(false)

  useEffect(() => {
    if (done > 0 && done < lines.length) haptic.tick()
    if (done >= lines.length) {
      if (finished.current) return
      finished.current = true
      haptic.success()
      const t = setTimeout(next, 650)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setDone((d) => d + 1), LINE_MS)
    return () => clearTimeout(t)
  }, [done, lines.length, next])

  return (
    <StepLayout contentStyle={styles.montage}>
      <FloatingPerle />
      <Title size={24}>{'Je règle CosmeCheck\nsur ta peau…'}</Title>
      <Gap h={20} />
      <View style={styles.lines}>
        {lines.map((l, i) => {
          const isDone = i < done
          const isCurrent = i === done
          return (
            <Animated.View key={l} entering={FadeIn.delay(i * 120).duration(300)} style={styles.lineRow}>
              {isDone ? (
                <Animated.View entering={softScaleIn(0, 0.6, 240)} style={styles.checkDot}>
                  <Ionicons name="checkmark" size={18} color={colors.surface} />
                </Animated.View>
              ) : isCurrent ? (
                <View style={styles.spinnerSlot}>
                  <ActivityIndicator color={colors.rose} />
                </View>
              ) : (
                <View style={styles.pendingDot} />
              )}
              <Text style={[styles.lineText, !isDone && !isCurrent && styles.lineTextPending]}>{l}</Text>
            </Animated.View>
          )
        })}
      </View>
      <View style={styles.flexGrow} />
      <View style={styles.proof}>
        <Image source={LAUREL_L} style={styles.laurel} contentFit="contain" />
        <View style={styles.proofCol}>
          <Text style={styles.proofNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {CATALOG_SIZE_LABEL}
              </Text>
          <Text style={styles.proofLabel}>produits déjà décryptés pour toi</Text>
        </View>
        <Image source={LAUREL_R} style={styles.laurel} contentFit="contain" />
      </View>
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1, minHeight: 16 },
  lock: {
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 22,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
  },
  lockTime: { fontFamily: fontFamilies.semiBold, fontSize: 52, color: colors.surface, marginBottom: 16, letterSpacing: -1 },
  notif: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  notifIcon: { width: 38, height: 38, borderRadius: 9 },
  notifHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifApp: { fontFamily: fontFamilies.semiBold, fontSize: 13.5, color: colors.ink },
  notifWhen: { fontFamily: fontFamilies.regular, fontSize: 12.5, color: colors.inkLight },
  notifTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink, marginTop: 2 },
  notifBody: { fontFamily: fontFamilies.regular, fontSize: 14.5, lineHeight: 20, color: colors.ink, marginTop: 1 },
  noSpam: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.inkMuted, textAlign: 'center' },

  montage: { paddingTop: 12 },
  hero: { alignItems: 'center', marginBottom: 8 },
  loupeWrap: { width: '72%', alignItems: 'center' },
  loupe: { width: '100%', aspectRatio: 720 / 726, maxHeight: 280 },
  spark: { position: 'absolute' },
  lines: { gap: 14 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  checkDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerSlot: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pendingDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.roseSoft },
  lineText: { flex: 1, fontFamily: fontFamilies.semiBold, fontSize: 16.5, lineHeight: 22, color: colors.ink },
  lineTextPending: { color: colors.inkLight },
  proof: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20 },
  laurel: { width: 22, height: 50 },
  proofCol: { alignItems: 'center' },
  proofNum: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.ink },
  proofLabel: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
})
