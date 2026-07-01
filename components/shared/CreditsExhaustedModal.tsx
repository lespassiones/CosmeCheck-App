/**
 * CreditsExhaustedModal — modale « Crédits épuisés », équivalent RN du
 * composant web `CreditsExhaustedModal.tsx`.
 *
 * S'affiche quand l'utilisateur a consommé tous ses crédits du jour (429 des
 * Edge Functions). Pilotée par le store zustand `useExhaustedStore`, qui
 * s'abonne lui-même au DeviceEventEmitter 'cosmecheck:credits-exhausted' : le
 * hook d'analyse (WS2) peut donc déclencher la modale sans import dur.
 *
 * UX (ton FR repris du web) :
 *   - overlay centré semi-transparent (tap backdrop = fermer) ;
 *   - carte glassmorphique (GlassCard) avec icône d'alerte rose ;
 *   - titre « Crédits épuisés » + info used/limit du payload ;
 *   - CTA primaire dégradé « Découvrir Premium » → route /offre ;
 *   - lien secondaire « Plus tard » qui ramène au dashboard.
 *
 * Montée une seule fois au niveau racine (voir app/_layout.tsx).
 */

import type { FC } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'

import { GlassCard } from '@/components/design/GlassCard'
import { colors } from '@/constants/colors'
import { gradients } from '@/constants/gradients'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useExhaustedStore } from '@/lib/credits/exhaustedStore'

export const CreditsExhaustedModal: FC = () => {
  const router = useRouter()
  const open = useExhaustedStore((s) => s.open)
  const payload = useExhaustedStore((s) => s.payload)
  const hide = useExhaustedStore((s) => s.hide)

  const limit = payload.limit ?? 100

  // « Plus tard » / tap backdrop : on FERME simplement la modale et on reste
  // EXACTEMENT là où l'utilisateur était (on ne le renvoie plus au dashboard).
  // « Découvrir Premium » fait un push vers /offre → un retour arrière le ramène
  // pile sur cet écran.
  const close = () => {
    hide()
  }

  const goPremium = () => {
    Haptics.selectionAsync().catch(() => {})
    hide()
    router.push(ROUTES.OFFRE.INDEX)
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        {/* stopPropagation : un tap sur la carte ne ferme pas la modale */}
        <Pressable onPress={() => {}}>
          <GlassCard
            opacity={0.96}
            blurIntensity={28}
            borderRadius={radius.card}
            padding={spacing.xl}
            style={styles.card}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle" size={28} color={colors.rose} />
            </View>

            <Text style={styles.title} allowFontScaling={false}>
              Crédits épuisés
            </Text>

            <Text style={styles.subtitle} allowFontScaling={false}>
              Tu as utilisé tes {limit} crédits du jour
            </Text>

            <Text style={styles.body} allowFontScaling={false}>
              Reviens demain pour de nouveaux crédits, ou passe Premium pour des
              analyses illimitées.
            </Text>

            <Pressable
              onPress={goPremium}
              style={({ pressed }) => [
                styles.primaryWrap,
                pressed && { opacity: 0.9 },
              ]}
            >
              <LinearGradient
                colors={[...gradients.darkGlass.colors]}
                start={gradients.darkGlass.start}
                end={gradients.darkGlass.end}
                style={styles.primaryBtn}
              >
                <Ionicons name="sparkles" size={16} color={colors.surface} />
                <Text style={styles.primaryLabel} allowFontScaling={false}>
                  Découvrir Premium
                </Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={close}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.secondaryLabel} allowFontScaling={false}>
                Plus tard
              </Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.20)',
  },
  title: {
    textAlign: 'center',
    fontFamily: fontFamilies.bold,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  body: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
  },
  primaryWrap: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  primaryLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    letterSpacing: 0.1,
    color: colors.surface,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.inkMuted,
  },
})
