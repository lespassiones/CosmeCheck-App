/**
 * ProfileScreen — profil utilisateur.
 *
 * Affiché comme ONGLET « Profil » de la barre du bas (`app/(tabs)/profil.tsx`,
 * `inTab`) depuis le 28/09/2026 : pas de chevron retour (sauf en édition) et
 * marge basse qui laisse passer la barre. `/profile` redirige vers l'onglet.
 *
 * Design « réglages » monochrome (28/09/2026) :
 *   - identité : avatar à gauche, prénom, email, badge d'abonnement ;
 *   - carte Crédits : solde de la période (useCredits), jauge, heure de recharge
 *     LOCALE (le quota bascule à minuit UTC), « Détail » → /profile/credits ;
 *   - sections titrées en listes groupées : Mon profil (profil beauté résumé,
 *     restrictions comptées, annuaire des ingrédients), Abonnement, Préférences
 *     (notifications), Aide (signalement), Informations (légal, exigé par Apple
 *     §3.1.2 et Play §4.8) ; avertissement médical, déconnexion, suppression.
 *
 * « Profil beauté » ouvre l'édition en place (BeautyProfileForm), persistée
 * dans user_profiles.preferences.skin via useProfile().saveSkin (merge non
 * destructif) ; l'état de l'auto-save s'affiche dans l'en-tête.
 */

import { type FC, type ReactNode, useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import type { SkinProfile } from '@/lib/skin/profile'
import { beautyProfileSummary, restrictionsCount } from '@/lib/skin/profileSummary'
import { creditsPeriodLabel, creditsRefillLabel, splitCredits } from '@/lib/credits/refill'
import { resetPreOnboarding } from '@/lib/storage/preOnboarding'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useCredits } from '@/hooks/useCredits'
import { Reveal } from '@/components/design/Reveal'
import { AnimatedGaugeFill } from '@/components/design/motion'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { fireHaptic, type HapticLevel } from '@/lib/pressFeedback'
import { supabase } from '@/lib/supabase/client'
import { runAfterModalClose, waitForModalClose } from '@/lib/navigation/afterModalClose'
import { BeautyProfileForm, type SaveStatus } from '@/components/profile/BeautyProfileForm'
import { useNotificationToggle } from '@/components/profile/NotificationSettings'
import { ReportSheet } from '@/components/profile/ReportSheet'
import { TAB_CONTENT_BOTTOM } from '@/components/navigation/BottomTabBar'
import { ToggleSwitch } from '@/components/design/ToggleSwitch'
import { useAdsConsent } from '@/hooks/useAdsConsent'

type IoniconName = keyof typeof Ionicons.glyphMap

const icon = (name: IoniconName) => <Ionicons name={name} size={22} color={colors.ink} />

// ─── Briques de liste ────────────────────────────────────────────────────────

/** Ligne de liste groupée : icône, libellé, valeur/contrôle à droite, chevron si tappable. */
const Row: FC<{
  icon: ReactNode
  label: string
  value?: string
  right?: ReactNode
  onPress?: () => void
  first?: boolean
  role?: 'button' | 'link'
  haptic?: HapticLevel
}> = ({ icon: iconNode, label, value, right, onPress, first = false, role = 'button', haptic }) => {
  const body = (
    <>
      <View style={styles.rowIcon}>{iconNode}</View>
      {/* Filet sous la ligne précédente, aligné sur le libellé (pas sous l'icône). */}
      <View style={[styles.rowBody, !first && styles.rowDivider]}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {/* Espace libre : pousse la valeur à droite ; la VALEUR se tronque, pas le libellé. */}
        <View style={styles.rowSpacer} />
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.inkLight} /> : null}
      </View>
    </>
  )
  if (!onPress) return <View style={styles.row}>{body}</View>
  return (
    <Pressable
      onPress={onPress}
      haptic={haptic}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole={role}
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      {body}
    </Pressable>
  )
}

/** Section titrée + liste groupée (carte blanche à liseré). */
const Section: FC<{ title: string; children: ReactNode; footer?: ReactNode }> = ({
  title,
  children,
  footer,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.group}>{children}</View>
    {footer}
  </View>
)

// ─── Écran ───────────────────────────────────────────────────────────────────

