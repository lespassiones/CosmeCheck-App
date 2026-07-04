/**
 * PasteLinkFlow — décoder une URL produit e-commerce (twin mobile du web
 * ProductUrlInput.tsx).
 *
 * Flux :
 *   1. input   : l'utilisateur colle une URL → bouton "Récupérer".
 *   2. fetching: appel à l'Edge Function `ecommerce-scrape`.
 *   3. preview : on affiche la fiche du produit récupéré (image, marque, nom,
 *                snippet description) + bouton "Oui, analyser" ou "Refaire".
 *   4. error   : message d'erreur + bouton "Coller la composition à la main".
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

interface Props {
  /** Callback quand l'extraction réussit + user confirme. */
  onInciReady: (
    inci: string,
    extra: {
      productName?: string
      brand?: string
      sourceUrl: string
      imageUrl?: string
    },
  ) => void
  onFallbackToManual: () => void
  disabled?: boolean
}

interface ScrapeResult {
  ok: true
  productName: string | null
  brand: string | null
  description: string | null
  ingredientsText: string | null
  imageUrl: string | null
  sourceUrl: string
  source: { metadata: string; inci: 'llm' | 'none'; cached: boolean }
}

type Step = 'input' | 'fetching' | 'preview' | 'error'

export const PasteLinkFlow: FC<Props> = ({
  onInciReady,
  onFallbackToManual,
  disabled = false,
}) => {
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<ScrapeResult | null>(null)

  /** Validation rapide côté client avant d'envoyer l'Edge Function. */
  const looksLikeUrl = (s: string) => {
    const t = s.trim()
    if (t.length === 0 || t.length > 2048) return false
    if (!/^https?:\/\//i.test(t)) return false
    try {
      const u = new URL(t)
      return Boolean(u.hostname)
    } catch {
      return false
    }
  }

  const fetchUrl = async () => {
    if (disabled) return
    const u = url.trim()
    if (!looksLikeUrl(u)) {
      setErrorMsg(
        "Lien invalide. Colle une URL complète qui commence par http:// ou https://.",
      )
      setStep('error')
      return
    }
    setStep('fetching')
    setErrorMsg(null)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data, error } = await supabase.functions.invoke('ecommerce-scrape', {
        body: { url: u },
      })
      if (error) {
        // L'Edge Function retourne un body { error, reason } même sur status non-2xx,
        // mais supabase.functions.invoke lève sur les codes 4xx/5xx. On extrait le
        // message si possible.
        const ctx = (error as { context?: { error?: string } }).context
        const msg = ctx?.error ?? 'Impossible de récupérer la page.'
        setErrorMsg(msg)
        setStep('error')
        return
      }
      const res = data as ScrapeResult | { ok: false; message?: string }
      if (!('ok' in res) || !res.ok) {
        setErrorMsg(
          (res as { message?: string }).message ??
            'Impossible de récupérer la page.',
        )
        setStep('error')
        return
      }
      setResult(res)
      setStep('preview')
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : 'Erreur réseau pendant la récupération.',
      )
      setStep('error')
    }
  }

  const confirm = () => {
    if (!result || !result.ingredientsText) return
    onInciReady(result.ingredientsText, {
      productName: result.productName ?? undefined,
      brand: result.brand ?? undefined,
      sourceUrl: result.sourceUrl,
      imageUrl: result.imageUrl ?? undefined,
    })
  }

  const reset = () => {
    setStep('input')
    setResult(null)
    setErrorMsg(null)
  }

  // ── Input ──────────────────────────────────────────────────────────
  if (step === 'input') {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Colle l’URL de la page produit. On récupère le nom, la marque et la
          composition INCI directement depuis le site.
        </Text>

        <View style={styles.urlWrap}>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder="https://exemple.com/produits/..."
            placeholderTextColor={colors.inkLight}
            selectionColor={colors.textSelection}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => void fetchUrl()}
          />
        </View>

        <Pressable
          style={[styles.cta, !looksLikeUrl(url) && styles.ctaDisabled]}
          onPress={() => void fetchUrl()}
          disabled={!looksLikeUrl(url) || disabled}
        >
          <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
          <Text style={styles.ctaText}>Récupérer la composition</Text>
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={onFallbackToManual}>
          <Text style={styles.linkText}>Coller la liste INCI à la main</Text>
        </Pressable>
      </ScrollView>
    )
  }

  // ── Fetching ───────────────────────────────────────────────────────
  if (step === 'fetching') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.rose} />
        <Text style={styles.processingText}>On lit la page produit…</Text>
        <Text style={styles.processingHint}>
          Récupération des métadonnées et extraction de la liste INCI.
        </Text>
      </View>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.warning} />
        <Text style={styles.errorText}>{errorMsg}</Text>
        <Pressable style={styles.cta} onPress={reset}>
          <Text style={styles.ctaText}>Réessayer avec un autre lien</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={onFallbackToManual}>
          <Text style={styles.linkText}>Coller la liste INCI à la main</Text>
        </Pressable>
      </View>
    )
  }

  // ── Preview ────────────────────────────────────────────────────────
  if (!result) return null
  const hasInci = Boolean(result.ingredientsText)

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          {result.imageUrl ? (
            <Image
              source={{ uri: result.imageUrl }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.previewImage, styles.previewImagePlaceholder]}>
              <Ionicons name="image-outline" size={24} color={colors.inkLight} />
            </View>
          )}
          <View style={styles.previewText}>
            {result.brand ? (
              <Text style={styles.previewBrand} numberOfLines={1}>
                {result.brand}
              </Text>
            ) : null}
            <Text style={styles.previewName} numberOfLines={2}>
              {result.productName ?? 'Produit identifié'}
            </Text>
            {result.source.cached ? (
              <Text style={styles.previewCached}>♻︎ Résultat en cache</Text>
            ) : null}
          </View>
        </View>

        {result.description ? (
          <Text style={styles.previewDescription} numberOfLines={3}>
            {result.description}
          </Text>
        ) : null}

        <View style={styles.inciBlock}>
          <Text style={styles.inciKicker}>
            COMPOSITION DÉTECTÉE {hasInci ? `(${ingredientCount(result.ingredientsText!)} ingr.)` : ''}
          </Text>
          {hasInci ? (
            <Text style={styles.inciText} numberOfLines={5}>
              {result.ingredientsText}
            </Text>
          ) : (
            <Text style={styles.inciMissing}>
              Aucune composition INCI trouvée sur cette page. Tu peux la coller
              à la main pour continuer l&apos;analyse.
            </Text>
          )}
        </View>
      </View>

      <Pressable
        style={[styles.cta, !hasInci && styles.ctaDisabled]}
        disabled={!hasInci || disabled}
        onPress={confirm}
      >
        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        <Text style={styles.ctaText}>Oui, analyser ce produit</Text>
      </Pressable>

      <Pressable style={styles.linkBtn} onPress={reset}>
        <Text style={styles.linkText}>Coller un autre lien</Text>
      </Pressable>

      {!hasInci ? (
        <Pressable style={styles.linkBtn} onPress={onFallbackToManual}>
          <Text style={styles.linkText}>Coller la composition à la main</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

/** Compteur rapide d'ingrédients (séparateurs virgule/point-virgule/bullet). */
function ingredientCount(text: string): number {
  return text
    .split(/[,;•·]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length < 80).length
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, alignItems: 'stretch' },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  illustration: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: radius.card,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.h4, color: colors.ink, textAlign: 'center' },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  urlWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  urlInput: {
    ...typography.small,
    color: colors.ink,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.md,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.button, color: '#FFFFFF' },
  linkBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  linkText: { ...typography.smallSemiBold, color: colors.rose },
  processingText: { ...typography.small, color: colors.inkMuted, marginTop: spacing.sm },
  processingHint: { ...typography.xs, color: colors.inkLight, textAlign: 'center' },
  errorText: {
    ...typography.small,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  // ── Preview card ────────────────────────────────────────────────
  previewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
  },
  previewImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  previewText: { flex: 1, minWidth: 0 },
  previewBrand: {
    ...typography.xsSemiBold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  previewName: {
    ...typography.bodySemiBold,
    color: colors.ink,
  },
  previewCached: {
    ...typography.caption,
    color: colors.inkLight,
    marginTop: 4,
  },
  previewDescription: {
    ...typography.xs,
    color: colors.inkMuted,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  inciBlock: {
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  inciKicker: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  inciText: {
    ...typography.xs,
    color: colors.ink,
    lineHeight: 18,
  },
  inciMissing: {
    ...typography.xs,
    color: colors.warning,
    lineHeight: 18,
  },
})
