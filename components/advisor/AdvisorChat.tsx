/**
 * AdvisorChat — interface de chat avec l'IA Beauty Advisor (twin mobile de
 * CosmetWiki/components/advisor/AdvisorChat.tsx).
 *
 * - Bulles user/assistant, avatar ✨, suggestions, points de saisie animés.
 * - Rendu markdown léger (**gras**, *italique*, `code`, puces).
 * - Envoi en STREAMING via expo/fetch (SDK 54) vers l'Edge Function
 *   `advisor-chat` :
 *     POST ${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/advisor-chat
 *     headers: Authorization: Bearer <access_token>, apikey: <anon>
 *     body: { messages: [{ role, content }] }
 *   Les chunks texte sont accumulés dans la dernière bulle assistant.
 * - DÉGRADE EN DOUCEUR : fonction non déployée / erreur réseau / pas de session
 *   → bulle d'erreur FR amicale, jamais de crash.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
// expo/fetch : implémentation streaming fiable sous React Native (SDK 54).
import { fetch as expoFetch } from 'expo/fetch'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'

type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  time?: string
  /** Message d'accueil : exclu de l'historique envoyé à l'API. */
  uiOnly?: boolean
}

const SUGGESTED_PROMPTS = [
  'Que penses-tu de ma routine ?',
  'Quels ingrédients prioriser pour ma peau ?',
  'Quels ingrédients éviter selon mon profil ?',
  "Comment ajuster ma routine pour l'hiver ?",
]

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export const AdvisorChat: FC<{ firstName: string }> = ({ firstName }) => {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content: `Salut ${firstName} 👋\nJe suis là pour t'aider avec ta routine ou tes ingrédients.\n\n**Que souhaites-tu savoir ?**`,
      time: getTime(),
      uiOnly: true,
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [messages])

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text || streaming) return
      setStreaming(true)

      const userMsg: ChatMsg = { role: 'user', content: text, time: getTime() }
      // Historique envoyé à l'API : sans les messages purement UI.
      const apiMessages = [
        ...messages.filter((m) => !m.uiOnly).map((m) => ({ role: m.role, content: m.content })),
        { role: userMsg.role, content: userMsg.content },
      ]
      setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', time: getTime() }])
      setInput('')

      const replaceLastAssistant = (content: string) =>
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content, time: getTime() }
          return copy
        })

      const failWith = (msg: string) => replaceLastAssistant(msg)

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token || !SUPABASE_URL) {
          failWith("Je ne parviens pas à m'authentifier. Reconnecte-toi puis réessaie.")
          return
        }

        const res = await expoFetch(`${SUPABASE_URL}/functions/v1/advisor-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON,
          },
          body: JSON.stringify({ messages: apiMessages }),
        })

        if (!res.ok) {
          if (res.status === 429) {
            failWith(
              "Tu as atteint la limite de questions pour aujourd'hui. Reviens demain, je serai là 💜",
            )
          } else {
            failWith(
              "Le conseiller IA est momentanément indisponible. Réessaie dans un instant.",
            )
          }
          return
        }

        const body = res.body
        if (!body) {
          // Pas de stream : on tente une lecture texte complète.
          const full = await res.text().catch(() => '')
          replaceLastAssistant(full.trim() || "Je n'ai pas pu générer de réponse cette fois-ci.")
          return
        }

        const reader = body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          replaceLastAssistant(buffer)
        }
        buffer += decoder.decode()
        if (buffer.trim().length === 0) {
          replaceLastAssistant("Je n'ai pas pu générer de réponse cette fois-ci.")
        } else {
          replaceLastAssistant(buffer)
        }
      } catch {
        failWith('Connexion interrompue. Vérifie ta connexion et réessaie.')
      } finally {
        setStreaming(false)
      }
    },
    [messages, streaming],
  )

  const showSuggestions = messages.filter((m) => !m.uiOnly).length === 0

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            msg={m}
            isLast={i === messages.length - 1}
            streaming={streaming}
          />
        ))}
      </ScrollView>

      {showSuggestions && (
        <View style={styles.suggestionsWrap}>
          <Text style={styles.suggestionsLabel}>SUGGESTIONS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsRow}
          >
            {SUGGESTED_PROMPTS.map((p) => (
              <Pressable
                key={p}
                onPress={() => void send(p)}
                disabled={streaming}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                  streaming && styles.chipDisabled,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={streaming ? 'Génération en cours…' : 'Pose ta question…'}
          placeholderTextColor={colors.inkLight}
          editable={!streaming}
          maxLength={500}
          selectionColor={colors.textSelection}
          style={styles.input}
          multiline
          onSubmitEditing={() => void send(input)}
          blurOnSubmit
          returnKeyType="send"
        />
        <Pressable
          onPress={() => void send(input)}
          disabled={streaming || input.trim().length === 0}
          style={({ pressed }) => [
            styles.sendBtn,
            (streaming || input.trim().length === 0) && styles.sendBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
        >
          {streaming ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons name="send" size={16} color={colors.surface} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

// ─── Bulle de message ────────────────────────────────────────────────────────

const MessageBubble: FC<{ msg: ChatMsg; isLast: boolean; streaming: boolean }> = ({
  msg,
  isLast,
  streaming,
}) => {
  const isUser = msg.role === 'user'
  const showDots = !isUser && msg.content.length === 0 && streaming && isLast

  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowEnd : styles.rowStart]}>
      <View style={[styles.bubbleCol, isUser ? styles.colEnd : styles.colStart]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>✨</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {isUser ? (
            <Text style={styles.userText}>{msg.content}</Text>
          ) : showDots ? (
            <TypingDots />
          ) : (
            <MarkdownMessage content={msg.content} />
          )}
        </View>
        {msg.time ? (
          <Text style={styles.time}>
            {msg.time}
            {isUser ? <Text style={styles.ticks}>{'  ✓✓'}</Text> : null}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

// ─── Markdown léger ──────────────────────────────────────────────────────────

const INLINE_RE = /\*\*([^*]+?)\*\*|__([^_]+?)__|_([^_]+?)_|\*([^*]+?)\*|`([^`]+?)`/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  let i = 0
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index))
    if (m[1] !== undefined) {
      nodes.push(
        <Text key={`${keyPrefix}-b-${i}`} style={styles.mdBold}>
          {m[1]}
        </Text>,
      )
    } else if (m[2] !== undefined) {
      nodes.push(
        <Text key={`${keyPrefix}-u-${i}`} style={styles.mdUnderline}>
          {m[2]}
        </Text>,
      )
    } else if (m[3] !== undefined || m[4] !== undefined) {
      nodes.push(
        <Text key={`${keyPrefix}-i-${i}`} style={styles.mdItalic}>
          {m[3] ?? m[4]}
        </Text>,
      )
    } else if (m[5] !== undefined) {
      nodes.push(
        <Text key={`${keyPrefix}-c-${i}`} style={styles.mdCode}>
          {m[5]}
        </Text>,
      )
    }
    lastIdx = m.index + m[0].length
    i++
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx))
  return nodes
}

