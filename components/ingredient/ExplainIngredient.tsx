/**
 * ExplainIngredient — bloc IA "Expliqué simplement" de la fiche ingrédient.
 *
 * Miroir mobile de CosmetWiki components/ingredient/ExplainIngredient.tsx.
 * Au tap sur "Expliquer simplement", on déclenche EN PARALLÈLE deux Edge
 * Functions Supabase :
 *   - invoke('ingredient-explain', { slug })   → texte d'explication public.
 *   - invoke('ingredient-exposure', { slug })  → ligne perso "présent dans X
 *     de tes produits" (peut être null pour un visiteur sans historique).
 *
 * DÉGRADATION GRACIEUSE : les Edge Functions ne sont peut-être pas encore
 * déployées. Si `explain` échoue / introuvable, on affiche une note discrète
 * "indisponible" et on NE crash JAMAIS. La ligne `exposure` est bonus : son
 * échec est silencieux (callout simplement masqué).
 */

import { useState, type FC } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import { supabase } from '@/lib/supabase/client'
import {
  readAiCache,
  writeAiCache,
  TTL_INGREDIENT_EXPLAIN_MS,
  TTL_INGREDIENT_EXPOSURE_MS,
} from '@/lib/storage/aiCache'

interface Props {
  slug: string
}

type Phase = 'idle' | 'loading' | 'ready' | 'unavailable'

/** Extrait défensivement le texte d'explication d'une réponse Edge Function. */
function extractText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const t = r.text ?? r.explanation ?? r.content
  if (typeof t === 'string' && t.trim().length > 0) return t.trim()
  return null
}

/** Extrait défensivement la ligne perso d'exposition. */
function extractPersonalLine(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const l = r.personalLine ?? r.line ?? r.text
  if (typeof l === 'string' && l.trim().length > 0) return l.trim()
  return null
}

export const ExplainIngredient: FC<Props> = ({ slug }) => {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState<string | null>(null)
  const [personalLine, setPersonalLine] = useState<string | null>(null)

  async function load() {
    setPhase('loading')
    setPersonalLine(null)

    // 1. Cache local : explain (30j) + exposure (1h). On peut afficher dès que
    // l'explain est trouvé — l'exposure est bonus.
    const [cachedExplain, cachedExposure] = await Promise.all([
      readAiCache<string>('ingredient-explain', slug, TTL_INGREDIENT_EXPLAIN_MS),
      readAiCache<string>('ingredient-exposure', slug, TTL_INGREDIENT_EXPOSURE_MS),
    ])
    if (cachedExplain) {
      setText(cachedExplain)
      if (cachedExposure) setPersonalLine(cachedExposure)
      setPhase('ready')
      return
    }

    // 2. Miss → invoke. Les deux appels sont tirés EN PARALLÈLE. `exposure`
    // est best-effort : on l'enveloppe pour qu'un échec ne fasse jamais
    // rejeter le Promise.all.
    const [explainRes, exposureRes] = await Promise.all([
      supabase.functions
        .invoke('ingredient-explain', { body: { slug } })
        .then((r) => r)
        .catch(() => ({ data: null, error: new Error('invoke_failed') })),
      supabase.functions
        .invoke('ingredient-exposure', { body: { slug } })
        .then((r) => r)
        .catch(() => ({ data: null, error: new Error('invoke_failed') })),
    ])

    const explanation = explainRes.error ? null : extractText(explainRes.data)

    if (!explanation) {
      // Edge Function absente / en erreur → on dégrade silencieusement.
      setPhase('unavailable')
      return
    }

    setText(explanation)
    void writeAiCache('ingredient-explain', slug, explanation)

    if (!exposureRes.error) {
      const line = extractPersonalLine(exposureRes.data)
      if (line) {
        setPersonalLine(line)
        void writeAiCache('ingredient-exposure', slug, line)
      }
    }

    setPhase('ready')
  }

  if (phase === 'ready' && text) {
    const paragraphs = text.split('\n').filter((l) => l.trim().length > 0)
    return (
      <WhiteCard style={styles.card} padding={spacing.lg}>
        <View style={styles.headRow}>
          <Text style={styles.sparkle}>✨</Text>
          <Text style={styles.headTitle}>Expliqué simplement</Text>
        </View>
        <View style={styles.paragraphs}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </View>
        {personalLine ? (
          <View style={styles.personalCallout}>
            <Text style={styles.personalText}>🧴 {personalLine}</Text>
          </View>
        ) : null}
      </WhiteCard>
    )
  }

  if (phase === 'unavailable') {
    return (
      <View style={styles.unavailableWrap}>
        <Text style={styles.unavailableText}>
          ✨ Explication simplifiée momentanément indisponible.
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      onPress={() => void load()}
      disabled={phase === 'loading'}
      accessibilityRole="button"
      accessibilityLabel="Expliquer cet ingrédient simplement"
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        phase === 'loading' && styles.buttonDisabled,
      ]}
    >
      {phase === 'loading' ? (
        <ActivityIndicator size="small" color={colors.accentDeep} />
      ) : (
        <Text style={styles.buttonText}>✨ Expliquer simplement</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sparkle: {
    fontSize: 16,
  },
  headTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  paragraphs: {
    gap: 8,
  },
  paragraph: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  personalCallout: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.roseSoft,
  },
  personalText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.roseDeep,
  },
  unavailableWrap: {
    marginTop: spacing.lg,
  },
  unavailableText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
  },
  button: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 200,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 9999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.accentDeep,
  },
})
