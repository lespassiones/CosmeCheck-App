/**
 * Le texte des deux fiches de magasin (App Store et Google Play), en francais,
 * et la seule chose qui garantisse qu'il entre.
 *
 * ## Ce que fait le script
 *
 *   node scripts/fiches-store.mjs              lecture seule : verifie chaque
 *                                              champ, ecrit docs/fiches-store.md,
 *                                              puis affiche le differentiel entre
 *                                              les fiches en ligne et ce texte.
 *   node scripts/fiches-store.mjs --appliquer  pousse le texte :
 *       - App Store : sur la PROCHAINE version (celle d'app.json), creee si elle
 *         n'existe pas encore, localisations fr-FR et fr-CA (identiques) ;
 *         le nom et le sous-titre vont sur la fiche « en preparation ».
 *       - Google Play : fiche fr-FR (titre, breve et longue description), dans
 *         une edition validee a la fin.
 *   Option --sans-fr-ca : ne cree ni ne modifie la localisation fr-CA.
 *
 * ⚠️ `--appliquer` ne soumet rien a la verification Apple et ne touche ni aux
 * binaires ni aux captures. Mais sur Google Play, valider l'edition envoie la
 * fiche a l'examen : si la publication geree est desactivee, elle part en ligne
 * des qu'elle est acceptee.
 *
 * ## Pourquoi un script plutot qu'un document
 *
 * Un champ trop long n'est pas tronque par le formulaire, il est REFUSE, et on
 * l'apprend au collage, un champ a la fois. `champ()` echoue ici avant que quoi
 * que ce soit parte. Meme principe que scripts/fiches-store.py de MemoryPilot.
 *
 * Les controles, tous bloquants : plafonds de chaque magasin ; aucun tiret
 * cadratin ni demi-cadratin ; aucune autre plateforme nommee dans un texte
 * Apple (regle 2.3.10) ; aucun prix (les prix vivent dans les magasins et
 * changent sans republication) ; mots-cles Apple sans espace, sans doublon,
 * sans mot du nom ni du sous-titre, sans marque concurrente.
 *
 * Cles (secrets, gitignore) : secrets/AuthKey_V8UJ847B48.p8 (App Store Connect)
 * et secrets/play-service-account.json (Google Play), comme asc-etat.mjs et
 * play-etat.mjs.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPLIQUER = process.argv.includes('--appliquer')
const AVEC_FR_CA = !process.argv.includes('--sans-fr-ca')

// ── Les champs et leurs plafonds ─────────────────────────────────────────────

const CHAMPS = {}
let erreurs = 0

function echec(msg) {
  console.error(`ERREUR : ${msg}`)
  erreurs++
}

function champ(cle, valeur, maximum) {
  const n = [...valeur].length
  if (n > maximum) echec(`${cle} fait ${n} / ${maximum}`)
  CHAMPS[cle] = { valeur, n, maximum }
  return valeur
}

// ── Les textes ───────────────────────────────────────────────────────────────

// Inchange sur l'App Store (Play passe de « cosmecheck: » a « Cosme Check: »).
// « Cosme Check » en deux mots indexe deja « cosme » et « check »
// separement, et « scan cosmetique » est l'intention tapee dans un magasin.
const NOM = champ('nom (Apple et Play)', 'Cosme Check: scan cosmétique', 30)

const SOUS_TITRE = champ('sous-titre (Apple)', 'Composition INCI & skincare', 30)

const MOTS_CLES = champ(
  'mots-clés (Apple)',
  'cosmecheck,routine,crème,visage,beauté,peau,bio,naturelle,allergène,ingrédient,soin,analyse,produit',
  100,
)

const PROMO = champ(
  'texte promotionnel (Apple)',
  "Une crème, un shampoing, un déo : scanne-le, lis sa composition INCI en clair, et vois s'il convient à ta peau et si ses promesses tiennent.",
  170,
)

const BREVE_PLAY = champ(
  'brève description (Play)',
  'Scanne tes cosmétiques : composition INCI, allergènes, routine skincare et peau',
  80,
)

const NOUVEAUTES = champ(
  'nouveautés 1.0.4 (Apple)',
  `Des notes plus cohérentes, et un quiz du jour bien plus riche.

• Le quiz du jour passe à 1 000 questions sur la peau et les soins, et il fonctionne même sans connexion.
• La note d'un produit est calculée de la même façon dans le catalogue, dans ton analyse et dans tes alternatives.
• Corrections et améliorations de performance.`,
  4000,
)

/** Le corps commun aux deux magasins. Seul le paragraphe d'abonnement differe. */
function description(gestionAbonnement) {
  return `Tu dépenses parfois des dizaines d'euros dans une crème... sans savoir si elle est vraiment faite pour ta peau. Cosme Check scanne ton cosmétique et te dit en quelques secondes ce qu'il contient, s'il convient à ton type de peau et s'il tient les promesses de son emballage.

CE QUE COSME CHECK T'APPORTE

• Décrypte la composition INCI
Chaque ingrédient de la liste INCI est expliqué simplement : à quoi il sert, et pourquoi il compte pour toi. Les allergènes réglementés en Europe et les ingrédients que tu veux éviter sont signalés.

• Un score de compatibilité avec ta peau
Type de peau, sensibilités, préférences : la note tient compte de ton profil, pas d'une moyenne.

• Vérifie les promesses
Hydratant, anti-âge, sans sulfates, naturel... Cosme Check regarde si la composition tient ce que la marque affiche. Tu ne paies plus pour du marketing.

• Note toute ta routine skincare
Ajoute tes soins visage, corps et cheveux : tu vois ce à quoi ta peau est exposée au total, les produits qui se contredisent, et ta progression vers tes objectifs beauté.

• Trouve mieux, dans la même catégorie
Une crème te convient peu ? Cosme Check te propose des alternatives mieux notées et de la même forme : une crème pour une crème, un shampoing pour un shampoing.

• Perle, ta conseillère beauté
Pose tes questions sur tes produits et ta routine, et reçois des réponses adaptées à ton profil.

3 FAÇONS D'ANALYSER UN PRODUIT
• Scan du code-barres, en magasin ou chez toi
• Recherche dans le catalogue
• Photo ou copier-coller de la liste d'ingrédients

GRATUIT ET PREMIUM
Cosme Check s'utilise gratuitement. L'abonnement Premium, mensuel ou annuel, débloque l'usage illimité des scans et le score de compatibilité détaillé. Son tarif s'affiche dans l'app avant tout achat. ${gestionAbonnement}
Conditions d'utilisation : https://cosme-check.com/cgu
Politique de confidentialité : https://cosme-check.com/privacy

Cosme Check est un outil d'information sur la composition des cosmétiques. Il ne pose aucun diagnostic et ne remplace pas l'avis d'un dermatologue ou d'un professionnel de santé.`
}

