/**
 * ObjectivesScreen — édition dédiée des objectifs beauté (/profile/objectives).
 *
 * Page ciblée (créée pour le CTA « Remplis tes objectifs » du bloc Couverture) :
 * réutilise le sélecteur d'objectifs de l'onboarding (Step3Goals : chips par
 * groupe Visage/Corps/Cheveux/Routine + champ « Autre »), avec sauvegarde via
 * useProfile().saveSkin (merge non destructif de preferences.skin).
 */

import { type FC, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import type { SkinProfile } from '@/lib/skin/profile'
import { useProfile } from '@/hooks/useProfile'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { Step3Goals } from '@/components/onboarding/Step3Goals'

const ObjectivesScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { skin, saveSkin } = useProfile()
  const [isSaving, setIsSaving] = useState(false)

  // Brouillon local initialisé depuis le profil (objectifs + « Autre »).
  const [draft, setDraft] = useState<SkinProfile>(() => ({
    goals: skin.goals ?? [],
    otherGoals: skin.otherGoals ?? '',
  }))

  const onChange = (patch: Partial<SkinProfile>) => setDraft((prev) => ({ ...prev, ...patch }))

  const count = useMemo(
    () => (draft.goals?.length ?? 0) + (draft.otherGoals?.trim() ? 1 : 0),
    [draft.goals, draft.otherGoals],
  )

  const save = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await saveSkin({ goals: draft.goals ?? [], otherGoals: draft.otherGoals ?? '' })
      router.back()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Mes objectifs</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Entrée douce du sélecteur d'objectifs. */}
          <Reveal>
            <Step3Goals value={draft} onChange={onChange} />
          </Reveal>
        </ScrollView>

        {/* CTA sticky en bas */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
            onPress={save}
            disabled={isSaving}
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>
                Enregistrer {count > 0 ? `(${count})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h4, color: colors.ink },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.base },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  saveBtn: {
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: { backgroundColor: colors.roseDeep },
  saveBtnText: { ...typography.button, color: '#FFFFFF' },
})

export default ObjectivesScreen
