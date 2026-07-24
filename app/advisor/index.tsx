/**
 * AdvisorScreen — Beauty Advisor (twin mobile de CosmetWiki/app/advisor/page.tsx).
 *
 * - En-tête « ✨ Beauty Advisor » + sous-titre.
 * - Gate profil : tant qu'aucun signal de profil n'est rempli
 *   (isProfileStarted === false), on invite l'utilisateur à compléter son
 *   profil beauté (CTA → /profile). Sinon : résumé repliable du profil +
 *   AdvisorChat (chat IA streaming).
 *
 * Le chat dégrade en douceur si l'Edge Function `advisor-chat` n'est pas
 * déployée (cf. AdvisorChat).
 */

import { useState, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AdvisorChat } from '@/components/advisor/AdvisorChat'
import { AdvisorHistorySheet } from '@/components/advisor/AdvisorHistorySheet'
import { loadConversationMessages, type StoredMessage } from '@/lib/advisor/conversations'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { PressableScale, StaggerItem } from '@/components/design/motion'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { useProfile } from '@/hooks/useProfile'
import { useAppConfig } from '@/hooks/useAppConfig'
import {
  isProfileStarted,
  SKIN_CONCERN_LABEL,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
} from '@/lib/skin/profile'

const AdvisorScreen: FC = () => {
  const { skin, firstName, isLoading } = useProfile()
  const { config } = useAppConfig()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Conversation active : id (null = nouvelle) + messages chargés depuis l'historique.
  // chatKey force le remontage de AdvisorChat quand on change de conversation.
  const [activeConv, setActiveConv] = useState<{
    id: string | null
    messages: StoredMessage[] | null
    chatKey: number
  }>({ id: null, messages: null, chatKey: 0 })

  function startNewConversation() {
    setActiveConv((c) => ({ id: null, messages: null, chatKey: c.chatKey + 1 }))
  }

  async function openConversation(conversationId: string) {
    setHistoryOpen(false)
    const messages = await loadConversationMessages(conversationId)
    setActiveConv((c) => ({ id: conversationId, messages, chatKey: c.chatKey + 1 }))
  }

  // Le chat s'affiche dès qu'un signal de profil est rempli (parité web).
  const started = isProfileStarted(skin)

  // Résumé textuel du profil (visage / corps · préoccupations · sans …).
  const summaryParts: string[] = []
  const face = skin.skinTypeFace ? SKIN_TYPE_FACE_LABEL[skin.skinTypeFace] : skin.otherSkinTypeFace
  const body = skin.skinTypeBody ? SKIN_TYPE_BODY_LABEL[skin.skinTypeBody] : skin.otherSkinTypeBody
  if (face) summaryParts.push(`visage : ${face}`)
  if (body) summaryParts.push(`corps : ${body}`)
  const summaryHead = summaryParts.join(' · ')
  const concernsText =
    skin.concerns && skin.concerns.length > 0
      ? skin.concerns.map((c) => SKIN_CONCERN_LABEL[c]).join(', ')
      : null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <BackgroundGlow variant="default" />

      {/* Header UNE ligne : retour + ✨ titre à gauche, crayon + historique à droite
          (le titre n'occupe plus sa propre ligne → plus de place pour le chat). */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.h1} numberOfLines={1}>
          <Text>✨ </Text>Beauty Advisor
        </Text>
        {started ? (
          <View style={styles.topActions}>
            <Pressable
              onPress={startNewConversation}
              hitSlop={10}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Nouvelle conversation"
            >
              <Ionicons name="create-outline" size={22} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => setHistoryOpen(true)}
              hitSlop={10}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Historique des conversations"
            >
              <Ionicons name="time-outline" size={22} color={colors.ink} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle} numberOfLines={1}>
          Un assistant IA qui s'appuie sur ton profil et ta routine.
        </Text>

        {isLoading ? null : !config.flag_advisor ? (
          <Reveal>
            <GlassCard style={styles.gateCard} padding={spacing.xl}>
              <Text style={styles.gateTitle}>Bientôt de retour</Text>
              <Text style={styles.gateText}>
                Le Beauty Advisor est momentanément indisponible. Reviens un peu plus tard.
              </Text>
            </GlassCard>
          </Reveal>
        ) : !started ? (
          <Reveal>
            <GlassCard style={styles.gateCard} padding={spacing.xl}>
              <Text style={styles.gateTitle}>Complète ton profil beauté</Text>
              <Text style={styles.gateText}>
                Type de peau, préoccupations, cheveux, allergies : on utilise ces informations pour
                adapter les conseils. Tu peux modifier à tout moment.
              </Text>
              <PressableScale
                onPress={() => router.push(ROUTES.PROFILE.INDEX)}
                style={styles.gateCta}
                accessibilityRole="button"
              >
                <Text style={styles.gateCtaText}>Compléter mon profil</Text>
              </PressableScale>
            </GlassCard>
          </Reveal>
        ) : (
          <View style={styles.chatWrap}>
            {/* Résumé profil repliable (parité du <details> web).
                StaggerItem index 0 : simple fondu d'apparition initiale (pas de
                stagger, le chat en dessous gère ses propres messages). */}
            {(summaryHead || concernsText || skin.allergiesFreeform) && (
              <StaggerItem index={0}>
                <Pressable
                  onPress={() => setSummaryOpen((v) => !v)}
                  style={styles.summaryBar}
                  accessibilityRole="button"
                  accessibilityLabel="Voir mon profil"
                >
                  <Text style={styles.summaryEmoji}>🧬</Text>
                  <Text style={styles.summaryText} numberOfLines={summaryOpen ? undefined : 1}>
                    {summaryHead ? <Text style={styles.summaryStrong}>{summaryHead}</Text> : null}
                    {concernsText ? `${summaryHead ? ' · ' : ''}${concernsText}` : ''}
                    {skin.allergiesFreeform ? ` · sans : ${skin.allergiesFreeform}` : ''}
                  </Text>
                  <Pressable
                    onPress={() => router.push(ROUTES.PROFILE.INDEX)}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.summaryEdit}>Modifier</Text>
                  </Pressable>
                </Pressable>
              </StaggerItem>
            )}

            <AdvisorChat
              key={activeConv.chatKey}
              firstName={firstName ?? 'toi'}
              conversationId={activeConv.id}
              initialMessages={activeConv.messages}
              onConversationCreated={(id) => setActiveConv((c) => ({ ...c, id }))}
            />
          </View>
        )}
      </View>

      <AdvisorHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => void openConversation(id)}
      />
    </SafeAreaView>
  )
}

export default AdvisorScreen

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  content: {
    flex: 1,
    paddingHorizontal: spacing.base,
  },
  h1: {
    ...typography.h4,
    color: colors.ink,
    flex: 1,
    marginLeft: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  gateCard: {},
  gateTitle: {
    ...typography.h4,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  gateText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  gateCta: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gateCtaText: {
    ...typography.button,
    color: colors.surface,
  },
  chatWrap: {
    flex: 1,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF1F2',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryEmoji: { fontSize: 14 },
  summaryText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: '#9F1239',
  },
  summaryStrong: {
    fontFamily: fontFamilies.semiBold,
    color: '#9F1239',
  },
  summaryEdit: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: '#F43F5E',
  },
})