const DESC_APPLE = champ(
  'description (Apple)',
  description(
    "L'abonnement se renouvelle automatiquement sauf résiliation au moins 24 heures avant la fin de la période en cours. Il se gère et se résilie à tout moment dans les réglages de ton compte App Store.",
  ),
  4000,
)

const DESC_PLAY = champ(
  'description (Play)',
  description(
    "L'abonnement se renouvelle automatiquement sauf résiliation avant la fin de la période en cours. Il se gère et se résilie à tout moment dans Google Play, rubrique Abonnements.",
  ) + '\n\nCosme Check, aussi écrit cosmecheck.',
  4000,
)

// ── Les controles ────────────────────────────────────────────────────────────

const MARQUES_CONCURRENTES = ['yuka', 'incibeauty', 'inci beauty', 'quelcosmetic', 'clean beauty app']

for (const [cle, { valeur }] of Object.entries(CHAMPS)) {
  if (/[\u2014\u2013]/.test(valeur)) echec(`tiret cadratin ou demi-cadratin dans ${cle}`)
  if (/€|\$|\d+[,.]\d\d\s?(eur|euros)/i.test(valeur)) echec(`un prix dans ${cle}`)
  const bas = valeur.toLowerCase()
  for (const m of MARQUES_CONCURRENTES) if (bas.includes(m)) echec(`marque concurrente « ${m} » dans ${cle}`)
  if (cle.includes('(Apple)') || cle.includes('Apple et Play')) {
    if (/android|google|play store|playstore/i.test(valeur)) echec(`autre plateforme nommee dans ${cle} (2.3.10)`)
  }
}

