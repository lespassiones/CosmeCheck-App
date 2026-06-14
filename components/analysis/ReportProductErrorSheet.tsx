/**
 * ReportProductErrorSheet — modale « Signaler une information incorrecte ».
 *
 * Reformulation de la fonction « Une erreur sur ce produit ? ». L'utilisateur
 * décrit le problème (mauvais nom, mauvaise composition, etc.) ; le message
 * part dans `user_feedback` (kind='product_error') et arrive côté admin web
 * sous « Retours › Modération produit ».
 */
import { useState, type FC } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { submitProductErrorReport } from '@/lib/productTools/reportError'

interface Props {
  visible: boolean
  onClose: () => void
  productEan: string | null
  productName: string | null
}

type Phase = 'form' | 'sending' | 'done' | 'error'

const MAX = 1000

export const ReportProductErrorSheet: FC<Props> = ({
  visible,
  onClose,
  productEan,
  productName,
}) => {
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState<Phase>('form')

  function reset() {
    setMessage('')
    setPhase('form')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSend() {
    if (message.trim().length < 3) return
    setPhase('sending')
    const res = await submitProductErrorReport({
      ean: productEan,
      productName,
      message,
    })
    setPhase(res.ok ? 'done' : 'error')
  }

  const canSend = message.trim().length >= 3 && phase === 'form'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Signaler une information incorrecte</Text>
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
          style={styles.body}
        >
          {phase === 'done' ? (
            <View style={styles.center}>
              <View style={[styles.statusIcon, { backgroundColor: colors.rating.vert.bg }]}>
                <Ionicons name="checkmark" size={32} color={colors.rating.vert.DEFAULT} />
              </View>
              <Text style={styles.statusTitle}>Merci pour ton signalement</Text>
              <Text style={styles.statusText}>
                On a bien reçu ton message. Notre équipe le vérifie et corrige la
                fiche si besoin.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.intro}>
                Un nom, une marque ou une composition qui te semble fausse ?
                Dis-nous ce qui ne va pas{productName ? ` sur « ${productName} »` : ''}.
              </Text>

              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Décris l'erreur que tu as repérée…"
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
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  body: { flex: 1, padding: spacing.base, gap: spacing.md },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
  },
  input: {
    minHeight: 140,
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
    marginTop: -spacing.sm,
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
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.inkLight },
  primaryBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
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
