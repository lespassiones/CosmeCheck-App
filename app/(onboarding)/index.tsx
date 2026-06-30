/**
 * OnboardingScreen — hôte plein écran du questionnaire profil (micro-étapes).
 *
 * Layout pleine hauteur : le wizard gère lui-même son header (progression +
 * titre), son corps scrollable et sa nav fixe en bas. Fond crème + glow léger,
 * SafeAreaView + KeyboardAvoidingView pour les écrans à saisie libre.
 */

import { type FC } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

const OnboardingScreen: FC = () => (
  <View style={styles.root}>
    <BackgroundGlow variant="minimal" />
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <OnboardingWizard />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>
)

export default OnboardingScreen

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
  },
})