const mots = MOTS_CLES.split(',')
if (/\s/.test(MOTS_CLES)) echec('espace dans les mots-cles Apple : chaque espace mange un caractere')
if (new Set(mots).size !== mots.length) echec('doublon dans les mots-cles Apple')
const indexes = `${NOM} ${SOUS_TITRE}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
for (const m of mots) if (indexes.includes(m)) echec(`« ${m} » est deja dans le nom ou le sous-titre`)

// ── Le pourquoi de chaque mot, et les volumes ────────────────────────────────

// Volumes : Google Keyword Planner, France, toutes langues, recherches
// mensuelles moyennes, mesures le 19/10/2026. C'est la recherche web, pas celle
// des magasins (qui ne publient rien), mais c'est le meilleur indicateur dispo.
const VOLUMES = [
  ['inci beauty', '10k-100k', 'marque concurrente : JAMAIS dans nos champs'],
  ['inci', '1k-10k', 'sous-titre'],
  ['routine skincare', '1k-10k', 'skincare (sous-titre) + routine (mots-clés)'],
  ['crème visage', '1k-10k', 'crème + visage (mots-clés)'],
  ['produit cosmétique', '1k-10k', 'cosmétique (nom) + produit (mots-clés)'],
  ['cosmetique bio', '1k-10k', 'cosmétique (nom) + bio (mots-clés)'],
  ['composition cosmétique', '100-1k', 'composition (sous-titre) + cosmétique (nom)'],
  ['application cosmétique', '100-1k', 'cosmétique (nom) ; « application » est ignoré par Apple'],
  ['application beauté', '100-1k', 'beauté (mots-clés)'],
  ['analyse peau', '100-1k', 'analyse + peau (mots-clés)'],
  ['type de peau', '100-1k', 'peau (mots-clés), dans la description Play'],
  ['cosmétique naturelle', '100-1k', 'cosmétique (nom) + naturelle (mots-clés)'],
  ['yuka cosmétique', '100-1k', 'marque concurrente : JAMAIS'],
  ['scan cosmétique', '10-100', 'nom, tel quel'],
  ['scanner produit beauté', '10-100', 'scan (nom) + produit + beauté (mots-clés)'],
  ['analyse cosmétique', '10-100', 'analyse (mots-clés) + cosmétique (nom)'],
  ['allergène cosmétique', '10-100', 'allergène (mots-clés)'],
  ['ingrédients cosmétiques', '10-100', 'ingrédient (mots-clés) + cosmétique (nom)'],
  ['application ingrédients cosmétiques', '10-100', 'idem'],
  ['application skincare', '10-100', 'skincare (sous-titre)'],
  ['perturbateurs endocriniens cosmétiques', '10-100', 'non retenu : volume faible, et mot de santé à manier avec soin'],
  ['application scan cosmétique, application soin visage, scanner crème, déchiffrer composition', 'aucun', 'couverts quand même par les mots du nom, du sous-titre et des mots-clés'],
]

const POURQUOI = [
  ['Cosme Check (nom)', 'La marque, en deux mots : « cosme » et « check » sont indexés séparément, donc « cosme check » et « cosme test » (vu dans Bing) retrouvent l’app.'],
  ['scan, cosmétique (nom)', 'L’intention tapée dans un magasin. « cosmétique » est la racine des requêtes les plus lourdes (produit cosmétique, cosmétique bio, cosmétique naturelle).'],
  ['composition (sous-titre)', '« composition cosmétique », 100-1k. C’est ce que l’app fait, mot pour mot.'],
  ['INCI (sous-titre)', '1k-10k, le mot générique le plus cherché du domaine. Placé dans le sous-titre, qui pèse plus que les mots-clés.'],
  ['skincare (sous-titre)', '« routine skincare » 1k-10k : le mot qu’emploient les 18-35 ans, combiné à « routine » des mots-clés.'],
  ['cosmecheck', 'La marque collée en un seul mot (cherchée, vue dans Bing). Pour un moteur, « cosmecheck » n’est pas « cosme check ».'],
  ['routine', 'Avec skincare : « routine skincare ». L’app note une routine entière.'],
  ['crème, visage', '« crème visage » 1k-10k : le produit le plus scanné, et la requête la plus lourde après INCI.'],
  ['beauté', '« application beauté » 100-1k, « scanner produit beauté ».'],
  ['peau', '« analyse peau », « type de peau » 100-1k. L’app adapte la note au type de peau.'],
  ['bio', '« cosmétique bio » 1k-10k. Le mot le moins direct de la liste : l’app ne certifie pas le bio, elle montre la composition, ce que cherche quelqu’un qui hésite sur un produit bio. À retirer en premier si Apple le juge hors sujet (2.3.7).'],
  ['naturelle', '« cosmétique naturelle » 100-1k. L’app vérifie la promesse « naturel » d’un emballage.'],
  ['allergène', '« allergène cosmétique ». L’app signale les allergènes réglementés en Europe.'],
  ['ingrédient', '« ingrédients cosmétiques », « application ingrédients cosmétiques ».'],
  ['soin', '« soin visage », « application soin visage » : le mot courant pour un produit de skincare.'],
  ['analyse', '« analyse cosmétique », « analyse peau ».'],
  ['produit', '« produit cosmétique » 1k-10k, « scanner produit beauté ».'],
]

const NON_RETENUS = [
  ['yuka, inci beauty, et toute autre marque', 'Marques concurrentes : motif de rejet (2.3.7) et risque de plainte. Jamais dans le nom, le sous-titre, les mots-clés ni la description.'],
  ['app, application, gratuit', 'Ignorés ou déjà couverts par Apple : chaque caractère serait perdu.'],
  ['shampooing, acné, dermo, label (anciens mots-clés)', 'Remplacés par des mots à volume mesuré (crème, visage, soin, produit). « acné » et « dermo » tirent vers le registre médical, qu’on évite.'],
  ['perturbateur, endocrinien', 'Volume faible (10-100) et 22 caractères ; vocabulaire de santé qui demande des précautions.'],
]

// ── Les captures : l'ordre propose (lu par l'API le 19/10/2026) ─────────────

const CAPTURES_IOS = {
  actuel: [
    '01 Est-il vraiment fait pour toi ?',
    '06 Atteins tes objectifs beauté',
    '07 Toute ta routine, notée',
    '05 Le meilleur choix pour ta peau',
    '04 Tient-il vraiment ses promesses ?',
    '09 On vérifie chaque promesse',
    '08 Ce à quoi ta peau est exposée',
    '03 Analyse un produit en 3 secondes',
    '02 Tout pour décrypter tes cosmétiques',
  ],
  propose: [
    '01 Est-il vraiment fait pour toi ?',
    '03 Analyse un produit en 3 secondes',
    '04 Tient-il vraiment ses promesses ?',
    '05 Le meilleur choix pour ta peau',
    '08 Ce à quoi ta peau est exposée',
    '07 Toute ta routine, notée',
    '06 Atteins tes objectifs beauté',
    '02 Tout pour décrypter tes cosmétiques',
    '09 On vérifie chaque promesse',
  ],
}

// ── docs/fiches-store.md ─────────────────────────────────────────────────────

function ecrireDoc() {
  const L = []
  const A = (s = '') => L.push(s)
  const bloc = (cle, libelle) => {
    const { valeur, n, maximum } = CHAMPS[cle]
    A(`### ${libelle}  ·  ${n} / ${maximum}`)
    A()
    A('```')
    A(valeur)
    A('```')
    A()
  }

  A('# Les fiches des magasins, mot pour mot')
  A()
  A('**Ce fichier ne s’écrit pas à la main.** Il sort de')
  A('[scripts/fiches-store.mjs](../scripts/fiches-store.mjs), qui refuse de')
  A('l’écrire si un champ dépasse son plafond, contient un tiret cadratin, un prix,')
  A('une marque concurrente ou, côté Apple, le nom d’une autre plateforme.')
  A()
  A('```bash')
  A('node scripts/fiches-store.mjs              # vérifie, écrit ce fichier, montre le différentiel')
  A('node scripts/fiches-store.mjs --appliquer  # pousse sur la prochaine version App Store et sur Play')
  A('```')
  A()
  A('> ⚠️ `--appliquer` ne soumet rien à Apple et ne touche ni aux binaires ni aux')
  A('> captures. Sur Google Play, valider l’édition envoie la fiche à l’examen.')
  A()
  A('L’app est en français seulement, et le reste pour l’instant. La localisation')
  A('**fr-CA** reçoit le même texte que fr-FR : sans elle, la vitrine canadienne')
  A('n’indexe que l’anglais et le français canadiens, et nos mots-clés n’y comptent')
  A('pas. Les captures ne sont pas envoyées pour fr-CA : App Store Connect reprend')
  A('celles de la langue principale (à vérifier à l’écran avant de soumettre).')
  A()
  A('---')
  A()
  A('## Comment l’app se retrouve')
  A()
  A('| | ce qui est indexé | ce qui fait marcher « cosme check » et « cosmecheck » |')
  A('|---|---|---|')
  A('| **App Store** | le nom, le sous-titre, les mots-clés. **Pas la description** | « Cosme Check » en deux mots dans le nom ; « cosmecheck » collé dans les mots-clés |')
  A('| **Play** | le titre, la brève description, la description complète | le titre, et « aussi écrit cosmecheck » à la fin de la description |')
  A()
  A('Mots-clés Apple : pas d’espace après les virgules, aucun mot déjà présent dans')
  A('le nom ou le sous-titre (Apple les indexe déjà et les combine avec les')
  A('mots-clés), **jamais de marque concurrente**.')
  A()
  A('### Pourquoi chaque mot est là')
  A()
  A('| Mot | Pourquoi |')
  A('|---|---|')
  for (const [m, p] of POURQUOI) A(`| ${m} | ${p} |`)
  A()
  A('### Ce qui n’a pas été retenu')
  A()
  A('| Mot | Pourquoi |')
  A('|---|---|')
  for (const [m, p] of NON_RETENUS) A(`| ${m} | ${p} |`)
  A()
  A('### Les volumes mesurés')
  A()
  A('Google Keyword Planner, France, toutes langues, recherches mensuelles')
  A('moyennes, relevé du 19/10/2026. C’est la recherche web, pas celle des')
  A('magasins (qui ne publient aucun volume), mais c’est le meilleur indicateur')
  A('disponible. Bing montre en plus que la marque est cherchée (« cosmecheck »,')
  A('« cosme test »).')
  A()
  A('| Requête | Volume | Où elle est couverte |')
  A('|---|---|---|')
  for (const [r, v, o] of VOLUMES) A(`| ${r} | ${v} | ${o} |`)
  A()
  A('À relire dans 14 jours après la mise en vente : conversion de la fiche, et')
  A('requêtes de recherche dans App Store Connect (Analyse > Sources).')
  A()
  A('---')
  A()
  A('## App Store Connect, fr-FR (et fr-CA, identique)')
  A()
  bloc('nom (Apple et Play)', 'Nom')
  bloc('sous-titre (Apple)', 'Sous-titre')
  bloc('mots-clés (Apple)', 'Mots-clés')
  bloc('texte promotionnel (Apple)', 'Texte promotionnel (modifiable sans vérification)')
  bloc('nouveautés 1.0.4 (Apple)', 'Nouveautés de la 1.0.4 (à relire)')
  bloc('description (Apple)', 'Description')
  A('> ⚠️ **Aucun prix dans la description.** Les prix vivent dans les magasins et')
  A('> changent sans republication ; un montant recopié finit faux. La règle 3.1.2')
  A('> demande le prix et la durée **dans l’app avant l’achat** (l’écran d’offre les')
  A('> lit chez RevenueCat), le renouvellement automatique, et les liens vers les')
  A('> conditions et la confidentialité : ces trois-là restent dans la description.')
  A()
  A('> ⚠️ **Règle 2.3.10.** Aucune autre plateforme n’est nommée dans un texte')
  A('> Apple. C’est vérifié par le script.')
  A()
  A('---')
  A()
  A('## Google Play, fr-FR')
  A()
  bloc('nom (Apple et Play)', 'Titre')
  bloc('brève description (Play)', 'Brève description')
  bloc('description (Play)', 'Description complète')
  A('---')
  A()
  A('## Les captures')
  A()
  A('Seules les trois premières se voient dans les résultats de recherche, sans')
  A('ouvrir la fiche. Elles doivent répondre à « qu’est-ce que ça fait » avant')
  A('« qu’est-ce que ça m’apporte en plus ». Rien n’est modifié par le script.')
  A()
  A('### App Store (iPhone 6,5 pouces, 9 captures)')
  A()
  A('| Place | Aujourd’hui | Proposé |')
  A('|---|---|---|')
  CAPTURES_IOS.actuel.forEach((c, i) => A(`| ${i + 1} | ${c} | ${CAPTURES_IOS.propose[i]} |`))
  A()
  A('Pourquoi : « Est-il vraiment fait pour toi ? » reste en tête, c’est la')
  A('promesse. « Analyse un produit en 3 secondes » remonte de la 8e à la 2e place :')
  A('c’est le geste (scanner), et c’est ce que cherche quelqu’un qui a tapé « scan')
  A('cosmétique ». « Tient-il vraiment ses promesses ? » en 3e : c’est ce qui')
  A('distingue l’app. « On vérifie chaque promesse » répète la 3e et part en')
  A('dernier.')
  A()
  A('### Google Play (8 captures)')
  A()
  A('L’ordre actuel est déjà le bon (fait pour toi, tout pour décrypter, 3 secondes,')
  A('promesses, meilleur choix, objectifs, routine, exposition). Une seule')
  A('suggestion : passer « Analyse un produit en 3 secondes » en 2e, devant « Tout')
  A('pour décrypter tes cosmétiques », pour la même raison que sur iOS.')
  A()
  A('> ⚠️ Les captures Play montrent un iPhone (cadre et îlot dynamique). Google')
  A('> le tolère, mais ce n’est pas l’appareil de la personne qui regarde : à')
  A('> refaire sur un cadre Android à la prochaine série.')

  const chemin = path.join(RACINE, 'docs', 'fiches-store.md')
  fs.writeFileSync(chemin, L.join('\n') + '\n', 'utf8')
  const relu = fs.readFileSync(chemin, 'utf8')
  if (/[\u2014\u2013]/.test(relu)) echec('un tiret cadratin s’est glissé dans docs/fiches-store.md')
  if (!relu.includes('crème') || !relu.includes('Décrypte')) echec('les accents n’ont pas survécu à l’écriture')
  return chemin
}

