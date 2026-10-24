import {
  acceptServerCorrection,
  applyRecognitionResult,
  composeDraft,
  correctTranscriptLocal,
  DICTATION_MAX_CHARS,
  joinSpoken,
  keepQuestionMark,
  looksLikeQuestion,
} from '@/lib/voice/transcript'

describe('composeDraft / joinSpoken', () => {
  it('joint le texte déjà saisi, le validé et le partiel', () => {
    expect(composeDraft('Bonjour', 'je cherche un sérum', 'pour peau')).toBe(
      'Bonjour je cherche un sérum pour peau',
    )
  })
  it('ignore les morceaux vides et les espaces', () => {
    expect(joinSpoken('  ', 'a', '', undefined, ' b ')).toBe('a b')
    expect(composeDraft('', '', '')).toBe('')
  })
  it('ne dépasse pas la longueur max de la saisie', () => {
    expect(composeDraft('x'.repeat(490), 'y'.repeat(50), '').length).toBe(DICTATION_MAX_CHARS)
  })
})

describe('applyRecognitionResult', () => {
  it('un partiel remplace le morceau en cours sans toucher au validé', () => {
    let s = { committed: '', interim: '' }
    s = applyRecognitionResult(s, 'je cherche', false)
    s = applyRecognitionResult(s, 'je cherche une crème', false)
    expect(s).toEqual({ committed: '', interim: 'je cherche une crème' })
  })
  it('un final (Android, par segment) s’ajoute au validé', () => {
    let s = { committed: '', interim: '' }
    s = applyRecognitionResult(s, 'je cherche une crème', true)
    s = applyRecognitionResult(s, 'pour peau sèche', false)
    s = applyRecognitionResult(s, 'pour peau sèche', true)
    expect(s).toEqual({ committed: 'je cherche une crème pour peau sèche', interim: '' })
  })
  it('un final cumulé (iOS) ne double pas le texte', () => {
    let s = { committed: 'je cherche une crème', interim: '' }
    s = applyRecognitionResult(s, 'Je cherche une crème pour peau sèche', true)
    expect(s.committed).toBe('Je cherche une crème pour peau sèche')
  })
  it('un final vide efface seulement le partiel', () => {
    const s = applyRecognitionResult({ committed: 'a', interim: 'b' }, '  ', true)
    expect(s).toEqual({ committed: 'a', interim: '' })
  })
})

describe('looksLikeQuestion', () => {
  it.each([
    'est-ce que le rétinol est bon',
    'quelle crème pour peau grasse',
    'comment utiliser la niacinamide',
    'tu peux me conseiller un sérum',
    "c'est quoi un INCI",
    'Où acheter ce produit',
    'que penses-tu de ma routine',
  ])('« %s » est une question', (s) => expect(looksLikeQuestion(s)).toBe(true))

  it.each(['je cherche une crème', 'merci beaucoup', 'conseille-moi un sérum', ''])(
    '« %s » n’en est pas une',
    (s) => expect(looksLikeQuestion(s)).toBe(false),
  )
})

