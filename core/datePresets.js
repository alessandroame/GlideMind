/**
 * GlideMind - Phase 4: Smart Date Selector & Calendar Presets Engine
 * 
 * Provides deterministic date calculations tailored for paragliding pilots:
 * 1. Adaptive quick-presets based on the current day of the week:
 *    - Mon-Thu: Oggi, Domani, Sabato, Domenica (zero weekend blind spot).
 *    - Friday: Oggi, Sabato (Domani), Domenica (zero redundant buttons).
 *    - Saturday: Oggi (Sabato), Domani (Domenica), Prossimo Sabato.
 *    - Sunday: Oggi (Domenica), Domani (Lunedì), Prossimo Sabato.
 * 2. Custom date integration: injects an active custom chip if a non-preset date is selected.
 * 3. Atmospheric model horizon assessment (high-res 0-3d, standard 4-7d, synoptic trend > 7d).
 * 4. Past date presets for flight logging (Oggi, Ieri, Ultimo Weekend).
 * 
 * ZERO DOM DEPENDENCIES: 100% pure Node.js headless testable.
 */

const ITALIAN_MONTHS_SHORT = Object.freeze([
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
]);

const ITALIAN_DAYS_FULL = Object.freeze([
  'Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'
]);

const ITALIAN_DAYS_SHORT = Object.freeze([
  'Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'
]);

/**
 * Formats a Date object as YYYY-MM-DD using local calendar date.
 * Avoids UTC timezone shift errors common with date.toISOString().
 * @param {Date} date
 * @returns {string}
 */
