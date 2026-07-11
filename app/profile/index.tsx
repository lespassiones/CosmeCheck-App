/**
 * ProfileScreen — profil utilisateur.
 *
 * Vue : avatar, prénom + email, badge abonnement, carte profil beauté
 * (SkinProfileCard) éditable (BeautyProfileForm), liens (restrictions,
 * premium), déconnexion et suppression de compte (requis App Store).
 *
 * Le profil beauté est persisté dans user_profiles.preferences.skin via
 * useProfile().saveSkin (merge non destructif des autres clés de preferences).
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import type { SkinProfile } from '@/lib/skin/profile'
import { resetPreOnboarding } from '@/lib/storage/preOnboarding'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { NeuCard } from '@/components/design/NeuCard'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { supabase } from '@/lib/supabase/client'
import { SkinProfileCard } from '@/components/profile/SkinProfileCard'
import { BeautyProfileForm } from '@/components/profile/BeautyProfileForm'
import { NotificationSettings } from '@/components/profile/NotificationSettings'
import { ReportSheet } from '@/components/profile/ReportSheet'

type IoniconName = keyof typeof Ionicons.glyphMap

interface LinkRow {
  icon: IoniconName
  label: string
  onPress: () => void
}

/** Adresse de contact pour la suppression manuelle (aucune RPC dédiée à ce jour). */

const ProfileScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const { profile, skin, firstName, saveSkin, updateProfile, isSaving } = useProfile()

  const [editing, setEditing] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const email = user?.email ?? null
  const initial = (firstName?.[0] ?? email?.[0] ?? '?').toUpperCase()
  const isPremium = profile?.tier === 'premium'

  const links: LinkRow[] = useMemo(
    () => [
      {
        icon: 'shield-checkmark-outline',
        label: 'Mes restrictions',
        onPress: () => router.push(ROUTES.PROFILE.RESTRICTIONS),
      },
      {
        icon: 'diamond-outline',
        label: 'Passer Premium',
        onPress: () => router.push(ROUTES.OFFRE.INDEX),
      },
      {
        icon: 'flag-outline',
        label: 'Signaler un problème',
        onPress: () => setReportOpen(true),
      },
    ],
    [],
  )

  /** Bloc « Informations légales » — exigé par Apple §3.1.2 et Play Policy §4.8. */
  const legalLinks: LinkRow[] = useMemo(
    () => [
      {
        icon: 'document-text-outline',
        label: "Conditions d'utilisation",
        onPress: () => router.push(ROUTES.LEGAL.CGU),
      },
      {
        icon: 'lock-closed-outline',
        label: 'Politique de confidentialité',
        onPress: () => router.push(ROUTES.LEGAL.PRIVACY),
      },
      {
        icon: 'business-outline',
        label: 'Mentions légales',
        onPress: () => router.push(ROUTES.LEGAL.MENTIONS),
      },
      {
        icon: 'information-circle-outline',
        label: 'À propos & avertissement médical',
        onPress: () => router.push(ROUTES.LEGAL.ABOUT),
      },
    ],
    [],
  )

  const handleSignOut = useCallback(async () => {
    setConfirmSignOut(false)
    await signOut()
    // Le guard racine redirige vers l'authentification.
  }, [signOut])

  // DEV uniquement : réinitialise le flag du pré-onboarding puis déconnecte, pour
  // pouvoir revoir le carrousel de présentation (sinon invisible après 1er lancement).
  const handleReplayPreOnboarding = useCallback(async () => {
    await resetPreOnboarding()
    await signOut()
  }, [signOut])

  // DEV uniquement : rouvre le questionnaire profil post-connexion (onboarding).
  // On remet `onboardingShown=false` (sans toucher au profil beauté existant) :
  // l'AuthGuard éjecte sinon de /(onboarding) dès que ce flag est vrai (règle 6).
  // Le questionnaire est pré-rempli avec les réponses actuelles, pour révision.
  const handleReplayOnboarding = useCallback(async () => {
    await updateProfile({ onboardingShown: false })
    router.replace(ROUTES.ONBOARDING.INDEX)
  }, [updateProfile])

  // Suppression de compte DÉFINITIVE et IMMÉDIATE via l'Edge Function
  // `delete-account` (cascade DB → toutes les données purgées), puis sign-out.
  const handleDeleteAccount = useCallback(async () => {
    if (deleting) return
    setDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} })
      if (error) {
        setDeleting(false)
        setConfirmDelete(false)
        Alert.alert(
          'Suppression impossible',
          'Une erreur est survenue. Réessaie dans un instant.',
        )
        return
      }
      // Succès → déconnexion (le guard racine redirige vers l'authentification).
      await signOut()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
      Alert.alert(
        'Suppression impossible',
        'Vérifie ta connexion et réessaie.',
      )
    }
  }, [deleting, signOut])

  const handleSave = useCallback(
    async (next: SkinProfile) => {
      await saveSkin(next)
    },
    [saveSkin],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => (editing ? setEditing(false) : router.back())}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Modifier' : 'Mon profil'}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing['2xl'] },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {editing ? (
            <BeautyProfileForm
              initialSkin={skin}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              isSaving={isSaving}
            />
          ) : (
            <>
              <View style={styles.identity}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <Text style={styles.name}>{firstName ?? 'Toi'}</Text>
                {email ? <Text style={styles.email}>{email}</Text> : null}
                <View
                  style={[styles.tierPill, isPremium ? styles.tierPremium : styles.tierFree]}
                >
                  <Text
                    style={[
                      styles.tierText,
                      isPremium ? styles.tierTextPremium : styles.tierTextFree,
                    ]}
                  >
                    {isPremium ? 'Premium' : 'Lancement'}
                  </Text>
                </View>
              </View>

              <SkinProfileCard skin={skin} onEditPress={() => setEditing(true)} />

              <NotificationSettings />

              <NeuCard padding={0} interactive={false} style={styles.linksCard}>
                {links.map((link, i) => (
                  <Pressable
                    key={link.label}
                    onPress={link.onPress}
                    style={[styles.linkRow, i > 0 && styles.linkRowBorder]}
                  >
                    <Ionicons name={link.icon} size={20} color={colors.accent} />
                    <Text style={styles.linkLabel}>{link.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
                  </Pressable>
                ))}
              </NeuCard>

              {/* Section « Informations légales » — exigence Apple §3.1.2 +
                  Google Play Policy §4.8 : les CGU et la politique de
                  confidentialité doivent être accessibles depuis l'app. */}
              <Text style={styles.sectionKicker}>Informations légales</Text>
              <NeuCard padding={0} interactive={false} style={styles.linksCard}>
                {legalLinks.map((link, i) => (
                  <Pressable
                    key={link.label}
                    onPress={link.onPress}
                    style={[styles.linkRow, i > 0 && styles.linkRowBorder]}
                    accessibilityRole="link"
                    accessibilityLabel={link.label}
                  >
                    <Ionicons name={link.icon} size={20} color={colors.inkMuted} />
                    <Text style={styles.linkLabel}>{link.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
                  </Pressable>
                ))}
              </NeuCard>

              {/* Mini-disclaimer médical inline — visible sans cliquer pour
                  satisfaire les reviewers stores qui scannent vite. */}
              <View style={styles.medicalNote}>
                <Ionicons name="information-circle-outline" size={16} color={colors.inkMuted} />
                <Text style={styles.medicalNoteText}>
                  Cosme Check est un outil pédagogique. Les analyses ne
                  constituent pas un avis médical. En cas de doute, consulte un
                  professionnel de santé.
                </Text>
              </View>

              <Pressable style={styles.signOutBtn} onPress={() => setConfirmSignOut(true)}>
                <Text style={styles.signOutText}>Se déconnecter</Text>
              </Pressable>

              {__DEV__ && (
                <Pressable
                  style={styles.devBtn}
                  onPress={() => void handleReplayPreOnboarding()}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.inkMuted} />
                  <Text style={styles.devText}>Revoir l'onboarding (dev)</Text>
                </Pressable>
              )}

              {__DEV__ && (
                <Pressable
                  style={styles.devBtn}
                  onPress={() => void handleReplayOnboarding()}
                  accessibilityRole="button"
                >
                  <Ionicons name="clipboard-outline" size={15} color={colors.inkMuted} />
                  <Text style={styles.devText}>Revoir le questionnaire profil (dev)</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.deleteBtn}
                onPress={() => setConfirmDelete(true)}
                accessibilityRole="button"
              >
                <Text style={styles.deleteText}>Supprimer mon compte</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Se déconnecter"
        message="Tu devras te reconnecter pour accéder à ton suivi beauté."
        confirmLabel="Se déconnecter"
        cancelLabel="Annuler"
        destructive
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirmSignOut(false)}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title="Supprimer mon compte"
        message={
          'Cette action est DÉFINITIVE et IMMÉDIATE. Ton compte et toutes tes données (profil, analyses, routine) seront supprimés et ne pourront pas être récupérés.'
        }
        confirmLabel={deleting ? 'Suppression…' : 'Supprimer définitivement'}
        cancelLabel="Annuler"
        destructive
        onConfirm={() => void handleDeleteAccount()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        firstName={firstName}
      />
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
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.base, gap: spacing.lg },
  identity: { alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.h2, color: colors.accent },
  name: { ...typography.h3, color: colors.ink },
  email: { ...typography.small, color: colors.inkMuted },
  tierPill: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  tierPremium: { backgroundColor: colors.roseSoft },
  tierFree: { backgroundColor: colors.accentSoft },
  tierText: { ...typography.xsSemiBold },
  tierTextPremium: { color: colors.roseDeep },
  tierTextFree: { color: colors.accent },
  linksCard: { borderRadius: radius.lg, overflow: 'hidden' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  linkRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  linkLabel: { ...typography.bodyMedium, color: colors.ink, flex: 1 },
  sectionKicker: {
    ...typography.xsSemiBold,
    color: colors.inkLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  medicalNote: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  medicalNoteText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkMuted,
    fontStyle: 'italic',
  },
  signOutBtn: { alignItems: 'center', paddingVertical: spacing.base, marginTop: spacing.sm },
  signOutText: { ...typography.button, color: colors.error },
  devBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  devText: { ...typography.small, color: colors.inkMuted },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  deleteText: { ...typography.small, color: colors.inkLight, textDecorationLine: 'underline' },
})

export default ProfileScreen
