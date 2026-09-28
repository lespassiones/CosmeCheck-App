/**
 * Pure : met en forme la routine de l'utilisateur pour le prompt système de
 * `advisor-agent`. Sans ce bloc, l'agent ne voyait pas la routine (chaîne en
 * dur « non détaillée ici ») et répondait « envoie la liste de tes produits »
 * à « que penses-tu de ma routine ? » alors qu'elle est enregistrée dans l'app.
 *
 * Entrées :
 *   - rows     : select `routine_items` + jointure légère `analysis:analyses(...)`
 *                (PAS de result_json : ~30 KB par ligne).
 *   - tagRows  : sortie de la RPC `cosme_check_get_routine_tags` (tags agrégés
 *                côté Postgres), rapprochée par libellé produit. Facultative.
 *
 * Pas de dépendance Deno : consommé par l'Edge Function ET par Jest (env node),
 * voir lib/__tests__/advisorRoutineContext.test.ts.
 */

export interface RoutineEntry {
  name: string
  brand: string | null
  productType: string | null
  score: number | null
  kind: 'routine' | 'staple'
  timeOfDay: 'morning' | 'evening' | 'both' | null
  frequency: 'daily' | 'weekly' | 'monthly' | null
  tags: string[]
}

export const ROUTINE_FETCH_LIMIT = 30
const MAX_TAGS = 5
const MAX_NAME = 80

const MOMENT_LABEL: Record<string, string> = {
  morning: 'matin',
  evening: 'soir',
  both: 'matin et soir',
}

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'tous les jours',
  weekly: 'chaque semaine',
  monthly: 'chaque mois',
}

/** Texte utilisateur injecté dans un prompt : une seule ligne, longueur bornée. */
function clean(value: unknown, max = MAX_NAME): string | null {
  if (typeof value !== 'string') return null
  const out = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max)
  return out || null
}

/** Clé de rapprochement select ↔ RPC tags (même libellé que l'affichage). */
export function routineLabelKey(productLabel: unknown, name: unknown): string {
  const label = clean(productLabel) ?? clean(name) ?? ''
  return label.toLowerCase()
}

function tagsByLabel(tagRows: unknown): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!Array.isArray(tagRows)) return map
  for (const r of tagRows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.tags)) continue
    const key = routineLabelKey(r.product_label, r.name)
    if (!key || map.has(key)) continue
    map.set(key, (r.tags as unknown[]).filter((t): t is string => typeof t === 'string'))
  }
  return map
}

/** Supabase renvoie la relation jointe en objet ou en tableau selon la config. */
function joinedAnalysis(raw: unknown): Record<string, unknown> | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function normalizeRoutineEntries(rows: unknown, tagRows?: unknown): RoutineEntry[] {
  if (!Array.isArray(rows)) return []
  const tags = tagsByLabel(tagRows)
  const out: RoutineEntry[] = []
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    const a = joinedAnalysis(r.analysis ?? r.analyses)
    if (!a) continue
    const name = clean(a.product_label) ?? clean(a.name)
    if (!name) continue
    const score = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : null
    const tod = r.time_of_day
    const freq = r.frequency
    out.push({
      name,
      brand: clean(a.brand, 40),
      productType: clean(a.product_type, 40),
      score,
      kind: r.kind === 'staple' ? 'staple' : 'routine',
      timeOfDay: tod === 'morning' || tod === 'evening' || tod === 'both' ? tod : null,
      frequency: freq === 'daily' || freq === 'weekly' || freq === 'monthly' ? freq : null,
      tags: (tags.get(routineLabelKey(a.product_label, a.name)) ?? []).slice(0, MAX_TAGS),
    })
    if (out.length >= ROUTINE_FETCH_LIMIT) break
  }
  return out
}

function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10
  return `${String(rounded).replace('.', ',')}/20`
}

function formatEntry(e: RoutineEntry): string {
  const head = e.brand ? `${e.name} (${e.brand})` : e.name
  const parts = [
    e.productType,
    e.score != null ? `note ${formatScore(e.score)}` : 'note inconnue',
    // Le créneau n'a de sens que pour les soins ; les produits du quotidien
    // (déo, dentifrice…) sont rangés à part dans l'app.
    e.kind === 'routine' && e.timeOfDay ? MOMENT_LABEL[e.timeOfDay] : null,
    e.frequency ? FREQUENCY_LABEL[e.frequency] : null,
  ].filter(Boolean)
  const tags = e.tags.length ? ` [tags : ${e.tags.join(', ')}]` : ''
  return `- ${head} : ${parts.join(', ')}${tags}`
}

/**
 * Réponse réduite à son annonce (« Bilan rapide : voici ce qu'il faut
 * remplacer. ») sans le contenu. gpt-5-mini @ low le fait parfois sur un avis
 * de routine : il appelle `answer` avec la seule phrase de bilan. Une ligne
 * unique qui commence par « Bilan / Analyse / Résumé… », contient « voici »,
 * renvoie à « quelques ajustements / points… » jamais détaillés, ou finit
 * par « : ».
 */
export function isAnnouncementOnly(text: string): boolean {
  const t = text.trim()
  if (!t || t.includes('\n') || t.length > 220) return false
  return (
    /^(bilan|analyse|résumé|resume|récap|recap|synthèse|synthese)\b/i.test(t) ||
    /\bvoici\b/i.test(t) ||
    /\bquelques (ajustements|points|changements|conseils|pistes|modifications|améliorations|ameliorations)\b/i.test(t) ||
    t.endsWith(':')
  )
}

/**
 * Réponse trop mince : une seule ligne courte (< 120 caractères), sans puce.
 * L'appelant ne s'en sert que pour une vraie question beauté sans produit.
 */
export function isThinAnswer(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length < 120 && !t.includes('\n')
}

/** Bloc « ROUTINE » du prompt système. */
export function formatRoutineContext(entries: RoutineEntry[]): string {
  if (entries.length === 0) {
    return "ROUTINE : vide (aucun produit enregistré dans l'app pour l'instant). Si elle demande un avis sur sa routine, dis-le et invite-la à ajouter ses produits depuis l'onglet Routine, puis donne 2 ou 3 bases utiles pour son profil."
  }
  const care = entries.filter((e) => e.kind === 'routine')
  const staples = entries.filter((e) => e.kind === 'staple')
  const lines = [
    `ROUTINE enregistrée dans l'app (${entries.length} produit${entries.length > 1 ? 's' : ''}, notes sur 20 : 17+ très bien, 13+ bien, 9+ moyen, 5+ médiocre, sous 5 mauvais) :`,
  ]
  if (care.length) lines.push('Soins :', ...care.map(formatEntry))
  if (staples.length) lines.push('Produits du quotidien :', ...staples.map(formatEntry))
  return lines.join('\n')
}
