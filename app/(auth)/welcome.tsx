/**
 * WelcomeScreen (A22) : « On garde tout ça ? ».
 *
 * Écran de compte de l'onboarding « Le diagnostic de Perle ». On y arrive en
 * fin de parcours invité : la carte de peau est construite, on propose de la
 * garder (Apple sur iPhone, Google, e-mail). Les réponses sont écrites dans le
 * profil juste après l'inscription par `OnboardingDraftFlusher`, puis le guard
 * enchaîne vers le paywall.
 *
 * On y arrive aussi sans parcours (après une déconnexion) : le texte devient
 * alors un simple accueil, sans parler d'une carte qui n'existe pas.
 */

import { useState, useSyncExternalStore, type FC } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { getDraft, subscribeDraft } from '@/lib/onboarding/draft'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { PillButton, ProviderButtons } from '@/components/auth/AuthProviders'
import { FLOW_MAX_WIDTH } from '@/components/onboarding/flow/ui'

const PERLE_CARTE = require('../../assets/images/onboarding/perle-carte.webp')

const WelcomeScreen: FC = () => {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)
  const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft)
  const hasCard = Boolean(draft?.completed)
  const purchased = Boolean(draft?.purchased)
  const name = draft?.firstName?.trim()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
            <Image
              source={PERLE_CARTE}
              style={styles.perle}
              contentFit="contain"
              accessibilityLabel="Perle serre contre elle sa carte de peau"
            />
          </Animated.View>
          <Text style={styles.title} accessibilityRole="header">
            {hasCard ? 'On garde tout ça ?' : 'Bienvenue sur CosmeCheck'}
          </Text>
          <Text style={styles.subtitle}>
            {purchased
              ? `Ton essai Premium est activé${name ? `, ${name}` : ''}. Crée ton compte pour le garder avec ta carte de peau.`
              : hasCard
                ? `Ta carte de peau t'attend${name ? `, ${name}` : ''}.`
                : 'Connecte-toi pour retrouver tes analyses et ta routine.'}
          </Text>

          <View style={styles.buttons}>
            <ProviderButtons />
            <PillButton
              variant="light"
              label="Continuer avec mon e-mail"
              logo={<Ionicons name="mail-outline" size={22} color={colors.rose} />}
              onPress={() => router.push(ROUTES.AUTH.SIGN_UP)}
            />
          </View>

          <Text style={styles.already} onPress={() => router.push(ROUTES.AUTH.SIGN_IN)} accessibilityRole="link">
            J'ai déjà un compte
          </Text>

          <Text style={styles.legal}>
            En continuant, tu acceptes les{' '}
            <Text style={styles.legalLink} onPress={() => setLegalDoc('cgu')}>
              Conditions d'utilisation
            </Text>{' '}
            et la{' '}
            <Text style={styles.legalLink} onPress={() => setLegalDoc('privacy')}>
              Politique de confidentialité
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </SafeAreaView>
  )
}

export default WelcomeScreen

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20 },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: 18 },
  perle: { width: '62%', aspectRatio: 720 / 942, maxHeight: 300 },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  buttons: { gap: 12, marginTop: 26 },
  already: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.rose,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 20,
    paddingVertical: 6,
  },
  legal: {
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: 14,
  },
  legalLink: { textDecorationLine: 'underline', color: colors.inkMuted },
})
