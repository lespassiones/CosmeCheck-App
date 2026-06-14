/**
 * Construction de l'historique envoyé à l'Edge `advisor-chat`.
 *
 * Point CRITIQUE (bug multi-tours déjà rencontré deux fois) : on doit RECONSTRUIRE
 * le bloc technique `<<<RECO>>>…<<<END>>>` sur les réponses assistant passées, à
 * partir des critères stockés (`recoCriteria`). Sinon l'IA voit son propre
 * historique SANS bloc, imite ce schéma, et arrête d'émettre le bloc aux tours
 * suivants → le carrousel disparaît après le 1er message.
 *
 * Logique pure (aucune dépendance RN) pour être testable et ne plus régresser.
 */
export interface AdvisorHistoryMsg {
  role: 'user' | 'assistant'
  content: string
  /** Message d'UI seulement (ex. carte) : exclu de l'historique API. */
  uiOnly?: boolean
  /** Critères de la reco émise par ce message assistant (pour reconstruire le bloc). */
  recoCriteria?: { ingredients: string[]; form: string | null } | null
}

export interface AdvisorApiMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Transforme l'historique d'affichage + le nouveau message utilisateur en messages
 * pour l'API. Filtre les messages purement UI et réinjecte le bloc RECO.
 */
export function buildAdvisorApiMessages(
  history: AdvisorHistoryMsg[],
  newUserText: string,
): AdvisorApiMessage[] {
  const past = history
    .filter((m) => !m.uiOnly)
    .map((m) => ({
      role: m.role,
      content:
        m.role === 'assistant' && m.recoCriteria
          ? `${m.content}\n<<<RECO>>>${JSON.stringify({
              ingredients: m.recoCriteria.ingredients,
              form: m.recoCriteria.form,
            })}<<<END>>>`
          : m.content,
    }))
  return [...past, { role: 'user', content: newUserText }]
}
