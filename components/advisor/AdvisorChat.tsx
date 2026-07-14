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
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CREDITS_EXHAUSTED_EVENT } from '@/lib/credits/exhaustedStore'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { supabase } from '@/lib/supabase/client'
import { useLaunchAlternative } from '@/hooks/useLaunchAlternative'
import { AlternativesCarousel } from '@/components/analysis/AlternativesCarousel'
import { ProcessingOverlay } from '@/components/shared/ProcessingOverlay'
import {
  askAdvisorAgent,
  askAdvisorAgentStreaming,
  makeLoadingSequence,
  advisorLoadingColor,
  ADVISOR_LOADING_STEPS,
  AdvisorNoCreditsError,
  AdvisorRateLimitError,
  AdvisorUnavailableError,
  AdvisorStreamUnsupportedError,
  type AdvisorAgentResult,
} from '@/lib/advisor/agentClient'
import { prefetchProductsAnalyses } from '@/lib/analysis/eanAnalysisPrefetch'
import {
  createConversation,
  saveAdvisorMessage,
  type StoredMessage,
} from '@/lib/advisor/conversations'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  time?: string
  /** Message d'accueil : exclu de l'historique envoyé à l'API. */
  uiOnly?: boolean
  /** Bulle d'erreur locale (auth/réseau/crédits) : pas de bouton reco dessus. */
  errorMsg?: boolean
  /** Intention produit décidée par l'agent : 'offer' → bouton « Explorer quelques
   *  pistes » proposé quand aucun produit n'est affiché ; 'none' → aucun bouton. */
  productOffer?: 'none' | 'offer'
  /** Une recommandation produit a été demandée pour ce message. */
  recoTried?: boolean
  /** Recherche des produits en cours. */
  recoLoading?: boolean
  /** Produits recommandés à afficher en carrousel sous la bulle. */
  products?: AlternativeProduct[]
  /** Critères de la reco (pour le « Voir plus » qui ouvre la page paginée). */
  recoCriteria?: { ingredients: string[]; form: string | null; exclude?: string[] }
  /** Raison d'un carrousel vide : 'restrictions' (tout filtré) ou 'none' (rien trouvé). */
  recoEmptyReason?: 'restrictions' | 'none' | null
  /** Compromis proposé quand aucune reco ne coche TOUTES les contraintes ad-hoc. */
  recoRelaxation?: {
    keptLabels: string[]
    droppedLabels: string[]
    products: AlternativeProduct[]
  } | null
}

const SUGGESTED_PROMPTS = [
  'Que penses-tu de ma routine ?',
  'Conseille-moi une crème adaptée à ma peau',
  'Quels ingrédients éviter selon mon profil ?',
  "Comment ajuster ma routine pour l'hiver ?",
]

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

/**
 * Message envoyé à l'agent quand l'utilisateur tape le bouton « Montre-moi des
 * recommandations » (affiché sous une réponse SANS produits). Il n'apparaît pas
 * comme bulle : seul le carrousel du message concerné se remplit.
 */
const RECO_REQUEST_PROMPT = 'Montre-moi des produits recommandés adaptés à ma demande.'

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

interface AdvisorChatProps {
  firstName: string
  /** Conversation existante à reprendre (sinon nouvelle conversation). */
  conversationId?: string | null
  /** Messages d'une conversation chargée depuis l'historique. */
  initialMessages?: StoredMessage[] | null
  /** Notifie le parent quand une nouvelle conversation est créée (1er message). */
  onConversationCreated?: (id: string) => void
}

const greeting = (firstName: string): ChatMsg => ({
  role: 'assistant',
  content: `Salut ${firstName} 👋\n\n**Que souhaites-tu savoir ?**`,
  time: getTime(),
  uiOnly: true,
})

