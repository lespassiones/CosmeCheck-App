/**
 * buildAdvisorApiMessages — prouve que le bloc RECO est RECONSTRUIT dans
 * l'historique assistant (sinon l'IA cesse d'émettre le bloc aux tours suivants
 * → carrousel qui disparaît après le 1er message). Bug rencontré deux fois.
 */
import {
  buildAdvisorApiMessages,
  type AdvisorHistoryMsg,
} from '@/lib/advisor/apiMessages'

describe('buildAdvisorApiMessages', () => {
  it('reconstruit le bloc RECO sur les réponses assistant avec critères', () => {
    const history: AdvisorHistoryMsg[] = [
      { role: 'user', content: 'un soin hydratant' },
      {
        role: 'assistant',
        content: 'Voici des idées.',
        recoCriteria: { ingredients: ['hyaluronic', 'glycerin'], form: 'creme' },
      },
    ]
    const out = buildAdvisorApiMessages(history, 'et un déodorant ?')
    expect(out).toHaveLength(3)
    // La réponse assistant passée DOIT contenir le bloc reconstruit.
    expect(out[1].content).toContain('<<<RECO>>>')
    expect(out[1].content).toContain('"hyaluronic"')
    expect(out[1].content).toContain('"form":"creme"')
    expect(out[1].content.startsWith('Voici des idées.')).toBe(true)
    // Le nouveau message utilisateur est ajouté en fin.
    expect(out[2]).toEqual({ role: 'user', content: 'et un déodorant ?' })
  })

  it('ne touche pas une réponse assistant SANS critères (question d info)', () => {
    const history: AdvisorHistoryMsg[] = [
      { role: 'user', content: 'c est quoi le rétinol ?' },
      { role: 'assistant', content: 'Le rétinol est un dérivé de vitamine A.' },
    ]
    const out = buildAdvisorApiMessages(history, 'merci')
    expect(out[1].content).not.toContain('<<<RECO>>>')
    expect(out[1].content).toBe('Le rétinol est un dérivé de vitamine A.')
  })

  it('exclut les messages purement UI de l historique API', () => {
    const history: AdvisorHistoryMsg[] = [
      { role: 'user', content: 'salut' },
      { role: 'assistant', content: 'Coucou !' },
      { role: 'assistant', content: '[carte produit]', uiOnly: true },
    ]
    const out = buildAdvisorApiMessages(history, 'une crème mains')
    expect(out.map((m) => m.content)).not.toContain('[carte produit]')
    expect(out).toHaveLength(3) // user + assistant + nouveau user
  })

  it('reconstruit le bloc à CHAQUE réponse reco de l historique (multi-tours)', () => {
    const history: AdvisorHistoryMsg[] = [
      { role: 'user', content: 'soin hydratant' },
      { role: 'assistant', content: 'A', recoCriteria: { ingredients: ['hyaluronic'], form: null } },
      { role: 'user', content: 'crème mains' },
      { role: 'assistant', content: 'B', recoCriteria: { ingredients: ['glycerin'], form: 'mains' } },
    ]
    const out = buildAdvisorApiMessages(history, 'un déo')
    const blocks = out.filter((m) => m.content.includes('<<<RECO>>>'))
    expect(blocks).toHaveLength(2)
    // form null sérialisé en null JSON (pas la chaîne "null").
    expect(out[1].content).toContain('"form":null')
  })
})
