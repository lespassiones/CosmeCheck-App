/**
 * formulation : classe la FORME GALÉNIQUE d'un cosmétique à partir de sa liste
 * INCI (ordre décroissant de concentration), sans IA, de façon déterministe.
 *
 * POURQUOI (retour bêta sept 2026) : « Il n'analyse pas la composition avant de
 * proposer une alternative. Pour une crème dont le premier ingrédient est l'eau,
 * l'alternative doit être une crème dont le premier ingrédient est l'eau. »
 * La catégorie catalogue donne la FONCTION et la ZONE ; ce module ajoute la
 * COMPOSITION (sérum aqueux, émulsion, huile, baume, base lavante, savon solide,
 * poudre, base alcoolique) pour ne proposer que des formules comparables.
 *
 * Types (galenic) :
 *   - aqueous        : base eau sans phase grasse notable (sérum/tonique/gel aqueux, eau micellaire) ;
 *   - emulsion       : eau + phase grasse (+ émulsifiant) : crème, lait, après-shampooing ;
 *   - wash           : base lavante liquide (eau + tensioactifs en tête) : gel douche, shampooing ;
 *   - soap_bar       : savon saponifié ou syndet SOLIDE (pain, shampooing solide) ;
 *   - anhydrous_oil  : huile, sérum huileux, huile démaquillante, huile de douche ;
 *   - anhydrous_balm : baume, beurre, cire, stick ;
 *   - powder         : poudre, argile sèche, sels, bicarbonate ;
 *   - alcoholic      : base alcool (parfum, spray alcoolique, gel hydroalcoolique) ;
 *   - unknown        : liste vide, illisible ou ambiguë (dentifrice, vernis...).
 *
 * Heuristiques sur les 12 premiers ingrédients (chaque nom reçoit un RÔLE : eau,
 * alcool, polyol, savon, tensioactif, huile, cire/beurre, alcool gras, poudre,
 * cristal, autre) :
 *   1. on ignore les gaz propulseurs (butane, propane...) ;
 *   2. extrait aqueux en tête (aloe, hydrolat, eau florale) => base eau ;
 *   3. la BASE = premier ingrédient structurant parmi les 3 premiers ; les
 *      extraits, actifs et parfums de tête sont sautés (au-delà : unknown) ;
 *   4. base eau : tensioactif juste derrière l'eau, ou 2 tensioactifs dans le
 *      top 6 sans phase grasse devant eux => wash ; sinon phase grasse pondérée
 *      par la position (+ émulsifiant) => emulsion ; sinon aqueous ;
 *   5. base lipide : soude en tête ou « saponifié » => soap_bar (potasse => wash) ;
 *      eau dans les 3 suivants => emulsion ; sinon baume si cire/beurre/alcool
 *      gras en tête, huile sinon ;
 *   6. base tensioactif : eau juste derrière => wash ; structurant solide (alcool
 *      gras, cire, poudre, savon de sodium) => soap_bar ; huile juste derrière
 *      => anhydrous_oil (huile de douche) ; eau plus loin => wash ;
 *   7. base savon de sodium => soap_bar ; savon de potassium => wash ;
 *   8. base poudre / cristal : eau proche => règles eau ; sucre ou sel suivi
 *      d'huiles => anhydre (gommage) ; sinon powder (fards, sels de bain) ;
 *   9. dentifrice (abrasif + marqueur bucco-dentaire) => unknown.
 *
 * Mesure (sept 2026, 20 000 INCI tirés au hasard dans le catalogue, 30 fiches
 * relues par type et par passe) : environ 2,5 % d'erreurs manifestes sur la
 * dernière passe non vue avant ajustement ; l'essentiel des cas restants est
 * une hésitation huile / baume, qui sont voisins.
 *
 * Module PUR, sans aucun import : la copie `supabase/functions/_shared/formulation.ts`
 * doit rester STRICTEMENT IDENTIQUE (un test Jest vérifie l'égalité des fichiers).
 * On n'importe PAS `lib/inci/parser.ts` pour cette raison (alias `@/` et types
 * applicatifs incompatibles avec Deno) : le découpage ci-dessous est volontairement
 * plus simple, il n'a besoin que des noms de tête.
 */

export type Galenic =
  | 'aqueous'
  | 'emulsion'
  | 'wash'
  | 'soap_bar'
  | 'anhydrous_oil'
  | 'anhydrous_balm'
  | 'powder'
  | 'alcoholic'
  | 'unknown'

export interface Formulation {
  galenic: Galenic
  /** Premier ingrédient = eau (aqua, hydrolat, eau florale, jus d'aloe). */
  waterFirst: boolean
  /** Confiance indicative 0..1 (0 pour unknown). */
  confidence: number
}

export type FormulationAffinity = 'same' | 'near' | 'opposite' | 'unknown'

/** Nombre d'ingrédients de tête examinés. */
export const FORMULATION_WINDOW = 12

// ─── Découpage ──────────────────────────────────────────────────────────────

/** Diacritiques combinants (plage U+0300 à U+036F), construits sans caractère littéral. */
const COMBINING_RE = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')
/** Tiret simple, demi-cadratin (U+2013) ou cadratin (U+2014) entre espaces : séparateur. */
const DASH_SEPARATOR_RE = new RegExp(' +[-' + String.fromCharCode(0x2013, 0x2014) + '] +', 'g')
/** Puces (U+2022, U+00B7, U+25CF, U+25C6, U+25AA) et barre verticale : séparateurs. */
const BULLET_RE = new RegExp('[' + String.fromCharCode(0x2022, 0xb7, 0x25cf, 0x25c6, 0x25aa) + '|]', 'g')