export const AdvisorChat: FC<AdvisorChatProps> = ({
  firstName,
  conversationId = null,
  initialMessages = null,
  onConversationCreated,
}) => {
  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    initialMessages && initialMessages.length > 0
      ? initialMessages.map((m) => ({
          role: m.role,
          content: m.content,
          products: m.products ?? undefined,
          recoCriteria: m.recoCriteria ?? undefined,
          recoTried: !!(m.products && m.products.length > 0) || !!m.recoCriteria,
        }))
      : [greeting(firstName)],
  )
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  // Statut de progression RÉEL remonté par le flux (« Je cherche… », « J'analyse
  // N produits… »). Quand il est renseigné, il remplace la phrase rotative.
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  // Tick pour faire tourner les messages de chargement pendant l'attente de l'agent.
  const [loadingTick, setLoadingTick] = useState(0)
  // Ordre aléatoire des phrases de chargement, régénéré à chaque envoi.
  const loadingSeqRef = useRef<string[]>(ADVISOR_LOADING_STEPS.slice())
  const scrollRef = useRef<ScrollView>(null)
  const { analyze, isAnalyzing } = useLaunchAlternative()
  const router = useRouter()
  const qc = useQueryClient()
  // Id de la conversation courante (créée à la volée au 1er message).
  const convIdRef = useRef<string | null>(conversationId)

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [messages])

  // Messages de chargement rotatifs pendant l'attente de l'agent : intervalle
  // ALÉATOIRE (1,4 s à 3,2 s) pour un rythme naturel, pas mécanique.
  useEffect(() => {
    if (!streaming) return
    setLoadingTick(0)
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      const delay = 1400 + Math.random() * 1800
      id = setTimeout(() => {
        setLoadingTick((t) => t + 1)
        tick()
      }, delay)
    }
    tick()
    return () => clearTimeout(id)
  }, [streaming])

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text || streaming) return
      // Nouvel ordre aléatoire des phrases de chargement pour cet envoi (fallback
      // si le flux ne remonte pas de statut réel).
      loadingSeqRef.current = makeLoadingSequence()
      setLiveStatus(null)
      setStreaming(true)

      const userMsg: ChatMsg = { role: 'user', content: text, time: getTime() }
      // Historique envoyé à l'agent : plain {role, content}, sans les messages
      // purement UI (accueil). L'agent ne parse pas de bloc technique : le contenu
      // visible suffit (le serveur tronque aux 12 derniers tours).
      const apiMessages = [
        ...messages
          .filter((m) => !m.uiOnly)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMsg.content },
      ]
      setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', time: getTime() }])
      setInput('')

      // Persistance historique (best-effort) : conversation créée au 1er message.
      let convId = convIdRef.current
      if (!convId) {
        convId = await createConversation(text)
        if (convId) {
          convIdRef.current = convId
          onConversationCreated?.(convId)
        }
      }
      if (convId) void saveAdvisorMessage(convId, { role: 'user', content: text })

      // Pour sauvegarder la réponse de l'assistant en fin de tour.
      let finalAssistant = ''
      let finalProducts: AlternativeProduct[] = []

      const updateLastAssistant = (patch: Partial<ChatMsg>) =>
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = {
            ...last,
            ...patch,
            role: 'assistant',
            time: last?.time ?? getTime(),
          }
          return copy
        })

      const failWith = (msg: string) => updateLastAssistant({ content: msg, errorMsg: true })

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token || !SUPABASE_URL) {
          failWith("Je ne parviens pas à m'authentifier. Reconnecte-toi puis réessaie.")
          return
        }

        // EAN déjà affichés dans la conversation → l'agent les exclut pour que
        // « montre-m'en d'autres » renvoie de NOUVEAUX produits.
        const seenEans = Array.from(
          new Set(
            messages.flatMap((m) => (m.products ?? []).map((p) => p.ean)).filter(Boolean),
          ),
        )
        // Agent : on tente le STREAMING (événements de progression réels pendant
        // la phase outils → on affiche « Je cherche… », « J'analyse N produits… »).
        // Le `result` final (texte + produits DÉJÀ vérifiés côté serveur) est
        // identique au mode bloquant. Si le runtime ne sait pas lire le flux, on
        // retombe proprement sur l'appel bloquant (mêmes données).
        let result: AdvisorAgentResult
        try {
          result = await askAdvisorAgentStreaming(apiMessages, token, seenEans, (s) =>
            setLiveStatus(s.label),
          )
        } catch (streamErr) {
          if (streamErr instanceof AdvisorStreamUnsupportedError) {
            result = await askAdvisorAgent(apiMessages, token, seenEans)
          } else {
            throw streamErr
          }
        }
        finalAssistant = result.reply
        finalProducts = result.products

        // Une fois la réponse reçue, on rend la main à l'animation typewriter :
        // le statut live n'a plus lieu d'être.
        setLiveStatus(null)
        // Mémorise l'intention produit décidée par l'agent (pilote le bouton).
        // Posée avant le typewriter : les updates de contenu la préservent (spread).
        updateLastAssistant({ productOffer: result.productOffer })

        // 1) Dévoilement progressif du texte (~1,2 s max quelle que soit la longueur).
        const full = finalAssistant
        const steps = Math.min(full.length, 46)
        const chunk = Math.max(1, Math.ceil(full.length / steps))
        for (let i = chunk; i < full.length; i += chunk) {
          updateLastAssistant({ content: full.slice(0, i) })
          await new Promise((r) => setTimeout(r, 26))
        }
        updateLastAssistant({ content: full })

        // 2) Puis les cartes produit (vérifiées) apparaissent, juste après le texte.
        if (result.products.length > 0) {
          await new Promise((r) => setTimeout(r, 180))
          updateLastAssistant({
            products: result.products,
            recoTried: true,
            recoLoading: false,
            recoEmptyReason: null,
            recoRelaxation: null,
            recoCriteria: undefined,
          })
          // Préchargement LECTURE SEULE des analyses → clic instantané ensuite.
          prefetchProductsAnalyses(qc, result.products.map((p) => p.ean))
        }

        // Sauvegarde la réponse (avec ses produits vérifiés) dans l'historique.
        if (convId) {
          void saveAdvisorMessage(convId, {
            role: 'assistant',
            content: finalAssistant,
            products: finalProducts,
            recoCriteria: null,
          })
        }
      } catch (err) {
        if (err instanceof AdvisorNoCreditsError) {
          failWith(err.message)
          // Ouvre la modale globale « Crédits épuisés » (→ /offre).
          DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, { used: err.used, limit: err.limit })
        } else if (err instanceof AdvisorRateLimitError) {
          failWith('Tu vas un peu vite 😅 Patiente une minute et réessaie.')
        } else if (err instanceof AdvisorUnavailableError) {
          failWith('Le conseiller IA est momentanément indisponible. Réessaie dans un instant.')
        } else {
          failWith('Connexion interrompue. Vérifie ta connexion et réessaie.')
        }
      } finally {
        setStreaming(false)
        setLiveStatus(null)
        // L'agent débite le(s) crédit(s) côté serveur → on rafraîchit la pastille.
        void qc.invalidateQueries({ queryKey: ['credits'] })
      }
    },
    [messages, streaming, qc],
  )

  // L'utilisateur accepte le compromis : on charge le set relâché dans le carrousel.
  const acceptRelaxation = useCallback((index: number) => {
    setMessages((prev) =>
      prev.map((mm, idx) =>
        idx === index && mm.recoRelaxation
          ? { ...mm, products: mm.recoRelaxation.products, recoEmptyReason: null, recoRelaxation: null }
          : mm,
      ),
    )
  }, [])

  // Bouton « Montre-moi des recommandations » (sous la dernière réponse sans
  // produits) : relance l'agent avec l'historique + une demande de reco explicite.
  // Le texte de la bulle ne change pas ; seul le carrousel du message se remplit.
  const [recoRequesting, setRecoRequesting] = useState(false)
  const requestReco = useCallback(
    async (index: number) => {
      if (streaming || recoRequesting) return
      setRecoRequesting(true)
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, recoTried: true, recoLoading: true } : m)),
      )
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token || !SUPABASE_URL) throw new AdvisorUnavailableError()

        const apiMessages = [
          ...messages
            .slice(0, index + 1)
            .filter((m) => !m.uiOnly && !m.errorMsg)
            .map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: RECO_REQUEST_PROMPT },
        ]
        const seenEans = Array.from(
          new Set(
            messages.flatMap((m) => (m.products ?? []).map((p) => p.ean)).filter(Boolean),
          ),
        )
        const result = await askAdvisorAgent(apiMessages, token, seenEans)
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index
              ? {
                  ...m,
                  recoLoading: false,
                  products: result.products,
                  recoEmptyReason: result.products.length === 0 ? 'none' : null,
                }
              : m,
          ),
        )
        if (result.products.length > 0) {
          prefetchProductsAnalyses(qc, result.products.map((p) => p.ean))
        }
      } catch (err) {
        // Échec : on retire l'état de chargement et on remet le bouton.
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index ? { ...m, recoTried: false, recoLoading: false } : m,
          ),
        )
        if (err instanceof AdvisorNoCreditsError) {
          DeviceEventEmitter.emit(CREDITS_EXHAUSTED_EVENT, { used: err.used, limit: err.limit })
        }
      } finally {
        setRecoRequesting(false)
        void qc.invalidateQueries({ queryKey: ['credits'] })
      }
    },
    [messages, streaming, recoRequesting, qc],
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
          <Fragment key={i}>
            <MessageBubble
              msg={m}
              isLast={i === messages.length - 1}
              streaming={streaming}
              loadingLabel={
                liveStatus ?? loadingSeqRef.current[loadingTick % loadingSeqRef.current.length]
              }
              loadingColor={advisorLoadingColor(loadingTick)}
            />
            {/* Bouton « Montre-moi des recommandations » : uniquement sous la
                DERNIÈRE réponse de l'assistant quand aucune reco n'a été faite. */}
            {m.role === 'assistant' &&
            m.productOffer === 'offer' &&
            !m.recoTried &&
            !m.uiOnly &&
            !m.errorMsg &&
            m.content.length > 0 &&
            i === messages.length - 1 &&
            !streaming ? (
              <View style={styles.recoAskWrap}>
                <Pressable
                  onPress={() => void requestReco(i)}
                  disabled={recoRequesting}
                  style={({ pressed }) => [
                    styles.recoAskBtn,
                    pressed && styles.recoAskBtnPressed,
                    recoRequesting && styles.recoAskBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Explorer quelques pistes"
                >
                  <Text style={styles.recoAskEmoji}>✨</Text>
                  <Text style={styles.recoAskText}>Explorer quelques pistes</Text>
                </Pressable>
              </View>
            ) : null}
            {m.role === 'assistant' && m.recoTried ? (
              <View style={styles.recoWrap}>
                {m.recoRelaxation && !m.recoLoading && (m.products?.length ?? 0) === 0 ? (
                  <View style={styles.relaxBox}>
                    <Text style={styles.relaxText}>
                      {m.recoRelaxation.keptLabels.length > 0
                        ? `Aucun produit ne coche tout. J'en ai ${m.recoRelaxation.products.length} ${m.recoRelaxation.keptLabels.join(' et ')}, mais je ne peux pas garantir : ${m.recoRelaxation.droppedLabels.join(', ')}.`
                        : `Aucun produit ne respecte toutes ces contraintes dans notre base. J'ai ${m.recoRelaxation.products.length} produits du bon type (compatibles avec ton profil), mais je ne peux pas garantir : ${m.recoRelaxation.droppedLabels.join(', ')}.`}
                    </Text>
                    <Pressable
                      onPress={() => acceptRelaxation(i)}
                      style={({ pressed }) => [styles.relaxBtn, pressed && styles.relaxBtnPressed]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.relaxBtnText}>
                        Voir ces {m.recoRelaxation.products.length} produits
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <AlternativesCarousel
                    products={m.products ?? []}
                    isInitialLoading={!!m.recoLoading}
                    isEmpty={!m.recoLoading && (m.products?.length ?? 0) === 0}
                    analyzing={isAnalyzing}
                    showSeeAll={(m.products?.length ?? 0) >= 10 && !!m.recoCriteria}
                    onSelect={(p) => void analyze(p)}
                    onSeeAll={() => {
                      if (!m.recoCriteria) return
                      router.push({
                        pathname: '/advisor/recommendations',
                        params: {
                          ingredients: m.recoCriteria.ingredients.join(','),
                          form: m.recoCriteria.form ?? '',
                          exclude: m.recoCriteria.exclude?.join(',') ?? '',
                        },
                      })
                    }}
                    title="Quelques pistes à considérer"
                    emptyText={
                      m.recoEmptyReason === 'restrictions'
                        ? "Des produits correspondaient, mais aucun ne respecte tes restrictions actuelles. Assouplis-les dans ton profil pour voir des suggestions."
                        : "Je n'ai pas trouvé de produit qui colle vraiment à ce besoin. Précise un peu et je recherche autrement."
                    }
                  />
                )}
              </View>
            ) : null}
          </Fragment>
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

      <ProcessingOverlay visible={isAnalyzing} message="On décode la composition…" />
    </KeyboardAvoidingView>
  )
}

