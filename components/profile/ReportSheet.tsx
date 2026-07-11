/**
 * ReportSheet — modale « Signaler un problème » (depuis le profil).
 *
 * L'utilisateur choisit un objet (l'assistant IA, une promesse, autre) puis
 * décrit le souci. Le signalement part dans `user_feedback` (kind='contact',
 * trigger_source='report', objet dans contact_subject) et arrive côté admin
 * sous « Retours », avec l'auteur, l'objet et le message.
 *
 * Les analyses de produits ne sont PAS listées ici : elles ont déjà leur propre
 * bouton « Signaler une information incorrecte » (ReportProductErrorSheet).
 */
import { useState, type FC } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import {
  REPORT_OBJECTS,
  submitReport,
  type ReportObjectKey,
} from '@/lib/feedback/submitReport'

interface Props {
  visible: boolean
  onClose: () => void
  /** Prénom de l'utilisateur (affiché côté admin). */
  firstName?: string | null
}

type Phase = 'form' | 'sending' | 'done' | 'error'

const MAX = 1000

export const ReportSheet: FC<Props> = ({ visible, onClose, firstName }) => {
  const [objectKey, setObjectKey] = useState<ReportObjectKey | null>(null)
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState<Phase>('form')

  function reset() {
    setObjectKey(null)
    setMessage('')
    setPhase('form')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSend() {
    if (!objectKey || message.trim().length < 3) return
    setPhase('sending')
    const res = await submitReport({ objectKey, message, firstName })
    setPhase(res.ok ? 'done' : 'error')
  }

  const canSend = !!objectKey && message.trim().length >= 3 && phase === 'form'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Signaler un problème</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          {phase === 'done' ? (
            <View style={styles.center}>
              <View style={[styles.statusIcon, { backgroundColor: colors.rating.vert.bg }]}>
                <Ionicons name="checkmark" size={32} color={colors.rating.vert.DEFAULT} />
              </View>
              <Text style={styles.statusTitle}>Merci pour ton signalement</Text>
              <Text style={styles.statusText}>
                On a bien reçu ton message. Notre équipe le vérifie et fait le
                nécessaire.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.intro}>
                Qu'est-ce qui te pose problème ? Sélectionne un élément puis
                décris-nous ce qui ne va pas.
              </Text>

              <Text style={styles.label}>Objet du signalement</Text>
              <View style={styles.options}>
                {REPORT_OBJECTS.map((opt) => {
                  const selected = objectKey === opt.key
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setObjectKey(opt.key)}
                      style={[styles.option, selected && styles.optionSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selected ? colors.accent : colors.inkLight}
                      />
                      <Text
                        style={[styles.optionText, selected && styles.optionTextSelected]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text style={styles.label}>Ton message</Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Décris le problème que tu as rencontré…"
                placeholderTextColor={colors.inkLight}
                multiline
                maxLength={MAX}
                textAlignVertical="top"
                editable={phase === 'form'}
              />
              <Text style={styles.counter}>
                {message.length}/{MAX}
              </Text>

              {phase === 'error' ? (
                <Text style={styles.errorText}>
                  L'envoi a échoué. Vérifie ta connexion et réessaie.
                </Text>
              ) : null}

              <Pressable
                style={[styles.primaryBtn, !canSend && styles.primaryBtnDisabled]}
                onPress={handleSend}
                disabled={!canSend}
              >
                {phase === 'sending' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Envoyer</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  body: { padding: spacing.base, gap: spacing.sm },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
  optionTextSelected: { color: colors.accentDeep },
  input: {
    minHeight: 130,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
  },
  counter: {
    alignSelf: 'flex-end',
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: -spacing.xs,
  },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.rating.rouge.DEFAULT,
  },
  primaryBtn: {
    marginTop: spacing.sm,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.inkLight },
  primaryBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: '#FFFFFF' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontFamily: fontFamilies.semiBold, fontSize: 18, color: colors.ink },
  statusText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})
