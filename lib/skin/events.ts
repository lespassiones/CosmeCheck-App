/**
 * Score de peau : évènements globaux (DeviceEventEmitter).
 *
 * Point d'accroche découplé pour l'architecte notifications : émis à la fin du
 * TOUT PREMIER bilan (quand `fetchCheckins()` ne renvoyait aucun row avant
 * l'upsert). L'abonné n'importe que cette constante, pas le code de la feature.
 *
 *   DeviceEventEmitter.emit(SKIN_FIRST_BILAN_COMPLETED_EVENT)
 */

export const SKIN_FIRST_BILAN_COMPLETED_EVENT = 'cosmecheck:skin-first-bilan-completed'