// ── Les API ──────────────────────────────────────────────────────────────────

const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function trouver(candidats, quoi) {
  const p = candidats.find((c) => fs.existsSync(c))
  if (!p) throw new Error(`${quoi} introuvable. Cherchee ici :\n  ${candidats.join('\n  ')}`)
  return p
}

// App Store Connect
const ASC_KEY_ID = 'V8UJ847B48'
const ASC_ISSUER = '7ff0f8c5-16e0-4ba8-8dad-76b2a629c4e3'
const ASC_APP = '6803527040'

function ascJeton() {
  const cle = fs.readFileSync(
    trouver([path.join(RACINE, `secrets/AuthKey_${ASC_KEY_ID}.p8`)], 'Cle App Store Connect'),
    'utf8',
  )
  const now = Math.floor(Date.now() / 1000)
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))
  const p = b64url(JSON.stringify({ iss: ASC_ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }))
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: cle, dsaEncoding: 'ieee-p1363' })
  return `${h}.${p}.${b64url(sig)}`
}

let ascH
async function asc(methode, chemin, corps) {
  ascH ??= { authorization: `Bearer ${ascJeton()}`, 'content-type': 'application/json' }
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${chemin}`, {
    method: methode,
    headers: ascH,
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`App Store ${methode} ${chemin} -> ${res.status} ${JSON.stringify(json.errors ?? json)}`)
  return json
}

// Google Play
const PKG = 'com.cosmecheck.app'
const PLAY_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`

async function playJeton() {
  const key = JSON.parse(
    fs.readFileSync(
      trouver(
        [path.join(RACINE, 'secrets/play-service-account.json'), path.join(RACINE, 'play-service-account.json')],
        'Cle du compte de service Play',
      ),
      'utf8',
    ),
  )
  const now = Math.floor(Date.now() / 1000)
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const c = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const s = crypto.createSign('RSA-SHA256')
  s.update(`${h}.${c}`)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${h}.${c}.${b64url(s.sign(key.private_key))}`,
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`jeton Play refuse : ${JSON.stringify(json)}`)
  return json.access_token
}

let playH
async function play(methode, chemin, corps) {
  playH ??= { authorization: `Bearer ${await playJeton()}`, 'content-type': 'application/json' }
  const res = await fetch(`${PLAY_API}/${chemin}`, {
    method: methode,
    headers: playH,
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Play ${methode} ${chemin} -> ${res.status} ${JSON.stringify(json.error ?? json)}`)
  return json
}