// ─── Bulle de message ────────────────────────────────────────────────────────

const MessageBubble: FC<{
  msg: ChatMsg
  isLast: boolean
  streaming: boolean
  loadingLabel?: string
  loadingColor?: string
}> = ({ msg, isLast, streaming, loadingLabel, loadingColor }) => {
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
            <View style={styles.loadingRow}>
              <TypingDots />
              {loadingLabel ? (
                <ShimmerText text={loadingLabel} color={loadingColor ?? colors.gray500} />
              ) : null}
            </View>
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

// Texte de chargement coloré avec un BALAYAGE LUMINEUX qui passe sur les lettres
// (MaskedView = forme des lettres, LinearGradient blanc animé en translation).
const SHIMMER_BAND = 56
const ShimmerText: FC<{ text: string; color: string }> = ({ text, color }) => {
  const [w, setW] = useState(0)
  const tx = useSharedValue(-SHIMMER_BAND)
  useEffect(() => {
    if (w <= 0) return
    tx.value = -SHIMMER_BAND
    tx.value = withRepeat(
      withTiming(w + SHIMMER_BAND, { duration: 1300, easing: Easing.linear }),
      -1,
      false,
    )
  }, [w, text, tx])
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  return (
    <MaskedView
      style={styles.shimmerBox}
      maskElement={
        <Text style={[styles.loadingLabel, styles.shimmerMask]} numberOfLines={1}>
          {text}
        </Text>
      }
    >
      {/* Sizer invisible : donne au MaskedView la largeur exacte du texte. */}
      <Text
        style={[styles.loadingLabel, styles.shimmerSizer]}
        numberOfLines={1}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        {text}
      </Text>
      {/* Remplissage couleur des lettres. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
      {/* Bande blanche qui balaie. */}
      <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.95)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerBand}
        />
      </Animated.View>
    </MaskedView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  recoWrap: { paddingHorizontal: spacing.xs, marginTop: -spacing.sm },
  // ── Bouton « Montre-moi des recommandations » ──
  recoAskWrap: { paddingHorizontal: spacing.xs, marginTop: -spacing.sm },
  recoAskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  recoAskBtnPressed: { opacity: 0.8 },
  recoAskBtnDisabled: { opacity: 0.5 },
  recoAskEmoji: { fontSize: 12 },
  recoAskText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12.5,
    color: '#BE123C',
  },
  relaxBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E7E2EC',
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  relaxText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  relaxBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.success,
  },
  relaxBtnPressed: { opacity: 0.85 },
  relaxBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12.5,
    color: colors.gray500,
  },
  shimmerBox: { height: 18, justifyContent: 'center' },
  shimmerMask: { color: '#000', backgroundColor: 'transparent' },
  shimmerSizer: { opacity: 0 },
  shimmerBand: { width: SHIMMER_BAND, height: 18 },
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
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.85 },
})
