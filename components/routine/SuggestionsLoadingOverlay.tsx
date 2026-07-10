/**
 * SuggestionsLoadingOverlay — petit overlay modal affiché PENDANT la recherche
 * d'alternatives (« Proposer de meilleures alternatives » / « Suggestions
 * intelligentes »). L'appel Edge inclut une réanalyse IA (plusieurs secondes) :
 * sans ce retour visuel, l'utilisateur tape puis ne voit RIEN jusqu'à ce que le
 * deck apparaisse d'un coup. Ici : backdrop léger + carte centrée avec spinner
 * rose + message rassurant « processus en cours ».
 */

import { memo } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

interface Props {
  visible: boolean
  /** Message principal (défaut : recherche d'alternatives). */
  message?: string
}

export const SuggestionsLoadingOverlay = memo(function SuggestionsLoadingOverlay({
  visible,
  message = 'Recherche des meilleures alternatives…',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={22} color={colors.rose} />
          </View>
          <ActivityIndicator color={colors.rose} style={styles.spinner} />
          <Text style={styles.title}>{message}</Text>
        </View>
      </View>
    </Modal>
  )
})

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  spinner: {
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
  },
})
