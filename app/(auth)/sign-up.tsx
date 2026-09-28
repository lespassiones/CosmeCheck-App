/**
 * SignUpScreen (A23) : « Crée ton compte ».
 *
 * Les connexions Apple et Google vivent sur l'écran précédent (welcome) : ici,
 * seulement l'e-mail. Le prénom vient du parcours d'onboarding s'il existe.
 */

import { useSyncExternalStore, type FC } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { keyboardPadding, useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { getDraft, subscribeDraft } from '@/lib/onboarding/draft'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { FLOW_MAX_WIDTH } from '@/components/onboarding/flow/ui'

const SignUpScreen: FC = () => {
  const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft)
  const name = draft?.firstName?.trim()
  const hasCard = Boolean(draft?.completed)
  const insets = useSafeAreaInsets()
  // Clavier : le formulaire remonte et garde le champ actif ET le bouton en vue.
  const { scrollRef, keyboardHeight, onScroll, onContentSizeChange } = useKeyboardAwareScroll(140)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.flex, keyboardHeight > 0 && { paddingBottom: keyboardPadding(keyboardHeight, insets.bottom, true) }]}>
        <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.column}>
            <Pressable
              hitSlop={8}
              onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.AUTH.WELCOME))}
              accessibilityRole="button"
              accessibilityLabel="Retour"
              style={styles.back}
            >
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              Crée ton compte
            </Text>
            <Text style={styles.subtitle}>
              {hasCard ? 'Une minute, et ta carte de peau est sauvegardée.' : 'Une minute, et CosmeCheck est à toi.'}
            </Text>
            <SignUpForm knownFirstName={name} />
            <Text style={styles.switch}>
              Déjà un compte ?{' '}
              <Text style={styles.switchLink} onPress={() => router.replace(ROUTES.AUTH.SIGN_IN)} accessibilityRole="link">
                Me connecter
              </Text>
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

export default SignUpScreen

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28 },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: fontFamilies.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: colors.ink },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: 24,
  },
  switch: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.inkMuted, textAlign: 'center', marginTop: 18 },
  switchLink: { color: colors.rose, fontFamily: fontFamilies.semiBold, textDecorationLine: 'underline' },
})
