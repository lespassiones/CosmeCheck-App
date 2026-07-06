/**
 * Client de l'agent Beauty Advisor (Edge Function `advisor-agent`).
 *
 * Contrat NOUVELLE génération (vs l'ancien `advisor-chat` en streaming + bloc
 * <<<RECO>>>) : l'agent RAISONNE, cherche de vrais produits notés, les VÉRIFIE
 * côté serveur, et renvoie en UNE réponse JSON :
 *   { reply, products:[{ean,brand,name,category,score,score_label,score_tone,
 *      count_total,image_url,ingredients_text}], followup, searches, model,
 *      creditsCharged }
 *
 * Le client n'a plus à parser de bloc technique ni à relancer une RPC produits :
 * les cartes affichées sont exactement celles que l'agent a vérifiées.
 */
import { fetch as expoFetch } from 'expo/fetch'
import type { AlternativeProduct } from '@/lib/analysis/alternativesFilter'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export type AdvisorApiMessage = { role: 'user' | 'assistant'; content: string }

type AgentProduct = {
  ean: string
  brand: string | null
  name: string | null
  category: string | null
  score: number | null
  score_label: string | null
  score_tone: string | null
  count_total: number | null
  image_url: string | null
  ingredients_text: string | null
}

export type AdvisorAgentResult = {
  reply: string
  products: AlternativeProduct[]
  followup: string | null
}

export class AdvisorNoCreditsError extends Error {
  used?: number
  limit?: number
  constructor(message: string, used?: number, limit?: number) {
    super(message)
    this.name = 'AdvisorNoCreditsError'
    this.used = used
    this.limit = limit
  }
}
export class AdvisorRateLimitError extends Error {}
export class AdvisorUnavailableError extends Error {}

/** Mappe un produit vérifié par l'agent vers la forme carrousel `AlternativeProduct`.
 *  Le score renvoyé par la RPC est DÉJÀ plafonné (sidecar product_score_cap) →
 *  countOrange/countRouge à 0 (le plancher couleur est déjà intégré au score). */
function toAlternative(p: AgentProduct): AlternativeProduct {
  return {
    ean: String(p.ean ?? ''),
    brand: p.brand ?? null,
    name: p.name ?? null,
    imageUrl: p.image_url ?? null,
    score: p.score != null ? Number(p.score) : null,
    scoreLabel: p.score_label ?? null,
    scoreTone: p.score_tone ?? null,
    countTotal: p.count_total != null ? Number(p.count_total) : null,
    ingredientsText: p.ingredients_text ?? null,
    countOrange: 0,
    countRouge: 0,
  }
}

/**
 * Appelle l'agent. `token` = access_token Supabase. Lève une erreur typée sur
 * 429 (crédits / rate-limit) ou indisponibilité, pour un affichage FR adapté.
 */
export async function askAdvisorAgent(
  messages: AdvisorApiMessage[],
  token: string,
  seenEans: string[] = [],
): Promise<AdvisorAgentResult> {
  const res = await expoFetch(`${SUPABASE_URL}/functions/v1/advisor-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
    },
    body: JSON.stringify({ messages, seen_eans: seenEans }),
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as
      | { code?: string; error?: string; credits?: { used?: number; limit?: number } }
      | null
    if (res.status === 429 && errBody?.code === 'no_credits') {
      throw new AdvisorNoCreditsError(
        errBody.error ??
          'Tu as utilisé tous tes crédits du jour. Reviens demain ou passe en Premium pour en avoir plus 💜',
        errBody.credits?.used,
        errBody.credits?.limit,
      )
    }
    if (res.status === 429) throw new AdvisorRateLimitError()
    throw new AdvisorUnavailableError()
  }

  const data = (await res.json().catch(() => null)) as
    | { reply?: string; products?: AgentProduct[]; followup?: string | null }
    | null
  if (!data) throw new AdvisorUnavailableError()

  return {
    reply: (data.reply ?? '').trim() || "Je n'ai pas pu générer de réponse cette fois-ci.",
    products: Array.isArray(data.products) ? data.products.map(toAlternative) : [],
    followup: typeof data.followup === 'string' && data.followup.trim() ? data.followup.trim() : null,
  }
}

/**
 * Pool de ~50 phrases de chargement affichées pendant l'attente de l'agent
 * (3-17 s). L'ordre est mélangé à chaque envoi (cf. makeLoadingSequence) pour
 * ne jamais montrer toujours la même chose. Rendues en couleurs rotatives.
 */
export const ADVISOR_LOADING_STEPS = [
  'Je lis ta demande…',
  'Je cerne ton besoin…',
  'Je fouille le catalogue…',
  'Je cherche de vrais produits notés…',
  'Je compare les compositions…',
  'Je vérifie les ingrédients…',
  'J’écarte les formules douteuses…',
  'Je garde le meilleur pour ta peau…',
  'Je vérifie les compositions…',
  'Je traque les bons actifs…',
  'J’analyse les étiquettes…',
  'Je fais le tri dans les INCI…',
  'Je repère les pépites…',
  'Je vérifie la douceur des formules…',
  'Je croise avec ton profil…',
  'Je respecte tes restrictions…',
  'Je chasse le superflu…',
  'Je sélectionne les valeurs sûres…',
  'Je pèse le pour et le contre…',
  'Je vérifie les notes…',
  'Je décrypte les listes d’ingrédients…',
  'Je cherche ce qui te convient vraiment…',
  'Je mets de côté les irritants…',
  'Je compare les scores…',
  'Je regarde ce qui est vraiment clean…',
  'Je peaufine ma sélection…',
  'Je vérifie deux fois…',
  'Je m’assure que c’est adapté…',
  'Je fais parler la composition…',
  'J’affine les résultats…',
  'Je cherche la perle rare…',
  'Je vérifie l’absence d’allergènes…',
  'Je passe les formules au crible…',
  'Je garde seulement le pertinent…',
  'Je consulte les meilleures références…',
  'Je vérifie que ça colle à ton besoin…',
  'Je prépare mes recommandations…',
  'Je rassemble mes trouvailles…',
  'Je vérifie une dernière chose…',
  'Je finalise ma réponse…',
  'Je réfléchis à la meilleure option…',
  'Je fais le point sur les actifs utiles…',
  'Je vérifie les concentrations…',
  'Je compare marque par marque…',
  'Je cherche le juste équilibre…',
  'Je vérifie la tolérance des formules…',
  'Je mets ta peau au centre…',
  'Je trie par qualité…',
  'Je boucle ma sélection…',
  'Presque prêt…',
] as const

/** Palette rose/violet/bleu/teal/ambre/rose vif pour colorer les phrases. */
export const ADVISOR_LOADING_COLORS = [
  '#F43F5E', // rose
  '#8B5CF6', // violet
  '#0EA5A4', // teal
  '#3B82F6', // bleu
  '#F59E0B', // ambre
  '#EC4899', // rose vif
] as const

/** Mélange (Fisher-Yates) le pool → un ordre aléatoire par envoi. */
export function makeLoadingSequence(): string[] {
  const arr = [...ADVISOR_LOADING_STEPS]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function advisorLoadingColor(tick: number): string {
  const n = ADVISOR_LOADING_COLORS.length
  return ADVISOR_LOADING_COLORS[((tick % n) + n) % n]
}
