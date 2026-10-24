/**
 * Dictée vocale en temps réel pour la saisie du Beauty Advisor.
 *
 * - Reconnaissance native (Apple Speech / service Google), français par défaut,
 *   résultats partiels affichés mot à mot dans la saisie.
 * - À la fin : correction locale immédiate (`correctTranscriptLocal`), puis
 *   relecture IA en arrière-plan (`voice-correct`), appliquée seulement si la
 *   saisie n'a pas bougé entre-temps.
 *
 * Le module natif est OPTIONNEL : `runtimeVersion` suit la version de l'app,
 * mais un bundle JS livré à un binaire qui n'a pas le module ne doit pas
 * planter l'Advisor. Sans module (ou sans service de reconnaissance), le micro
 * est simplement masqué (`available = false`).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking } from 'react-native'
import { requireOptionalNativeModule } from 'expo'
import { useSharedValue, withTiming } from 'react-native-reanimated'
import type { ExpoSpeechRecognitionNativeEventMap } from 'expo-speech-recognition'

import {
  applyRecognitionResult,
  composeDraft,
  correctTranscriptLocal,
  DICTATION_CONTEXT_WORDS,
  DICTATION_LANG,
  joinSpoken,
} from '@/lib/voice/transcript'
import { correctTranscriptRemote } from '@/lib/voice/correctRemote'

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule']
type EventName = keyof ExpoSpeechRecognitionNativeEventMap

const speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition')

function isRecognitionAvailable(): boolean {
  if (!speech) return false
  try {
    return speech.isRecognitionAvailable()
  } catch {
    return false
  }
}

export type DictationStatus = 'idle' | 'starting' | 'listening' | 'correcting'

interface Options {
  /** Texte actuel de la saisie (lu au démarrage et avant d'appliquer la relecture IA). */
  getText: () => string
  /** Écrit dans la saisie. */
  setText: (text: string) => void
}

