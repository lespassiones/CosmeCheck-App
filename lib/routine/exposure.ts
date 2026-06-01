/**
 * ⚠️ DÉPRÉCIÉ — modèle "matin/soir" abandonné.
 *
 * L'ancien blueprint de ce fichier décrivait un calcul d'exposition basé sur
 * un poids matin/soir/matin_soir. Ce n'est PAS le modèle du web : la parité
 * impose le modèle daily/weekly/monthly de `lib/routine/engine.ts`
 * (`computeRoutineMetrics`).
 *
 * Aucun code applicatif n'importait les anciennes fonctions (uniquement un
 * commentaire de spec). On conserve donc ce module comme simple ré-export de
 * l'engine canonique pour la compatibilité ascendante des imports
 * `@/lib/routine/exposure`. NE PAS réintroduire le modèle matin/soir.
 */
export {
  computeRoutineMetrics,
  type Frequency,
  type RoutineProduct,
  type RoutineMetrics,
} from "./engine";
