# DATA MODELS — CosmeCheck Mobile

> Types TypeScript complets et schéma Supabase pour l'application CosmeCheck.
> Ces types correspondent aux tables Supabase de CosmetWiki.

---

## 1. Types TypeScript

### Utilisateur & Profil

```typescript
/** Profil utilisateur complet */
interface UserProfile {
  id: string                    // UUID, FK vers auth.users
  email: string
  first_name: string | null
  avatar_url: string | null
  subscription_tier: 'free' | 'premium'
  credits_remaining: number
  preferences: UserPreferences  // JSONB
  restrictions: UserRestrictions | null  // JSONB
  created_at: string            // ISO timestamp
  updated_at: string
}

/** Préférences beauté (stockées en JSONB dans user_profiles) */
interface UserPreferences {
  // Étape 1 — Type de peau
  skinType: {
    face: 'seche' | 'mixte' | 'grasse' | 'sensible' | 'normale' | null
    body: 'seche' | 'tres_seche' | 'normale' | 'sensible' | 'mixte' | null
    hair: 'secs' | 'gras' | 'cuir_chevelu_sensible' | null
  }
  // Étape 2 — Préoccupations
  concerns: {
    skin: SkinConcern[]
    hair: HairConcern[]
    allergies: string           // texte libre
  }
  // Étape 3 — Objectifs
  goals: BeautyGoal[]
  // Métadonnées
  onboarding_completed: boolean
  onboarding_step: 1 | 2 | 3
}

type SkinConcern =
  | 'acne' | 'rides' | 'taches' | 'secheresse' | 'rougeurs'
  | 'sensibilite' | 'pores' | 'sebum' | 'cernes' | 'vergetures'

type HairConcern =
  | 'chute' | 'brillance' | 'hydratation' | 'frisottis' | 'pellicules'

type BeautyGoal =
  | 'peau_douce' | 'teint_uniforme' | 'anti_age' | 'eclat'
  | 'hydratation_intense' | 'pores_reduits' | 'controle_sebum'
  | 'confort' | 'brillance_cheveux' | 'pousse_cheveux'

/** Restrictions / allergies utilisateur */
interface UserRestrictions {
  allergies_freeform: string    // texte libre
  ingredient_families_to_avoid: IngredientFamily[]
  favorite_ingredients: string[]  // noms INCI
}

type IngredientFamily =
  | 'alcools' | 'parabenes' | 'silicones' | 'sulfates' | 'parfums'
  | 'colorants' | 'conservateurs' | 'huiles_minerales' | 'peg'
  | 'formaldehyde' | 'phenoxyethanol' | 'acide_benzoique'
  | 'propylene_glycol' | 'lanoline' | 'methylisothiazolinone'
  | 'triclosan' | 'bha_bht' | 'retinol' | 'acide_salicylique'
  | 'nanoparticules'
```

### Analyses INCI

```typescript
/** Analyse complète d'un produit */
interface Analysis {
  id: string                    // UUID
  user_id: string               // FK vers auth.users
  created_at: string
  product_name: string | null
  brand: string | null
  barcode: string | null
  source: AnalysisSource
  inci_raw: string              // liste INCI brute
  result: AnalyseResponse       // JSONB — résultat complet
}

type AnalysisSource = 'barcode' | 'ocr' | 'search' | 'manual'

/** Réponse complète de l'API d'analyse */
interface AnalyseResponse {
  score: number                 // 0-20
  colorRating: ColorRating
  label: 'excellent' | 'bon' | 'acceptable' | 'a_ameliorer'
  spectrum: AnalyseSpectrum
  ingredients: AnalyseItem[]
  observations: Observation[]
  euFragranceAllergens: string[]
  aiSummary: string
  essentialView: string[]       // 3-5 points clés vulgarisés
}

type ColorRating = 'vert' | 'jaune' | 'orange' | 'rouge'

interface AnalyseSpectrum {
  vert: number                  // pourcentage
  jaune: number
  orange: number
  rouge: number
  top5: AnalyseItem[]
  top10: AnalyseItem[]
}

interface AnalyseItem {
  position: number              // n° dans la liste INCI
  inci_name: string             // nom INCI officiel
  fr_name: string               // traduction française
  color_rating: ColorRating
  score: number                 // score individuel
  functions: string[]           // ex: ['Hydratant', 'Émollient']
  tags: string[]                // ex: ['#allergène', '#naturel']
  is_restricted: boolean        // si dans les restrictions user
  is_eu_fragrance_allergen: boolean
  slug: string                  // pour navigation vers /ingredient/[slug]
}

interface Observation {
  type: 'warning' | 'info' | 'positive'
  label: string
  ingredients: string[]         // ingrédients concernés
  tag: string                   // ex: "#endocrinien", "#comedogene"
}
```

### Routine

```typescript
/** Produit dans la routine beauté */
interface RoutineItem {
  id: string
  user_id: string
  analysis_id: string           // FK vers analyses
  added_at: string
  frequency: 'matin' | 'soir' | 'matin_soir'
  is_active: boolean
  order_index: number
  // Champs dénormalisés pour perf
  product_name: string
  brand: string | null
  score: number
  color_rating: ColorRating
}

/** Métriques d'exposition de la routine */
interface RoutineExposureMetrics {
  cumulative_score: number      // score global de la routine
  products_count: number
  family_exposure: FamilyExposure[]
  worst_product: RoutineItem | null
  simulated_score_without_worst: number | null
}

interface FamilyExposure {
  family: string                // ex: "Conservateurs"
  exposure_level: number        // 0-20
  color_rating: ColorRating
  ingredients: string[]         // ingrédients concernés
}
```

### Analyses Cohérence / Promesses

