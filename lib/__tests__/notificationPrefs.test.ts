/**
 * Préférences de notifications (lib/notifications/prefs.ts).
 *
 * POURQUOI ces tests : `preferences.notifications` est un jsonb libre écrit
 * potentiellement par le web ou d'anciennes versions ; la lecture doit être
 * indestructible (types faux, bornes dépassées, objet absent) et retomber sur
 * des défauts sûrs (notifications OFF par défaut : opt-in explicite). On
 * verrouille aussi le prédicat shouldShowEnableCard : jamais de carte si déjà
 * vue, permission déjà accordée, ou module natif absent (OTA pré-rebuild).
 */

import {
  DEFAULT_NOTIFICATION_PREFS,
  readNotificationPrefs,
  shouldShowEnableCard,
  type NotificationPrefs,
} from '@/lib/notifications/prefs'

describe('readNotificationPrefs : défauts', () => {
  it('null -> défauts complets (enabled false, dimanche 18h, conflits true)', () => {
    expect(readNotificationPrefs(null)).toEqual({
      enabled: false,
      bilanWeekday: 7,
      bilanHour: 18,
      conflictAlerts: true,
      suiviProduit: false,
      promptSeen: false,
    })
  })

  it('undefined et objet vide -> mêmes défauts', () => {
    expect(readNotificationPrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(readNotificationPrefs({})).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('ne renvoie jamais l objet DEFAULT partagé (pas de mutation possible)', () => {
    expect(readNotificationPrefs(null)).not.toBe(DEFAULT_NOTIFICATION_PREFS)
  })
})

describe('readNotificationPrefs : coercition défensive', () => {
  it('clampe bilanWeekday dans 1..7 (9 -> 7, 0 -> 1)', () => {
    expect(readNotificationPrefs({ bilanWeekday: 9 }).bilanWeekday).toBe(7)
    expect(readNotificationPrefs({ bilanWeekday: 0 }).bilanWeekday).toBe(1)
  })

  it('clampe bilanHour dans 0..23 (42 -> 23, -3 -> 0)', () => {
    expect(readNotificationPrefs({ bilanHour: 42 }).bilanHour).toBe(23)
    expect(readNotificationPrefs({ bilanHour: -3 }).bilanHour).toBe(0)
  })

  it('arrondit les nombres non entiers dans les bornes', () => {
    expect(readNotificationPrefs({ bilanWeekday: 2.6 }).bilanWeekday).toBe(3)
    expect(readNotificationPrefs({ bilanHour: 18.2 }).bilanHour).toBe(18)
  })

  it('types faux -> défauts champ par champ', () => {
    const prefs = readNotificationPrefs({
      enabled: 'true', // string, pas boolean
      bilanWeekday: 'dimanche',
      bilanHour: NaN,
      conflictAlerts: 0,
      suiviProduit: {},
      promptSeen: [],
    })
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('champs valides conservés même au milieu de champs corrompus', () => {
    const prefs = readNotificationPrefs({ enabled: true, bilanHour: 'soir' })
    expect(prefs.enabled).toBe(true)
    expect(prefs.bilanHour).toBe(18)
  })

  it('round-trip : un objet valide ressort à l identique', () => {
    const valid: NotificationPrefs = {
      enabled: true,
      bilanWeekday: 3,
      bilanHour: 9,
      conflictAlerts: false,
      suiviProduit: true,
      promptSeen: true,
    }
    expect(readNotificationPrefs({ ...valid })).toEqual(valid)
  })
})

describe('shouldShowEnableCard', () => {
  const base = DEFAULT_NOTIFICATION_PREFS // promptSeen false

  it('promptSeen true -> jamais la carte', () => {
    expect(shouldShowEnableCard({ ...base, promptSeen: true }, 'undetermined')).toBe(false)
    expect(shouldShowEnableCard({ ...base, promptSeen: true }, 'denied')).toBe(false)
  })

  it('permission déjà accordée -> pas de carte', () => {
    expect(shouldShowEnableCard(base, 'granted')).toBe(false)
  })

  it('module natif absent (unavailable) -> pas de carte', () => {
    expect(shouldShowEnableCard(base, 'unavailable')).toBe(false)
  })

  it('jamais vue + permission non accordée -> carte affichée', () => {
    expect(shouldShowEnableCard(base, 'undetermined')).toBe(true)
    expect(shouldShowEnableCard(base, 'denied')).toBe(true)
  })
})
