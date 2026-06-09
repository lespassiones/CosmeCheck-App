/**
 * Arbre des catégories produit — hardcodé pour une navigation instantanée.
 * Supabase n'est appelé QUE lorsqu'on atteint une feuille (nœud sans enfants).
 * Le slug DB est dérivé à la volée via pathToSlug().
 */

export interface CategoryNode {
  readonly name: string
  readonly children?: readonly CategoryNode[]
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

function b(name: string, children: CategoryNode[]): CategoryNode {
  return { name, children }
}
function l(name: string): CategoryNode {
  return { name }
}

// ─── Arbre complet ────────────────────────────────────────────────────────────

export const CATEGORIES: readonly CategoryNode[] = [
  b('Bien-être', [
    l('Huile essentielle'),
    l('Massage'),
    l('Sommeil et produit de relaxation'),
  ]),

  b('Coiffure', [
    b('Coloration capillaire', [
      l("Coloration capillaire d'oxydation"),
      l('Coloration capillaire homme'),
      l('Coloration capillaire végétale'),
      l('Crème / Poudre décolorante'),
      l('Éclaircissant capillaire'),
      l('Oxydant et révélateur de couleur'),
      l('Retouche racines'),
    ]),
    b('Produits coiffants', [
      l('Cire coiffante'),
      l('Crème coiffante'),
      l('Gel coiffant'),
      l('Laque'),
      l('Mousse coiffante'),
      l('Poudre coiffante'),
      l('Spray coiffant'),
    ]),
    b('Shampooing', [
      l('Shampooing anti-poux'),
      l('Shampooing antichute'),
      l('Shampooing antipelliculaire'),
      l('Shampooing botox'),
      l('Shampooing cheveux blonds'),
      l('Shampooing cheveux bouclés'),
      l('Shampooing cheveux colorés / méchés'),
      l('Shampooing cheveux fins'),
      l('Shampooing cheveux gras'),
      l('Shampooing cheveux secs et abîmés'),
      l('Shampooing cheveux ternes'),
      l('Shampooing classique'),
      l('Shampooing croissance capillaire'),
      l('Shampooing déjaunisseur'),
      l('Shampooing enfant'),
      l('Shampooing Homme'),
      l('Shampooing sec'),
      l('Shampooing solide'),
    ]),
    b('Soin capillaire', [
      l('Après-shampooing'),
      l('Après-shampooing solide'),
      l('Botox capillaire'),
      l('Démêlant (sans rinçage)'),
      l('Gommage cuir chevelu'),
      l('Huile capillaire'),
      l('Lissage capillaire'),
      l('Masque capillaire'),
      l('Sérum capillaire'),
      l('Soin anti-chute des cheveux'),
      l('Soin anti-poux'),
      l('Soin capillaire anti-frisottis'),
      l('Soin capillaire nuit'),
      l('Soin croissance capillaire'),
      l('Soin cuir chevelu'),
      l('Soin pour cheveux bouclés'),
      l('Soin pour cheveux colorés'),
      l('Soin pour cheveux gras'),
      l('Soin pour cheveux secs et abîmés'),
      l('Soin pour tous types de cheveux'),
    ]),
  ]),

  b('Hygiène dentaire', [
    l('Anti-taches et blanchiment dentaire'),
    l('Bain de bouche'),
    l('Crème pour appareil dentaire'),
    l('Dentifrice à croquer'),
    l('Dentifrice adulte'),
    l('Dentifrice en poudre'),
    l('Dentifrice enfant'),
    l('Dentifrice sans fluor'),
    l('Dentifrice solide'),
    l('Fil dentaire'),
    l('Haleine'),
  ]),

  b('Hygiène du corps', [
    b('Déodorant', [
      l('Anti-transpirant'),
      l('Déodorant bille'),
      l('Déodorant corporel'),
      l('Déodorant crème'),
      l('Déodorant solide'),
      l('Déodorant spray'),
      l('Déodorant stick'),
      l('Lingettes déodorantes'),
      l("Pierre d'Alun"),
      l('Recharge pour déodorant'),
    ]),
    b('Hygiène intime', [
      l('Déodorant intime'),
      l('Lingettes intime'),
      l('Toilette intime'),
      l('Toilette intime solide'),
    ]),
    l('Papier Toilette Humide'),
    b('Produit de bain', [
      l('Bain moussant'),
      l('Bombe de bain'),
      l('Gel douche'),
      l('Gel douche à reconstituer'),
      l('Gel douche enfant'),
      l('Gel douche familial'),
      l('Gel douche gommant'),
      l('Gel douche homme'),
      l('Huile de Douche'),
      l('Hydratant sous la douche'),
      l('Lingettes nettoyantes mains'),
      l('Mousse de douche'),
      l('Savon liquide'),
      l('Savon noir'),
      l('Savon solide'),
      l('Savon solide exfoliant'),
      l('Sels de bain'),
      l('Shampooing douche 2 en 1'),
    ]),
  ]),

  b('Manucure et pédicure', [
    l('Dissolvant'),
    l('Nail art, faux ongles et accessoires'),
    l('Sèche vernis'),
    l('Soin et traitement des ongles'),
    l('Soins pour cuticules'),
    l('Stylo correcteur de vernis'),
    b('Vernis et base Ongles', [
      l('Base de vernis'),
      l("Durcisseur d'ongles"),
      l('Top coat'),
      l('Vernis à ongles'),
      l('Vernis semi-permanent'),
    ]),
  ]),

  b('Maquillage', [
    l('Accessoires de maquillage'),
    l('Coffret de maquillage'),
    b('Démaquillant', [
      l('Baume démaquillant'),
      l('Coton et disque à démaquiller'),
      l('Crème démaquillante'),
      l('Démaquillant solide'),
      l('Eau Micellaire'),
      l('Gel démaquillant'),
      l('Huile démaquillante'),
      l('Lait démaquillant'),
      l('Lingettes démaquillantes'),
      l('Lotion démaquillante'),
      l('Mousse démaquillante'),
    ]),
    l('Encre et peinture corporelle'),
    l('Fixateur de maquillage'),
    b('Fond de teint et poudre', [
      l('Anti-cernes'),
      l('Base de teint et Primer'),
      l('BB Crème'),
      l('Blush'),
      l('CC Crème'),
      l('Contouring'),
      l('Correcteur de teint / Concealer'),
      l('Crème / Gel teinté'),
      l('DD Crème'),
      l('Enlumineurs et illuminateur de teint'),
      l('Fond de teint'),
      l('Maquillage camouflant corps'),
      l('Papiers matifiants'),
      l('Poudre bronzante / Poudre de soleil'),
      l('Poudre compacte'),
      l('Poudre libre'),
    ]),
    b('Maquillage à lèvres', [
      l('Base lèvres'),
      l('Baume à lèvres teinté'),
      l('Coffret maquillage à lèvres'),
      l('Crayon à lèvres'),
      l('Fixateur maquillage à lèvres'),
      l('Gloss et brillant à lèvres'),
      l('Huile à lèvres'),
      l('Laque et encre à lèvres'),
      l('Rouge à lèvres'),
      l('Top coat lèvres'),
    ]),
    l('Maquillage de fête'),
    b('Maquillage des yeux', [
      l('Base et Primer paupières'),
      l('Base mascara'),
      l('Coffret pour sourcils'),
      l('Crayon à sourcils'),
      l('Crayon yeux et khôl'),
      l('Encre à sourcils'),
      l('Eyeliner et Kajal'),
      l('Fard à paupières'),
      l('Faux cils et accessoires'),
      l('Fixateur de sourcils'),
      l('Mascara'),
      l('Mascara à sourcils et gel'),
      l('Palette sourcils'),
      l('Poudre à sourcils'),
      l('Teinture pour sourcils'),
    ]),
    l('Paillettes'),
    l('Palette de maquillage'),
    l('Tatouages éphémères'),
  ]),

  b('Parfum', [
    b('Parfum mixte', [
      l('Brume parfumée mixte'),
      l('Coffret parfum mixte'),
      l('Eau de Cologne mixte'),
      l('Eau de parfum mixte'),
      l('Eau de toilette mixte'),
      l('Eau fraîche mixte'),
      l('Parfum solide mixte'),
    ]),
    l('Parfum pour bébé'),
    l('Parfum pour cheveux'),
    b('Parfum pour enfant', [
      l('Brume parfumée pour enfant'),
      l('Coffret parfum pour enfant'),
      l('Eau de Cologne pour enfant'),
      l('Eau de parfum pour enfant'),
      l('Eau de toilette pour enfant'),
      l('Eau fraîche pour enfant'),
      l('Parfum solide pour enfant'),
    ]),
    b('Parfum pour femme', [
      l('Brume parfumée pour femme'),
      l('Coffret parfum pour femme'),
      l('Eau de cologne pour femme'),
      l('Eau de parfum pour femme'),
      l('Eau de toilette pour femme'),
      l('Eau fraîche pour femme'),
      l('Lingettes parfumées pour femme'),
      l('Parfum solide pour femme'),
    ]),
    b('Parfum pour homme', [
      l('Brume parfumée pour homme'),
      l('Coffret parfum pour homme'),
      l('Eau de Cologne pour homme'),
      l('Eau de parfum pour homme'),
      l('Eau de toilette pour homme'),
      l('Eau fraîche pour homme'),
    ]),
  ]),

  b('Produit solaire', [
    l('Après soleil'),
    l('Autobronzant'),
    l('Baume à lèvres solaire'),
    l('Crème solaire'),
    l('Graisse à traire'),
    l('Huile de bronzage'),
    l('Préparateur bronzage'),
  ]),

  b('Rasage et épilation', [
    b('Après-rasage', [
      l('Après-rasage solide'),
      l('Baume après-rasage'),
      l('Gel après-rasage'),
      l('Lotion après-rasage'),
    ]),
    b('Épilation et cire', [
      l('Accessoires épilation'),
      l('Bandes de cire froide corps'),
      l('Bandes de cire froide maillot & aisselles'),
      l('Bandes de cire froide visage'),
      l('Cire en pain et galet'),
      l('Cire en perles'),
      l('Cire en pot'),
      l('Cire orientale'),
      l('Cire roll-on'),
      l('Crème décolorante'),
      l('Crème dépilatoire corps'),
      l('Crème dépilatoire maillot & aisselles'),
      l('Crème dépilatoire visage'),
      l('Épilation du visage'),
      l('Soin anti-repousse poils'),
      l('Soin poils incarnés'),
      l('Soin post épilation'),
      l('Soin préparateur épilation'),
      l('Sucre à épiler'),
    ]),
    l('Huile de rasage'),
    l('Lames de rasoir'),
    b('Mousse et gel de rasage', [
      l('Crème à raser'),
      l('Gel à raser'),
      l('Gel et mousse à raser corps'),
      l('Mousse à raser'),
      l('Savon à raser'),
      l('Soin spécifique pour le rasage'),
      l('Stick à raser'),
    ]),
    l('Rasoir barbe'),
    l('Rasoir corps'),
    b('Soin de la barbe', [
      l('Accélérateur de pousse'),
      l('Après-shampoing pour barbe'),
      l('Baume et hydratant à barbe'),
      l('Cire pour barbe & moustache'),
      l('Coffret rasage et barbe'),
      l('Huile à barbe'),
      l('Shampooing et savon à barbe'),
      l('Soin spécifique pour barbe'),
      l('Teinture pour barbe'),
    ]),
  ]),

  b('Santé', [
    l('Gel hydroalcoolique'),
    l('Parapharmacie'),
    l('Répulsif anti-insectes'),
  ]),

  b('Soin du corps et visage', [
    l('Argile et Ghassoul'),
    l("Calendrier de l'avent"),
    b('Crème hydratante', [
      l('Baume hydratant solide'),
      l('Beurre de karité'),
      l('Coffret de soins'),
      l('Crème visage'),
      l('Gel aloé vera'),
      l('Huile hydratante pour le corps'),
      l('Huile hydratante pour le visage'),
      l('Hydratant pour le corps'),
      l('Hydratant visage et corps'),
      l('Hydratant visage nuit'),
      l('Sérum hydratant visage'),
    ]),
    l('DIY - À faire soi-même'),
    l('Eaux Thermales / Brumes'),
    b('Masque et gommage', [
      l('Disques exfoliant'),
      l('Gommage corps'),
      l('Gommage Visage'),
      l('Gommage Visage et corps'),
      l('Masque Crème / Gel'),
      l('Masque tissu'),
    ]),
    b('Nettoyant visage', [
      l('Baume nettoyant visage'),
      l('Crème nettoyante visage'),
      l('Gel nettoyant visage'),
      l('Huile nettoyante visage'),
      l('Lait nettoyant visage'),
      l('Lingettes nettoyantes visage'),
      l('Lotion nettoyante visage'),
      l('Mousse nettoyante visage'),
      l('Nettoyant solide'),
      l('Stick nettoyant visage'),
      l('Tonique visage'),
    ]),
    l('Régime et Minceur'),
    b('Soin acné et imperfection', [
      l('Masque anti-imperfections'),
      l('Nettoyant anti-imperfections'),
      l('Patchs anti-imperfections'),
      l('Sérum anti-imperfections'),
      l('Soin anti-acné et boutons'),
      l('Soin anti-imperfections'),
      l('Soin anti-imperfections corps'),
      l('Soin anti-points noirs'),
      l('Soin anti-rougeurs'),
      l('Soin anti-tâches'),
      l('Soin pour adolescent'),
    ]),
    b('Soin anti-âge', [
      l('Ampoules anti-âge'),
      l('Brume anti-âge'),
      l('Coffret anti-âge'),
      l('Crème anti-âge visage jour'),
      l('Crème anti-âge visage nuit'),
      l('Crème corps anti-âge'),
      l('Crème cou et décolleté anti-âge'),
      l('Crème lèvres anti-âge'),
      l('Crème mains anti-âge / anti-taches'),
      l('Gommage et exfoliant anti-âge'),
      l('Huile anti-âge visage'),
      l('Lotion / Eau de soin anti-âge'),
      l('Masque anti-âge jour'),
      l('Masque anti-âge nuit'),
      l('Masque cou et décolleté anti-âge'),
      l('Masque yeux anti-âge'),
      l('Nettoyants anti-âge'),
      l('Patch anti-âge'),
      l('Sérum corps anti-âge'),
      l('Sérum cou et décolleté anti-âge'),
      l('Sérum visage jour anti-âge'),
      l('Sérum visage nuit anti-âge'),
      l('Sérum yeux anti-âge'),
      l('Soin contour des yeux anti-âge'),
    ]),
    b('Soin anti-cellulite', [
      l('Crème / Gel / Huile anti-cellulite'),
      l('Soin raffermissant corps'),
      l('Textile anti-cellulite'),
    ]),
    l('Soin anti-vergetures'),
    b('Soin des lèvres', [
      l('Baume à lèvres'),
      l('Crème pour les lèvres'),
      l('Gommage des lèvres'),
      l('Masque pour les lèvres'),
      l('Patch à lèvres'),
      l('Soins spécifiques pour les lèvres'),
    ]),
    b('Soin des mains', [
      l('Coffret pour les mains'),
      l('Crème pour les mains'),
      l('Gommage pour les mains'),
      l('Masque pour les mains'),
    ]),
    b('Soin des pieds et jambes', [
      l('Bain de pieds'),
      l('Déodorant pour les pieds'),
      l('Gommage / Exfoliant pieds'),
      l('Hydratants pour les pieds'),
      l('Masque pour les pieds'),
      l('Soin anti-callosités'),
      l('Soin fissures et crevasses'),
      l('Soin jambes lourdes'),
      l('Soin spécifique pour jambes et pieds'),
    ]),
    b('Soin des yeux', [
      l('Anti-poches / Anti-cernes'),
      l('Masque contour des yeux'),
      l('Patch contour des yeux'),
      l('Soin contour des yeux'),
      l('Soin des cils et sourcils'),
      l('Soins spécifiques'),
    ]),
    b('Soin du buste', [
      l('Crème pour le buste'),
      l('Huile pour le buste'),
      l('Sérum pour le buste'),
    ]),
    l('Soin intime'),
    b('Soin pour homme', [
      l('Anti-âge homme'),
      l('Anti-cernes homme'),
      l('Anti-imperfections homme'),
      l('Coffret de soins pour homme'),
      l('Épilation homme'),
      l('Gel et laque homme'),
      l('Gommage / exfoliant homme'),
      l('Hydratant corps homme'),
      l('Hydratant visage homme'),
      l('Masque homme'),
      l('Nettoyant visage homme'),
    ]),
    l('Talc et poudre adulte'),
  ]),

  b('Soin et hygiène bébé', [
    l('Lingettes bébé'),
    b('Shampooing et savon bébé', [
      l('Bain moussant bébé'),
      l('Coffret bébé'),
      l('Gel et crème de douche bébé'),
      l('Huile de bain bébé'),
      l('Mousse lavante bébé'),
      l('Savon solide bébé'),
      l('Shampooing bébé'),
      l('Shampooing douche 2 en 1 bébé'),
    ]),
    b('Soin bébé', [
      l('Coffret de soin bébé'),
      l('Crème pour le change'),
      l('Eau nettoyante bébé'),
      l('Huile de massage bébé'),
      l('Huile de soin bébé'),
      l('Hygiène du nez'),
      l('Lait de toilette bébé'),
      l('Lait et crème hydratante bébé'),
      l('Liniment'),
      l('Soin pour croûtes de lait'),
      l('Soin premières dents'),
      l('Soin spécifique pour bébé'),
      l('Talc et poudre bébé'),
    ]),
    b('Soin de grossesse', [
      l('Autres soins de grossesse'),
      l('Coffrets de grossesse'),
      l('Soin des mamelons'),
      l('Soin du périnée'),
      l('Soin raffermissant'),
    ]),
  ]),
] as const

// ─── Icônes par catégorie L1 ──────────────────────────────────────────────────

export const CATEGORY_ICONS: Record<string, string> = {
  'Bien-être':             'heart-outline',
  'Coiffure':              'cut-outline',
  'Hygiène dentaire':      'medkit-outline',
  'Hygiène du corps':      'water-outline',
  'Manucure et pédicure':  'hand-left-outline',
  'Maquillage':            'color-palette-outline',
  'Parfum':                'flower-outline',
  'Produit solaire':       'sunny-outline',
  'Rasage et épilation':   'remove-outline',
  'Santé':                 'fitness-outline',
  'Soin du corps et visage': 'body-outline',
  'Soin et hygiène bébé':  'person-outline',
}

export const DEFAULT_CATEGORY_ICON = 'pricetag-outline'

// ─── Utilitaires de slug ──────────────────────────────────────────────────────

/**
 * Convertit un nom d'affichage en slug DB.
 * Exemples :
 *   "Shampooing classique"          → "shampooing-classique"
 *   "Coloration capillaire d'oxydation" → "coloration-capillaire-d-oxydation"
 *   "Masque Crème / Gel"            → "masque-creme-gel"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // supprime les diacritiques (é→e, etc.)
    .replace(/['']/g, ' ')           // apostrophe → séparateur de mots
    .replace(/\s*\/\s*/g, '-')       // " / " → "-"
    .replace(/[^a-z0-9\s-]/g, '')   // supprime tout autre caractère spécial
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')             // collapse double tirets
}

