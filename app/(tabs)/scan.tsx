/**
 * ScanScreen — onglet « Décode un produit ».
 *
 * Interface de scan plein écran : un en-tête + le contrôle segmenté ScanSheet
 * (Photo / Code-barres / Recherche / Manuel). Le FAB « Décode » route déjà ici.
 *
 * Après une analyse réussie, on remplace la route courante par la fiche
 * d'analyse (/analyse/[id]) — `replace` pour que le retour ramène à l'onglet
 * scan plutôt qu'à un écran de chargement intermédiaire.
 */

import { type FC, useCallback } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { ScanSheet } from '@/components/scan/ScanSheet'

const ScanScreen: FC = () => {
  const router = useRouter()

  const handleComplete = useCallback(
    (analysisId: string) => {
      router.replace(ROUTES.ANALYSE.DETAIL(analysisId))
    },
    [router],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="default" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Décode un produit</Text>
            <Text style={styles.subtitle}>
              Choisis ta méthode pour analyser une composition en quelques secondes.
            </Text>
          </View>
          <View style={styles.content}>
            <ScanSheet onAnalysisComplete={handleComplete} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
})

export default ScanScreen
