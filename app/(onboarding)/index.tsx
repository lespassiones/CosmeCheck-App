/**
 * OnboardingScreen — écran plein écran qui accueille le questionnaire.
 *
 * Fond crème (colors.bg) + BackgroundGlow, titre « Bienvenue {firstName} ✨ »,
 * puis le wizard 3 étapes. SafeAreaView + KeyboardAvoidingView + ScrollView
 * pour que les champs texte restent visibles quand le clavier s'ouvre.
 */

import { type FC } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useProfile } from '@/hooks/useProfile'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

const OnboardingScreen: FC = () => {
  const { firstName } = useProfile()

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="default" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.welcome}>
                Bienvenue {firstName ? `${firstName} ` : ''}✨
              </Text>
              <Text style={styles.subtitle}>
                Trois étapes rapides pour personnaliser tes analyses.
              </Text>
            </View>

            <OnboardingWizard />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing.xl,
  },
  welcome: {
    ...typography.h1,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
  },
})