// ── Le differentiel ──────────────────────────────────────────────────────────

const court = (s) => {
  const t = (s ?? '').replace(/\n/g, ' / ')
  return t.length > 110 ? `${t.slice(0, 107)}...` : t
}
function diff(libelle, ancien, nouveau) {
  const a = ancien ?? ''
  if (a === nouveau) {
    console.log(`  = ${libelle} (${[...nouveau].length} car.) identique`)
    return false
  }
  console.log(`  ~ ${libelle}`)
  console.log(`      avant (${[...a].length} car.) : ${court(a) || '(vide)'}`)
  console.log(`      après (${[...nouveau].length} car.) : ${court(nouveau)}`)
  return true
}

const VERSION = JSON.parse(fs.readFileSync(path.join(RACINE, 'app.json'), 'utf8')).expo.version
const EDITABLES = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']
const etatVersion = (v) => v.attributes.appVersionState ?? v.attributes.appStoreState
const etatInfo = (i) => i.attributes.state ?? i.attributes.appStoreState

async function appStore() {
  console.log(`\nAPP STORE (prochaine version : ${VERSION})`)
  const versions = (await asc('GET', `apps/${ASC_APP}/appStoreVersions?limit=20`)).data
  let cible = versions.find((v) => v.attributes.versionString === VERSION)
  if (cible && !EDITABLES.includes(etatVersion(cible))) {
    throw new Error(`la version ${VERSION} existe deja et n'est plus modifiable (${etatVersion(cible)})`)
  }
  // Sans version en preparation, on compare a la version en vente.
  const reference = cible ?? versions.find((v) => etatVersion(v) === 'READY_FOR_SALE' || etatVersion(v) === 'READY_FOR_DISTRIBUTION')
  console.log(
    cible
      ? `  version ${VERSION} trouvee (${etatVersion(cible)})`
      : `  version ${VERSION} absente : comparaison avec la ${reference?.attributes.versionString} en vente${APPLIQUER ? ', creation de la 1.0.4' : ''}`,
  )

  if (APPLIQUER && !cible) {
    cible = (
      await asc('POST', 'appStoreVersions', {
        data: {
          type: 'appStoreVersions',
          attributes: { platform: 'IOS', versionString: VERSION },
          relationships: { app: { data: { type: 'apps', id: ASC_APP } } },
        },
      })
    ).data
    console.log(`  version ${VERSION} creee (${cible.id})`)
  }

  const locs = (await asc('GET', `appStoreVersions/${(cible ?? reference).id}/appStoreVersionLocalizations`)).data
  const infos = (await asc('GET', `apps/${ASC_APP}/appInfos`)).data
  const infoEditable = infos.find((i) => etatInfo(i) !== 'READY_FOR_SALE' && etatInfo(i) !== 'READY_FOR_DISTRIBUTION')
  const infoRef = infoEditable ?? infos[0]
  const infoLocs = (await asc('GET', `appInfos/${infoRef.id}/appInfoLocalizations`)).data

  const locales = AVEC_FR_CA ? ['fr-FR', 'fr-CA'] : ['fr-FR']
  const fr = locs.find((l) => l.attributes.locale === 'fr-FR')
  for (const locale of locales) {
    console.log(`  [${locale}]`)
    const l = locs.find((x) => x.attributes.locale === locale)
    const il = infoLocs.find((x) => x.attributes.locale === locale)
    if (!l) console.log('    (localisation absente, elle sera creee)')
    const a = l?.attributes ?? {}
    diff('nom', il?.attributes.name, NOM)
    diff('sous-titre', il?.attributes.subtitle, SOUS_TITRE)
    diff('mots-clés', a.keywords, MOTS_CLES)
    diff('texte promotionnel', a.promotionalText, PROMO)
    diff('description', a.description, DESC_APPLE)
    if (cible || APPLIQUER) diff('nouveautés', a.whatsNew, NOUVEAUTES)
    else console.log(`  ~ nouveautés : posées sur la ${VERSION} au moment de --appliquer`)

    if (!APPLIQUER) continue
    const textes = { description: DESC_APPLE, keywords: MOTS_CLES, promotionalText: PROMO, whatsNew: NOUVEAUTES }
    if (l) {
      await asc('PATCH', `appStoreVersionLocalizations/${l.id}`, {
        data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: textes },
      })
    } else {
      await asc('POST', 'appStoreVersionLocalizations', {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: {
            locale,
            ...textes,
            supportUrl: fr?.attributes.supportUrl ?? 'https://www.cosme-check.com',
            marketingUrl: fr?.attributes.marketingUrl ?? 'https://www.cosme-check.com',
          },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: cible.id } } },
        },
      })
    }
    if (!infoEditable) {
      console.log('    ! aucune fiche « en preparation » : nom et sous-titre non modifies')
      continue
    }
    if (il) {
      await asc('PATCH', `appInfoLocalizations/${il.id}`, {
        data: { type: 'appInfoLocalizations', id: il.id, attributes: { name: NOM, subtitle: SOUS_TITRE } },
      })
    } else {
      const frInfo = infoLocs.find((x) => x.attributes.locale === 'fr-FR')
      await asc('POST', 'appInfoLocalizations', {
        data: {
          type: 'appInfoLocalizations',
          attributes: {
            locale,
            name: NOM,
            subtitle: SOUS_TITRE,
            privacyPolicyUrl: frInfo?.attributes.privacyPolicyUrl ?? 'https://cosme-check.com/privacy',
          },
          relationships: { appInfo: { data: { type: 'appInfos', id: infoEditable.id } } },
        },
      })
    }
    console.log(`    -> ${locale} pousse`)
  }
}