export function formatDateIso(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses an ISO date string (YYYY-MM-DD) into a local Date object.
 * Sets time to 12:00:00 (noon) to prevent daylight saving boundary shifts.
 * @param {string} isoStr
 * @returns {Date}
 */
export function parseDateIso(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') {
    return new Date();
  }
  const parts = isoStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

/**
 * Adds an integer number of days to a Date object, returning a new Date.
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
export function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Formats a date into a short human-readable string (e.g. "9 Ott").
 * @param {Date} date
 * @returns {string}
 */
export function formatShortDate(date) {
  const day = date.getDate();
  const month = ITALIAN_MONTHS_SHORT[date.getMonth()];
  return `${day} ${month}`;
}

/**
 * Returns the Italian name of the day of the week.
 * @param {Date} date
 * @param {boolean} [abbreviated=false]
 * @returns {string}
 */
export function getDayName(date, abbreviated = false) {
  const dayIndex = date.getDay();
  return abbreviated ? ITALIAN_DAYS_SHORT[dayIndex] : ITALIAN_DAYS_FULL[dayIndex];
}

/**
 * Calculates the difference in full days between two ISO dates (dateB - dateA).
 * @param {string} isoA
 * @param {string} isoB
 * @returns {number}
 */
export function diffDaysIso(isoA, isoB) {
  const dateA = parseDateIso(isoA);
  const dateB = parseDateIso(isoB);
  const diffMs = dateB.getTime() - dateA.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Classifies forecast horizon reliability according to meteorological numerical models.
 * @param {number} dayOffset Difference in days from today
 * @returns {{ level: 'high_res' | 'standard' | 'synoptic', label: string, isSynoptic: boolean }}
 */
export function classifyForecastHorizon(dayOffset) {
  if (dayOffset <= 2) {
    return {
      level: 'high_res',
      label: 'Alta risoluzione (AROME / ICON-D2)',
      isSynoptic: false
    };
  }
  if (dayOffset <= 6) {
    return {
      level: 'standard',
      label: 'Modello europeo (ECMWF / ICON)',
      isSynoptic: false
    };
  }
  return {
    level: 'synoptic',
    label: 'Tendenza sinottica (Attendibilità ridotta)',
    isSynoptic: true
  };
}

/**
 * Generates smart quick-presets for paragliding pilot planning.
 * 
 * @param {Date|string} [refDate=new Date()] Reference date (defaults to today)
 * @param {string|null} [activeDateIso=null] Currently active ISO date
 * @returns {{
 *   presets: Array<{
 *     isoDate: string,
 *     label: string,
 *     subLabel: string,
 *     isActive: boolean,
 *     isToday: boolean,
 *     isWeekend: boolean,
 *     isCustom?: boolean
 *   }>,
 *   activeDate: string,
 *   activeHorizon: { level: string, label: string, isSynoptic: boolean },
 *   isCustomActive: boolean
 * }}
 */
export function getSmartDatePresets(refDate = new Date(), activeDateIso = null) {
  const ref = (typeof refDate === 'string') ? parseDateIso(refDate) : new Date(refDate.getTime());
  ref.setHours(12, 0, 0, 0);

  const todayIso = formatDateIso(ref);
  const activeIso = activeDateIso || todayIso;
  const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  /** @type {Array<{ isoDate: string, label: string, subLabel: string, isToday: boolean, isWeekend: boolean }>} */
  const presets = [];

  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    // Lunedì, Martedì, Mercoledì, Giovedì
    const satOffset = 6 - dayOfWeek;
    const sunOffset = 7 - dayOfWeek;
    const satDate = addDays(ref, satOffset);
    const sunDate = addDays(ref, sunOffset);
    const tomorrowDate = addDays(ref, 1);

    presets.push({
      isoDate: todayIso,
      label: 'Oggi',
      subLabel: formatShortDate(ref),
      isToday: true,
      isWeekend: false
    });

    presets.push({
      isoDate: formatDateIso(tomorrowDate),
      label: 'Domani',
      subLabel: formatShortDate(tomorrowDate),
      isToday: false,
      isWeekend: false
    });

    presets.push({
      isoDate: formatDateIso(satDate),
      label: 'Sabato',
      subLabel: formatShortDate(satDate),
      isToday: false,
      isWeekend: true
    });

    presets.push({
      isoDate: formatDateIso(sunDate),
      label: 'Domenica',
      subLabel: formatShortDate(sunDate),
      isToday: false,
      isWeekend: true
    });
  } else if (dayOfWeek === 5) {
    // Venerdì: Domani è già Sabato! Non duplicare i pulsanti
    const satDate = addDays(ref, 1);
    const sunDate = addDays(ref, 2);

    presets.push({
      isoDate: todayIso,
      label: 'Oggi',
      subLabel: formatShortDate(ref),
      isToday: true,
      isWeekend: false
    });

    presets.push({
      isoDate: formatDateIso(satDate),
      label: 'Sabato',
      subLabel: formatShortDate(satDate),
      isToday: false,
      isWeekend: true
    });

    presets.push({
      isoDate: formatDateIso(sunDate),
      label: 'Domenica',
      subLabel: formatShortDate(sunDate),
      isToday: false,
      isWeekend: true
    });
  } else if (dayOfWeek === 6) {
    // Sabato: Weekend in corso
    const sunDate = addDays(ref, 1);
    const nextSatDate = addDays(ref, 7);

    presets.push({
      isoDate: todayIso,
      label: 'Oggi',
      subLabel: 'Sabato ' + formatShortDate(ref),
      isToday: true,
      isWeekend: true
    });

    presets.push({
      isoDate: formatDateIso(sunDate),
      label: 'Domani',
      subLabel: 'Domenica ' + formatShortDate(sunDate),
      isToday: false,
      isWeekend: true
    });

    presets.push({
      isoDate: formatDateIso(nextSatDate),
      label: 'Prossimo Sab',
      subLabel: formatShortDate(nextSatDate),
      isToday: false,
      isWeekend: true
    });
  } else {
    // Domenica: Weekend in corso (giorno 2)
    const tomorrowDate = addDays(ref, 1);
    const nextSatDate = addDays(ref, 6);

    presets.push({
      isoDate: todayIso,
      label: 'Oggi',
      subLabel: 'Domenica ' + formatShortDate(ref),
      isToday: true,
      isWeekend: true
    });

    presets.push({
      isoDate: formatDateIso(tomorrowDate),
      label: 'Domani',
      subLabel: 'Lunedì ' + formatShortDate(tomorrowDate),
      isToday: false,
      isWeekend: false
    });

    presets.push({
      isoDate: formatDateIso(nextSatDate),
      label: 'Prossimo Sab',
      subLabel: formatShortDate(nextSatDate),
      isToday: false,
      isWeekend: true
    });
  }

  // Check if activeDate matches any generated preset
  let matchedIndex = presets.findIndex(p => p.isoDate === activeIso);
  let isCustomActive = false;

  if (matchedIndex === -1) {
    // Custom active date chosen by user via calendar picker
    const customDate = parseDateIso(activeIso);
    presets.push({
      isoDate: activeIso,
      label: formatShortDate(customDate),
      subLabel: getDayName(customDate, true),
      isToday: activeIso === todayIso,
      isWeekend: customDate.getDay() === 0 || customDate.getDay() === 6,
      isCustom: true
    });
    matchedIndex = presets.length - 1;
    isCustomActive = true;
  }

  const finalPresets = presets.map((preset, index) => ({
    ...preset,
    isActive: index === matchedIndex
  }));

  const dayOffset = diffDaysIso(todayIso, activeIso);
  const activeHorizon = classifyForecastHorizon(dayOffset);

  return {
    presets: finalPresets,
    activeDate: activeIso,
    activeHorizon,
    isCustomActive
  };
}

/**
 * Returns past date presets for flight logging (Logbook form).
 * @param {Date|string} [refDate=new Date()]
 * @returns {Array<{ isoDate: string, label: string, subLabel: string }>}
 */
export function getPastDatePresets(refDate = new Date()) {
  const ref = (typeof refDate === 'string') ? parseDateIso(refDate) : new Date(refDate.getTime());
  ref.setHours(12, 0, 0, 0);

  const todayIso = formatDateIso(ref);
  const yesterday = addDays(ref, -1);
  const dayOfWeek = ref.getDay(); // 0 = Sun, ..., 6 = Sat

  // Find last Sunday
  let lastSundayOffset = 0;
  if (dayOfWeek === 0) {
    // If today is Sunday, last Sunday was 7 days ago
    lastSundayOffset = -7;
  } else {
    lastSundayOffset = -dayOfWeek;
  }
  const lastSunday = addDays(ref, lastSundayOffset);
  const lastSaturday = addDays(lastSunday, -1);

  const presets = [
    {
      isoDate: todayIso,
      label: 'Oggi',
      subLabel: formatShortDate(ref)
    },
    {
      isoDate: formatDateIso(yesterday),
      label: 'Ieri',
      subLabel: formatShortDate(yesterday)
    }
  ];

  // If yesterday is not already the last Sunday or Saturday, offer them
  if (formatDateIso(yesterday) !== formatDateIso(lastSunday)) {
    presets.push({
      isoDate: formatDateIso(lastSunday),
      label: 'Domenica',
      subLabel: formatShortDate(lastSunday)
    });
  }

  if (formatDateIso(yesterday) !== formatDateIso(lastSaturday)) {
    presets.push({
      isoDate: formatDateIso(lastSaturday),
      label: 'Sabato',
      subLabel: formatShortDate(lastSaturday)
    });
  }

  return presets.slice(0, 4);
}

/**
 * Generates an array of available calendar dates for picker sheets up to maxDays in the future.
 * @param {Date|string} [refDate=new Date()]
 * @param {number} [maxDays=14]
 * @returns {Array<{
 *   isoDate: string,
 *   formatted: string,
 *   dayName: string,
 *   dayNumber: number,
 *   isWeekend: boolean,
 *   horizon: { level: string, label: string, isSynoptic: boolean }
 * }>}
 */
export function getAvailableCalendarDates(refDate = new Date(), maxDays = 14) {
  const ref = (typeof refDate === 'string') ? parseDateIso(refDate) : new Date(refDate.getTime());
  ref.setHours(12, 0, 0, 0);

  const list = [];
  for (let i = 0; i < maxDays; i++) {
    const d = addDays(ref, i);
    const dayOfWeek = d.getDay();
    const iso = formatDateIso(d);
    list.push({
      isoDate: iso,
      formatted: formatShortDate(d),
      dayName: getDayName(d, true),
      dayNumber: d.getDate(),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      horizon: classifyForecastHorizon(i)
    });
  }
  return list;
}
