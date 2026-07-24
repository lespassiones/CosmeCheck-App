/**
 * daily-picks-lot2 — 2ᵉ lot de questions « Quizz & idées reçues du jour ».
 * Même style TRÈS grand public que le lot 1 (ingrédients connus, zéro jargon).
 * Importé par scripts/seed-daily-picks.ts (concaténé après le lot 1).
 */
export type Item = { kind: 'quiz' | 'myth'; question: string; options: string[]; correct_index: number; reveal: string; category: string }
const q = (question: string, options: string[], correct_index: number, reveal: string, category: string): Item =>
  ({ kind: 'quiz', question, options, correct_index, reveal, category })
const m = (question: string, correct_index: number, reveal: string, category: string): Item =>
  ({ kind: 'myth', question, options: ['Vrai', 'Faux', 'Nuancé'], correct_index, reveal, category })

export const LOT2: Item[] = [
  // ── Ingrédients : à quoi ça sert ──
  q("À quoi sert surtout l'huile d'olive dans les soins ?", ["Nourrir les peaux sèches", "Matifier", "Assécher les boutons", "Faire mousser"], 0, "L'huile d'olive est riche et nourrissante, bien pour les peaux et cheveux secs. Sur peau grasse, elle peut être un peu lourde.", 'ingrédients'),
  q("À quoi sert le vinaigre de cidre (dilué) sur les cheveux ?", ["Faire briller après le shampooing", "Colorer", "Assécher la peau", "Parfumer la maison"], 0, "Un rinçage à l'eau + vinaigre de cidre dilué aide à faire briller les cheveux. On rince bien ensuite.", 'cheveux'),
  q("À quoi sert le rhassoul (argile du Maroc) ?", ["Laver et purifier peau et cheveux en douceur", "Faire bronzer", "Nourrir les peaux très sèches", "Colorer les ongles"], 0, "Le rhassoul est une argile lavante qui nettoie sans décaper. On l'utilise sur la peau ou le cuir chevelu.", 'ingrédients'),
  q("À quoi sert la caféine dans les soins contour des yeux ?", ["Aider à décongestionner les poches et cernes", "Réveiller en buvant", "Faire bronzer", "Colorer"], 0, "La caféine aide à décongestionner : on la retrouve dans des soins yeux (poches, cernes) et anti-cellulite.", 'ingrédients'),
  q("À quoi sert l'huile de nigelle (cumin noir) ?", ["Apaiser les peaux à imperfections", "Faire mousser", "Blanchir les dents", "Colorer les cheveux"], 0, "L'huile de nigelle est réputée pour apaiser les peaux à tendance boutons et irritations.", 'ingrédients'),
  q("À quoi sert le beurre de mangue ?", ["Nourrir la peau et les cheveux secs", "Matifier", "Nettoyer le maquillage", "Assécher"], 0, "Le beurre de mangue, comme le karité, nourrit les peaux et cheveux secs. Il fond au contact de la peau.", 'ingrédients'),
  q("À quoi sert l'hamamélis (eau) sur la peau ?", ["Resserrer et apaiser les peaux mixtes", "Nourrir les peaux très sèches", "Faire bronzer", "Colorer"], 0, "L'eau d'hamamélis a un léger effet astringent : utile en tonique sur peaux mixtes à grasses.", 'ingrédients'),
  q("À quoi sert la vitamine E dans une crème ?", ["Protéger la peau et éviter que les huiles rancissent", "Faire mousser", "Colorer", "Épaissir"], 0, "La vitamine E est un antioxydant : elle protège la peau et aide les huiles du produit à mieux se conserver.", 'ingrédients'),
  q("D'où vient l'huile de coco ?", ["De la noix de coco", "Du pétrole", "D'une algue", "Du lait"], 0, "L'huile de coco est extraite de la chair de la noix de coco. Très nourrissante, mais elle peut boucher les pores du visage.", 'ingrédients'),
  q("D'où vient la cire d'abeille ?", ["Des abeilles (dans la ruche)", "D'un arbre", "Du pétrole", "D'une pierre"], 0, "La cire d'abeille est produite par les abeilles. Elle protège et donne de la tenue aux baumes.", 'ingrédients'),

  // ── Situations concrètes ──
  q("Cheveux fins et plats : quel geste donne du volume sans les alourdir ?", ["Un soin léger, éviter les huiles sur les racines", "Beaucoup d'huile sur tout", "Un baume très riche", "Ne pas laver"], 0, "Les cheveux fins s'alourdissent vite : on garde les soins riches pour les pointes, jamais sur les racines.", 'cheveux'),
  q("Cheveux colorés : quel réflexe protège la couleur ?", ["Un shampooing doux et de l'eau tiède", "De l'eau très chaude", "Laver plusieurs fois par jour", "Le citron"], 0, "L'eau chaude et les lavages agressifs font ternir la couleur plus vite. Douceur et eau tiède la préservent.", 'cheveux'),
  q("Mains gercées en hiver : que faire le soir ?", ["Crème riche au karité + éventuellement des gants", "De l'alcool", "Rien", "Du citron"], 0, "Une crème riche la nuit (karité, glycérine) répare les mains gercées. Des gants en coton aident à faire pénétrer.", 'mains'),
  q("Coudes et genoux secs et rugueux : quel soin ?", ["Un beurre nourrissant (karité, cacao)", "Un gel léger", "De l'argile", "Du charbon"], 0, "Les zones rugueuses (coudes, genoux) aiment les beurres très riches. On peut faire un gommage doux avant.", 'peau sèche'),
  q("Jambes lourdes en fin de journée : quel ingrédient soulage ?", ["La menthe (effet frais)", "Le beurre de karité chaud", "Le charbon", "Le sucre"], 0, "Les gels à la menthe donnent une sensation de fraîcheur qui soulage les jambes lourdes. On masse du bas vers le haut.", 'jambes'),
  q("Vergetures pendant la grossesse : quel geste aide à les prévenir ?", ["Hydrater la peau chaque jour (huile, beurre)", "Frotter fort", "Ne rien mettre", "Utiliser du citron"], 0, "Une peau bien hydratée et souple résiste mieux à l'étirement. On masse doucement le ventre, les hanches, la poitrine.", 'grossesse'),
  q("Points noirs sur le nez : quel est le bon réflexe ?", ["Nettoyer en douceur régulièrement", "Les presser fort avec les ongles", "Mettre de l'alcool", "Frotter au citron"], 0, "On assainit doucement (argile ponctuelle). Presser abîme la peau et laisse des marques.", 'boutons'),
  q("Dents un peu jaunes : quel geste est sûr au quotidien ?", ["Bien se brosser les dents 2 fois par jour", "Frotter au bicarbonate chaque jour", "Mettre du citron", "Utiliser de l'eau de Javel"], 0, "Un bon brossage régulier garde les dents saines. Le bicarbonate ou le citron trop souvent abîment l'émail.", 'hygiène'),
  q("Cheveux qui tombent un peu : quel réflexe doux adopter ?", ["Masser le cuir chevelu et éviter de tirer dessus", "Laver à l'eau brûlante", "Serrer les coiffures très fort", "Frotter à l'alcool"], 0, "Un massage doux stimule le cuir chevelu. Les coiffures trop serrées et la chaleur fragilisent les cheveux.", 'cheveux'),
  q("Après l'épilation : quel soin apaise la peau ?", ["Un soin apaisant (aloe vera)", "De l'alcool", "Du parfum", "Rien du tout"], 0, "L'aloe vera calme la peau échauffée après l'épilation. On évite parfum et alcool juste après.", 'épilation'),

  // ── Idées reçues (myths) ──
  m("Le rasage rend les poils plus épais.", 1, "Faux. C'est une illusion : le poil repousse coupé net, il paraît plus dru mais n'est pas plus épais.", 'idées reçues'),
  m("Le bicarbonate est parfait pour blanchir les dents tous les jours.", 1, "Faux. Utilisé trop souvent, le bicarbonate use l'émail des dents. À réserver à un usage très occasionnel.", 'idées reçues'),
  m("Un déodorant empêche de transpirer.", 2, "Nuancé. Un déodorant masque l'odeur ; c'est l'anti-transpirant qui réduit la sueur. Ce sont deux produits différents.", 'idées reçues'),
  m("On peut garder un maquillage tant qu'il sent encore bon.", 1, "Faux. L'odeur ne dit pas tout : un maquillage périmé peut abriter des microbes, surtout près des yeux.", 'conservation'),
  m("Laver ses pinceaux de maquillage est inutile.", 1, "Faux. Des pinceaux sales accumulent bactéries et sébum et favorisent les boutons. On les lave régulièrement.", 'hygiène'),
  m("Le froid soulage les jambes lourdes.", 0, "Vrai. La fraîcheur (gel à la menthe, eau froide) resserre et soulage la sensation de jambes lourdes.", 'jambes'),
  m("Une huile ne convient jamais à une peau grasse.", 1, "Faux. Certaines huiles légères (jojoba) conviennent aux peaux grasses. C'est surtout l'huile de coco qui pose souci.", 'idées reçues'),
  m("La crème solaire, c'est seulement pour la plage.", 1, "Faux. Les UV sont là toute l'année, même en ville et par temps nuageux. La protection est utile au quotidien.", 'solaire'),
  m("Les enfants peuvent utiliser la même crème solaire que les adultes.", 2, "Nuancé. Une haute protection convient, mais la peau des enfants est plus fragile : mieux vaut une formule adaptée et un indice élevé.", 'solaire'),
  m("Le sèche-cheveux abîme forcément les cheveux.", 2, "Nuancé. Une chaleur trop forte abîme, mais à température moyenne, à bonne distance et avec un soin protecteur, ça va.", 'idées reçues'),

  // ── Bloc suite ──
  q("Peau qui pèle après un coup de soleil : que NE pas faire ?", ["Arracher les peaux", "Hydrater", "Rester à l'ombre", "Boire de l'eau"], 0, "On n'arrache jamais les peaux (marques, infection). On hydrate et on laisse la peau se renouveler seule.", 'solaire'),
  q("Piqûre de moustique qui gratte : quel geste apaise ?", ["Le froid et un gel apaisant", "Gratter très fort", "Mettre du parfum", "Frotter au citron"], 0, "Le froid calme la démangeaison. Gratter aggrave et peut infecter.", 'peau sensible'),
  q("Quel ingrédient très doux apaise les rougeurs du visage ?", ["L'eau de bleuet", "L'alcool", "Le charbon", "Le citron"], 0, "L'eau de bleuet apaise et rafraîchit les peaux sensibles et les yeux fatigués.", 'peau sensible'),
  q("Cuir chevelu qui démange : quel réflexe doux ?", ["Un shampooing doux, sans gratter avec les ongles", "Frotter fort avec les ongles", "Laver à l'eau brûlante", "Mettre de l'alcool"], 0, "On lave en douceur du bout des doigts. Gratter et l'eau brûlante irritent davantage le cuir chevelu.", 'cheveux'),
  q("Quel ingrédient gourmand nourrit un masque cheveux maison ?", ["L'avocat ou la banane écrasée", "Le sel", "Le charbon", "L'alcool"], 0, "Avocat ou banane bien écrasés nourrissent les cheveux secs. On rince très bien après pose.", 'cheveux'),
  q("Contour des yeux fatigué : quel geste simple aide ?", ["Appliquer un soin frais et tapoter doucement", "Frotter fort", "Mettre du savon", "Utiliser de l'eau chaude"], 0, "On tapote doucement un soin frais (concombre, caféine). La zone est fragile : jamais frotter.", 'yeux'),
  q("Odeur de transpiration : quel produit agit sur la sueur elle-même ?", ["Un anti-transpirant", "Un parfum", "Une eau florale", "Un gommage"], 0, "L'anti-transpirant réduit la transpiration ; le déodorant, lui, masque surtout l'odeur.", 'hygiène'),
  q("Peau du décolleté qui marque avec l'âge : quel réflexe ?", ["L'hydrater et la protéger du soleil comme le visage", "L'oublier", "La frotter fort", "Mettre du citron"], 0, "Le décolleté vieillit vite car souvent oublié : on l'hydrate et on le protège du soleil comme le visage.", 'anti-âge'),
  q("Bébé a les fesses rouges : quel soin doux ?", ["Une crème pour le change (souvent au zinc)", "De l'alcool", "Du parfum", "Du citron"], 0, "Une crème change (zinc) protège et apaise les fesses de bébé. On change souvent la couche et on sèche bien.", 'bébé'),
  q("Croûtes de lait de bébé : quel geste doux ?", ["Masser avec une huile douce puis laver doucement", "Gratter les croûtes", "Mettre de l'alcool", "Frotter fort"], 0, "Une huile douce (amande, calendula) ramollit les croûtes de lait ; on lave ensuite en douceur, sans gratter.", 'bébé'),

  // ── Idées reçues (suite) ──
  m("Se maquiller donne forcément des boutons.", 2, "Nuancé. Le souci vient surtout d'un mauvais démaquillage ou de produits qui bouchent les pores, pas du maquillage en soi.", 'idées reçues'),
  m("« Hypoallergénique » veut dire zéro risque d'allergie.", 1, "Faux. Ça veut dire risque réduit, pas nul. On peut quand même réagir à un produit hypoallergénique.", 'idées reçues'),
  m("Le stress peut aggraver l'acné.", 0, "Vrai. Le stress influence les hormones et peut aggraver les boutons chez certaines personnes.", 'idées reçues'),
  m("Le manque de sommeil marque le visage.", 0, "Vrai. Mal dormir favorise cernes, teint terne et petites imperfections. Le sommeil est un vrai soin gratuit.", 'idées reçues'),
  m("Frotter fort avec un gant rend la peau plus propre.", 1, "Faux. Frotter fort agresse la peau et peut la rendre plus sensible. La douceur nettoie très bien.", 'idées reçues'),
  m("Le collagène en crème comble les rides en profondeur.", 1, "Faux. Le collagène en crème reste en surface (molécule trop grosse). Il hydrate, mais ne « remplit » pas les rides.", 'idées reçues'),
  m("Une peau grasse n'a jamais besoin d'être hydratée.", 1, "Faux. Même grasse, la peau a besoin d'eau. Une texture légère l'hydrate sans la faire briller.", 'idées reçues'),
  m("Le savon d'Alep peut convenir au visage.", 2, "Nuancé. Le savon d'Alep est doux et convient à beaucoup de peaux, mais certaines peaux sèches le trouvent décapant.", 'idées reçues'),
  m("Il faut attendre un peu avant de se brosser les dents après un jus d'orange.", 0, "Vrai. Juste après un aliment acide, l'émail est fragilisé. On attend un moment avant de brosser.", 'hygiène'),
  m("Les cheveux gras, c'est un manque de lavage.", 1, "Faux. Le gras vient de la production de sébum, pas d'un manque de lavage. Trop laver peut même en produire plus.", 'idées reçues'),

  // ── Ingrédients & usages ──
  q("Quel ingrédient est réputé pour un masque purifiant peau grasse ?", ["L'argile verte", "Le beurre de karité", "L'huile de coco", "Le beurre de cacao"], 0, "L'argile verte absorbe l'excès de gras : idéale en masque purifiant, une fois par semaine, sur peau grasse.", 'peau grasse'),
  q("Quel ingrédient apaise et hydrate un masque maison pour peau sensible ?", ["Le miel", "Le sel", "Le charbon", "L'alcool"], 0, "Le miel hydrate et apaise : un peu de miel en masque convient aux peaux sensibles et sèches.", 'ingrédients'),
  q("Quel ingrédient rafraîchit un masque maison « bonne mine » ?", ["Le concombre", "Le charbon", "L'alcool", "Le sel"], 0, "Le concombre rafraîchit et décongestionne : parfait en masque express pour une peau fatiguée.", 'ingrédients'),
  q("Quel ingrédient est réputé pour fortifier les cils ?", ["L'huile de ricin", "Le charbon", "L'eau salée", "L'alcool"], 0, "L'huile de ricin est souvent utilisée pour renforcer cils et sourcils. Une touche le soir, loin des yeux.", 'ingrédients'),
  q("Quel ingrédient nourrit un baume à lèvres maison ?", ["La cire d'abeille + une huile", "Le charbon", "Le sel", "L'alcool"], 0, "Cire d'abeille fondue avec une huile (coco, amande) fait un baume lèvres nourrissant et protecteur.", 'lèvres'),
  q("Quel ingrédient aide la peau à retenir l'eau ?", ["La glycérine", "L'alcool", "Le charbon", "Le sel"], 0, "La glycérine attire l'eau dans la peau : c'est un hydratant simple qu'on retrouve dans beaucoup de crèmes.", 'ingrédients'),
  q("Quel ingrédient nourrit intensément un masque cheveux très secs ?", ["Le beurre de karité", "L'argile", "Le charbon", "Le citron"], 0, "Le karité en masque nourrit les cheveux très secs et abîmés. On pose sur les longueurs, on rince bien.", 'cheveux'),
  q("Quel ingrédient est réputé pour apaiser les coups de soleil ET les petites brûlures légères ?", ["L'aloe vera", "Le charbon", "L'alcool", "Le sel"], 0, "L'aloe vera rafraîchit et apaise la peau échauffée. Pour une vraie brûlure, on consulte.", 'ingrédients'),
  q("Quel geste garde un savon solide plus longtemps ?", ["Le laisser sécher entre deux utilisations", "Le laisser dans l'eau", "Le mettre au soleil", "Le couper en morceaux"], 0, "Un savon qui sèche entre deux usages dure bien plus longtemps que s'il baigne dans l'eau.", 'conservation'),
  q("Quel ingrédient donne une sensation de fraîcheur sur les jambes ?", ["La menthe", "Le beurre de karité", "L'huile de coco", "Le miel"], 0, "La menthe rafraîchit : agréable sur les jambes lourdes ou après le sport.", 'ingrédients'),

  // ── Routine & bon sens ──
  q("Dans quel ordre appliquer ses soins le matin (du plus léger au plus riche) ?", ["Nettoyant, soin léger, crème, puis solaire", "Solaire d'abord, puis nettoyant", "Crème riche puis nettoyant", "Peu importe totalement"], 0, "En général : on nettoie, on met les textures les plus fines d'abord, puis les plus riches, et la crème solaire en dernier le matin.", 'routine'),
  q("À quel moment mettre la crème solaire dans la routine du matin ?", ["En dernier, avant de sortir", "En tout premier", "Au milieu", "Le soir"], 0, "La protection solaire se met en dernière étape du matin, par-dessus les soins, avant de sortir.", 'routine'),
  q("Peau normale : à quelle fréquence faire un gommage doux ?", ["Environ 1 fois par semaine", "Tous les jours", "3 fois par jour", "Jamais de la vie"], 0, "Un gommage doux 1 fois par semaine suffit. Plus souvent, on risque d'agresser la peau.", 'routine'),
  q("Quel geste du soir est le plus important pour la peau ?", ["Bien se démaquiller / nettoyer", "Mettre du parfum", "Boire un café", "Se gommer"], 0, "Le soir, l'essentiel est de retirer maquillage, pollution et sébum de la journée. La peau se répare la nuit.", 'routine'),
  q("Meilleur moment pour appliquer une crème pour le corps ?", ["Juste après la douche, peau encore humide", "Sur peau très sèche seulement", "Jamais", "Avant la douche"], 0, "Sur peau humide, la crème retient mieux l'eau : l'hydratation dure plus longtemps.", 'routine'),
  q("Comment tester un nouveau produit quand on a la peau sensible ?", ["En mettre un peu dans le pli du coude et attendre", "En couvrir tout le visage direct", "Le boire", "Le chauffer"], 0, "On teste une petite zone (pli du coude) et on attend un jour ou deux pour voir si ça réagit.", 'routine'),
  q("Que faire si un produit fait rougir ou gratter ?", ["Arrêter et rincer à l'eau claire", "En remettre plus", "Frotter", "Ajouter du parfum"], 0, "En cas de réaction, on arrête le produit et on rince à l'eau. Si ça persiste, on demande conseil.", 'routine'),
  q("Comment garder ses soins en bon état l'été ?", ["À l'abri de la chaleur et du soleil", "Dans la voiture au soleil", "Près du radiateur", "Ouverts en permanence"], 0, "La chaleur dégrade les soins. On les garde au frais et à l'abri de la lumière.", 'conservation'),
  q("Le maquillage waterproof, comment bien l'enlever ?", ["Avec une huile ou un démaquillant adapté", "Juste à l'eau", "En frottant fort", "Avec du savon à vaisselle"], 0, "Le waterproof résiste à l'eau : une huile ou un biphasé l'enlève en douceur, sans frotter les yeux.", 'hygiène'),
  q("Cheveux : à quoi sert l'après-shampooing ?", ["Démêler et adoucir les longueurs", "Nettoyer le cuir chevelu", "Colorer", "Faire mousser"], 0, "L'après-shampooing lisse et démêle les longueurs. On l'applique surtout sur les pointes, pas sur les racines.", 'cheveux'),

  // ── Idées reçues (suite 2) ──
  m("Une crème de jour peut aussi servir de crème de nuit.", 2, "Nuancé. Ça peut dépanner, mais les crèmes de nuit sont souvent plus riches et sans filtre solaire (inutile la nuit).", 'idées reçues'),
  m("Un flacon-pompe protège mieux le produit qu'un pot ouvert.", 0, "Vrai. Le flacon-pompe limite le contact avec l'air et les doigts : le produit reste sain plus longtemps qu'en pot large.", 'conservation'),
  m("L'eau micellaire n'a jamais besoin d'être rincée.", 2, "Nuancé. Elle démaquille sans rinçage, mais rincer ensuite évite les résidus, surtout sur peau sensible.", 'idées reçues'),
  m("Dormir sur le dos peut aider à limiter les plis du visage.", 0, "Vrai. Écraser le visage contre l'oreiller chaque nuit favorise des plis. Dormir sur le dos aide un peu.", 'idées reçues'),
  m("Le maquillage « longue tenue » est plus difficile à démaquiller.", 0, "Vrai. Plus ça tient, plus il faut un démaquillage soigné (souvent une huile) pour ne rien laisser.", 'idées reçues'),
  m("Un produit « testé dermatologiquement » convient à tout le monde.", 1, "Faux. Ça veut dire qu'il a été testé, pas qu'il conviendra à chaque peau. On peut quand même réagir.", 'idées reçues'),
  m("Se laver les cheveux à l'eau froide les fait plus briller.", 2, "Nuancé. Un rinçage frais referme les écailles et donne un peu plus de brillance, mais l'effet reste léger.", 'idées reçues'),
  m("La transpiration donne des boutons sur le corps si on ne se rince pas.", 0, "Vrai. Sueur + frottements + vêtements serrés peuvent favoriser des boutons. Se rincer après le sport aide.", 'idées reçues'),
  m("Les huiles essentielles sont sans danger car naturelles.", 1, "Faux. Très concentrées, elles peuvent irriter, être allergènes et sont déconseillées à certaines personnes (femmes enceintes, bébés).", 'idées reçues'),
  m("On peut utiliser un gommage sur un coup de soleil pour enlever les peaux.", 1, "Faux. On ne gomme jamais une peau brûlée par le soleil. On hydrate et on laisse la peau se réparer.", 'idées reçues'),

  // ── Ingrédients : reconnaître / choisir ──
  q("Quel ingrédient est le plus adapté à une peau à imperfections ?", ["L'argile", "Le beurre de karité", "L'huile de coco", "Le beurre de cacao"], 0, "L'argile assainit sans nourrir en excès. Les corps gras riches peuvent aggraver les imperfections.", 'boutons'),
  q("Quel ingrédient choisir pour une peau très sèche du corps ?", ["Le beurre de karité", "L'argile", "Le charbon", "Le citron"], 0, "Le karité (ou beurre de cacao) nourrit intensément les peaux très sèches du corps.", 'peau sèche'),
  q("Quelle huile est légère et adaptée à un visage mixte ?", ["L'huile de jojoba", "L'huile de coco", "Le beurre de karité", "L'huile d'olive"], 0, "La jojoba est légère et proche du sébum : bien tolérée par les peaux mixtes. La coco et l'olive sont plus lourdes.", 'ingrédients'),
  q("Quel ingrédient aide à protéger la peau de la pollution au quotidien ?", ["Un antioxydant comme le thé vert", "Le sel", "L'alcool", "Le charbon"], 0, "Les antioxydants (thé vert, vitamine E) aident la peau à faire face à la pollution et à la fatigue.", 'ingrédients'),
  q("Quel ingrédient nourrit et fait briller sans alourdir, en petite quantité ?", ["L'huile d'argan", "Le beurre de cacao", "L'huile de ricin", "La cire"], 0, "Quelques gouttes d'argan suffisent pour nourrir et faire briller cheveux ou peau, sans effet gras.", 'ingrédients'),
  q("Quel ingrédient est souvent utilisé pour les peaux de bébé et sensibles ?", ["Le calendula", "L'alcool", "Le charbon", "Le parfum"], 0, "Le calendula (souci) apaise les peaux délicates. On choisit des formules simples et sans parfum pour bébé.", 'ingrédients'),
  q("Quel ingrédient donne un effet frais et « réveille » le regard ?", ["Le concombre ou la caféine", "Le beurre de karité", "L'huile de coco", "Le sel"], 0, "Concombre (froid) et caféine décongestionnent le contour des yeux fatigué.", 'yeux'),
  q("Quel ingrédient utilise-t-on pour un gommage doux du corps ?", ["Le sucre + une huile", "L'alcool", "Le charbon seul", "Le sel fin sur le visage"], 0, "Sucre et huile font un gommage corps doux. Sur le visage, on reste très délicat.", 'ingrédients'),
  q("Quel ingrédient nourrissant est aussi utilisé pour la barbe ?", ["L'huile (argan, jojoba)", "L'argile", "Le charbon", "L'alcool"], 0, "Les huiles à barbe (argan, jojoba) assouplissent le poil et hydratent la peau dessous.", 'ingrédients'),
  q("Quel ingrédient est réputé pour aider un cuir chevelu qui pèle (pellicules) ?", ["Le zinc (dans un shampooing adapté)", "Le beurre de karité pur", "Le sucre", "L'huile de coco pure"], 0, "Le zinc, dans un shampooing ciblé, aide contre les pellicules. On lave en douceur sans gratter.", 'cheveux'),

  // ── Idées reçues (suite 3) ──
  m("Il faut changer de shampooing souvent car les cheveux s'y habituent.", 1, "Faux. Les cheveux ne s'habituent pas à un shampooing. Si le tien te convient, tu peux le garder.", 'idées reçues'),
  m("Un cheveu blanc arraché repousse en plusieurs cheveux blancs.", 1, "Faux. Un follicule ne fait qu'un cheveu. Arracher n'en multiplie pas, mais peut abîmer la racine.", 'idées reçues'),
  m("On peut garder un masque en tissu toute la nuit pour plus d'effet.", 1, "Faux. Un masque en tissu se retire après 15-20 min. Laissé trop longtemps, il sèche et « repompe » l'eau de la peau.", 'idées reçues'),
  m("Boire beaucoup d'eau suffit à hydrater une peau sèche en surface.", 2, "Nuancé. Boire est bon pour le corps, mais la couche superficielle a aussi besoin d'une crème pour rester hydratée.", 'idées reçues'),
  m("Les produits solaires « waterproof » n'ont jamais besoin d'être remis.", 1, "Faux. Même waterproof, la protection s'use avec l'eau, la sueur et le temps. On remet régulièrement.", 'idées reçues'),
  m("Un after-sun peut remplacer la crème solaire.", 1, "Faux. L'après-soleil apaise APRÈS ; il ne protège pas. C'est la crème solaire qui protège pendant l'exposition.", 'solaire'),
  m("Il faut hydrater la peau seulement en hiver.", 1, "Faux. La peau a besoin d'hydratation toute l'année, y compris l'été (soleil, climatisation, sel de mer).", 'idées reçues'),
  m("Le citron sur les cheveux est un bon moyen d'éclaircir sans risque.", 2, "Nuancé. Le citron + soleil éclaircit un peu mais dessèche beaucoup les cheveux. À éviter en usage répété.", 'idées reçues'),
  m("Une peau qui ne brille pas est forcément bien hydratée.", 1, "Faux. Ne pas briller ne veut pas dire être hydraté : une peau sèche ne brille pas non plus. Deux choses différentes.", 'idées reçues'),
  m("Les cosmétiques « sans parfum » sont toujours plus doux.", 2, "Nuancé. Souvent oui (le parfum est un allergène fréquent), mais d'autres ingrédients peuvent aussi irriter.", 'idées reçues'),

  // ── Situations & bon sens (suite) ──
  q("Cheveux électriques en hiver : quel geste aide ?", ["Un peu d'huile ou de soin sur les longueurs", "Frotter avec une serviette", "Laver à l'eau chaude", "Brosser à sec très fort"], 0, "Un voile de soin ou d'huile sur les longueurs limite l'électricité statique et discipline les cheveux.", 'cheveux'),
  q("Lèvres qui pèlent : quel réflexe ?", ["Baume nourrissant, ne pas mordiller", "Arracher les peaux", "Mettre du citron", "Les lécher souvent"], 0, "On nourrit avec un baume et on évite de mordiller ou lécher, ce qui aggrave la sécheresse.", 'lèvres'),
  q("Peau grasse qui brille en journée : quel geste sans décaper ?", ["Tamponner doucement (papier matifiant)", "Se laver le visage 5 fois", "Mettre de l'alcool", "Frotter fort"], 0, "Un papier matifiant absorbe l'excès de gras sans agresser. Se laver trop souvent relance la brillance.", 'peau grasse'),
  q("Quel geste limite les frisottis sur cheveux bouclés ?", ["Sécher en douceur et nourrir les longueurs", "Frotter avec la serviette", "Brosser à sec", "Laver à l'eau brûlante"], 0, "On sèche en tamponnant (pas en frottant) et on nourrit les longueurs pour discipliner les frisottis.", 'cheveux'),
  q("Quel réflexe protège un tatouage récent au soleil ?", ["Le couvrir ou mettre de la crème solaire une fois cicatrisé", "L'exposer pour « fixer »", "Le frotter", "Mettre du citron"], 0, "Le soleil fait pâlir les tatouages. Une fois cicatrisé, on le protège avec de la crème solaire.", 'solaire'),
  q("Ongles qui se dédoublent : quel réflexe ?", ["Les hydrater (huile) et éviter les chocs/produits agressifs", "Les limer dans tous les sens", "Mettre de l'alcool", "Les ronger"], 0, "On nourrit ongles et cuticules (huile de ricin) et on évite les produits décapants et les chocs.", 'ongles'),
  q("Talons fendillés : quel soin le soir ?", ["Crème riche + chaussettes en coton", "De l'alcool", "Rien", "Du citron"], 0, "Une crème riche (karité, urée) la nuit sous des chaussettes en coton répare les talons fendillés.", 'pieds'),
  q("Quel geste évite les poils incarnés après le rasage/l'épilation ?", ["Un gommage doux régulier", "Frotter à l'alcool", "Ne jamais hydrater", "Raser à sec"], 0, "Un gommage doux libère le poil et limite les poils incarnés. On hydrate aussi la zone.", 'épilation'),
  q("Peau du visage qui tiraille après le nettoyage : que changer ?", ["Passer à un nettoyant plus doux", "Nettoyer plus souvent", "Utiliser de l'eau chaude", "Ajouter du savon"], 0, "Si ça tiraille, le nettoyant est trop décapant. On choisit plus doux et on rince à l'eau tiède.", 'peau sèche'),
  q("Quel ingrédient tout doux pour démaquiller les yeux sensibles ?", ["Une huile douce ou un biphasé", "L'alcool", "Le savon", "Le citron"], 0, "Une huile douce ou un démaquillant biphasé retire le maquillage des yeux sans les irriter.", 'yeux'),

  // ── Idées reçues (suite 4) ──
  m("Le chocolat donne des boutons.", 2, "Nuancé. Le lien direct n'est pas prouvé. Chez certains, le sucre et les produits laitiers jouent plus que le chocolat.", 'idées reçues'),
  m("Se laver le visage à l'eau très chaude nettoie mieux.", 1, "Faux. L'eau chaude dessèche et fragilise la peau. L'eau tiède nettoie tout aussi bien, en douceur.", 'idées reçues'),
  m("Un gommage remplace le démaquillage.", 1, "Faux. Le gommage enlève les cellules mortes, pas le maquillage. On démaquille d'abord.", 'idées reçues'),
  m("Une crème solaire de l'an dernier est aussi efficace.", 2, "Nuancé. Si elle n'est pas périmée et a été bien conservée, oui ; ouverte depuis longtemps ou exposée à la chaleur, elle perd en efficacité.", 'solaire'),
  m("Un soin « anti-âge » efface les rides existantes.", 1, "Faux. Un soin peut hydrater et lisser l'aspect, mais aucune crème n'efface vraiment les rides. La prévention (soleil) compte le plus.", 'idées reçues'),
  m("Plus on met de crème, mieux c'est.", 1, "Faux. Une noisette suffit en général. Trop de produit ne pénètre pas mieux et peut coller.", 'idées reçues'),
  m("Un savon « surgras » lave moins bien.", 1, "Faux. Il lave bien tout en laissant un film protecteur : idéal pour les peaux sèches.", 'idées reçues'),
  m("Il faut exfolier pour que la crème « pénètre » mieux.", 2, "Nuancé. Un peu de renouvellement aide, mais exfolier trop souvent agresse la peau et fait l'inverse.", 'idées reçues'),
  m("Les mains vieillissent aussi vite que le visage si on les néglige.", 0, "Vrai. Les mains sont très exposées (soleil, lavages) : les hydrater et les protéger aide à limiter les marques.", 'anti-âge'),
  m("Le maquillage périmé peut irriter les yeux.", 0, "Vrai. Un mascara ou eye-liner trop vieux abrite des microbes et peut provoquer irritations et infections.", 'conservation'),

  // ── Divers grand public ──
  q("Quel produit protège le mieux les lèvres au soleil ?", ["Un baume à lèvres avec protection solaire", "Rien", "Du citron", "De l'alcool"], 0, "Les lèvres attrapent aussi des coups de soleil : un baume avec filtre solaire les protège.", 'solaire'),
  q("Quel geste simple garde une bonne haleine ?", ["Se brosser les dents et la langue", "Manger du citron", "Boire du café", "Rincer à l'alcool fort"], 0, "Brosser dents ET langue, et éventuellement un bain de bouche doux, aident à garder une haleine fraîche.", 'hygiène'),
  q("Quel ingrédient tout doux nettoie une peau sensible sans mousse agressive ?", ["Un lait ou une huile lavante", "Un savon très parfumé", "L'alcool", "Le citron"], 0, "Les laits et huiles lavantes nettoient sans décaper : parfaits pour les peaux sensibles qui n'aiment pas les mousses.", 'hygiène'),
  q("Quel geste évite d'agresser une peau atopique (très sèche, qui gratte) ?", ["Douche tiède rapide + crème riche après", "Bains chauds très longs", "Savon parfumé", "Gommage quotidien"], 0, "Peau atopique : eau tiède, douche courte, savon surgras, et une crème riche juste après la douche.", 'peau sèche'),
  q("Quel ingrédient apaisant met-on souvent dans les soins pour peaux atopiques ?", ["L'avoine", "L'alcool", "Le parfum", "Le charbon"], 0, "L'avoine apaise les démangeaisons : très présente dans les soins pour peaux très sèches et atopiques.", 'ingrédients'),
  q("Peau qui rougit vite (couperose) : quel réflexe ?", ["Éviter l'eau très chaude et les produits qui piquent", "Frotter fort", "Mettre de l'alcool", "Prendre des douches brûlantes"], 0, "On évite le chaud et les produits agressifs, on protège du soleil, et on choisit des soins apaisants.", 'peau sensible'),
  q("Quel geste protège les cheveux à la piscine (chlore) ?", ["Les mouiller à l'eau claire avant, rincer après", "Ne rien faire", "Mettre du citron", "Les laisser sécher au chlore"], 0, "Cheveux mouillés à l'eau claire absorbent moins de chlore. On rince bien après la baignade.", 'cheveux'),
  q("Quel ingrédient est réputé pour un masque anti-brillance rapide ?", ["L'argile", "Le beurre de karité", "L'huile de coco", "Le miel épais"], 0, "L'argile absorbe le gras et matifie. En masque ponctuel sur peau grasse, pas tous les jours.", 'peau grasse'),
  q("Quel geste limite les cernes de fatigue au réveil ?", ["Dormir assez + soin frais le matin", "Boire beaucoup de café", "Frotter les yeux", "Mettre du sel"], 0, "Le sommeil est le meilleur soin anti-cernes. Un soin frais (concombre, caféine) aide au réveil.", 'yeux'),
  q("Quel produit choisir pour un bébé au moment du bain ?", ["Un lavant très doux 2-en-1 sans parfum", "Un gel douche adulte parfumé", "Du savon décapant", "De l'eau brûlante"], 0, "Pour bébé : un lavant très doux, sans parfum, cheveux et corps, et de l'eau tiède.", 'bébé'),

  // ── Dernier bloc ──
  m("Le sport « nettoie » la peau en profondeur par la transpiration.", 1, "Faux. Transpirer régule la température, ça ne nettoie pas les pores. On se rince après pour éviter les boutons.", 'idées reçues'),
  m("On peut appliquer du parfum pur sur le visage.", 1, "Faux. Le parfum (alcool) irrite la peau du visage et la sensibilise au soleil. On le met sur les vêtements ou le cou.", 'idées reçues'),
  m("Les peaux foncées n'ont pas besoin de crème solaire.", 1, "Faux. Toutes les peaux ont besoin de protection : les peaux foncées bronzent aussi et risquent taches et vieillissement.", 'solaire'),
  m("Il faut se démaquiller même si on n'a pas mis de maquillage.", 2, "Nuancé. Sans maquillage, un simple nettoyage doux le soir suffit pour retirer pollution et sébum.", 'idées reçues'),
  m("Un produit bio se conserve aussi longtemps qu'un produit classique.", 2, "Nuancé. Souvent moins : avec peu de conservateurs, les produits bio/naturels peuvent se garder moins longtemps une fois ouverts.", 'conservation'),
  q("Quel réflexe garde une crème saine plus longtemps ?", ["Utiliser une spatule ou des mains propres", "Y plonger les doigts sales", "La laisser ouverte", "La chauffer"], 0, "Des doigts sales apportent des microbes. Une spatule ou des mains propres gardent la crème saine plus longtemps.", 'conservation'),
  q("Quel ingrédient nourrissant convient aux cheveux crépus très secs ?", ["Le beurre de karité", "L'argile", "L'alcool", "Le citron"], 0, "Les cheveux crépus sont naturellement secs : le karité et les huiles riches les nourrissent et les assouplissent.", 'cheveux'),
  q("Quel geste évite d'assécher une peau déjà sèche sous la douche ?", ["Eau tiède + savon doux, pas trop longtemps", "Eau brûlante", "Savon décapant", "Se frotter fort au gant"], 0, "Eau tiède, savon doux et douche courte préservent le film protecteur d'une peau sèche.", 'peau sèche'),
  q("Quel ingrédient apaise une peau qui a pris un coup de froid (vent, ski) ?", ["Le karité (protège) + l'aloe vera (apaise)", "L'alcool", "Le citron", "Le charbon"], 0, "Le karité protège du froid et l'aloe vera apaise la peau agressée par le vent et le froid.", 'peau sensible'),
  q("Quel est le meilleur geste anti-âge, simple et gratuit ?", ["Se protéger du soleil et bien dormir", "Multiplier les crèmes chères", "Se gommer tous les jours", "Boire du café"], 0, "Protection solaire + bon sommeil : les deux gestes les plus efficaces (et gratuits) contre le vieillissement de la peau.", 'anti-âge'),
]
