/**
 * AdvisorHistorySheet — liste des conversations passées du Beauty Advisor.
 * Tap sur une conversation → la reprend. Icône corbeille → suppression.
 */
import { useEffect, useState, type FC } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import {
  deleteConversation,
  listConversations,
  type ConversationSummary,
} from '@/lib/advisor/conversations'

interface Props {
  visible: boolean
  onClose: () => void
  onSelect: (conversationId: string) => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export const AdvisorHistorySheet: FC<Props> = ({ visible, onClose, onSelect }) => {
  const [rows, setRows] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    void listConversations()
      .then(setRows)
      .finally(() => setLoading(false))
  }, [visible])

  async function handleDelete(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    await deleteConversation(id)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Mes conversations</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>Aucune conversation pour le moment.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => onSelect(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={r.title ?? 'Conversation'}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.inkMuted} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {r.title ?? 'Conversation'}
                    </Text>
                    <Text style={styles.rowDate}>{formatDate(r.updated_at)}</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => void handleDelete(r.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer la conversation"
                  style={styles.del}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.inkLight} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
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
  title: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.inkMuted },
  list: { padding: spacing.base, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.ink },
  rowDate: { fontFamily: fontFamilies.regular, fontSize: 11.5, color: colors.inkLight, marginTop: 2 },
  del: { padding: spacing.md },
})
