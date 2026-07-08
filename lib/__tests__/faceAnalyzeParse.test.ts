/**
 * Parse strict de la sortie du modèle vision (face-analyze/lib/parse.ts).
 *
 * WHAT : verrouille le contrat du parseur consommé par le handler `face-analyze`.
 * WHY : le handler débite 2 crédits sur la foi de ce parse ; toute tolérance mal
 * placée (JSON cassé accepté, métrique manquante ignorée, raison hors enum
 * conservée) coûterait un débit à tort ou insèrerait un scan invalide. On teste
 * donc les bornes décrites au design 2c : clamp [0,100], filtrage de l'enum
 * fermé avec fallback 'cadrage', et retour null sur entrée non exploitable.
 *
 * Import RELATIF (le module est une FEUILLE Deno zéro-import, pattern
 * coherenceAbsenceGuard.test.ts) : jamais via l'alias '@/'.
 */
import {
  parseFaceAnalyzeOutput,
  QUALITY_REASONS,
  type FaceAnalyzeParsed,
} from '../../supabase/functions/face-analyze/lib/parse'

/** Sortie modèle valide de succès (les 5 métriques présentes). */
function validSuccess(metrics?: Partial<Record<string, unknown>>): string {
  return JSON.stringify({
    quality: { ok: true, reasons: [] },
    metrics: {
      imperfections: 80,
      rougeurs: 70,
      secheresse: 60,
      brillance: 50,
      douceur: 90,
      ...metrics,
    },
    notes: 'peau nette',
  })
}

describe('parseFaceAnalyzeOutput : succès qualité', () => {
  it('payload valide -> quality.ok true + 5 métriques entières', () => {
    const out = parseFaceAnalyzeOutput(validSuccess()) as FaceAnalyzeParsed
    expect(out).not.toBeNull()
    expect(out.quality).toEqual({ ok: true, reasons: [] })
    expect(out.metrics).toEqual({
      imperfections: 80,
      rougeurs: 70,
      secheresse: 60,
      brillance: 50,
      douceur: 90,
    })
  })

  it('valeurs hors bornes clampées et arrondies (150 -> 100, -5 -> 0, 66.6 -> 67)', () => {
    const out = parseFaceAnalyzeOutput(
      validSuccess({ imperfections: 150, rougeurs: -5, secheresse: 66.6 }),
    ) as FaceAnalyzeParsed
    expect(out.metrics?.imperfections).toBe(100)
    expect(out.metrics?.rougeurs).toBe(0)
    expect(out.metrics?.secheresse).toBe(67)
  })

  it('tolère une clôture markdown ```json ... ```', () => {
    const fenced = '```json\n' + validSuccess() + '\n```'
    const out = parseFaceAnalyzeOutput(fenced) as FaceAnalyzeParsed
    expect(out).not.toBeNull()
    expect(out.quality.ok).toBe(true)
  })
})

describe('parseFaceAnalyzeOutput : rejets qualité', () => {
  it('ok:false sans métriques -> valide, metrics null', () => {
    const raw = JSON.stringify({ quality: { ok: false, reasons: ['lunettes'] } })
    const out = parseFaceAnalyzeOutput(raw) as FaceAnalyzeParsed
    expect(out).not.toBeNull()
    expect(out.quality).toEqual({ ok: false, reasons: ['lunettes'] })
    expect(out.metrics).toBeNull()
  })

  it('raison inconnue filtrée, fallback "cadrage" si plus rien ne survit', () => {
    const raw = JSON.stringify({ quality: { ok: false, reasons: ['barbe', 'chapeau'] } })
    const out = parseFaceAnalyzeOutput(raw) as FaceAnalyzeParsed
    expect(out.quality.reasons).toEqual(['cadrage'])
  })

  it('mélange valide + inconnue -> ne garde que les valides, dédoublonnées', () => {
    const raw = JSON.stringify({
      quality: { ok: false, reasons: ['flou', 'inconnue', 'flou', 'trop_sombre'] },
    })
    const out = parseFaceAnalyzeOutput(raw) as FaceAnalyzeParsed
    expect(out.quality.reasons).toEqual(['flou', 'trop_sombre'])
  })

  it('ok:false sans tableau reasons -> fallback "cadrage"', () => {
    const raw = JSON.stringify({ quality: { ok: false } })
    const out = parseFaceAnalyzeOutput(raw) as FaceAnalyzeParsed
    expect(out.quality.reasons).toEqual(['cadrage'])
  })

  it('toutes les raisons de l\'enum fermé sont acceptées', () => {
    const raw = JSON.stringify({ quality: { ok: false, reasons: [...QUALITY_REASONS] } })
    const out = parseFaceAnalyzeOutput(raw) as FaceAnalyzeParsed
    expect(out.quality.reasons).toEqual([...QUALITY_REASONS])
  })
})

describe('parseFaceAnalyzeOutput : entrées invalides -> null', () => {
  it('JSON cassé -> null', () => {
    expect(parseFaceAnalyzeOutput('{ pas du json')).toBeNull()
  })

  it('chaîne vide -> null', () => {
    expect(parseFaceAnalyzeOutput('')).toBeNull()
  })

  it('JSON non-objet (tableau) -> null', () => {
    expect(parseFaceAnalyzeOutput('[1,2,3]')).toBeNull()
  })

  it('quality.ok manquant -> null', () => {
    expect(parseFaceAnalyzeOutput(JSON.stringify({ quality: {} }))).toBeNull()
  })

  it('ok:true mais une métrique manquante -> null (pas de scan bidon)', () => {
    const raw = JSON.stringify({
      quality: { ok: true, reasons: [] },
      metrics: { imperfections: 80, rougeurs: 70, secheresse: 60, brillance: 50 },
    })
    expect(parseFaceAnalyzeOutput(raw)).toBeNull()
  })

  it('ok:true mais une métrique non numérique -> null', () => {
    const out = parseFaceAnalyzeOutput(validSuccess({ douceur: 'très douce' }))
    expect(out).toBeNull()
  })

  it('ok:true sans objet metrics -> null', () => {
    expect(
      parseFaceAnalyzeOutput(JSON.stringify({ quality: { ok: true, reasons: [] } })),
    ).toBeNull()
  })
})