```typescript
/** Analyse de cohérence marketing */
interface CoherenceAnalysis {
  id: string
  user_id: string
  created_at: string
  product_name: string
  marketing_claims_raw: string  // texte brut des promesses
  analysis_id: string | null    // FK vers analyse INCI si liée
  result: CoherenceResult       // JSONB
}

interface CoherenceResult {
  overall_verdict: ColorRating
  promises: PromiseVerdict[]
  ai_summary: string
}

interface PromiseVerdict {
  claim: string                 // la promesse marketing
  verdict: ColorRating
  explanation: string           // explication courte
  supporting_ingredients: string[]  // ingrédients qui soutiennent/contredisent
}
```

### Ingrédients (référentiel)

```typescript
/** Ingrédient dans le référentiel global */
interface Ingredient {
  id: string
  slug: string                  // ex: "aqua", "glycerin"
  inci_name: string             // nom officiel INCI
  fr_name: string               // traduction française
  color_rating: ColorRating
  score: number                 // score global (référentiel)
  functions: string[]
  tags: string[]
  description_fr: string | null
  is_eu_fragrance_allergen: boolean
  is_endocrine_disruptor: boolean
  cosdna_id: string | null
  cosing_ref: string | null
  updated_at: string
}
```

---

## 2. Schéma Supabase

### Tables

#### `user_profiles`
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  credits_remaining INTEGER NOT NULL DEFAULT 3,
  preferences JSONB NOT NULL DEFAULT '{}',
  restrictions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
```

#### `analyses`
```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_name TEXT,
  brand TEXT,
  barcode TEXT,
  source TEXT CHECK (source IN ('barcode', 'ocr', 'search', 'manual')),
  inci_raw TEXT NOT NULL,
  result JSONB NOT NULL
);

CREATE INDEX analyses_user_id_created_at ON analyses(user_id, created_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own analyses" ON analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON analyses FOR DELETE USING (auth.uid() = user_id);
```

#### `routine_items`
```sql
CREATE TABLE routine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frequency TEXT NOT NULL DEFAULT 'matin_soir' CHECK (frequency IN ('matin', 'soir', 'matin_soir')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL,
  brand TEXT,
  score NUMERIC(4,2),
  color_rating TEXT CHECK (color_rating IN ('vert', 'jaune', 'orange', 'rouge'))
);

ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own routine" ON routine_items USING (auth.uid() = user_id);
```

#### `coherence_analyses`
```sql
CREATE TABLE coherence_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_name TEXT NOT NULL,
  marketing_claims_raw TEXT NOT NULL,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  result JSONB NOT NULL
);

ALTER TABLE coherence_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own coherence analyses" ON coherence_analyses USING (auth.uid() = user_id);
```

#### `ingredients`
```sql
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  inci_name TEXT NOT NULL,
  fr_name TEXT NOT NULL,
  color_rating TEXT CHECK (color_rating IN ('vert', 'jaune', 'orange', 'rouge')),
  score NUMERIC(4,2),
  functions TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  description_fr TEXT,
  is_eu_fragrance_allergen BOOLEAN DEFAULT false,
  is_endocrine_disruptor BOOLEAN DEFAULT false,
  cosdna_id TEXT,
  cosing_ref TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table publique (lecture seule pour users authentifiés)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ingredients" ON ingredients FOR SELECT TO authenticated USING (true);
```

### Fonctions RPC

```sql
-- Récupérer les crédits restants de l'utilisateur courant
CREATE FUNCTION cosme_check_get_credits()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT credits_remaining FROM user_profiles WHERE id = auth.uid();
$$;

-- Décrémenter les crédits (appelée lors d'une analyse)
CREATE FUNCTION cosme_check_use_credit()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits_remaining INTO current_credits
  FROM user_profiles WHERE id = auth.uid();

  IF current_credits <= 0 THEN
    RETURN false;
  END IF;

  UPDATE user_profiles
  SET credits_remaining = credits_remaining - 1
  WHERE id = auth.uid();

  RETURN true;
END;
$$;
```

---

## 3. Types de navigation

```typescript
/** Paramètres des routes Expo Router */

// /analyse/[id]
type AnalyseRouteParams = {
  id: string
}

// /promesses/[id]
type PromesseRouteParams = {
  id: string
}

// /ingredient/[slug]
type IngredientRouteParams = {
  slug: string
}

// /compare — passé via query params ou store global
type CompareRouteParams = {
  ids: string[]  // 2 à 3 IDs d'analyses
}
```

---

## 4. Types de l'état local (Stores Zustand)

```typescript
/** Store d'authentification */
interface AuthStore {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  setSession: (session: Session | null) => void
  signOut: () => Promise<void>
}

/** Store de scan en cours */
interface ScanStore {
  pendingInci: string | null
  pendingSource: AnalysisSource | null
  pendingProductName: string | null
  setPendingInci: (inci: string, source: AnalysisSource, name?: string) => void
  clearPending: () => void
}

/** Store de comparaison */
interface CompareStore {
  selectedAnalysisIds: string[]
  addToCompare: (id: string) => void
  removeFromCompare: (id: string) => void
  clearCompare: () => void
}
```

---

## 5. Types API externe

```typescript
/** Requête vers l'API /api/analyser de CosmetWiki */
interface AnalyseApiRequest {
  inci_input: string
  product_name?: string
  user_id?: string              // pour personnalisation selon profil
}

/** Réponse de l'API /api/analyser */
type AnalyseApiResponse = AnalyseResponse  // cf. section 1

/** Réponse de l'API /api/coherence */
interface CoherenceApiRequest {
  product_name: string
  marketing_claims: string
  inci_input?: string
}

type CoherenceApiResponse = CoherenceResult
```