async function googlePlay() {
  console.log('\nGOOGLE PLAY (fr-FR)')
  const edit = await play('POST', 'edits')
  let valide = false
  try {
    const l = await play('GET', `edits/${edit.id}/listings/fr-FR`)
    diff('titre', l.title, NOM)
    diff('brève description', l.shortDescription, BREVE_PLAY)
    const change = [
      diff('description', l.fullDescription, DESC_PLAY),
    ].some(Boolean) || l.title !== NOM || l.shortDescription !== BREVE_PLAY
    if (!APPLIQUER || !change) return
    await play('PUT', `edits/${edit.id}/listings/fr-FR`, {
      language: 'fr-FR',
      title: NOM,
      shortDescription: BREVE_PLAY,
      fullDescription: DESC_PLAY,
    })
    await play('POST', `edits/${edit.id}:commit`)
    valide = true
    console.log('  -> fiche Play envoyee (edition validee)')
  } finally {
    // Une edition ouverte bloque la suivante : on la ferme si elle n'a pas ete validee.
    if (!valide) await fetch(`${PLAY_API}/edits/${edit.id}`, { method: 'DELETE', headers: playH }).catch(() => {})
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const chemin = ecrireDoc()
console.log('CHAMPS')
for (const [cle, { n, maximum }] of Object.entries(CHAMPS)) {
  console.log(`  ${cle.padEnd(30)} ${String(n).padStart(4)} / ${String(maximum).padEnd(4)} (${maximum - n} de marge)`)
}
if (erreurs) {
  console.error(`\n${erreurs} erreur(s) : rien n'est envoye.`)
  process.exit(1)
}
console.log(`\n${path.relative(RACINE, chemin)} ecrit. Aucun tiret cadratin, aucun prix, aucune marque concurrente.`)
console.log(APPLIQUER ? '\nMODE --appliquer : les fiches vont etre modifiees.' : '\nLecture seule (ajouter --appliquer pour pousser).')

let echecApi = false
for (const etape of [appStore, googlePlay]) {
  try {
    await etape()
  } catch (e) {
    echecApi = true
    console.error(`\n${e.message}`)
  }
}
process.exit(echecApi ? 1 : 0)