const MarkdownMessage: FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let listBuf: string[] = []
  let key = 0

  const flushList = () => {
    if (listBuf.length === 0) return
    const items = listBuf
    blocks.push(
      <View key={`ul-${key++}`} style={styles.mdList}>
        {items.map((it, idx) => (
          <View key={idx} style={styles.mdListItem}>
            <Text style={styles.mdBullet}>{'•  '}</Text>
            <Text style={styles.assistantText}>{renderInline(it, `li-${idx}`)}</Text>
          </View>
        ))}
      </View>,
    )
    listBuf = []
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].replace(/\s+$/, '')
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) {
      listBuf.push(bullet[1])
      continue
    }
    flushList()
    if (line.trim() === '') {
      blocks.push(<View key={`sp-${key++}`} style={styles.mdSpacer} />)
    } else {
      blocks.push(
        <Text key={`p-${key++}`} style={styles.assistantText}>
          {renderInline(line, `p-${idx}`)}
        </Text>,
      )
    }
  }
  flushList()

  return (
    <View style={styles.mdRoot}>
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </View>
  )
}

// ─── Points de saisie animés ─────────────────────────────────────────────────

const TypingDots: FC = () => (
  <View style={styles.dotsRow}>
    <Dot delay={0} />
    <Dot delay={150} />
    <Dot delay={300} />
  </View>
)

const Dot: FC<{ delay: number }> = ({ delay }) => {
  const v = useSharedValue(0)
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true),
    )
  }, [v, delay])
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + v.value * 0.65,
    transform: [{ translateY: -v.value * 2 }],
  }))
  return <Animated.View style={[styles.dot, style, delay > 0 && { marginLeft: 4 }]} />
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.base,
    paddingBottom: spacing.base,
    gap: spacing.base,
  },

  // Bulles
  bubbleRow: {
    flexDirection: 'row',
  },
  rowEnd: { justifyContent: 'flex-end' },
  rowStart: { justifyContent: 'flex-start' },
  bubbleCol: {
    maxWidth: '84%',
  },
  colEnd: { alignItems: 'flex-end' },
  colStart: { alignItems: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarEmoji: { fontSize: 14 },
  bubble: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bubbleUser: {
    backgroundColor: '#111111',
    borderBottomRightRadius: radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gray100,
    borderBottomLeftRadius: radius.sm,
  },
  userText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.surface,
  },
  assistantText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  time: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    color: colors.inkLight,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  ticks: { color: '#FB7185' },

  // Markdown
  mdRoot: { gap: 2 },
  mdBold: { fontFamily: fontFamilies.semiBold, color: colors.ink },
  mdItalic: { fontStyle: 'italic' },
  mdUnderline: { textDecorationLine: 'underline' },
  mdCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12.5,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  mdList: { gap: 2, marginVertical: 2 },
  mdListItem: { flexDirection: 'row' },
  mdBullet: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  mdSpacer: { height: 8 },

  // Typing dots
  dotsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inkLight,
  },

  // Suggestions
  suggestionsWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  suggestionsLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  suggestionsRow: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: '#111111',
    backgroundColor: colors.surface,
  },
  chipPressed: { backgroundColor: '#111111' },
  chipDisabled: { opacity: 0.5 },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.ink,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.85 },
})
