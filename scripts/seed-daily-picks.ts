/**
 * seed-daily-picks — LOT 1 de questions « Quizz & idées reçues du jour ».
 *
 * Style : TRÈS grand public, aucun terme scientifique — que des ingrédients
 * connus de tous (aloe vera, beurre de karité, huile de coco, argile, miel…).
 * Objectif : informer simplement. Interleavé quiz/idée-reçue + thèmes variés
 * (chaque journée = 10 items consécutifs → doit rester varié).
 *
 * Serveur (table `cosme_check.daily_picks`) → partagé mobile + web, éditable
 * sans release. RÉVERSIBLE : ce lot occupe order_index 81+. Reversal :
 *   DELETE FROM cosme_check.daily_picks WHERE order_index > 80;
 *
 *   node scripts/seed-daily-picks.ts            # DRY-RUN (aperçu, 0 écriture)
 *   node scripts/seed-daily-picks.ts --apply    # (re)pose le lot (idempotent)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LOT2 } from './daily-picks-lot2.ts'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('.env incomplet')
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check' }
const G = '\x1b[32m', C = '\x1b[36m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m'

type Item = { kind: 'quiz' | 'myth'; question: string; options: string[]; correct_index: number; reveal: string; category: string }
const q = (question: string, options: string[], correct_index: number, reveal: string, category: string): Item =>
  ({ kind: 'quiz', question, options, correct_index, reveal, category })
const m = (question: string, correct_index: number, reveal: string, category: string): Item =>
  ({ kind: 'myth', question, options: ['Vrai', 'Faux', 'Nuancé'], correct_index, reveal, category })
// correct_index pour myth : 0=Vrai, 1=Faux, 2=Nuancé

const BATCH_1: Item[] = [
  // ── Bloc 1 ──
  q('Tu as des boutons. Quel ingrédient est réputé pour aider à les limiter ?',
    ["L'argile verte", "L'huile de coco", 'Le beurre de karité', "L'huile d'olive"], 0,
    "L'argile verte absorbe l'excès de gras et aide à assainir la peau. À l'inverse, l'huile de coco a tendance à boucher les pores.", 'boutons'),
  m('Les peaux grasses n’ont pas besoin de crème hydratante.', 1,
    'Faux. Une peau grasse peut aussi manquer d’eau : une crème légère l’hydrate sans la graisser. La priver la pousse même à produire plus de gras.', 'idées reçues'),
  q('Après un coup de soleil, qu’est-ce qui apaise le mieux la peau ?',
    ["L'aloe vera", "L'alcool", 'Le parfum', 'Le charbon'], 0,
    "L'aloe vera rafraîchit et apaise. On l'applique en gel, idéalement conservé au frais.", 'solaire'),
  q('À quoi sert surtout le beurre de karité ?',
    ['Nourrir les peaux sèches', 'Matifier les peaux grasses', 'Éclaircir les taches', 'Démaquiller'], 0,
    'Le beurre de karité est très riche : il nourrit et protège les peaux sèches, les lèvres et les cheveux abîmés.', 'ingrédients'),
  m('Un produit qui pique, c’est qu’il fait effet.', 1,
    'Faux. Le picotement est souvent un signe d’irritation, pas d’efficacité. Un bon soin ne doit pas faire mal.', 'idées reçues'),
  q('Cheveux secs et abîmés : quel ingrédient nourrit le plus ?',
    ["L'huile d'argan", "L'argile", "L'alcool", 'Le charbon'], 0,
    "L'huile d'argan nourrit et fait briller les cheveux secs. Quelques gouttes sur les pointes suffisent.", 'cheveux'),
  q('Peau grasse : quelle texture vaut-il mieux choisir ?',
    ['Un gel léger', 'Un baume très riche', 'Une huile épaisse', 'Une cire'], 0,
    'Un gel léger hydrate sans étouffer la peau ni la faire briller. Les textures très riches sont plutôt pour les peaux sèches.', 'peau grasse'),
  m('Dormir maquillé(e) abîme la peau.', 0,
    'Vrai. Le maquillage laissé la nuit bouche les pores et favorise les boutons et le teint terne. On se démaquille toujours le soir.', 'idées reçues'),
  q('Lèvres gercées : quel ingrédient est le plus adapté ?',
    ['La cire d’abeille et le karité', 'Le charbon', "L'alcool", "L'argile"], 0,
    'Un baume à la cire d’abeille et au karité forme un film protecteur qui répare les lèvres sèches.', 'lèvres'),
  q('À quoi sert surtout l’aloe vera ?',
    ['Apaiser et hydrater', 'Parfumer', 'Colorer', 'Faire mousser'], 0,
    "L'aloe vera est un gel apaisant et hydratant, parfait après le soleil ou sur une peau qui tiraille.", 'ingrédients'),

  // ── Bloc 2 ──
  q('Quel geste protège le plus la peau du vieillissement ?',
    ['Mettre de la crème solaire', 'Boire un café', 'Se laver 3 fois par jour', 'Prendre des douches chaudes'], 0,
    'Le soleil est la 1ʳᵉ cause de rides et de taches. La crème solaire est le meilleur soin anti-âge, même en ville.', 'solaire'),
  m('Le savon classique est parfait pour laver le visage.', 2,
    'Nuancé. Beaucoup de savons sont trop décapants pour le visage et le dessèchent. Mieux vaut un nettoyant doux adapté.', 'hygiène'),
  q('Quel ingrédient est connu pour apaiser une peau sensible qui rougit ?',
    ['La camomille', 'Le citron', "L'alcool", 'Le charbon'], 0,
    'La camomille (et l’eau de bleuet) calme les rougeurs et les irritations. On évite le citron et l’alcool, agressifs.', 'peau sensible'),
  q('Yeux gonflés le matin : quel ingrédient rafraîchit le mieux ?',
    ['Le concombre', 'Le charbon', "L'huile de coco", 'Le sel'], 0,
    'Le concombre (froid) décongestionne et rafraîchit le contour des yeux. Le froid réduit les poches.', 'yeux'),
  m('Plus un produit contient d’ingrédients, meilleur il est.', 1,
    'Faux. Une longue liste n’est pas un gage de qualité. Souvent, une formule simple avec de bons ingrédients suffit.', 'idées reçues'),
  q('D’où vient l’huile d’argan ?',
    ["De l'arganier, un arbre du Maroc", 'Du pétrole', "D'une algue", "D'un minéral"], 0,
    "L'huile d'argan est pressée à partir des fruits de l'arganier, un arbre qui pousse surtout au Maroc.", 'ingrédients'),
  q('À quoi sert le miel dans les soins ?',
    ['Hydrater et apaiser', 'Faire bronzer', 'Assécher la peau', 'Parfumer seulement'], 0,
    'Le miel retient l’eau et apaise ; on le retrouve dans des masques et baumes pour peaux sèches ou sensibles.', 'ingrédients'),
  m('Le froid resserre les pores pour de bon.', 1,
    'Faux. L’eau froide resserre les pores sur le moment, mais l’effet est temporaire. Les pores ne se « ferment » pas durablement.', 'idées reçues'),
  q('Cheveux gras : quel geste est le plus adapté ?',
    ['Un shampooing doux, sans frotter trop fort', "Mettre de l'huile sur les racines", 'Laver à l’eau très chaude', 'Ne jamais laver'], 0,
    'On lave en douceur avec un shampooing adapté. L’eau très chaude et le frottement stimulent encore plus le gras.', 'cheveux'),
  q('Quel ingrédient absorbe l’excès de gras et « détox » la peau ?',
    ['Le charbon', 'Le beurre de cacao', "L'huile d'amande douce", 'La glycérine'], 0,
    'Le charbon (et l’argile) attire les impuretés et l’excès de sébum. Idéal en masque ponctuel sur peau grasse.', 'ingrédients'),

  // ── Bloc 3 ──
  m('Il faut boire beaucoup d’eau pour hydrater sa peau en surface.', 2,
    'Nuancé. Boire est bon pour la santé, mais n’hydrate pas directement la couche superficielle. Une crème hydrate mieux la surface.', 'idées reçues'),
  q('Peau qui tiraille et desquame : quel ingrédient choisir ?',
    ['Le beurre de karité', "L'argile verte", 'Le charbon', 'Le citron'], 0,
    'Le karité (ou le beurre de cacao) nourrit intensément les peaux sèches qui tiraillent. On évite l’argile, plutôt asséchante.', 'peau sèche'),
  q('Ongles cassants : quel ingrédient est réputé les fortifier ?',
    ["L'huile de ricin", 'Le charbon', "L'alcool", "L'argile"], 0,
    "L'huile de ricin est connue pour renforcer les ongles et nourrir les cuticules. On l’applique le soir.", 'ongles'),
  m('Percer un bouton le fait partir plus vite.', 1,
    'Faux. Percer un bouton risque d’infecter la peau et de laisser une marque. Mieux vaut le laisser tranquille ou l’assainir.', 'boutons'),
  q('À quoi sert surtout l’huile de coco ?',
    ['Nourrir la peau et les cheveux', 'Matifier le visage', 'Nettoyer en profondeur', 'Faire bronzer'], 0,
    'L’huile de coco nourrit peau et cheveux, mais elle peut boucher les pores : à éviter sur le visage à tendance à boutons.', 'ingrédients'),
  q('Pieds secs et talons rugueux : quel ingrédient aide le plus ?',
    ['Le beurre de karité', 'Le charbon', "L'alcool", 'Le concombre'], 0,
    'Le karité (souvent dans les crèmes pieds) nourrit et assouplit les talons secs. On applique le soir, avec des chaussettes.', 'pieds'),
  m('Le naturel ne provoque jamais d’allergie.', 1,
    'Faux. Des ingrédients naturels comme certaines huiles essentielles ou parfums de plantes sont très allergènes. Naturel ≠ sans risque.', 'idées reçues'),
  q('Quel ingrédient doux est parfait pour la peau de bébé ?',
    ["Le calendula (souci)", 'Le charbon', "L'alcool", 'Le parfum'], 0,
    'Le calendula (souci des jardins) apaise la peau délicate des bébés. On choisit des soins simples et sans parfum.', 'bébé'),
  q('Teint terne et fatigué : quel ingrédient donne bonne mine ?',
    ['Le thé vert', "L'alcool", 'Le charbon', 'Le sel'], 0,
    'Le thé vert est un antioxydant qui aide à garder un teint frais. Un bon sommeil et l’eau florale aident aussi.', 'ingrédients'),

  // ── Bloc 4 ──
  m('Se laver le visage plusieurs fois par jour, c’est mieux.', 1,
    'Faux. Trop laver agresse la peau et peut la rendre plus grasse ou sensible. Matin et soir suffisent en général.', 'hygiène'),
  q('D’où vient le beurre de karité ?',
    ["De la noix de l'arbre à karité, en Afrique", 'Du lait de vache', "D'une algue", 'Du pétrole'], 0,
    'Le karité est extrait de la noix de l’arbre à karité, qui pousse en Afrique. Il est utilisé depuis très longtemps.', 'ingrédients'),
  q('Quel ingrédient apaise les démangeaisons d’une peau sèche ?',
    ["L'avoine", 'Le citron', 'Le charbon', "L'alcool"], 0,
    'L’avoine (souvent en « lait d’avoine ») calme les démangeaisons et les peaux qui grattent. Très utilisée pour peaux sensibles.', 'peau sensible'),
  m('L’eau très chaude est bonne pour la peau.', 1,
    'Faux. L’eau chaude dessèche la peau et fragilise sa barrière. Mieux vaut de l’eau tiède pour se laver.', 'idées reçues'),
  q('Quel ingrédient hydrate en « retenant l’eau » dans la peau ?',
    ['La glycérine', 'Le charbon', "L'alcool", 'Le sel'], 0,
    'La glycérine attire et retient l’eau dans la peau : c’est un hydratant simple et efficace, présent dans beaucoup de crèmes.', 'ingrédients'),
  q('Quelle protection choisir contre le soleil au quotidien ?',
    ['Une crème solaire', 'Un autobronzant', 'De l’huile de bronzage', 'Rien si on est déjà bronzé'], 0,
    'Seule une crème solaire protège des UV. L’autobronzant colore mais ne protège pas ; le bronzage non plus.', 'solaire'),
  m('Le citron est un bon soin pour éclaircir la peau.', 1,
    'Faux. Le citron est acide et irritant, et il rend la peau sensible au soleil (taches). À éviter directement sur la peau.', 'idées reçues'),
  q('Cheveux qui manquent de brillance : quel ingrédient aide ?',
    ["L'huile d'argan ou de jojoba", 'Le charbon', "L'argile", "L'alcool"], 0,
    'Quelques gouttes d’huile d’argan ou de jojoba sur les pointes redonnent de la brillance sans alourdir.', 'cheveux'),
  q('À quoi sert l’huile d’amande douce ?',
    ['Nourrir et assouplir la peau', 'Assécher les boutons', 'Faire mousser', 'Colorer'], 0,
    'L’huile d’amande douce est douce et nourrissante : idéale pour les peaux sèches, les bébés et le corps.', 'ingrédients'),

  // ── Bloc 5 ──
  m('Se couper les cheveux les fait pousser plus vite.', 1,
    'Faux. Couper les pointes n’accélère pas la pousse (qui vient de la racine). Ça évite juste les fourches et donne meilleure mine.', 'idées reçues'),
  q('Quel ingrédient est réputé pour aider les cheveux à pousser en bonne santé ?',
    ["L'huile de ricin", 'Le charbon', 'Le citron', "L'alcool"], 0,
    'L’huile de ricin nourrit le cuir chevelu et fortifie les longueurs. Elle est épaisse : on la mélange souvent à une autre huile.', 'cheveux'),
  q('Peau sensible : quel ingrédient vaut-il mieux ÉVITER ?',
    ["L'alcool et le parfum", "L'avoine", "L'aloe vera", 'La camomille'], 0,
    'L’alcool et le parfum peuvent irriter les peaux sensibles. On privilégie l’avoine, l’aloe vera ou la camomille.', 'peau sensible'),
  m('Bronzer aide à faire disparaître l’acné.', 1,
    'Faux. Le soleil « sèche » les boutons sur le moment, mais l’acné revient souvent en plus fort après. Il abîme aussi la peau.', 'boutons'),
  q('Quel ingrédient proche du gras naturel de la peau hydrate sans graisser ?',
    ["L'huile de jojoba", 'Le beurre de cacao', 'Le charbon', 'Le sel'], 0,
    'L’huile de jojoba ressemble au sébum de la peau : elle hydrate et est bien tolérée, même par les peaux mixtes.', 'ingrédients'),
  q('Comment garder une crème plus longtemps en bon état ?',
    ['Bien refermer le pot et éviter la chaleur', 'La laisser ouverte', 'La mettre au soleil', 'Y tremper les doigts sales'], 0,
    'On referme bien, on garde à l’abri de la chaleur et on évite d’y mettre les doigts sales : la crème reste saine plus longtemps.', 'conservation'),
  m('Une peau qui brille est forcément une peau sale.', 1,
    'Faux. La brillance vient du sébum (le gras naturel), pas de la saleté. Trop décaper peut même empirer la brillance.', 'idées reçues'),
  q('Quel ingrédient tout doux apaise une peau irritée après le rasage ?',
    ["L'aloe vera", "L'alcool", 'Le charbon', 'Le citron'], 0,
    'L’aloe vera calme le feu du rasoir. On évite l’après-rasage à l’alcool qui pique et assèche.', 'rasage'),
  q('À quoi sert le beurre de cacao ?',
    ['Nourrir et protéger du dessèchement', 'Matifier', 'Nettoyer', 'Faire bronzer'], 0,
    'Le beurre de cacao est riche et gourmand : il nourrit les peaux sèches et protège du froid. Souvent utilisé pour le corps et les lèvres.', 'ingrédients'),

  // ── Bloc 6 ──
  m('Le maquillage empêche la peau de « respirer ».', 1,
    'Faux. La peau ne respire pas par les pores. Le vrai souci, c’est de dormir maquillé(e) : là, ça bouche les pores.', 'idées reçues'),
  q('Quel ingrédient est réputé pour aider contre les pellicules ?',
    ["Un shampooing à l'huile de cade ou au zinc", "L'huile de coco pure", 'Le beurre de karité', 'Le sucre'], 0,
    'Des shampooings ciblés (zinc, cade, arbre à thé) aident contre les pellicules. On lave en douceur, sans gratter le cuir chevelu.', 'cheveux'),
  q('Rougeurs et peau réactive : quelle eau apaisante utiliser ?',
    ["L'eau florale de bleuet ou de camomille", 'De l’eau très chaude', 'De l’eau salée', 'De l’eau parfumée'], 0,
    'Les eaux florales de bleuet ou de camomille rafraîchissent et apaisent les peaux qui rougissent facilement.', 'peau sensible'),
  m('Il faut changer souvent de crème, sinon la peau « s’habitue ».', 1,
    'Faux. La peau ne s’habitue pas à une bonne crème. Si un soin te convient, tu peux le garder.', 'idées reçues'),
  q('Quel ingrédient gourmand nourrit les peaux très sèches en hiver ?',
    ['Le beurre de karité', "L'argile", 'Le charbon', 'Le concombre'], 0,
    'Le karité forme un film nourrissant qui protège du froid et du vent. Parfait pour mains, corps et lèvres en hiver.', 'peau sèche'),
  q('À quoi sert le charbon dans un soin visage ?',
    ['Absorber les impuretés et le gras', 'Hydrater en profondeur', 'Nourrir les peaux sèches', 'Faire briller'], 0,
    'Le charbon attire les impuretés : utile en masque sur peau grasse, mais trop souvent il peut assécher. Une fois par semaine suffit.', 'ingrédients'),
  m('Les produits pour bébé sont trop doux pour servir aux adultes.', 2,
    'Nuancé. Ils sont doux et souvent bien tolérés par les peaux sensibles d’adultes, mais parfois moins « ciblés » (hydratation, anti-âge…).', 'idées reçues'),
  q('Cheveux bouclés qui manquent d’hydratation : quel ingrédient aide ?',
    ["L'huile de coco ou le beurre de karité", "L'alcool", 'Le charbon', 'Le sel'], 0,
    'Les boucles adorent le gras : huile de coco, karité ou beurre de mangue nourrissent et définissent les boucles sèches.', 'cheveux'),
  q('Quel réflexe évite le plus les coups de soleil à la plage ?',
    ['Remettre de la crème solaire toutes les 2 heures', 'En mettre une seule fois le matin', 'Attendre d’avoir rougi', 'Se mettre de l’huile sans protection'], 0,
    'La crème solaire s’élimine avec la sueur, l’eau et le temps : on en remet toutes les 2 heures et après la baignade.', 'solaire'),

  // ── Bloc 7 ──
  m('Un indice solaire élevé permet de rester au soleil sans jamais remettre de crème.', 1,
    'Faux. Même un indice élevé s’use avec le temps et l’eau. On remet régulièrement, quel que soit l’indice.', 'idées reçues'),
  q('Quel ingrédient apaisant met-on souvent dans les soins après-soleil ?',
    ["L'aloe vera", "L'alcool", "L'argile", 'Le charbon'], 0,
    'L’aloe vera rafraîchit et calme la peau chauffée par le soleil. On l’applique généreusement le soir.', 'solaire'),
  q('Mains sèches et abîmées : quel ingrédient choisir dans une crème mains ?',
    ['Le karité ou la glycérine', 'Le charbon', "L'alcool", 'Le citron'], 0,
    'Karité et glycérine nourrissent et retiennent l’eau : parfaits pour réparer les mains sèches, surtout en hiver.', 'mains'),
  m('Transpirer « nettoie » la peau en profondeur.', 1,
    'Faux. La transpiration régule la température, elle ne « nettoie » pas les pores. Après le sport, on rince pour éviter les boutons.', 'idées reçues'),
  q('Quel ingrédient tout simple aide à démaquiller en douceur ?',
    ["Une huile végétale (coco, amande, jojoba)", "L'alcool", "L'argile", 'Le sel'], 0,
    'Une huile végétale dissout le maquillage, même waterproof, sans agresser. On rince ensuite avec un nettoyant doux.', 'hygiène'),
  q('Peau qui pèle après le soleil : quel geste adopter ?',
    ['Hydrater avec de l’aloe vera et ne pas arracher les peaux', 'Frotter fort pour enlever les peaux', 'Mettre du citron', 'Reprendre le soleil'], 0,
    'On hydrate (aloe vera, crème après-soleil) et on laisse la peau se renouveler seule. Arracher les peaux laisse des marques.', 'solaire'),
  m('Gommer sa peau tous les jours, c’est bon pour elle.', 1,
    'Faux. Un gommage trop fréquent agresse et fragilise la peau. Une fois par semaine suffit largement.', 'idées reçues'),
  q('Quel ingrédient donne une sensation de fraîcheur et décongestionne ?',
    ['Le concombre', 'Le beurre de karité', "L'huile de coco", 'Le charbon'], 0,
    'Le concombre rafraîchit et aide à décongestionner (yeux gonflés, peau fatiguée). Effet « bonne mine » immédiat.', 'ingrédients'),
  q('Bébé : que choisir pour laver sa peau fragile ?',
    ['Un produit lavant très doux, sans parfum', 'Un savon parfumé', 'Un gel pour adultes', 'De l’eau très chaude'], 0,
    'La peau de bébé est fragile : on choisit un lavant très doux, sans parfum, et de l’eau tiède.', 'bébé'),

  // ── Bloc 8 ──
  m('Arracher un cheveu blanc en fait pousser plusieurs.', 1,
    'Faux. Un follicule ne produit qu’un cheveu : en arracher un n’en fait pas pousser plusieurs. Mais ça peut abîmer la racine.', 'idées reçues'),
  q('Quel ingrédient est réputé pour renforcer les cils et les sourcils ?',
    ["L'huile de ricin", 'Le charbon', "L'alcool", 'Le sel'], 0,
    'L’huile de ricin est utilisée pour fortifier cils et sourcils. On l’applique en petite quantité, le soir, en évitant les yeux.', 'ingrédients'),
  q('Quel ingrédient calme une peau échauffée ou qui gratte ?',
    ["L'avoine", 'Le citron', "L'alcool", 'Le charbon'], 0,
    'L’avoine apaise les peaux qui grattent et les irritations. On la trouve dans beaucoup de soins pour peaux sensibles et bébés.', 'peau sensible'),
  m('Le dentifrice est un bon truc pour sécher un bouton.', 1,
    'Faux. Le dentifrice irrite et peut brûler la peau. Mieux vaut un soin ciblé (argile, zinc, arbre à thé).', 'boutons'),
  q('Quel ingrédient hydrate les lèvres et les protège du froid ?',
    ['Le beurre de karité', 'Le charbon', "L'alcool", "L'argile"], 0,
    'Un baume au karité (ou cire d’abeille) nourrit et protège les lèvres. On évite de « lécher » ses lèvres, ça les dessèche.', 'lèvres'),
  q('À quoi sert l’eau de rose ?',
    ['Apaiser et rafraîchir la peau', 'Faire bronzer', 'Assécher les boutons', 'Nettoyer le sol'], 0,
    'L’eau de rose est une eau florale douce qui apaise, rafraîchit et parfume légèrement. Agréable en fin de démaquillage.', 'ingrédients'),
  m('Une crème « bio » ne peut pas provoquer d’allergie.', 1,
    'Faux. Bio ne veut pas dire sans risque : parfums et huiles essentielles bio peuvent aussi être allergènes.', 'idées reçues'),
  q('Peau mixte (grasse au milieu, sèche sur les côtés) : quelle texture ?',
    ['Un soin léger type gel-crème', 'Un baume très riche partout', 'Une huile épaisse', 'Rien du tout'], 0,
    'Un gel-crème léger convient bien aux peaux mixtes : il hydrate sans graisser la zone du front, du nez et du menton.', 'routine'),
  q('Quel ingrédient antioxydant aide à garder un teint frais ?',
    ['Le thé vert', 'Le sel', "L'alcool", 'Le charbon'], 0,
    'Le thé vert protège la peau des agressions du quotidien (pollution, fatigue) et aide à garder un teint lumineux.', 'ingrédients'),

  // ── Bloc 9 ──
  m('Se laver les cheveux tous les jours, c’est mauvais.', 2,
    'Nuancé. Ça dépend de tes cheveux : avec un shampooing doux, un lavage fréquent est possible. L’important, c’est la douceur.', 'idées reçues'),
  q('Quel ingrédient nourrit et fait briller un cuir chevelu sec ?',
    ["L'huile de coco (en bain avant shampooing)", 'Le charbon', "L'alcool", 'Le sel'], 0,
    'Un bain d’huile de coco avant le shampooing nourrit les longueurs sèches. On rince bien pour ne pas alourdir.', 'cheveux'),
  q('Coups de soleil : quel est le meilleur réflexe le lendemain ?',
    ['Hydrater et rester à l’ombre', 'Reprendre le soleil pour « fixer »', 'Frotter la peau', 'Mettre du parfum'], 0,
    'On hydrate beaucoup (aloe vera) et on protège la zone du soleil le temps qu’elle guérisse.', 'solaire'),
  m('Le maquillage waterproof s’enlève juste à l’eau.', 1,
    'Faux. Le waterproof résiste à l’eau : il faut une huile ou un démaquillant adapté pour bien l’enlever.', 'idées reçues'),
  q('Quel ingrédient doux nettoie sans dessécher la peau ?',
    ['Un nettoyant à base de miel ou d’avoine', "L'alcool", 'Le savon très parfumé', 'Le citron'], 0,
    'Des nettoyants doux (miel, avoine, huiles lavantes) respectent la peau. Les produits trop parfumés ou décapants l’agressent.', 'hygiène'),
  q('À quoi servent les huiles essentielles dans un soin ?',
    ['Parfumer et cibler certains besoins, mais elles peuvent irriter', 'Hydrater en profondeur', 'Nettoyer le maquillage', 'Rien du tout'], 0,
    'Les huiles essentielles parfument et ont des propriétés ciblées, mais elles sont puissantes et allergènes : à utiliser avec prudence.', 'ingrédients'),
  m('Une odeur agréable = un produit de bonne qualité.', 1,
    'Faux. Le parfum n’a rien à voir avec l’efficacité. Beaucoup de bons soins sont peu ou pas parfumés (mieux pour peaux sensibles).', 'idées reçues'),
  q('Quel geste simple limite les boutons quand on fait du sport ?',
    ['Se rincer le visage après avoir transpiré', 'Garder le maquillage', 'Ne pas se laver', 'Mettre de l’huile épaisse'], 0,
    'La sueur mélangée au sébum et au maquillage bouche les pores. Un rinçage après le sport limite les boutons.', 'boutons'),
  q('Quel ingrédient très riche protège les peaux sèches du froid ?',
    ['Le beurre de cacao', 'Le charbon', "L'argile", 'Le concombre'], 0,
    'Le beurre de cacao forme un film protecteur contre le froid et le vent. Parfait pour le corps et les lèvres en hiver.', 'peau sèche'),

  // ── Bloc 10 ──
  m('Il faut attendre d’avoir la peau qui tiraille pour mettre de la crème.', 1,
    'Faux. Mieux vaut hydrater régulièrement plutôt que d’attendre l’inconfort. La peau reste souple et mieux protégée.', 'idées reçues'),
  q('Quel ingrédient apaisant est parfait pour le change de bébé ?',
    ['Le liniment (huile d’olive + eau de chaux) ou le calendula', "L'alcool", 'Le parfum', 'Le charbon'], 0,
    'Le liniment nettoie et protège les fesses de bébé en douceur. Le calendula apaise les rougeurs.', 'bébé'),
  q('Quel ingrédient donne des cheveux doux et faciles à démêler ?',
    ["Un après-shampooing (avec huile ou karité)", 'Le charbon', 'Le sel', "L'alcool"], 0,
    'L’après-shampooing lisse les cheveux et facilite le démêlage. Les ingrédients nourrissants (huiles, karité) les assouplissent.', 'cheveux'),
  m('On peut mettre du parfum directement sur le visage pour sentir bon.', 1,
    'Faux. Le parfum (souvent à base d’alcool) irrite et sensibilise la peau du visage, surtout au soleil. On le réserve aux vêtements ou au cou.', 'idées reçues'),
  q('Quel ingrédient simple aide contre les petites imperfections ?',
    ["L'argile ou l'arbre à thé", "L'huile de coco", 'Le beurre de karité', 'Le sucre'], 0,
    'L’argile assainit et l’arbre à thé cible les boutons. On évite les corps gras qui bouchent les pores sur peau à imperfections.', 'boutons'),
  q('Peau normale : quelle routine de base suffit ?',
    ['Nettoyer en douceur, hydrater, protéger du soleil', 'Multiplier 10 produits chaque jour', 'Ne rien faire jamais', 'Gommer tous les jours'], 0,
    'Une routine simple suffit : un nettoyage doux, une crème hydratante, et une protection solaire la journée.', 'routine'),
  m('Un produit cher est forcément plus efficace.', 1,
    'Faux. Le prix ne fait pas l’efficacité. Beaucoup de produits simples et abordables font très bien le travail.', 'idées reçues'),
  q('Quel ingrédient hydrate les cheveux crépus/frisés très secs ?',
    ['Le beurre de karité', "L'alcool", 'Le charbon', 'Le citron'], 0,
    'Les cheveux frisés et crépus sont naturellement secs : le karité et les huiles les nourrissent et les rendent souples.', 'cheveux'),
  q('Quel geste protège les lèvres l’hiver ?',
    ['Mettre un baume nourrissant régulièrement', 'Les humecter avec la langue', 'Ne rien faire', 'Mettre du citron'], 0,
    'Un baume (karité, cire d’abeille) protège du froid. Se lécher les lèvres les dessèche encore plus.', 'lèvres'),

  // ── Bloc 11 ──
  m('Les taches brunes partent toutes seules si on frotte fort.', 1,
    'Faux. Frotter n’enlève pas les taches et irrite la peau. La meilleure prévention reste la crème solaire.', 'idées reçues'),
  q('Quel ingrédient nourrit sans laisser de film gras trop lourd ?',
    ["L'huile de jojoba", 'Le beurre de cacao', "L'huile de ricin", 'La cire'], 0,
    'L’huile de jojoba est légère et proche du sébum : elle hydrate sans effet trop gras, même sur peau mixte.', 'ingrédients'),
  q('Cheveux ternes : quel geste redonne de l’éclat facilement ?',
    ['Rincer à l’eau tiède/froide en fin de douche', 'Laver à l’eau bouillante', 'Ne jamais rincer', 'Mettre du sel'], 0,
    'Un dernier rinçage à l’eau tiède ou froide referme les écailles du cheveu et lui donne plus de brillance.', 'cheveux'),
  m('Le soleil est bon pour la peau car il fait « sécher » les boutons.', 1,
    'Faux. L’effet est trompeur : l’acné rebondit souvent après, et le soleil abîme la peau et crée des taches.', 'idées reçues'),
  q('Quel ingrédient tout doux répare une peau très abîmée (gerçures) ?',
    ['Le beurre de karité ou la cire d’abeille', 'Le citron', "L'alcool", 'Le charbon'], 0,
    'Karité et cire d’abeille forment un pansement nourrissant sur les gerçures (mains, lèvres) et aident à réparer.', 'peau sèche'),
  q('À quoi sert un « lait » ou une « eau » démaquillante ?',
    ['Enlever le maquillage en douceur', 'Faire bronzer', 'Colorer les cheveux', 'Assécher la peau'], 0,
    'Le lait et l’eau démaquillants retirent le maquillage doucement. On termine par un nettoyage pour une peau nette.', 'hygiène'),
  m('On peut garder un mascara ouvert pendant des années.', 1,
    'Faux. Le mascara se garde peu (souvent quelques mois) : des microbes s’y développent et peuvent irriter les yeux.', 'conservation'),
  q('Quel ingrédient apaise une peau rougie par le froid ou le vent ?',
    ["L'aloe vera ou le karité", 'Le citron', "L'alcool", 'Le charbon'], 0,
    'Aloe vera (apaisant) et karité (protecteur) calment et protègent une peau agressée par le froid.', 'peau sensible'),
  q('Quel est le meilleur moment pour hydrater le corps ?',
    ['Juste après la douche, sur peau encore humide', 'Jamais', 'Seulement en été', 'Sur peau très sèche uniquement'], 0,
    'Sur peau humide, la crème « emprisonne » l’eau : l’hydratation dure plus longtemps.', 'routine'),

  // ── Bloc 12 ──
  m('Plus une crème est épaisse, plus elle hydrate.', 2,
    'Nuancé. L’épaisseur ne fait pas tout : une texture riche protège les peaux sèches, mais une peau grasse préfère un gel léger tout aussi hydratant.', 'idées reçues'),
  q('Quel ingrédient est réputé pour matifier une peau qui brille ?',
    ["L'argile", 'Le beurre de karité', "L'huile de coco", 'Le beurre de cacao'], 0,
    'L’argile absorbe l’excès de gras et matifie. Utile en masque sur peau grasse, mais pas tous les jours.', 'peau grasse'),
  q('Quel ingrédient doux nettoie les mains sans les dessécher ?',
    ['Un savon surgras ou à la glycérine', 'Un gel à l’alcool à répétition', 'Le citron', 'Le charbon'], 0,
    'Un savon surgras ou à la glycérine nettoie sans agresser. Les gels à l’alcool répétés dessèchent beaucoup les mains.', 'mains'),
  m('Il faut sentir sa crème « pénétrer » pour qu’elle marche.', 1,
    'Faux. La sensation n’indique pas l’efficacité. Certaines crèmes riches laissent un film normal et protègent très bien.', 'idées reçues'),
  q('Quel ingrédient gourmand adoucit un gommage maison pour le corps ?',
    ['Le sucre ou le marc de café + une huile', 'Le charbon seul', "L'alcool", 'Le sel fin sur le visage'], 0,
    'Sucre ou marc de café mélangés à une huile font un gommage doux pour le corps. Sur le visage, on reste très délicat.', 'ingrédients'),
  q('Cheveux gras à la racine mais secs aux pointes : que faire ?',
    ['Laver la racine en douceur, nourrir seulement les pointes', 'Mettre de l’huile partout', 'Laver à l’eau chaude', 'Ne pas laver'], 0,
    'On lave surtout la racine (douceur) et on nourrit les pointes (huile/après-shampooing) sans en mettre sur les racines.', 'cheveux'),
  m('Un savon antibactérien est meilleur pour la peau au quotidien.', 1,
    'Faux. Au quotidien, un savon doux suffit. Les antibactériens agressifs déséquilibrent la peau sans réel bénéfice.', 'idées reçues'),
  q('Quel ingrédient apaise et hydrate à la fois, même sur peau grasse ?',
    ["L'aloe vera", 'Le beurre de cacao', "L'huile de coco", 'La cire'], 0,
    'L’aloe vera hydrate en légèreté et apaise : c’est un des rares « gras-free » qui convient aussi aux peaux grasses.', 'ingrédients'),
  q('Quel geste évite les cheveux qui cassent au démêlage ?',
    ['Démêler en douceur, de préférence sur cheveux avec un soin', 'Brosser fort sur cheveux mouillés sans soin', 'Tirer sur les nœuds', 'Frotter avec la serviette'], 0,
    'On démêle doucement, avec un après-shampooing ou un démêlant, en partant des pointes vers les racines.', 'cheveux'),
]

// Lot complet = lot 1 (inline) + lot 2 (fichier dédié).
const BATCH: Item[] = [...BATCH_1, ...LOT2]

;(async () => {
  console.log(`\n${B}=== Seed daily_picks — LOTS 1+2 — ${APPLY ? Y + 'APPLY' : G + 'DRY-RUN'}${X}${B} ===${X}`)
  const quiz = BATCH.filter((b) => b.kind === 'quiz').length
  const myth = BATCH.filter((b) => b.kind === 'myth').length
  console.log(`  ${C}·${X} ${BATCH.length} questions (${quiz} quiz, ${myth} idées reçues) → order_index 81..${80 + BATCH.length}`)

  // Garde-fous qualité
  const problems: string[] = []
  const seen = new Set<string>()
  BATCH.forEach((b, i) => {
    if (seen.has(b.question)) problems.push(`doublon: ${b.question}`)
    seen.add(b.question)
    if (b.correct_index < 0 || b.correct_index >= b.options.length) problems.push(`correct_index HS #${i}: ${b.question}`)
    if (new Set(b.options).size !== b.options.length) problems.push(`options dupliquées #${i}: ${b.question}`)
    if (b.kind === 'quiz' && b.options.length !== 4) problems.push(`quiz ≠ 4 options #${i}: ${b.question}`)
  })
  // Anti-doublon vs les 80 questions ORIGINALES (order_index <= 80).
  const origRes = await fetch(`${URL_}/rest/v1/daily_picks?select=question&order_index=lte.80`, { headers: H })
  if (origRes.ok) {
    const orig = new Set(((await origRes.json()) as { question: string }[]).map((r) => r.question))
    for (const b of BATCH) if (orig.has(b.question)) problems.push(`doublon vs original: ${b.question}`)
  }
  if (problems.length) { problems.forEach((p) => console.log(`  ${Y}⚠ ${p}${X}`)); throw new Error(`${problems.length} problème(s) — corriger avant d'appliquer`) }
  console.log(`  ${G}✓ garde-fous OK (0 doublon interne/vs original, index valides, 4 options/quiz)${X}`)

  console.log(`\n${B}Aperçu (5 premières)${X}`)
  for (const b of BATCH.slice(0, 5)) {
    console.log(`  ${D}[${b.kind}/${b.category}]${X} ${b.question}`)
    console.log(`     ✓ ${b.options[b.correct_index]}   ${D}(${b.options.filter((_, i) => i !== b.correct_index).join(' · ')})${X}`)
  }

  if (!APPLY) { console.log(`\n${G}DRY-RUN OK.${X} --apply pour poser le lot (remplace order_index > 80).\n`); return }

  // Idempotent : on efface le lot précédent (>80) puis on réinsère.
  const del = await fetch(`${URL_}/rest/v1/daily_picks?order_index=gt.80`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
  if (!del.ok) throw new Error(`DELETE ${del.status}: ${(await del.text()).slice(0, 200)}`)
  const rows = BATCH.map((b, i) => ({ ...b, order_index: 81 + i }))
  const ins = await fetch(`${URL_}/rest/v1/daily_picks`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows),
  })
  if (!ins.ok) throw new Error(`INSERT ${ins.status}: ${(await ins.text()).slice(0, 300)}`)
  console.log(`\n${G}✓ ${rows.length} questions posées (total daily_picks = 80 + ${rows.length}).${X}\n`)
})()
