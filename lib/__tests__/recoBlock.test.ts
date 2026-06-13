import { parseRecoBlock, stripRecoBlock } from '@/lib/advisor/recoBlock'

describe('stripRecoBlock', () => {
  it('retire le bloc complet du texte affiché', () => {
    const t = 'Voici une idée pour toi.\n<<<RECO>>>\n{"ingredients":["niacinamide"],"form":"serum"}\n<<<END>>>'
    expect(stripRecoBlock(t)).toBe('Voici une idée pour toi.')
  })

  it('masque le bloc même partiel (en cours de streaming)', () => {
    expect(stripRecoBlock('Texte utile.\n<<<RECO>>>\n{"ingred')).toBe('Texte utile.')
    expect(stripRecoBlock('Texte utile.\n<<<RE')).toBe('Texte utile.')
  })

  it('laisse le texte intact si pas de bloc', () => {
    expect(stripRecoBlock('Juste une réponse.')).toBe('Juste une réponse.')
  })
})

describe('parseRecoBlock', () => {
  it('extrait ingrédients + form', () => {
    const t = 'intro\n<<<RECO>>>\n{"ingredients":["niacinamide","panthenol"],"form":"serum"}\n<<<END>>>'
    expect(parseRecoBlock(t)).toEqual({ ingredients: ['niacinamide', 'panthenol'], form: 'serum' })
  })

  it('form null accepté', () => {
    const t = '<<<RECO>>>{"ingredients":["aloe vera"],"form":null}<<<END>>>'
    expect(parseRecoBlock(t)).toEqual({ ingredients: ['aloe vera'], form: null })
  })

  it('null si pas de bloc, JSON invalide, ou ingrédients vides', () => {
    expect(parseRecoBlock('pas de bloc')).toBeNull()
    expect(parseRecoBlock('<<<RECO>>> pas du json <<<END>>>')).toBeNull()
    expect(parseRecoBlock('<<<RECO>>>{"ingredients":[]}<<<END>>>')).toBeNull()
  })

  it('limite à 4 ingrédients et ignore les entrées trop courtes', () => {
    const t = '<<<RECO>>>{"ingredients":["a","retinol","niacinamide","peptides","aha","bha"]}<<<END>>>'
    expect(parseRecoBlock(t)?.ingredients).toEqual(['retinol', 'niacinamide', 'peptides', 'aha'])
  })
})