/** Majuscules, sans accents ni entités HTML, parenthèses/crochets en espaces. */
export function normalizeInciToken(raw: string): string {
  return raw
    .replace(/&(quot|amp|apos|#39|#34|nbsp);/gi, ' ')
    .normalize('NFD')
    .replace(COMBINING_RE, '')
    .toUpperCase()
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[*°¹²³†‡"«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.:,;-]+|[\s.:,;-]+$/g, '')
    .trim()
}

/** Remplace les virgules/points-virgules situés DANS des parenthèses par des espaces. */
function neutralizeNestedSeparators(text: string): string {
  let depth = 0
  let out = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if ((ch === ')' || ch === ']') && depth > 0) depth--
    out += depth > 0 && (ch === ',' || ch === ';') ? ' ' : ch
  }
  return out
}

/**
 * Découpe une liste INCI brute (ou un tableau de noms) en noms normalisés, dans
 * l'ordre. Tolère « AQUA (WATER) », « AQUA/WATER/EAU », astérisques bio, listes
 * séparées par des points, retours ligne au milieu d'un nom, « 1,2-HEXANEDIOL ».
 */
export function splitInci(input: string | readonly string[] | null | undefined): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return (input as readonly string[])
      .map((s) => (typeof s === 'string' ? normalizeInciToken(s) : ''))
      .filter((s) => s.length >= 2)
  }
  let text = String(input)
  // Libellé d'en-tête (« Ingrédients : », « INCI: ») précédé d'un texte descriptif
  // éventuel (fiches produit collées) : on repart juste après.
  const header = /\b(INGREDIENTS?|INGR[EÉ]DIENTS?|INGREDIENTES|INGREDIENTI|INCI|COMPOSITION|ZUTATEN|SKLAD)\s*:\s*/i.exec(
    text.slice(0, 400),
  )
  if (header) text = text.slice(header.index + header[0].length)
  // Entités HTML (« &quot; ») AVANT le découpage : leur « ; » n'est pas un séparateur.
  text = text.replace(/&(quot|amp|apos|#39|#34|nbsp);/gi, ' ')
  text = neutralizeNestedSeparators(text)
  // Virgule entre deux chiffres = nom chimique (1,2-HEXANEDIOL), pas un séparateur.
  text = text.replace(/(\d),(\d)/g, '$1.$2')
  const hasComma = /[,;]/.test(text)
  // Avec de vraies virgules, un retour ligne coupe un nom en deux : on le recolle.
  text = hasComma ? text.replace(/[\r\n]+/g, ' ') : text.replace(/[\r\n]+/g, ',')
  // Listes séparées par des points : « AQUA. GLYCERIN. » (pas « ALCOHOL DENAT. » en fin).
  if (!hasComma) text = text.replace(/([A-Za-z)])\.\s+(?=[A-Za-z])/g, '$1,')
  // Tirets / puces utilisés comme séparateurs.
  text = text.replace(DASH_SEPARATOR_RE, ',').replace(BULLET_RE, ',')
  return text
    .split(/[,;]+/)
    .map(normalizeInciToken)
    .filter((s) => s.length >= 2 && !/^[\d\s.%+-]+$/.test(s))
}

// ─── Rôles des ingrédients ──────────────────────────────────────────────────

type Role =
  | 'water'
  | 'alcohol'
  | 'polyol'
  | 'soap_na'
  | 'soap_k'
  | 'surfactant'
  | 'oil'
  | 'solid_lipid'
  | 'fatty_alcohol'
  | 'powder'
  | 'crystal'
  | 'propellant'
  | 'other'

const PROPELLANT_RE =
  /^(BUTANE|ISOBUTANE|PROPANE|PENTANE|ISOPENTANE|HYDROFLUOROCARBON 152A|HFC-152A|1.1-DIFLUOROETHANE|DIMETHYL ETHER|NITROGEN|NITROUS OXIDE|CARBON DIOXIDE)$/

const WATER_RE =
  /\b(AQUA|WATER|WATERS|EAU|EAUX|AGUA|ACQUA|WASSER|HYDROLAT|HYDROLATE|HYDROSOL|DISTILLATE|JUICE|JUS)\b/

const ALCOHOL_RE =
  /^(SD )?(ALCOHOL|ALCOOL|ALKOHOL|ETHANOL|ETHYL ALCOHOL|DENATURED ALCOHOL|ISOPROPYL ALCOHOL|ACETONE)( DENAT\.?| DENATURED| SD ?[\dA-Z-]+| \d+[A-Z-]*)*\.?( SD ALCOHOL [\dA-Z-]+)?$/

const POLYOL_RE =
  /^(GLYCERIN|GLYCERINE|GLYCEROL|GLYCERINA|DIGLYCERIN|PROPYLENE GLYCOL|BUTYLENE GLYCOL|PROPANEDIOL|1.3-PROPANEDIOL|PENTYLENE GLYCOL|HEXYLENE GLYCOL|DIPROPYLENE GLYCOL|METHYLPROPANEDIOL|ISOPENTYLDIOL|SORBITOL|XYLITOL|ERYTHRITOL|GLYCERETH-26|PEG-\d+|ETHOXYDIGLYCOL)$/

/** Acides gras / huiles saponifiés (savon « vrai »). */
const SOAP_STEM_RE =
  /(PALM|KERNEL|COCO|OLIV|TALLOW|SUNFLOWER|RAPESEED|CASTOR|SHEA|BUTTER|PARKI|CANOL|ALMOND|AVOCAD|BABASSU|SOY|HEMP|ARGAN|GRAPESEED|JOJOB|MACADAMI|APRICOT|LARD|SAFFLOWER|SESAME|RICE BRAN|CORN|LINSEED|HAZELNUT|MANGO|COCOA|CAMELLI|NEEM|KARANJ|LAUR|MYRIST|STEAR|OLE|RICINOLE|PALMIT|BEHEN|UNDECYLEN)[A-Z -]*ATE$/
const SOAP_EXCLUDE_RE =
  /OYL |OYL$|SULF|ISETHION|GLUTAM|GLYCIN|SARCOS|TAUR|LACTYL|PHOSPH|CITR|BENZO|SALICYL|HYALURON|ACRYL|CARBON|CARBOX|LACTATE|ASPART|ALANIN|SUCCIN|POLY|AMPHO|AMINO|IMINO|PROPION|GLUCOSID|GLUCON/

const SURFACTANT_RE = new RegExp(
  [
    '(LAURYL|LAURETH|COCO|COCOYL|COCETH|MYRETH|PARETH|TRIDECETH|MYRISTYL|DECYL|TRIDECYL|OLEYL|C\\d+-\\d+ ALKYL)[- ]?(\\d+ )?SULFATE\\b',
    'SULFOSUCCINATE',
    'SULFOACETATE',
    'ISETHIONATE',
    'OLEFIN SULFONATE',
    'SARCOSINATE',
    '(COCOYL|LAUROYL|MYRISTOYL|CAPRYLOYL|OLEOYL) (GLUTAMATE|GLYCINATE|ALANINATE|TAURATE|METHYL TAURATE|METHYL ISETHIONATE|APPLE AMINO ACIDS|WHEAT AMINO ACIDS|OAT AMINO ACIDS|AMINO ACIDS|HYDROLYZED)',
    'AMIDOPROPYL (BETAINE|HYDROXYSULTAINE)',
    'COCO-?BETAINE',
    'LAURYL BETAINE',
    'SULTAINE',
    'AMPHO(DI)?ACETATE',
    'AMPHO(DI)?PROPIONATE',
    '^(DECYL|COCO|LAURYL|CAPRYLYL|CAPRYL|CAPRYLYL/CAPRYL|OCTYL|COCO-) ?GLUCOSIDE$',
    'GLUCOSE CARBOXYLATE',
    'LAURETH-\\d+ CARBOXYLATE',
    'AMINE OXIDE',
    'COCAMIDE (MEA|DEA|MIPA)',
    'LAURAMIDE (MEA|DEA)',
  ].join('|'),
)

const EMULSIFIER_RE = new RegExp(
  [
    '^(CETEARYL|CETYL|STEARYL|BEHENYL|ARACHIDYL|C\\d+-\\d+ ALKYL) GLUCOSIDE$',
    '^GLYCERYL (STEARATE|OLEATE|CITRATE|LAURATE|BEHENATE|DIBEHENATE|STEARATE SE|STEARATE CITRATE|ISOSTEARATE)',
    'POLYSORBATE (60|65|80|85)',
    'CETEARETH',
    'STEARETH',
    'CETETH',
    'OLETH',
    'BEHENETH',
    'CETEARYL OLIVATE',
    'SORBITAN (STEARATE|OLEATE|OLIVATE|PALMITATE|ISOSTEARATE|SESQUIOLEATE|TRISTEARATE|LAURATE)',
    'LECITHIN',
    'POLYGLYCERYL-\\d+ ([A-Z]+ )?(STEARATE|OLEATE|ISOSTEARATE|DIISOSTEARATE|RICINOLEATE|POLYRICINOLEATE|OLIVATE|PALMITATE|DIPOLYHYDROXYSTEARATE|BEHENATE)',
    'SUCROSE (STEARATE|DISTEARATE|POLYSTEARATE|PALMITATE)',
    'METHYL GLUCOSE (SESQUI|DI)?STEARATE',
    'CETYL PHOSPHATE',
    'STEAROYL (GLUTAMATE|LACTYLATE)',
    'PEG-\\d+ (STEARATE|DISTEARATE|OLEATE|DIMETHICONE|GLYCERYL STEARATE|GLYCERYL TRIISOSTEARATE)',
    'PEG/PPG-\\d+/\\d+ DIMETHICONE',
    'BEHENTRIMONIUM',
    'CETRIMONIUM CHLORIDE',
    'STEARTRIMONIUM',
    'AMIDOPROPYL DIMETHYLAMINE',
    'DISTEARYLDIMONIUM',
    'DICETYLDIMONIUM',
    'DIPALMITOYLETHYL',
    'DISTEAROYLETHYL',
    'PALMITAMIDOPROPYLTRIMONIUM',
    '(CETEARYL|CETYL) SULFATE',
    'ACRYLATES/C10-30 ALKYL ACRYLATE CROSSPOLYMER',
    'POLYACRYLATE CROSSPOLYMER-6',
    'POLYACRYLATE-13',
    'POLYACRYLAMIDE',
    'ACRYLOYLDIMETHYLTAURATE',
    'TRILAURETH-4 PHOSPHATE',
    'PPG-\\d+ STEARYL ETHER',
  ].join('|'),
)

const WAX_BUTTER_RE = new RegExp(
  [
    '\\bBUTTER\\b',
    '\\bBEURRE\\b',
    'BUTYROSPERMUM',
    '\\bSHEA\\b',
    'KARITE',
    'THEOBROMA CACAO SEED',
    '\\bCERA\\b',
    '\\bWAX\\b',
    'BEESWAX',
    '\\bCIRE\\b',
    'CANDELILLA',
    'CARNAUBA',
    'OZOKERITE',
    'CERESIN',
    'MICROCRISTALLINA',
    'MICROCRYSTALLINE',
    '^PARAFFIN$',
    'PETROLATUM',
    'VASELIN',
    '^LANOLIN$',
    'LANOLIN ANHYDROUS',
    'ADEPS LANAE',
    '^POLYETHYLENE$',
    '^HYDROGENATED (CASTOR|JOJOBA|RAPESEED|COCONUT|PALM|PALM KERNEL|SOYBEAN|VEGETABLE|OLIVE|SUNFLOWER SEED|APRICOT KERNEL) OIL$',
    'HYDROGENATED COCO-GLYCERIDES',
    '^CETYL PALMITATE$',
    '^CETYL ESTERS$',
    '^MYRISTYL MYRISTATE$',
    '^STEARYL STEARATE$',
    'TRIBEHENIN',
  ].join('|'),
)

const FATTY_ALCOHOL_RE =
  /^(CETEARYL|CETYL|STEARYL|BEHENYL|MYRISTYL|ARACHIDYL|LANOLIN|C\d+-\d+) ALCOHOLS?$|^(STEARIC|PALMITIC|MYRISTIC|BEHENIC|HYDROXYSTEARIC|12-HYDROXYSTEARIC) ACID$/

const OIL_RE = new RegExp(
  [
    '\\b(OIL|OILS|OLEUM|HUILE|OLIO|ACEITE|OLEO)\\b',
    'PARAFFINUM LIQUIDUM',
    'ISOHEXADECANE',
    'ISODODECANE',
    'ISOEICOSANE',
    'POLYISOBUTENE',
    'POLYBUTENE',
    'POLYDECENE',
    'SQUALANE',
    'SQUALENE',
    '^C\\d+-\\d+ (ALKANE|ISOPARAFFIN)$',
    '^(UNDECANE|TRIDECANE|DODECANE|ISOPARAFFIN)$',
    '^(DIMETHICONE|CYCLOPENTASILOXANE|CYCLOHEXASILOXANE|CYCLOTETRASILOXANE|CYCLOMETHICONE|PHENYL TRIMETHICONE|DIMETHICONOL|TRISILOXANE|DISILOXANE|CAPRYLYL METHICONE|METHYL TRIMETHICONE|DIPHENYLSILOXY PHENYL TRIMETHICONE|DIMETHICONE CROSSPOLYMER|AMODIMETHICONE|STEARYL DIMETHICONE|CETYL DIMETHICONE|PHENYL METHICONE|TRIMETHYLSILOXYSILICATE)$',
    '^(OCTYLDODECANOL|HEXYLDECANOL|ISOSTEARYL ALCOHOL|OLEYL ALCOHOL|OLEIC ACID|LINOLEIC ACID|ISOSTEARIC ACID)$',
    '^(CAPRYLIC/CAPRIC|CAPRIC/CAPRYLIC|COCO-CAPRYLATE/CAPRATE|COCO-CAPRYLATE|COCOGLYCERIDES|COCO-GLYCERIDES)',
    'TRIGLYCERIDES?$',
    'TRIETHYLHEXANOIN',
    'OCTOCRYLENE',
    'HOMOSALATE',
    'ETHYLHEXYL (SALICYLATE|METHOXYCINNAMATE|TRIAZONE|DIMETHYL PABA)',
    'OCTINOXATE',
    'OCTISALATE',
    'BUTYL METHOXYDIBENZOYLMETHANE',
    'AVOBENZONE',
    'DIETHYLAMINO HYDROXYBENZOYL HEXYL BENZOATE',
    'BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE',
    'DIETHYLHEXYL BUTAMIDO TRIAZONE',
    'ISOAMYL P-METHOXYCINNAMATE',
  ].join('|'),
)

/** Esters émollients (alcool gras + acide gras), hors sels et émulsifiants. */
const ESTER_SUFFIX_RE =
  /(MYRISTATE|PALMITATE|ISONONANOATE|ETHYLHEXANOATE|BENZOATE|ADIPATE|SEBACATE|NEOPENTANOATE|SUCCINATE|CAPRYLATE|CAPRATE|LAURATE|OLEATE|ISOSTEARATE|STEARATE|LACTATE|CARBONATE|HEPTANOATE|UNDECANOATE|LINOLEATE|ERUCATE|MALATE|DIMER DILINOLEATE|TETRAISOSTEARATE|TRIISOSTEARATE|DIISOSTEARATE|TETRAETHYLHEXANOATE|DIHEPTANOATE|ETHER)$/
const ESTER_EXCLUDE_RE =
  /^(SODIUM|POTASSIUM|MAGNESIUM|ZINC|CALCIUM|ALUMINUM|ALUMINIUM|AMMONIUM|DISODIUM|TRISODIUM|TETRASODIUM|TEA|TRIETHANOLAMINE|GLYCERYL|PEG|PPG|POLYGLYCERYL|SORBITAN|SUCROSE|METHYL|ETHYL|ASCORBYL|RETINYL|TOCOPHERYL|BENZYL|DENATONIUM|TRIETHYL|DIMETHYL|CETRIMONIUM|MENTHYL|PROPYLENE CARBONATE|LITHIUM|BARIUM)\b|SULFO|SULFATE|BUTYL ETHER$|^GLYCOL (DI)?STEARATE$/

const POWDER_RE = new RegExp(
  [
    '^TALC',
    '^MICA$',
    '\\bKAOLIN\\b',
    'BENTONITE',
    'MONTMORILLONITE',
    '\\bILLITE\\b',
    '\\bCLAY\\b',
    '\\bARGIL',
    '\\bSOLUM\\b',
    'GHASSOUL',
    'RHASSOUL',
    '^SILICA$',
    '^HYDRATED SILICA$',
    '\\bSTARCH\\b',
    '\\bAMIDON\\b',
    '\\bFLOUR\\b',
    '\\bPOWDER\\b',
    '\\bPOUDRE\\b',
    '^(MAGNESIUM|ZINC|CALCIUM) (STEARATE|MYRISTATE)$',
    '^BORON NITRIDE$',
    '^(CALCIUM|MAGNESIUM|SODIUM) (CARBONATE|BICARBONATE)$',
    '^TITANIUM DIOXIDE$',
    '^ZINC OXIDE$',
    '^CI 77(891|491|492|499|947|163|007)$',
    '^IRON OXIDES$',
    '^BISMUTH OXYCHLORIDE$',
    '^NYLON-\\d+$',
    '^POLYMETHYL METHACRYLATE$',
    '^SYNTHETIC FLUORPHLOGOPITE$',
    '^CALCIUM ALUMINUM BOROSILICATE$',
    '^ALUMINA$',
    '^PERLITE$',
    'DIATOMACEOUS EARTH',
    '^CHARCOAL',
  ].join('|'),
)

/** Cristaux (sucre, sel) : base de gommages ou de sels de bain. */
const CRYSTAL_RE =
  /^(SUCROSE|SUGAR|SACCHARUM OFFICINARUM|SODIUM CHLORIDE|MARIS SAL|SEA SALT|SAL|SEL|SEL DE MER|MAGNESIUM SULFATE|MAGNESIUM CHLORIDE|DEAD SEA SALT|MARIS SAL.*|SALT)$/

const ALKALI_NA_RE = /^SODIUM HYDROXIDE$/
const ALKALI_K_RE = /^POTASSIUM HYDROXIDE$/
// « UNSAPONIFIABLES » / « INSAPONIFIABLES » (fraction d'huile) ne sont PAS du savon.
const SAPONIFIED_RE = /(^|[^N])SAPONIF|\bSAVON\b|\bSOAP\b/

/** Abrasif + marqueur bucco-dentaire : dentifrice, hors référentiel. */
const TOOTH_ABRASIVE_RE =
  /HYDRATED SILICA|SILICA HIDRATADA|^CALCIUM CARBONATE$|DICALCIUM PHOSPHATE|CALCIUM PYROPHOSPHATE|HYDROXYAPATITE/
const TOOTH_MARKER_RE =
  /FLUORID|MONOFLUOROPHOSPHATE|PYROPHOSPHATE|^SORBITOL$|^XYLITOL$|SACCHARIN|HYDROXYAPATITE|HYDROGENATED STARCH HYDROLYSATE|SUCRALOSE|STEVIOSIDE|\bFLAVOU?R\b|\bAROMA\b|^CI 74160$/

/** Solvants volatils (produits anhydres coulants : mascara, gloss, sprays). */
const VOLATILE_RE = /^(ISODODECANE|ISOHEXADECANE|CYCLOPENTASILOXANE|CYCLOHEXASILOXANE|CYCLOMETHICONE|C\d+-\d+ ISOALKANE|UNDECANE|TRIDECANE)$/

/** Aloe / hydrolats / extraits aqueux en PREMIÈRE position = base aqueuse. */
const AQUEOUS_FIRST_RE =
  /ALOE .*(JUICE|GEL|WATER|EXTRACT|LEAF)|^ALOE BARBADENSIS$|^ALOE VERA$|FLOWER WATER|LEAF WATER|FRUIT WATER|HYDROLAT|DISTILLATE|INFUSION/

function roleOf(t: string): Role {
  if (PROPELLANT_RE.test(t)) return 'propellant'
  const pegLike = /^(PEG|PPG)-/.test(t) || /^(BIS|CETYL|LAURYL)-?(PEG|PPG)/.test(t)
  if (!pegLike && WATER_RE.test(t) && !/\b(OIL|OLEUM|HUILE|POWDER|BUTTER)\b/.test(t)) return 'water'
  if (ALCOHOL_RE.test(t)) return 'alcohol'
  if (POLYOL_RE.test(t)) return 'polyol'
  // « ISOPROPYL LAUROYL SARCOSINATE » : ester émollient (solaires), pas un lavant.
  if (/^(ISOPROPYL|ETHYL|OCTYLDODECYL|PHYTOSTERYL|BEHENYL|CHOLESTERYL)\b/.test(t) && /OYL /.test(t)) {
    return 'oil'
  }
  if (SURFACTANT_RE.test(t)) return 'surfactant'
  if (/^(SODIUM|POTASSIUM) /.test(t) && SOAP_STEM_RE.test(t) && !SOAP_EXCLUDE_RE.test(t)) {
    return t.startsWith('POTASSIUM') ? 'soap_k' : 'soap_na'
  }
  if (pegLike) return 'other'
  // « BUTYROSPERMUM PARKII OIL » (huile de karité) est liquide : un nom en OIL
  // sans BUTTER / WAX / CERA ni hydrogénation reste une huile.
  if (
    /\b(OIL|OLEUM|HUILE)\b/.test(t) &&
    !/^HYDROGENATED\b/.test(t) &&
    !/\b(BUTTER|BEURRE|WAX|CERA|CIRE)\b/.test(t)
  ) {
    return 'oil'
  }
  if (WAX_BUTTER_RE.test(t)) return 'solid_lipid'
  if (FATTY_ALCOHOL_RE.test(t)) return 'fatty_alcohol'
  if (OIL_RE.test(t)) return 'oil'
  if (ESTER_SUFFIX_RE.test(t) && !ESTER_EXCLUDE_RE.test(t)) return 'oil'
  if (CRYSTAL_RE.test(t)) return 'crystal'
  if (POWDER_RE.test(t)) return 'powder'
  return 'other'
}

const isLipid = (r: Role) => r === 'oil' || r === 'solid_lipid' || r === 'fatty_alcohol'
const isSurf = (r: Role) => r === 'surfactant' || r === 'soap_k' || r === 'soap_na'

/** Poids positionnel de la phase grasse (la tête de liste pèse plus). */
function lipidWeight(pos: number): number {
  if (pos <= 3) return 2
  if (pos <= 6) return 1
  if (pos <= 9) return 0.5
  return 0.25
}

const UNKNOWN: Formulation = { galenic: 'unknown', waterFirst: false, confidence: 0 }

function result(galenic: Galenic, waterFirst: boolean, confidence: number): Formulation {
  const c = Math.max(0.05, Math.min(1, confidence))
  return { galenic, waterFirst, confidence: Math.round(c * 100) / 100 }
}

/**
 * Classe la forme galénique d'une liste INCI (chaîne brute ou noms ordonnés).
 * Déterministe, sans IA. `unknown` dès que la tête de liste est illisible.
 */
export function classifyFormulation(inci: string | readonly string[] | null | undefined): Formulation {
  const all = splitInci(inci).filter((t) => !PROPELLANT_RE.test(t))
  if (all.length === 0) return UNKNOWN
  const tokens = all.slice(0, FORMULATION_WINDOW)
  const roles = tokens.map(roleOf)
  const n = tokens.length
  // Le stéarate de sodium hors tête de liste est un GÉLIFIANT (stick déodorant),
  // pas une base lavante : on ne le compte pas comme tensioactif.
  const surf = roles.map((r, i) => isSurf(r) && !(i > 0 && tokens[i] === 'SODIUM STEARATE'))
  const firstPos = (pred: (r: Role) => boolean, from = 0, to = n - 1): number => {
    for (let i = from; i <= Math.min(to, n - 1); i++) if (pred(roles[i])) return i
    return -1
  }
  const count = (pred: (r: Role) => boolean, from = 0, to = n - 1): number => {
    let c = 0
    for (let i = from; i <= Math.min(to, n - 1); i++) if (pred(roles[i])) c++
    return c
  }

  // Dentifrice : abrasif en tête + marqueur (fluor, sorbitol) : hors référentiel.
  if (
    tokens.slice(0, 5).some((t) => TOOTH_ABRASIVE_RE.test(t)) &&
    all.some((t) => TOOTH_MARKER_RE.test(t))
  ) {
    return UNKNOWN
  }

  const aqueousLead =
    roles[0] !== 'oil' && roles[0] !== 'powder' && AQUEOUS_FIRST_RE.test(tokens[0])
  const waterFirst = roles[0] === 'water' || aqueousLead

  // ── Base aqueuse ─────────────────────────────────────────────────────────
  const waterCase = (from: number, conf: number): Formulation => {
    const surfPositions: number[] = []
    for (let i = from; i < n; i++) if (surf[i]) surfPositions.push(i - from)
    const firstSurf = surfPositions.length ? surfPositions[0] : 99
    const surfTop6 = surfPositions.filter((p) => p <= 5).length
    // Plusieurs savons de sodium juste derrière l'eau : pain de savon listé
    // avec l'eau en tête (pâte avant séchage).
    const naSoaps = count((r) => r === 'soap_na', from, from + 3)
    const kSoaps = count((r) => r === 'soap_k', from, from + 5)
    if (naSoaps >= 2 && kSoaps === 0) return result('soap_bar', waterFirst, conf - 0.2)
    let lipid = 0
    let lipidBeforeSurf = 0
    for (let i = from; i < n; i++) {
      if (!isLipid(roles[i])) continue
      lipid += lipidWeight(i - from)
      if (i - from < firstSurf) lipidBeforeSurf += lipidWeight(i - from)
    }
    // Lavant : tensioactif juste derrière l'eau, ou plusieurs tensioactifs en
    // tête SANS phase grasse dominante devant eux (sinon crème de coloration,
    // lait nettoyant... : émulsion contenant un peu de tensioactif).
    if (firstSurf <= 2 || (surfTop6 >= 2 && lipidBeforeSurf < 2)) {
      return result('wash', waterFirst, conf)
    }
    const emulsifier = tokens.some((t, i) => i >= from && EMULSIFIER_RE.test(t))
    if (lipid >= 2 || (lipid >= 1 && emulsifier)) return result('emulsion', waterFirst, conf)
    if (lipid >= 1) return result('aqueous', waterFirst, conf - 0.25)
    return result('aqueous', waterFirst, conf)
  }

  // ── Base anhydre (huile / baume) ─────────────────────────────────────────
  const anhydrousCase = (from: number, conf: number): Formulation => {
    let solid = 0
    for (let i = from; i < Math.min(n, from + 6); i++) {
      if (roles[i] === 'solid_lipid' || roles[i] === 'fatty_alcohol') solid += i - from <= 2 ? 2 : 1
    }
    if (roles[from] === 'solid_lipid' || solid >= 2) return result('anhydrous_balm', false, conf)
    return result('anhydrous_oil', false, solid > 0 ? conf - 0.15 : conf)
  }

  // Extrait aqueux (aloe, hydrolat) en tête : base eau, quelle que soit la suite.
  if (aqueousLead) return waterCase(0, 0.8)

  // Base = premier ingrédient structurant parmi les 3 premiers (les extraits,
  // actifs et parfums de tête sont sautés). Au-delà : tête illisible.
  const basePos = firstPos((r) => r !== 'other', 0, 2)
  if (basePos < 0) return UNKNOWN
  const skippedPenalty = basePos * 0.15
  const base = roles[basePos]
  const waterPos = firstPos((r) => r === 'water')

  switch (base) {
    case 'water':
      return waterCase(basePos, 0.9 - skippedPenalty)

    case 'polyol': {
      const next = roles.slice(basePos + 1, basePos + 4)
      // Stick déodorant (propylène glycol + stéarate de sodium) : ni lavant ni aqueux.
      if (tokens.slice(basePos + 1, basePos + 4).includes('SODIUM STEARATE')) return UNKNOWN
      if (waterPos >= 0 && waterPos <= basePos + 2) return waterCase(basePos, 0.75 - skippedPenalty)
      if (next.some(isSurf)) return result('wash', false, 0.55 - skippedPenalty)
      if (next.some(isLipid)) return UNKNOWN
      return result('aqueous', false, 0.5 - skippedPenalty)
    }

    case 'alcohol':
      return result('alcoholic', false, 0.85 - skippedPenalty)

    case 'soap_na':
      return result('soap_bar', false, 0.9 - skippedPenalty)

    case 'soap_k':
      return result('wash', false, 0.75 - skippedPenalty)

    case 'surfactant': {
      // Eau juste derrière (ou derrière un 2e tensioactif / polyol) : concentré
      // liquide. Structurants solides (alcool gras, acide stéarique, cire, poudre,
      // maltodextrine) : syndet / shampooing solide. Huile sans eau : huile lavante.
      if (waterPos === basePos + 1) return result('wash', false, 0.7 - skippedPenalty)
      const between = roles[basePos + 1]
      if (waterPos === basePos + 2 && between && (isSurf(between) || between === 'polyol')) {
        return result('wash', false, 0.6 - skippedPenalty)
      }
      const solidMarker = tokens.some(
        (t, i) =>
          i > basePos &&
          i <= basePos + 5 &&
          (roles[i] === 'fatty_alcohol' ||
            roles[i] === 'solid_lipid' ||
            roles[i] === 'powder' ||
            roles[i] === 'soap_na' ||
            t === 'MALTODEXTRIN'),
      )
      if (solidMarker) return result('soap_bar', false, 0.75 - skippedPenalty)
      // Huile juste derrière le tensioactif : huile de douche / huile lavante.
      if (count((r) => r === 'oil', basePos + 1, basePos + 2) > 0) {
        return result('anhydrous_oil', false, 0.6 - skippedPenalty)
      }
      if (waterPos >= 0) return result('wash', false, 0.5 - skippedPenalty)
      return UNKNOWN
    }

    case 'oil':
    case 'solid_lipid':
    case 'fatty_alcohol': {
      const head = tokens.slice(0, 5)
      if (head.some((t) => SAPONIFIED_RE.test(t) || ALKALI_NA_RE.test(t))) {
        return result('soap_bar', false, 0.8)
      }
      if (head.some((t) => ALKALI_K_RE.test(t))) return result('wash', false, 0.6)
      if (waterPos >= 0 && waterPos <= basePos + 3) {
        return result('emulsion', false, 0.75 - skippedPenalty)
      }
      return anhydrousCase(basePos, 0.85 - skippedPenalty)
    }

    case 'crystal': {
      // Sucre / sel : gommage (dans l'eau ou l'huile) ou sels de bain (seuls).
      if (waterPos >= 0 && waterPos <= basePos + 2) return waterCase(waterPos, 0.6)
      // Sel + carbonate / sulfate de magnésium : sels de bain (même parfumés d'huile essentielle).
      const next = roles[basePos + 1]
      const lipids = count(isLipid, basePos + 1, basePos + 3)
      if (next !== 'powder' && next !== 'crystal' && (lipids >= 2 || (next && isLipid(next)))) {
        return anhydrousCase(firstPos(isLipid, basePos + 1, basePos + 3), 0.7 - skippedPenalty)
      }
      return result('powder', false, 0.75 - skippedPenalty)
    }

    case 'powder': {
      if (waterPos >= 0 && waterPos <= basePos + 2) return waterCase(waterPos, 0.6)
      const isPowderish = (r: Role) => r === 'powder' || r === 'crystal'
      const powdersHead = count(isPowderish, basePos, basePos + 2)
      // Poudre isolée derrière un ingrédient non structurant (colle à ongles :
      // cyanoacrylate + PMMA) : tête illisible.
      if (basePos > 0 && count(isPowderish, 0, 3) < 2) return UNKNOWN
      // Amidon + tensioactifs + alcool gras : pain nettoyant / shampooing solide.
      if (
        count(isSurf, basePos + 1, basePos + 2) > 0 &&
        count((r) => r === 'fatty_alcohol' || r === 'solid_lipid', basePos + 1, basePos + 5) > 0
      ) {
        return result('soap_bar', false, 0.6 - skippedPenalty)
      }
      // Une seule poudre en tête puis des lipides AVEC un solvant volatil ou une
      // cire : produit anhydre coulant ou en stick (gloss pailleté, mascara).
      // Deux poudres puis lipides AVEC cire ou beurre : baume (déodorant crème à
      // l'arrow-root). Sinon poudre : fards compacts et poudres libres ont aussi
      // des liants gras (squalane, esters) juste derrière le mica ou le talc.
      const volatileHead = tokens.slice(0, 4).some((t) => VOLATILE_RE.test(t))
      if (
        powdersHead === 1 &&
        count(isLipid, basePos + 1, basePos + 4) >= 2 &&
        (volatileHead || count((r) => r === 'solid_lipid', basePos + 1, basePos + 6) > 0)
      ) {
        return anhydrousCase(firstPos(isLipid, basePos + 1, basePos + 4), 0.6 - skippedPenalty)
      }
      if (
        powdersHead === 2 &&
        count(isLipid, basePos + 2, basePos + 5) >= 3 &&
        count((r) => r === 'solid_lipid', basePos + 2, basePos + 5) >= 1
      ) {
        return result('anhydrous_balm', false, 0.55 - skippedPenalty)
      }
      return result('powder', false, 0.8 - skippedPenalty)
    }

    default:
      return UNKNOWN
  }
}

// ─── Affinité ───────────────────────────────────────────────────────────────

/**
 * Voisinages admis (décision produit, sept 2026) : aqueux et émulsion ; huile et
 * baume. Ajout motivé : alcoolique et aqueux (deux solutions monophasiques
 * limpides ; l'ordre eau/alcool en tête ne traduit souvent qu'un léger écart de
 * dosage, ex. brume « AQUA, ALCOHOL » vs « ALCOHOL, AQUA »).
 * wash et soap_bar restent OPPOSÉS : un gel douche n'est pas un pain de savon.
 */
const NEAR: Record<Galenic, readonly Galenic[]> = {
  aqueous: ['emulsion', 'alcoholic'],
  emulsion: ['aqueous'],
  alcoholic: ['aqueous'],
  anhydrous_oil: ['anhydrous_balm'],
  anhydrous_balm: ['anhydrous_oil'],
  wash: [],
  soap_bar: [],
  powder: [],
  unknown: [],
}

function galenicOf(v: Galenic | Formulation | null | undefined): Galenic {
  if (!v) return 'unknown'
  return typeof v === 'string' ? v : v.galenic
}

/** Affinité entre deux formes : same | near | opposite | unknown (un côté inconnu). */
export function formulationAffinity(
  a: Galenic | Formulation | null | undefined,
  b: Galenic | Formulation | null | undefined,
): FormulationAffinity {
  const ga = galenicOf(a)
  const gb = galenicOf(b)
  if (ga === 'unknown' || gb === 'unknown') return 'unknown'
  if (ga === gb) return 'same'
  return NEAR[ga].includes(gb) ? 'near' : 'opposite'
}

/**
 * Rang de tri d'une affinité : 0 = même formule (prioritaire), 1 = voisine ou
 * inconnue (fail-open), 2 = opposée (à écarter).
 */
export function affinityRank(aff: FormulationAffinity): 0 | 1 | 2 {
  if (aff === 'same') return 0
  if (aff === 'opposite') return 2
  return 1
}

/** Libellé français court d'une forme (prompts IA, debug). */
export const GALENIC_LABEL_FR: Record<Galenic, string> = {
  aqueous: 'base aqueuse (sérum, tonique, gel aqueux)',
  emulsion: 'émulsion eau + huile (crème, lait)',
  wash: 'base lavante liquide (gel, shampooing)',
  soap_bar: 'savon ou syndet solide',
  anhydrous_oil: 'huile (sans eau)',
  anhydrous_balm: 'baume, beurre ou cire (sans eau)',
  powder: 'poudre',
  alcoholic: 'base alcoolique',
  unknown: 'forme inconnue',
}
