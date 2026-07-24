/**
 * BeautyProfileScreen — édition CIBLÉE d'une section du profil (peau OU cheveux),
 * ouverte depuis la carte « Score de compatibilité » quand la section manque
 * (`?section=skin|hair`). On NE passe PAS par l'onboarding : un utilisateur déjà
 * onboardé y serait immédiatement rejeté par l'AuthGuard (resolveAuthRoute règle
 * 6). Ce screen vit dans le groupe `profile` (comme /profile/restrictions), donc
 * aucun rebond. « Enregistrer » persiste via saveSkin puis revient AU PRODUIT
 * (router.back) → l'utilisateur n'a plus qu'à toucher « Recharger » sur la carte.
 *
 * Miroir du web (app/profile/beauty + BeautyProfileForm).
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { PressableScale } from '@/components/design/motion'
import { MultiSelectStep, SingleSelectStep } from '@/components/onboarding/OnboardingControls'
import { useProfile } from '@/hooks/useProfile'
import {
  HAIR_CONCERNS,
  HAIR_CONCERN_LABEL,
  SKIN_CONCERNS,
  SKIN_CONCERN_LABEL,
  SKIN_TYPES_BODY,
  SKIN_TYPES_FACE,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
  type HairConcern,
  type SkinConcern,
  type SkinProfile,
  type SkinTypeBody,
  type SkinTypeFace,
} from '@/lib/skin/profile'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'

type Section = 'skin' | 'hair'

const toggle = <T,>(arr: T[], key: T): T[] =>
  arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]

const BeautyProfileScreen: FC = () => {
  const router = useRouter()
  const { section: rawSection } = useLocalSearchParams<{ section?: string }>()
  const section: Section = rawSection === 'hair' ? 'hair' : 'skin'
  const { skin, saveSkin } = useProfile()

  const [face, setFace] = useState<SkinTypeFace | undefined>(skin.skinTypeFace)
  const [body, setBody] = useState<SkinTypeBody | undefined>(skin.skinTypeBody)
  const [concerns, setConcerns] = useState<SkinConcern[]>(skin.concerns ?? [])
  const [hairConcerns, setHairConcerns] = useState<HairConcern[]>(skin.hairConcerns ?? [])
  const [saving, setSaving] = useState(false)

  // Hydrate une seule fois quand le profil distant arrive (cas édition).
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    if (skin && Object.keys(skin).length > 0) {
      setFace(skin.skinTypeFace)
      setBody(skin.skinTypeBody)
      setConcerns(skin.concerns ?? [])
      setHairConcerns(skin.hairConcerns ?? [])
      hydratedRef.current = true
    }
  }, [skin])

  const canSave =
    section === 'hair'
      ? hairConcerns.length > 0
      : Boolean(face) || Boolean(body) || concerns.length > 0

  const onSave = useCallback(() => {
    if (saving) return
    setSaving(true)
    const patch: Partial<SkinProfile> =
      section === 'hair'
        ? { hairConcerns }
        : { skinTypeFace: face, skinTypeBody: body, concerns }
    void saveSkin(patch)
      .then(() => router.back())
      .catch(() => setSaving(false))
  }, [saving, section, hairConcerns, face, body, concerns, saveSkin, router])

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header : retour + titre */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {section === 'hair' ? 'Tes cheveux' : 'Ta peau'}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Entrée douce : sous-titre puis chaque bloc, en fondu échelonné.
              Les blocs sont des enfants DIRECTS de Reveal (pas de fragment)
              pour que le stagger s'applique bloc par bloc. */}
          <Reveal stagger={70} style={styles.revealStack}>
            <Text style={styles.subtitle}>
              {section === 'hair'
                ? 'Renseigne tes cheveux pour débloquer ta compatibilité avec les produits capillaires.'
                : 'Renseigne ta peau pour débloquer ta compatibilité avec les produits visage et corps.'}
            </Text>

            {section === 'hair' ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Comment sont tes cheveux ?</Text>
                <MultiSelectStep
                  tone="violet"
                  options={HAIR_CONCERNS.map((k) => ({ key: k, label: HAIR_CONCERN_LABEL[k] }))}
                  values={hairConcerns}
                  onToggle={(key) => setHairConcerns((prev) => toggle(prev, key as HairConcern))}
                />
              </View>
            ) : null}

            {section !== 'hair' ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Ton type de peau au visage ?</Text>
                <SingleSelectStep
                  tone="violet"
                  options={SKIN_TYPES_FACE.map((k) => ({ key: k, label: SKIN_TYPE_FACE_LABEL[k] }))}
                  selectedKey={face}
                  onPickKey={(key) =>
                    setFace((prev) => (prev === key ? undefined : (key as SkinTypeFace)))
                  }
                />
              </View>
            ) : null}
            {section !== 'hair' ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Et la peau de ton corps ?</Text>
                <SingleSelectStep
                  tone="violet"
                  options={SKIN_TYPES_BODY.map((k) => ({ key: k, label: SKIN_TYPE_BODY_LABEL[k] }))}
                  selectedKey={body}
                  onPickKey={(key) =>
                    setBody((prev) => (prev === key ? undefined : (key as SkinTypeBody)))
                  }
                />
              </View>
            ) : null}
            {section !== 'hair' ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Tes préoccupations (optionnel)</Text>
                <MultiSelectStep
                  tone="violet"
                  options={SKIN_CONCERNS.map((k) => ({ key: k, label: SKIN_CONCERN_LABEL[k] }))}
                  values={concerns}
                  onToggle={(key) => setConcerns((prev) => toggle(prev, key as SkinConcern))}
                />
              </View>
            ) : null}
          </Reveal>
        </ScrollView>

        {/* Barre d'action fixe */}
        <View style={styles.footer}>
          {/* Feedback d'appui à ressort (remplace l'opacité pressed). */}
          <PressableScale
            onPress={onSave}
            disabled={!canSave || saving}
            accessibilityRole="button"
            style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.saveText}>Enregistrer et revenir</Text>
            )}
          </PressableScale>
        </View>
      </SafeAreaView>
    </View>
  )
}

export default BeautyProfileScreen

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
  headerTitle: { fontFamily: fontFamilies.bold, fontSize: 18, color: colors.ink },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  // Reveal devient l'unique enfant du ScrollView : on y reporte le gap.
  revealStack: { gap: spacing.lg },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  block: { gap: spacing.md },
  blockLabel: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    backgroundColor: colors.bg,
  },
  saveBtn: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: colors.gray300 },
  saveText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.surface },
})
