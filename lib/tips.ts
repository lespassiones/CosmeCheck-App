/**
 * Educational tips shown on the home dashboard.
 *
 * Rotation is deterministic (hour-based) so the same tip is shown to every
 * visitor at the same hour and changes every hour. With 50 tips the full
 * pool cycles in about two days.
 *
 * Port byte-for-byte du web `lib/tips.ts`.
 */
export const DAILY_TIPS: string[] = [
  // Lire l'étiquette
  "Les 5 premiers ingrédients d'un produit représentent environ 75 % de la formule. Le reste, c'est surtout du détail.",
  "Sur une étiquette, les ingrédients sont rangés du plus présent au moins présent. Plus c'est haut, plus il y en a.",
  "Si « Aqua » (l'eau) est en 1er, le produit est avant tout… de l'eau. Normal pour une crème, plus surprenant pour un sérum « ultra concentré ».",
  "Quand un ingrédient arrive après le 1er conservateur, il y en a en général moins de 1 % dans le produit.",
  "Sous 1 %, les marques peuvent écrire les ingrédients dans l'ordre qu'elles veulent, la fin de liste n'est plus un classement fiable.",
  "Un ingrédient placé après « Parfum » est présent en toute petite quantité : son effet sur la peau reste limité.",
  "Avant « Parfum » = ingrédient bien présent, à surveiller. Après « Parfum » = traces, plus rassurant.",
  "Le mot « Parfum » sur une étiquette peut cacher des dizaines de molécules différentes que la marque n'est pas obligée de détailler.",
  "Les codes du type « CI 12345 » à la fin d'une liste, ce sont juste les colorants. Rien d'inquiétant en soi.",
  "Sur l'emballage, les noms en italique sont souvent des ingrédients d'origine végétale (le nom scientifique de la plante).",
  "Une note un peu basse ne veut pas dire « dangereux ». C'est une note de tolérance, pas un verdict médical.",
  "En Europe, la liste des ingrédients est obligatoire sur tous les cosmétiques. Si elle manque, repose le produit.",

  // Allergies & ingrédients sensibles
  "Il existe 26 ingrédients parfumants connus pour provoquer des allergies. Les marques doivent les écrire dès qu'il y en a un tout petit peu.",
  "Limonene, Linalool, Citronellol, Geraniol : 4 noms qu'on retrouve souvent dans les parfums et qui peuvent faire réagir les peaux sensibles.",
  "Le « Methylisothiazolinone » (parfois écrit MI ou MIT) est un conservateur qui déclenche beaucoup d'allergies. À éviter dans une crème qui reste sur la peau.",
  "Tous les parabens ne se valent pas : les longs sont aujourd'hui très encadrés, les courts (methyl-, ethyl-) sont toujours autorisés et plutôt bien tolérés.",
  "Le vrai formaldéhyde est interdit dans les cosmétiques, mais quelques conservateurs en libèrent un peu avec le temps. À éviter si tu as une peau réactive.",
  "Les huiles essentielles, même « naturelles », sont des concentrés très puissants. Plusieurs en même temps = plus de risque d'irritation.",
  "Si tu as la peau qui rougit ou pique facilement, regarde les conservateurs en haut de liste et limite les produits avec beaucoup d'huiles essentielles.",
  "Certaines huiles essentielles (bergamote, citron, agrumes en général) rendent la peau plus sensible au soleil. Évite-les le matin avant de sortir.",

  // Soleil & protection solaire
  "Un SPF 30 arrête environ 97 % des UV, un SPF 50 environ 98 %. La vraie différence, c'est surtout d'en remettre toutes les 2 heures.",
  "Sur ta crème solaire, regarde aussi « UVA » dans un cercle ou « PA+++ ». C'est ce qui protège la peau du vieillissement, pas seulement des coups de soleil.",
  "Une crème solaire perd de son efficacité après 1 à 2 ans une fois ouverte. Note la date d'ouverture au marqueur sur le tube.",
  "Une vieille crème solaire mal conservée peut moins bien protéger. Si elle a passé un été dans la voiture, mieux vaut en racheter une.",
  "Les filtres « minéraux » (oxyde de zinc, dioxyde de titane) sont en général mieux tolérés par les peaux sensibles que les filtres chimiques.",

  // Routine & application
  "Sur peau légèrement humide, les soins pénètrent un peu mieux. Tamponne ta peau avec une serviette plutôt que de la frotter à sec.",
  "Plus une molécule est petite, mieux elle entre dans la peau. C'est pour ça que tout ce qui est « collagène » dans une crème ne passe presque pas la surface.",
  "L'acide hyaluronique attire l'eau et hydrate la surface de la peau. Mais sans une crème par-dessus, l'effet ne tient pas longtemps.",
  "Le rétinol rend la peau plus sensible au soleil. Règle simple : rétinol le soir, crème solaire le matin, jamais l'inverse.",
  "Vitamine C le matin + crème solaire = duo gagnant contre les taches et le vieillissement de la peau.",
  "Évite d'utiliser un exfoliant (acide) et du rétinol le même soir, surtout sur peau sensible. Tu risques juste de l'irriter.",
  "Les soins anti-âge mettent environ 2 à 3 mois à montrer un vrai résultat. Si tu arrêtes au bout de 2 semaines, tu ne sauras jamais s'ils marchent.",

  // Lavants & shampooings
  "Le « SLS » (Sodium Lauryl Sulfate) est un agent lavant assez fort qui peut tirer la peau ou le cuir chevelu. Le « SLES » à côté est un peu plus doux.",
  "« Coco Glucoside » et « Decyl Glucoside » : ce sont des agents lavants doux, faits à partir de noix de coco. En général très bien tolérés.",
  "Un shampooing qui mousse beaucoup n'est pas forcément plus efficace. La grosse mousse, c'est surtout pour le plaisir sous la douche.",
  "Pour la peau, un produit lavant proche du pH naturel (autour de 5,5) respecte mieux la barrière qu'un savon basique très alcalin.",

  // Conservation
  "Le petit pot ouvert avec « 6M » ou « 12M » sur l'emballage = nombre de mois pendant lequel le produit reste bon après ouverture.",
  "Un produit qui contient beaucoup d'eau et zéro conservateur ne tient pas longtemps : 1 mois max avant que des microbes s'y développent.",
  "Garder une crème solaire ou un sérum à plus de 30 °C (soleil, voiture) abîme ses ingrédients actifs plus vite. Range-les à l'abri.",
  "Les produits sans eau (huiles pures, baumes) se conservent en général plus longtemps que les crèmes, qui sont un mélange d'eau et d'huile.",

  // Marketing & promesses
  "« Hypoallergénique » n'est pas un mot encadré par une loi stricte. Regarde la liste des ingrédients, pas juste le mot sur le packaging.",
  "« Sans parabens » peut juste vouloir dire que la marque les a remplacés par d'autres conservateurs, parfois plus allergisants.",
  "« Naturel à 99 % » compte souvent l'eau dans le pourcentage. C'est techniquement vrai, mais ça ne dit pas grand-chose de la qualité du produit.",
  "« Bio » ne veut pas dire « sans risque d'allergie ». Une huile essentielle bio peut faire réagir une peau sensible exactement comme la version non-bio.",
  "Les petits logos verts (feuille, planète, etc.) sont rarement contrôlés par un organisme indépendant. Fie-toi d'abord à la liste des ingrédients.",

  // Catégories spécifiques
  "Pour un bébé, choisis une liste d'ingrédients courte (moins de 10 si possible), sans parfum et sans alcool. Sa peau est beaucoup plus fragile que la nôtre.",
  "Un « déodorant » réduit les odeurs, un « anti-transpirant » bloque la transpiration. Ce ne sont pas les mêmes produits, et l'un n'est pas obligé de remplacer l'autre.",
  "Les masques à l'argile absorbent l'excès de gras. 1 à 2 fois par semaine sur les zones grasses suffit, plus, ça assèche la peau.",
  "Pour bien retirer une crème solaire résistante à l'eau, un démaquillant à l'huile fait beaucoup mieux qu'une eau micellaire seule.",

  // Bonnes habitudes
  "Avant de mettre un nouveau produit sur le visage, teste-le 48 h dans le pli du coude. Si ça rougit ou démange, n'insiste pas.",
  "Mieux vaut 8 à 10 produits bien choisis qu'une étagère de 30. Plus tu cumules, plus tu exposes ta peau à des ingrédients qui peuvent te gêner.",
  "Le vrai produit, c'est ce qu'il y a dedans, pas ce qui est marqué dessus. Apprends à lire la liste des ingrédients avant la pub.",
  "Quand un produit te fait réagir, note son nom. Au bout de 2 ou 3 réactions, tu pourras repérer l'ingrédient en commun.",
];

/**
 * Pick the tip for the current hour. Hour-based rotation gives roughly one
 * change per hour and cycles through the whole pool in ~2 days.
 */
export function tipForToday(date: Date = new Date()): string {
  const hoursSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60));
  return DAILY_TIPS[hoursSinceEpoch % DAILY_TIPS.length];
}

/**
 * Return a rotated slice of `count` tips starting at the current hour. This
 * gives the carousel a "tip-of-the-day-first, then variety" feel - the user
 * always sees the same first tip everyone else sees right now, but can swipe
 * to discover more.
 */
export function tipsForCarousel(count = 12, date: Date = new Date()): string[] {
  const hoursSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60));
  const start = hoursSinceEpoch % DAILY_TIPS.length;
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, DAILY_TIPS.length); i++) {
    out.push(DAILY_TIPS[(start + i) % DAILY_TIPS.length]);
  }
  return out;
}
