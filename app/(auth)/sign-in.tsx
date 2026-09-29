/**
 * SignInScreen (A24) : « Te revoilà ! ».
 *
 * Apple (iPhone) et Google en haut, puis l'e-mail. On y arrive depuis
 * l'accroche (« Se connecter »), depuis l'écran de compte (« J'ai déjà un
 * compte ») ou depuis l'inscription.
 */

import { type FC, useCallback } from 'react'
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
import { useAndroidBack } from '@/hooks/useAndroidBack'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { SignInForm } from '@/components/auth/SignInForm'
import { ProviderButtons } from '@/components/auth/AuthProviders'
import { FLOW_MAX_WIDTH } from '@/components/onboarding/flow/ui'

const SignInScreen: FC = () => {
  const insets = useSafeAreaInsets()
  // Clavier : le formulaire remonte et garde le champ actif ET le bouton en vue.
  const { scrollRef, keyboardHeight, onScroll, onContentSizeChange } = useKeyboardAwareScroll(120)
  // Retour Android sans écran dessous (ouverte par replace depuis les accroches) :
  // retour aux accroches, comme le bouton à l'écran, au lieu de fermer l'app.
  useAndroidBack(
    useCallback(() => {
      if (router.canGoBack()) return false
      router.replace(ROUTES.PREONBOARDING.INDEX)
      return true
    }, []),
  )
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
            // Sans écran dessous (ouverte par replace depuis les accroches du
            // parcours invité) : retour aux accroches, pas à « On garde tout ça ? ».
            onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.PREONBOARDING.INDEX))}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Te revoilà !
          </Text>
          <Text style={styles.subtitle}>Connecte-toi pour retrouver ta carte de peau.</Text>

          <ProviderButtons />
          <View style={styles.or}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>ou</Text>
            <View style={styles.orLine} />
          </View>
          <SignInForm />

          <Text style={styles.switch}>
            Pas encore de compte ?{' '}
            <Text style={styles.switchLink} onPress={() => router.replace(ROUTES.AUTH.SIGN_UP)} accessibilityRole="link">
              Créer un compte
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  </SafeAreaView>
  )
}

export default SignInScreen

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
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.inkLight },
  switch: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.inkMuted, textAlign: 'center', marginTop: 22 },
  switchLink: { color: colors.rose, fontFamily: fontFamilies.semiBold, textDecorationLine: 'underline' },
})
