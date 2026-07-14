/**
 * LegalModal — affiche CGU ou Politique de confidentialité dans un Modal RN
 * (pageSheet), SANS navigation de route.
 *
 * POURQUOI un modal et pas router.push('/legal/...') : depuis l'écran
 * d'inscription, l'utilisateur n'est pas authentifié. Naviguer vers /legal/*
 * (hors du groupe (auth)) déclenche l'AuthGuard racine qui le réexpédie vers
 * l'accueil (welcome). Un modal local ne change pas de route → aucun rejet.
 *
 * Le contenu (texte légal) est la MÊME source que les écrans pleins
 * (app/legal/cgu.tsx, app/legal/privacy.tsx) via les consts exportées.
 */

import { type FC } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { CGU_CONTENT } from '@/app/legal/cgu'
import { PRIVACY_CONTENT } from '@/app/legal/privacy'
import { LegalSections } from '@/components/legal/LegalSections'
import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

export type LegalDoc = 'cgu' | 'privacy'

const CONTENT = { cgu: CGU_CONTENT, privacy: PRIVACY_CONTENT }

interface Props {
  /** Document à afficher, ou `null` pour fermer le modal. */
  doc: LegalDoc | null
  onClose: () => void
}

export const LegalModal: FC<Props> = ({ doc, onClose }) => {
  const insets = useSafeAreaInsets()
  const content = doc ? CONTENT[doc] : null

  return (
    <Modal
      visible={!!content}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {content?.title ?? ''}
          </Text>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>

        {content ? (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + spacing['2xl'] },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <LegalSections subtitle={content.subtitle} sections={content.sections} />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.xl,
    paddingRight: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h4, color: colors.ink, flex: 1 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    gap: spacing.lg,
  },
})
