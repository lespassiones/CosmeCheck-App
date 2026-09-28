/**
 * A3 : « Ce que tu me confies, et pourquoi ».
 *
 * Consentement explicite aux données de santé (RGPD, articles 6.1.a et 9.2.a),
 * recueilli AVANT la première question sur la peau. Trois règles héritées de
 * l'ancien écran `/consent`, qui restent non négociables :
 *   - la case n'est jamais pré-cochée, le bouton reste inerte sans elle ;
 *   - les destinataires (OpenAI, la technologie de ChatGPT, et Mistral AI) sont
 *     nommés AU-DESSUS de la case, dans « Qui les traite », donc lus avant de
 *     cocher (règle Apple 5.1.2 sur le partage avec une IA tierce). La case
 *     elle-même reste courte depuis le 28/09/2026, à la demande du produit ;
 *   - le texte intégral reste lisible avant de cocher (« Tout lire en détail »).
 *
 * « Passer » vaut refus : le parcours continue sans aucune question de santé.
 */

import { useState, type FC } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated'
import { EASE_OUT, fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { ConsentDetails } from '@/components/consent/ConsentDetails'
import { ONBOARDING_CONSENT_VERSION } from '@/lib/onboarding/buildPreferences'
import { haptic } from '@/lib/haptics'
import { FLOW_MAX_WIDTH, GUTTER, PrimaryButton } from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const BLOCKS = [
  {
    title: 'Ce que je vais te demander',
    text: 'Ton type de peau, tes soucis et les ingrédients que tu évites. Pour la loi, ce sont des données de santé : je te demande donc ton accord avant.',
  },
  {
    title: 'À quoi ça sert',
    text: 'Seulement à adapter tes analyses et mes conseils à ta peau. Jamais vendu, jamais utilisé pour de la publicité.',
  },
  {
    title: 'Qui les traite',
    text: "Nos serveurs en Europe, et pour les explications personnalisées les modèles d'IA d'OpenAI (la technologie de ChatGPT) et de Mistral AI. Jamais ton nom ni ton e-mail, et rien ne sert à entraîner leurs modèles.",
  },
  {
    title: 'Ton choix',
    text: "Rien n'est enregistré tant que la case n'est pas cochée. Tu peux retirer ton accord à tout moment depuis ton profil.",
  },
]

export const ConsentStep: FC<StepProps & { asSheet: boolean }> = ({ update, next, asSheet }) => {
  const insets = useSafeAreaInsets()
  const [checked, setChecked] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const decide = (granted: boolean) => {
    if (granted) haptic.success()
    else haptic.selection()
    update({
      consent: { granted, at: new Date().toISOString(), version: ONBOARDING_CONSENT_VERSION },
    })
    next()
  }

  const toggle = () => {
    if (checked) haptic.selection()
    else haptic.select()
    setChecked((v) => !v)
  }

  const sheet = (
    <View style={[styles.sheet, asSheet ? styles.sheetFloating : styles.sheetFull]}>
      <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={styles.eyebrow}>AVANT DE COMMENCER</Text>
          <Pressable
            onPress={() => decide(false)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Passer sans personnaliser"
          >
            <Text style={styles.skip}>Passer</Text>
          </Pressable>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Ce que tu me confies,{'\n'}et pourquoi
        </Text>
        <View style={styles.blocks}>
          {BLOCKS.map((b, i) => (
            <Animated.View
              key={b.title}
              entering={fadeUp(300 + i * 90)}
              style={styles.block}
            >
              <Text style={styles.blockTitle}>{b.title}</Text>
              <Text style={styles.blockText}>{b.text}</Text>
            </Animated.View>
          ))}
        </View>
        <Pressable onPress={() => setDetailsOpen(true)} hitSlop={6} accessibilityRole="button" style={styles.detailsBtn}>
          <Ionicons name="document-text-outline" size={16} color={colors.rose} />
          <Text style={styles.detailsText}>Tout lire en détail</Text>
        </Pressable>
        <Text style={styles.links}>
          Détails :{' '}
          <Text style={styles.link} onPress={() => setLegalDoc('privacy')} accessibilityRole="link">
            Politique de confidentialité
          </Text>
          {'  ·  '}
          <Text style={styles.link} onPress={() => setLegalDoc('cgu')} accessibilityRole="link">
            Conditions d'utilisation
          </Text>
        </Text>
      </ScrollView>

      <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <Pressable
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="J'accepte que mon profil beauté, y compris mes sensibilités et allergies, serve à personnaliser mes analyses."
          style={styles.checkRow}
        >
          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
            {checked ? (
              <Animated.View entering={softScaleIn(0, 0.6, 200)}>
                <Ionicons name="checkmark" size={16} color={colors.surface} />
              </Animated.View>
            ) : null}
          </View>
          <Text style={styles.checkText}>
            J'accepte que mon profil beauté, y compris mes sensibilités et allergies, serve à
            personnaliser mes analyses.
          </Text>
        </Pressable>
        <PrimaryButton label="Continuer" iconRight="arrow-forward" onPress={() => decide(true)} disabled={!checked} />
        {!checked ? <Text style={styles.hint}>Coche la case pour continuer.</Text> : null}
      </View>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
      <Modal
        visible={detailsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <SafeAreaView style={styles.detailsSafe} edges={['top', 'bottom']}>
          <View style={styles.detailsHead}>
            <Text style={styles.detailsTitle}>Tes données, en détail</Text>
            <Pressable
              onPress={() => setDetailsOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={styles.detailsClose}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailsScroll}>
            <ConsentDetails />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  )

  if (!asSheet) return sheet
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(200)}>
      <View style={styles.backdrop} />
      <Animated.View style={styles.sheetHost} entering={SlideInDown.duration(380).easing(EASE_OUT)}>
        {sheet}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, width: '100%', alignSelf: 'center' },
  sheetFloating: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxWidth: FLOW_MAX_WIDTH + GUTTER * 2,
  },
  sheetFull: { flex: 1, maxWidth: FLOW_MAX_WIDTH + GUTTER * 2 },
  sheetScroll: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: fontFamilies.semiBold, fontSize: 13, letterSpacing: 2, color: colors.rose },
  skip: { fontFamily: fontFamilies.medium, fontSize: 16, color: colors.inkMuted },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 10,
    marginBottom: 14,
  },
  blocks: { gap: 10 },
  block: { backgroundColor: colors.gray100, borderRadius: 16, padding: 16, gap: 4 },
  blockTitle: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  blockText: { fontFamily: fontFamilies.regular, fontSize: 14.5, lineHeight: 21, color: colors.inkMuted },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, paddingVertical: 4 },
  detailsText: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.rose },
  links: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.inkMuted, marginTop: 8, lineHeight: 20 },
  link: { color: colors.roseDeep, textDecorationLine: 'underline' },
  sheetFooter: {
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
    backgroundColor: colors.surface,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.rose, borderColor: colors.rose },
  checkText: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 14.5, lineHeight: 20, color: colors.ink },
  hint: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.inkMuted, textAlign: 'center' },

  detailsSafe: { flex: 1, backgroundColor: colors.bg },
  detailsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingVertical: 12,
  },
  detailsTitle: { fontFamily: fontFamilies.bold, fontSize: 20, color: colors.ink },
  detailsClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsScroll: { paddingHorizontal: GUTTER, paddingBottom: 32, maxWidth: FLOW_MAX_WIDTH, width: '100%', alignSelf: 'center' },
})