export function useVoiceDictation({ getText, setText }: Options) {
  const [available] = useState(isRecognitionAvailable)
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  /** Volume de la voix, 0 à 1, pour l'anneau du bouton micro. */
  const level = useSharedValue(0)

  // Une séance = un appui sur le micro. Les événements d'une séance terminée
  // (fin tardive, erreur après arrêt) sont ignorés.
  const sessionRef = useRef(0)
  const activeRef = useRef(false)
  const baseRef = useRef('')
  const partsRef = useRef({ committed: '', interim: '' })
  const mountedRef = useRef(true)
  const setTextRef = useRef(setText)
  const getTextRef = useRef(getText)
  setTextRef.current = setText
  getTextRef.current = getText

  const safeSetStatus = (s: DictationStatus) => {
    if (mountedRef.current) setStatus(s)
  }

  /** Fin de séance : correction locale puis relecture IA en arrière-plan. */
  const finalize = useCallback(
    (session: number) => {
      if (session !== sessionRef.current || !activeRef.current) return
      activeRef.current = false
      level.value = withTiming(0, { duration: 160 })

      const { committed, interim } = partsRef.current
      const dictated = joinSpoken(committed, interim)
      if (!dictated) {
        setTextRef.current(baseRef.current)
        safeSetStatus('idle')
        return
      }
      const local = correctTranscriptLocal(dictated)
      const base = baseRef.current
      const shown = joinSpoken(base, local)
      setTextRef.current(shown)
      safeSetStatus('correcting')

      void correctTranscriptRemote(local).then((better) => {
        // Nouvelle séance lancée, texte retouché ou déjà envoyé : on ne touche à rien.
        if (session === sessionRef.current && better && getTextRef.current() === shown) {
          setTextRef.current(joinSpoken(base, better))
        }
        if (session === sessionRef.current) safeSetStatus('idle')
      })
    },
    [level],
  )

  // Abonnements aux événements natifs (une fois).
  useEffect(() => {
    mountedRef.current = true
    if (!speech) return
    const subs: Array<{ remove: () => void }> = []
    const on = <K extends EventName>(name: K, cb: (e: ExpoSpeechRecognitionNativeEventMap[K]) => void) => {
      subs.push(
        (speech as unknown as {
          addListener: (n: string, l: (e: unknown) => void) => { remove: () => void }
        }).addListener(name, cb as (e: unknown) => void),
      )
    }

    on('start', () => {
      if (activeRef.current) safeSetStatus('listening')
    })
    on('result', (e) => {
      if (!activeRef.current) return
      const transcript = e.results?.[0]?.transcript ?? ''
      partsRef.current = applyRecognitionResult(partsRef.current, transcript, e.isFinal)
      const { committed, interim } = partsRef.current
      setTextRef.current(composeDraft(baseRef.current, committed, interim))
    })
    on('volumechange', (e) => {
      if (!activeRef.current) return
      // Échelle native : -2 (silence) à 10 (fort).
      const v = Math.max(0, Math.min(1, (e.value + 2) / 12))
      level.value = withTiming(v, { duration: 140 })
    })
    on('error', (e) => {
      const session = sessionRef.current
      if (e.error === 'aborted') return
      if (e.error === 'not-allowed') {
        activeRef.current = false
        safeSetStatus('idle')
        Alert.alert(
          'Micro désactivé',
          "Autorise le micro et la reconnaissance vocale dans les réglages pour dicter ta question à Perle.",
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Réglages', onPress: () => void Linking.openSettings() },
          ],
        )
        return
      }
      if (e.error !== 'no-speech' && e.error !== 'speech-timeout' && mountedRef.current) {
        setNotice(
          e.error === 'network'
            ? 'Pas de connexion pour la dictée. Réessaie ou écris ta question.'
            : "La dictée n'a pas fonctionné. Réessaie ou écris ta question.",
        )
      }
      finalize(session)
    })
    on('end', () => finalize(sessionRef.current))

    return () => {
      mountedRef.current = false
      subs.forEach((s) => s.remove())
      if (activeRef.current) {
        activeRef.current = false
        try {
          speech.abort()
        } catch {
          // déjà arrêté
        }
      }
    }
  }, [finalize, level])

  // Le message d'erreur s'efface tout seul.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const start = useCallback(async () => {
    if (!speech || activeRef.current) return
    setNotice(null)
    const session = ++sessionRef.current
    activeRef.current = true
    baseRef.current = getTextRef.current().trim()
    partsRef.current = { committed: '', interim: '' }
    safeSetStatus('starting')

    try {
      const perm = await speech.requestPermissionsAsync()
      if (session !== sessionRef.current) return
      if (!perm.granted) {
        activeRef.current = false
        safeSetStatus('idle')
        Alert.alert(
          'Micro désactivé',
          "Autorise le micro et la reconnaissance vocale dans les réglages pour dicter ta question à Perle.",
          perm.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Réglages', onPress: () => void Linking.openSettings() },
              ],
        )
        return
      }
      speech.start({
        lang: DICTATION_LANG,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        contextualStrings: DICTATION_CONTEXT_WORDS,
        iosTaskHint: 'dictation',
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      })
    } catch {
      activeRef.current = false
      safeSetStatus('idle')
      if (mountedRef.current) setNotice("La dictée n'a pas pu démarrer. Écris ta question.")
    }
  }, [])

  /** Arrêt normal : le moteur envoie son dernier résultat, puis `end` finalise. */
  const stop = useCallback(() => {
    if (!speech || !activeRef.current) return
    try {
      speech.stop()
    } catch {
      finalize(sessionRef.current)
    }
  }, [finalize])

  /**
   * Arrêt immédiat avant un envoi : renvoie le texte complet corrigé
   * localement (sans attendre le moteur ni la relecture IA).
   */
  const finishNow = useCallback((): string | null => {
    if (!activeRef.current) return null
    const { committed, interim } = partsRef.current
    const text = joinSpoken(baseRef.current, correctTranscriptLocal(joinSpoken(committed, interim)))
    activeRef.current = false
    sessionRef.current++
    level.value = withTiming(0, { duration: 160 })
    safeSetStatus('idle')
    try {
      speech?.abort()
    } catch {
      // déjà arrêté
    }
    return text
  }, [level])

  return {
    available,
    status,
    listening: status === 'starting' || status === 'listening',
    notice,
    level,
    start,
    stop,
    finishNow,
  }
}
