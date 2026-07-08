/**
 * Planification du rappel de bilan peau (module PUR, zéro API native).
 *
 * QUOI : décide de la forme du trigger de notification du bilan hebdo
 * (répétitif ou one-shot), convertit les jours ISO vers la convention
 * expo-notifications, et fabrique la clé de dédoublonnage des alertes conflit.
 *
 * POURQUOI cette séparation : la vraie programmation passe par
 * expo-notifications (indisponible en environnement de test node et absente
 * des binaires pré-rebuild). Toute la logique de décision est donc isolée ici,
 * testable, et le scheduler natif ne fait qu'exécuter le plan.
 *
 * Règle métier : si le bilan a DÉJÀ été fait cette semaine ISO, on ne veut pas
 * que le trigger hebdo répétitif sonne encore cette semaine ; on programme un
 * one-shot visant la prochaine occurrence (weekday, hour) située STRICTEMENT
 * dans une semaine ISO ultérieure. La réconciliation au boot re-armera ensuite
 * le trigger hebdo répétitif.
 */

import { isoWeekKey, isoWeekday } from '@/lib/skin/week'

export type BilanTriggerPlan =
  /** Trigger hebdo répétitif inexact (weekday ISO 1..7, minute toujours 0). */
  | { kind: 'weekly'; weekday: number; hour: number; minute: number }
  /** One-shot en secondes : saute la semaine ISO en cours (bilan déjà fait). */
  | { kind: 'one-shot'; seconds: number }

/**
 * Calcule le plan de trigger du prochain rappel de bilan.
 *
 * - Bilan NON fait cette semaine ISO (lastBilanWeek différent de
 *   isoWeekKey(now), y compris null) -> trigger hebdo répétitif.
 * - Bilan déjà fait cette semaine -> one-shot dont `seconds` vise la prochaine
 *   occurrence (weekday, hour, minute 0) située dans une semaine ISO
 *   strictement ultérieure. Piège couvert : la prochaine occurrence calendaire
 *   peut encore appartenir à la semaine ISO courante (bilan fait lundi, rappel
 *   le dimanche de la MÊME semaine ; ou frontière d'année où le dimanche
 *   suivant reste dans la semaine 53) -> on avance de 7 jours en 7 jours
 *   jusqu'à changer de semaine ISO.
 */
export function computeNextBilanTrigger(
  now: Date,
  weekday: number,
  hour: number,
  lastBilanWeek: string | null,
): BilanTriggerPlan {
  const currentWeek = isoWeekKey(now)

  if (lastBilanWeek !== currentWeek) {
    return { kind: 'weekly', weekday, hour, minute: 0 }
  }

  // Prochaine occurrence calendaire (heure locale) du couple (weekday, hour).
  const daysAhead = (weekday - isoWeekday(now) + 7) % 7
  let target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysAhead,
    hour,
    0,
    0,
    0,
  )
  if (target.getTime() <= now.getTime()) {
    target = addDays(target, 7)
  }
  // Saute tant qu'on reste dans la semaine ISO courante (bilan déjà fait).
  while (isoWeekKey(target) === currentWeek) {
    target = addDays(target, 7)
  }

  const seconds = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000))
  return { kind: 'one-shot', seconds }
}

/** Ajoute n jours en calendrier LOCAL (préserve l'heure affichée malgré DST). */
function addDays(date: Date, n: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + n,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  )
}

/**
 * Conversion jour ISO (1 = lundi .. 7 = dimanche) vers la convention
 * expo-notifications Calendar (1 = dimanche .. 7 = samedi) : (iso % 7) + 1.
 * Source classique de rappels au mauvais jour : TOUJOURS passer par ici.
 */
export function isoWeekdayToExpo(iso: number): number {
  return (iso % 7) + 1
}

/** Nom normalisé pour la dédup : minuscules, accents retirés, espaces réduits. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Clé de dédoublonnage SYMÉTRIQUE d'une alerte conflit : les deux noms
 * normalisés triés + la clé de semaine. (A, B) et (B, A) donnent la même clé ;
 * une semaine différente redonne droit à une alerte.
 */
export function conflictDedupKey(nameA: string, nameB: string, weekKey: string): string {
  const [first, second] = [normalizeName(nameA), normalizeName(nameB)].sort()
  return `${weekKey}|${first}|${second}`
}