/**
 * Construit le slug DB complet depuis le chemin de navigation.
 * Ex: ["Coiffure", "Shampooing", "Shampooing classique"]
 *   → "coiffure/shampooing/shampooing-classique"
 */
export function pathToSlug(path: readonly string[]): string {
  return path.map(nameToSlug).join('/')
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/** Trouve le nœud correspondant à un chemin dans l'arbre. */
export function findNodeByPath(
  path: readonly string[],
  tree: readonly CategoryNode[] = CATEGORIES,
): CategoryNode | null {
  if (path.length === 0) return null
  const [head, ...tail] = path
  const node = tree.find((n) => n.name === head)
  if (!node) return null
  if (tail.length === 0) return node
  return findNodeByPath(tail, node.children ?? [])
}

/** Retourne les enfants du nœud courant (ou les catégories racine si chemin vide). */
export function getChildrenAtPath(path: readonly string[]): readonly CategoryNode[] {
  if (path.length === 0) return CATEGORIES
  const node = findNodeByPath(path)
  return node?.children ?? []
}

/** Retourne true si le nœud courant est une feuille (aucun enfant). */
export function isLeafPath(path: readonly string[]): boolean {
  if (path.length === 0) return false
  const node = findNodeByPath(path)
  return !!node && (!node.children || node.children.length === 0)
}
