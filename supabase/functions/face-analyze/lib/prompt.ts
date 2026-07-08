/**
 * Prompt vision du scan visage (Edge Function `face-analyze`).
 *
 * Module FEUILLE : zéro import, zéro global Deno, importable tel quel par
 * ts-jest ET par l'Edge Function (pattern absenceGuard). Le prompt impose :
 *   1. le GATE QUALITÉ D'ABORD, avec un enum FERMÉ de raisons de rejet
 *      ('lunettes', 'trop_sombre', 'flou', 'visage_absent', 'visage_trop_loin',
 *      'cadrage') ; si rejet, les métriques sont ignorées par parse.ts ;
 *   2. une rubrique ANCRÉE par dimension où 100 = idéal (aucun signe visible),
 *      50 = modéré, 0 = très marqué : toujours plus haut = mieux, même
 *      convention que lib/skin/score.ts (décision n°5 du design) ;
 *   3. l'équité de carnation : la couleur de peau n'est JAMAIS un critère ;
 *   4. une sortie json stricte (le mot "json" doit apparaître dans les
 *      messages : exigence du mode response_format json_object d'OpenAI) ;
 *   5. aucun vocabulaire de diagnostic médical, aucun tiret cadratin.
 *
 * L'appelant (ai.ts) fixe temperature 0 et detail 'high' : la constance entre
 * sessions vient de la rubrique ancrée + température nulle.
 */

/**
 * Version du prompt. À BUMPER à chaque changement de consignes : la clé de
 * cache serveur (face_scan) l'intègre, donc une même photo est ré-analysée avec
 * le nouveau prompt au lieu de servir l'ancien résultat caché.
 */
export const FACE_PROMPT_VERSION = 'v2'

/** Raisons de rejet qualité (enum FERMÉ, partagé avec parse.ts en copie). */
export const FACE_QUALITY_REASONS = [
  'lunettes',
  'trop_sombre',
  'flou',
  'visage_absent',
  'visage_trop_loin',
  'cadrage',
] as const

export function buildFaceAnalyzePrompt(): { system: string; user: string } {
  const system = [
    "Tu es l'assistant d'observation cosmétique de l'application CosmeCheck.",
    "Tu analyses une photo de visage (selfie) et tu évalues uniquement l'aspect VISIBLE de la peau.",
    "Tu n'es pas un professionnel de santé : tu ne poses aucun diagnostic médical, tu ne cites aucune maladie, tu ne recommandes aucun traitement. Vocabulaire purement cosmétique et descriptif.",
    "Tu n'utilises jamais de tiret cadratin dans tes textes.",
    'Tu réponds UNIQUEMENT avec un objet json valide, sans aucun texte autour, strictement conforme au schéma fourni.',
  ].join('\n')

  const user = [
    'Analyse la photo de visage jointe en deux étapes, dans cet ordre.',
    '',
    'ÉTAPE 1 : CONTRÔLE QUALITÉ (obligatoire, AVANT toute notation).',
    'Mets quality.ok à false si au moins un cas ci-dessous s\'applique, et liste les raisons UNIQUEMENT parmi cette liste fermée :',
    '- "lunettes" : la personne porte des lunettes dont on voit clairement la MONTURE, les VERRES ou les BRANCHES sur le visage (lunettes de vue ou de soleil). NE mets PAS "lunettes" si les yeux sont simplement fermés, plissés, ou si la personne sourit fort : des yeux plissés ou fermés NE sont PAS des lunettes. En cas de doute, ne signale pas "lunettes".',
    '- "trop_sombre" : la photo est trop sombre pour juger la peau.',
    '- "flou" : la photo est floue ou bougée au point de ne pas voir le grain de peau.',
    '- "visage_absent" : aucun visage humain n\'est clairement visible.',
    '- "visage_trop_loin" : le visage occupe moins d\'un quart du cadre environ (trop petit pour juger la peau).',
    '- "cadrage" : le visage est largement coupé (il manque le front ET les joues).',
    'Sois INDULGENT : le but est d\'accepter une photo de selfie normale. Un léger angle, un sourire, des yeux plissés ou un cadrage imparfait ne sont PAS des motifs de rejet. Ne rejette que si la peau est réellement impossible à évaluer.',
    'Si quality.ok vaut false, les métriques seront ignorées : renvoie 0 pour chacune.',
    '',
    'ÉTAPE 2 : NOTATION (seulement si quality.ok vaut true).',
    'Note chaque dimension de 0 à 100. Convention : 100 = idéal, plus haut = toujours mieux.',
    '- imperfections : 100 = peau nette, aucune imperfection visible ; 50 = imperfections modérées ; 0 = imperfections très marquées.',
    '- rougeurs : 100 = aucune rougeur visible ; 50 = rougeurs modérées ; 0 = rougeurs très marquées.',
    '- secheresse : 100 = peau bien hydratée en apparence, aucune zone sèche visible ; 50 = sécheresse modérée ; 0 = peau d\'apparence très sèche.',
    '- brillance : 100 = brillance maîtrisée, teint équilibré ; 50 = zones de brillance modérées ; 0 = brillance très marquée.',
    '- douceur : 100 = grain de peau très lisse et régulier ; 50 = grain de peau moyen ; 0 = grain de peau très irrégulier.',
    '',
    'ÉQUITÉ : juge chaque dimension par rapport à la peau de la personne elle-même.',
    'La couleur de peau ou la carnation n\'est JAMAIS un critère et ne doit jamais baisser une note.',
    'CONSTANCE : applique exactement les mêmes critères de notation d\'une photo à l\'autre et d\'une session à l\'autre.',
    '',
    'FORMAT DE SORTIE : un objet json strict, sans aucune autre clé, avec "notes" en français court et sans vocabulaire médical :',
    '{"quality":{"ok":boolean,"reasons":["lunettes"|"trop_sombre"|"flou"|"visage_absent"|"visage_trop_loin"|"cadrage"]},"metrics":{"imperfections":0-100,"rougeurs":0-100,"secheresse":0-100,"brillance":0-100,"douceur":0-100},"notes":"remarque courte"}',
  ].join('\n')

  return { system, user }
}