describe('correctTranscriptLocal', () => {
  it('met une majuscule et un point d’interrogation à une question', () => {
    expect(correctTranscriptLocal('est-ce que le rétinol convient aux peaux sensibles')).toBe(
      'Est-ce que le rétinol convient aux peaux sensibles ?',
    )
  })

  it('ne rajoute rien à une phrase affirmative', () => {
    expect(correctTranscriptLocal('je cherche une crème hydratante')).toBe(
      'Je cherche une crème hydratante',
    )
  })

  it('transforme la ponctuation dictée', () => {
    expect(
      correctTranscriptLocal(
        "bonjour Perle virgule j'ai la peau sèche point final quelle crème choisir point d'interrogation",
      ),
    ).toBe("Bonjour Perle, j'ai la peau sèche. Quelle crème choisir ?")
  })

  it('corrige le vocabulaire cosmétique écorché', () => {
    expect(correctTranscriptLocal('je veux un serum a la nia sinamide et a l acide hyaloronique')).toBe(
      'Je veux un sérum a la niacinamide et a l acide hyaluronique',
    )
    expect(correctTranscriptLocal('une creme solaire spf50 sans parabene')).toBe(
      'Une creme solaire SPF 50 sans parabènes',
    )
    expect(correctTranscriptLocal('le retinol et les ceramide pour mon eczema')).toBe(
      'Le rétinol et les céramides pour mon eczéma',
    )
    expect(correctTranscriptLocal('je mets de la vitamine c le matin')).toBe(
      'Je mets de la vitamine C le matin',
    )
  })

  it('reconnaît le nom de l’app et de la mascotte', () => {
    expect(correctTranscriptLocal('perle est-ce que cosmicheck connaît ce produit')).toBe(
      'Perle est-ce que CosmeCheck connaît ce produit ?',
    )
  })

  it('ne touche pas aux mots qui contiennent un terme du lexique', () => {
    // « perles » (pluriel), « incident », « serumeux » : mots différents.
    expect(correctTranscriptLocal('des perles de soin et un incident')).toBe(
      'Des perles de soin et un incident',
    )
  })

  it('retire les hésitations', () => {
    expect(correctTranscriptLocal('euh est-ce que le rétinol heu ça pique')).toBe(
      'Est-ce que le rétinol ça pique ?',
    )
    expect(correctTranscriptLocal('bah je sais pas, hum, quelle crème')).toBe(
      'Je sais pas, quelle crème ?',
    )
    // « bénéfique », « humide » : mots différents, intacts.
    expect(correctTranscriptLocal('une crème bénéfique pour peau humide')).toBe(
      'Une crème bénéfique pour peau humide',
    )
  })

  it('nettoie les espaces et la ponctuation doublée', () => {
    expect(correctTranscriptLocal('  bonjour   ,  ça va  ?  ')).toBe('Bonjour, ça va ?')
    expect(correctTranscriptLocal('a virgule virgule b')).toBe('A, b')
  })

  it('remplace les tirets longs (interdits dans l’app)', () => {
    expect(correctTranscriptLocal('ma peau — elle tiraille')).toBe('Ma peau, elle tiraille')
  })

  it('met une majuscule après chaque phrase', () => {
    expect(correctTranscriptLocal('merci. et le soir ? je fais quoi')).toBe(
      'Merci. Et le soir ? Je fais quoi',
    )
  })

  it('est idempotente', () => {
    const samples = [
      "bonjour Perle virgule quelle crème pour l'acné",
      'je veux un serum a la nia sinamide spf 30',
      'merci. et le soir ? je fais quoi',
    ]
    for (const s of samples) {
      const once = correctTranscriptLocal(s)
      expect(correctTranscriptLocal(once)).toBe(once)
    }
  })

  it('renvoie une chaîne vide pour une dictée vide', () => {
    expect(correctTranscriptLocal('   ')).toBe('')
  })
})

describe('keepQuestionMark', () => {
  it('rend le « ? » qu’une question avait localement', () => {
    expect(keepQuestionMark('Je peux mettre du rétinol le soir ?', 'Je peux mettre du rétinol le soir.')).toBe(
      'Je peux mettre du rétinol le soir ?',
    )
  })
  it('ne touche pas une demande ni un texte déjà ponctué', () => {
    expect(keepQuestionMark('Je cherche une crème', 'Je cherche une crème.')).toBe('Je cherche une crème.')
    expect(keepQuestionMark('Quel sérum ?', 'Quel sérum ?')).toBe('Quel sérum ?')
  })
})

describe('acceptServerCorrection', () => {
  const original = "Est-ce que la niacinamide c'est bien pour les peaux grasses ?"

  it('accepte une vraie correction (orthographe, ponctuation)', () => {
    expect(
      acceptServerCorrection(original, "Est-ce que la niacinamide, c'est bien pour les peaux grasses ?"),
    ).toBe(true)
  })

  it('refuse une RÉPONSE à la question au lieu d’une correction', () => {
    expect(
      acceptServerCorrection(
        original,
        'Oui, la niacinamide régule le sébum et resserre les pores, elle convient très bien aux peaux grasses et mixtes.',
      ),
    ).toBe(false)
  })

  it('refuse un texte vide, tronqué ou réécrit', () => {
    expect(acceptServerCorrection(original, '')).toBe(false)
    expect(acceptServerCorrection(original, null)).toBe(false)
    expect(acceptServerCorrection(original, 'Niacinamide ?')).toBe(false)
    expect(acceptServerCorrection(original, 'Quel actif choisir quand on a beaucoup de sébum le matin ?')).toBe(
      false,
    )
  })

  it('refuse un texte avec tiret long', () => {
    expect(
      acceptServerCorrection(original, "Est-ce que la niacinamide — c'est bien pour les peaux grasses ?"),
    ).toBe(false)
  })

  it('tolère 1 ou 2 mots mal reconnus sur une dictée courte', () => {
    expect(acceptServerCorrection('Le rait no le soir ?', 'Le rétinol le soir ?')).toBe(true)
  })
})