export const ProfileScreen: FC<{ inTab?: boolean }> = ({ inTab = false }) => {
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const { profile, skin, firstName, restrictions, saveSkin, updateProfile, isSaving } = useProfile()
  const { remaining, limit, bonus, renewalPeriod, isLoading: creditsLoading } = useCredits()
  const notif = useNotificationToggle()
  const ads = useAdsConsent()

  const [editing, setEditing] = useState(false)
  const [formStatus, setFormStatus] = useState<SaveStatus>('idle')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const email = user?.email ?? null
  const initial = (firstName?.[0] ?? email?.[0] ?? '?').toUpperCase()
  const isPremium = profile?.tier === 'premium'
  const restrictionTotal = restrictionsCount(restrictions)
  // Jauge = quota de la PÉRIODE ; les crédits bonus (ponctuels) sont à part.
  const credit = splitCredits({ remaining, limit, bonus })
  const creditPct = limit > 0 ? (credit.periodLeft / limit) * 100 : 0
  const refillLabel = creditsRefillLabel(renewalPeriod)

  const handleSignOut = useCallback(async () => {
    setConfirmSignOut(false)
    // Le guard racine redirige dès la déconnexion : on attend que la fenêtre de
    // confirmation (Modal) soit sortie, sinon les onglets sont démontés sous une
    // Modal en pleine fermeture (calque qui peut rester sur iPhone).
    await waitForModalClose()
    await signOut()
  }, [signOut])

  // DEV uniquement : rearme le carrousel puis déconnecte. `signOut` le rearme
  // déjà (toute déconnexion ramène à la présentation) ; on le fait ici aussi
  // pour que le bouton reste explicite sur son intention.
  const handleReplayPreOnboarding = useCallback(async () => {
    resetPreOnboarding()
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
        // iOS refuse une alerte présentée pendant la sortie d'une Modal.
        runAfterModalClose(() =>
          Alert.alert('Suppression impossible', 'Une erreur est survenue. Réessaie dans un instant.'),
        )
        return
      }
      // Succès → fenêtre fermée PUIS déconnexion (le guard racine redirige).
      setConfirmDelete(false)
      await waitForModalClose()
      await signOut()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
      runAfterModalClose(() =>
        Alert.alert('Suppression impossible', 'Vérifie ta connexion et réessaie.'),
      )
    }
  }, [deleting, signOut])

  const handleSave = useCallback(
    async (next: SkinProfile) => {
      await saveSkin(next)
    },
    [saveSkin],
  )

  const closeEditing = useCallback(() => {
    setEditing(false)
    setFormStatus('idle')
  }, [])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* En onglet, l'écran commence directement par l'identité (pas de titre).
            L'en-tête n'apparaît que pour revenir (hors onglet) ou en édition. */}
        {editing || !inTab ? (
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <Pressable
                style={styles.backBtn}
                onPress={() => (editing ? closeEditing() : router.back())}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Retour"
              >
                <Ionicons name="chevron-back" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={styles.headerTitle}>{editing ? 'Profil beauté' : 'Mon profil'}</Text>
            <View style={[styles.headerSide, styles.headerRight]}>
              {editing && formStatus === 'saving' ? (
                <ActivityIndicator size="small" color={colors.inkMuted} />
              ) : editing && formStatus === 'saved' ? (
                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.inkMuted} />
                  <Text style={styles.savedText}>Enregistré</Text>
                </View>
              ) : editing && formStatus === 'error' ? (
                <Text style={[styles.savedText, { color: colors.error }]}>Échec</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + (inTab ? TAB_CONTENT_BOTTOM : spacing['2xl']) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {editing ? (
            <BeautyProfileForm
              initialSkin={skin}
              onSave={handleSave}
              onCancel={closeEditing}
              isSaving={isSaving}
              onStatusChange={setFormStatus}
            />
          ) : (
            /* Entrée douce : chaque bloc apparaît en fondu échelonné. */
            <Reveal stagger={60} style={styles.stack}>
              {/* ── Identité ── */}
              <View style={styles.identity}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={styles.identityText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {firstName ?? 'Toi'}
                  </Text>
                  {email ? (
                    <Text style={styles.email} numberOfLines={1}>
                      {email}
                    </Text>
                  ) : null}
                  <View style={[styles.tierPill, isPremium && styles.tierPillPremium]}>
                    <Text style={[styles.tierText, isPremium && styles.tierTextPremium]}>
                      {isPremium ? 'Premium' : 'Gratuit'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── Crédits ── */}
              <Pressable
                onPress={() => router.push(ROUTES.PROFILE.CREDITS)}
                style={({ pressed }) => [styles.creditsCard, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Crédits : ${credit.periodLeft} sur ${limit} ${creditsPeriodLabel(renewalPeriod)}${credit.bonus > 0 ? `, plus ${credit.bonus} crédits bonus` : ''}. Voir le détail`}
              >
                <View style={styles.creditsHead}>
                  <Text style={styles.creditsTitle}>Crédits</Text>
                  <View style={styles.detailLink}>
                    <Text style={styles.detailText}>Détail</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink} />
                  </View>
                </View>
                <Text style={styles.creditsCount}>
                  {creditsLoading ? (
                    '…'
                  ) : (
                    <>
                      <Text style={styles.creditsCountStrong}>
                        {credit.periodLeft} sur {limit}
                      </Text>{' '}
                      {creditsPeriodLabel(renewalPeriod)}
                      {credit.bonus > 0 ? (
                        <Text style={styles.creditsBonus}>
                          {'  '}+ {credit.bonus} bonus
                        </Text>
                      ) : null}
                    </>
                  )}
                </Text>
                <View style={styles.creditsTrack}>
                  <AnimatedGaugeFill
                    percent={creditPct}
                    color={colors.gray900}
                    minPercent={0}
                    animateKey={credit.periodLeft}
                  />
                </View>
                {refillLabel ? <Text style={styles.refillText}>{refillLabel}</Text> : null}
              </Pressable>

              {/* ── Mon profil ── */}
              <Section title="Mon profil">
                <Row
                  first
                  icon={icon('person-outline')}
                  label="Profil beauté"
                  value={beautyProfileSummary(skin)}
                  onPress={() => setEditing(true)}
                />
                <Row
                  icon={icon('ban-outline')}
                  label="Mes restrictions"
                  value={restrictionTotal > 0 ? String(restrictionTotal) : 'Aucune'}
                  onPress={() => router.push(ROUTES.PROFILE.RESTRICTIONS)}
                />
                <Row
                  icon={icon('book-outline')}
                  label="Ingrédients"
                  value="Annuaire"
                  onPress={() => router.push(ROUTES.INGREDIENT.INDEX)}
                />
              </Section>

              {/* ── Abonnement ── */}
              <Section title="Abonnement">
                <Row
                  first
                  icon={<MaterialCommunityIcons name="crown-outline" size={22} color={colors.ink} />}
                  label={isPremium ? 'Mon abonnement' : 'Passer à Premium'}
                  right={
                    isPremium ? (
                      <View style={[styles.badge, styles.badgeGold]}>
                        <Text style={[styles.badgeText, { color: colors.gold }]}>Actif</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, styles.badgeRose]}>
                        <View style={styles.badgeDot} />
                        <Text style={[styles.badgeText, { color: colors.roseDeep }]}>Premium</Text>
                      </View>
                    )
                  }
                  onPress={() => router.push(ROUTES.OFFRE.INDEX)}
                  haptic={isPremium ? 'secondary' : 'primary'}
                />
              </Section>

              {/* ── Préférences ── */}
              <Section
                title="Préférences"
                footer={
                  !notif.available ? (
                    <Text style={styles.groupNote}>
                      Disponible après la prochaine mise à jour de l'application.
                    </Text>
                  ) : notif.deniedBySystem ? (
                    <Text style={styles.groupLink} onPress={notif.openSystemSettings}>
                      Autoriser dans les réglages
                    </Text>
                  ) : null
                }
              >
                <Row
                  first
                  icon={icon('notifications-outline')}
                  label="Notifications"
                  right={
                    <ToggleSwitch
                      value={notif.enabled}
                      onValueChange={(v) => {
                        fireHaptic('selection')
                        void notif.toggle(v)
                      }}
                      disabled={notif.busy || !notif.available}
                      accessibilityLabel="Notifications"
                    />
                  }
                />
                {/* Retrait du consentement Meta (RGPD). Masqué tant que le SDK
                    n'est pas dans le binaire ou que l'App ID n'est pas rempli. */}
                {ads.available ? (
                  <Row
                    icon={icon('megaphone-outline')}
                    label="Mesure des publicités"
                    right={
                      <ToggleSwitch
                        value={ads.enabled}
                        onValueChange={(v) => {
                          fireHaptic('selection')
                          void ads.toggle(v)
                        }}
                        disabled={ads.busy}
                        accessibilityLabel="Mesure des publicités"
                      />
                    }
                  />
                ) : null}
              </Section>

              {/* ── Aide ── */}
              <Section title="Aide">
                <Row
                  first
                  icon={icon('help-buoy-outline')}
                  label="Signaler un problème"
                  onPress={() => setReportOpen(true)}
                />
              </Section>

              {/* ── Informations (légal : exigé par Apple §3.1.2 et Play §4.8) ── */}
              <Section title="Informations">
                <Row
                  first
                  icon={icon('document-text-outline')}
                  label="Conditions d'utilisation"
                  onPress={() => router.push(ROUTES.LEGAL.CGU)}
                  role="link"
                />
                <Row
                  icon={icon('shield-checkmark-outline')}
                  label="Confidentialité"
                  onPress={() => router.push(ROUTES.LEGAL.PRIVACY)}
                  role="link"
                />
                <Row
                  icon={<MaterialCommunityIcons name="scale-balance" size={22} color={colors.ink} />}
                  label="Mentions légales"
                  onPress={() => router.push(ROUTES.LEGAL.MENTIONS)}
                  role="link"
                />
                <Row
                  icon={icon('information-circle-outline')}
                  label="À propos"
                  onPress={() => router.push(ROUTES.LEGAL.ABOUT)}
                  role="link"
                />
              </Section>

              {/* Mini-disclaimer médical inline : visible sans cliquer, pour les
                  reviewers stores qui scannent vite. */}
              <Text style={styles.medicalNote}>
                Cosme Check est un outil pédagogique. Les analyses ne constituent pas un
                avis médical. En cas de doute, consulte un professionnel de santé.
              </Text>

              <Pressable
                style={styles.signOutBtn}
                onPress={() => setConfirmSignOut(true)}
                accessibilityRole="button"
              >
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
            </Reveal>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Déconnexion : action neutre (bouton encre), pas destructive. */}
      <ConfirmDialog
        visible={confirmSignOut}
        title="Se déconnecter ?"
        message="Tu devras te reconnecter pour retrouver ton suivi."
        confirmLabel="Se déconnecter"
        cancelLabel="Annuler"
        centered
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirmSignOut(false)}
      />

      {/* Suppression : bouton rouge, puis « Suppression » + roue tant que
          l'Edge Function `delete-account` tourne (fenêtre verrouillée). */}
      <ConfirmDialog
        visible={confirmDelete}
        title="Supprimer ton compte ?"
        message="Ton compte, ton profil, tes analyses et ta routine seront supprimés. C'est définitif."
        confirmLabel="Supprimer"
        loadingLabel="Suppression"
        loading={deleting}
        cancelLabel="Annuler"
        destructive
        centered
        onConfirm={() => void handleDeleteAccount()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} firstName={firstName} />
    </View>
  )
}

const ICON_COL = 24
const ROW_PAD = spacing.base

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerRight: { justifyContent: 'flex-end' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamilies.bold, fontSize: 17, color: colors.ink },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.inkMuted },
  content: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
  stack: { gap: spacing.xl },

  // Identité
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fontFamilies.regular, fontSize: 30, color: colors.ink },
  identityText: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 2 },
  name: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.ink },
  email: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.inkMuted },
  tierPill: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.gray300,
  },
  // Or = Premium, partout dans l'app.
  tierPillPremium: { backgroundColor: colors.goldSoft, borderColor: colors.goldBorder },
  tierText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.ink },
  tierTextPremium: { color: colors.gold },

  // Crédits
  creditsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: ROW_PAD,
    gap: spacing.sm,
  },
  creditsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditsTitle: { fontFamily: fontFamilies.bold, fontSize: 18, color: colors.ink },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  creditsCount: { fontFamily: fontFamilies.regular, fontSize: 16, color: colors.ink, marginTop: -4 },
  creditsCountStrong: { fontFamily: fontFamilies.semiBold },
  creditsBonus: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.inkMuted },
  creditsTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  refillText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },

  // Sections et listes groupées
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamilies.bold, fontSize: 19, color: colors.ink },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupNote: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted },
  groupLink: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowPressed: { backgroundColor: colors.gray50 },
  rowIcon: {
    width: ICON_COL,
    marginLeft: ROW_PAD,
    marginRight: ROW_PAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray300 },
  rowLabel: { flexShrink: 0, fontFamily: fontFamilies.regular, fontSize: 16, color: colors.ink },
  rowSpacer: { flex: 1 },
  rowValue: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'right',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  badgeRose: { backgroundColor: colors.roseSoft },
  badgeGold: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose },
  badgeText: { fontFamily: fontFamilies.medium, fontSize: 13 },

  // Bas de page
  medicalNote: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.sm,
  },
  signOutBtn: { alignSelf: 'center', paddingVertical: spacing.xs, marginTop: -spacing.sm },
  signOutText: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  devBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: -spacing.md,
  },
  devText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  deleteBtn: { alignSelf: 'center', marginTop: -spacing.sm },
  deleteText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkLight,
    textDecorationLine: 'underline',
  },
})
