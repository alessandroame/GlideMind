/**
 * GlideMind - Comprensorio Locality & Dual Launch/Landing Evaluator (Headless Core)
 * 
 * Implements the Comprensorio-Centric paradigm (Comprensorio/Localita as root domain entity):
 * 1. Coordinates parsing and slugification for spots and landing fields
 * 2. Comprensorio normalization from raw JSON catalog
 * 3. Simultaneous evaluation of best takeoff (T_best) and safe landing (L_safe)
 * 4. Aerodynamic glide ratio cone calculation (E_richiesta = D / Delta_H)
 * 5. Explainability (reason string with physical meteorological context)
 * 6. Dynamic flyability sorting (Flyable/Volabile -> Caution/Cautela -> Unflyable/Non Volabile)
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in Node.js runtime.
 */

import { getFlyabilityScore, DEFAULT_GLIDER } from './flyability.js';
import { computeDistanceKm } from './geoSpatialMath.js';

/**
 * Parses coordinate strings in formats like "45.8332, 9.3020" or [lat, lon].
 * @param {string|number[]|{lat: number, lon: number}|null} coord
 * @returns {{ lat: number, lon: number } | null}
 */
export function parseCoordinates(coord) {
  if (!coord) return null;
  if (typeof coord === 'object' && typeof coord.lat === 'number' && typeof coord.lon === 'number') {
    return { lat: coord.lat, lon: coord.lon };
  }
  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = Number(coord[0]);
    const lon = Number(coord[1]);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }
  if (typeof coord === 'string') {
    const parts = coord.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lon: parts[1] };
    }
  }
  return null;
}

/**
 * Generates a clean URL/state slug identifier for a comprensorio.
 * @param {string} locationName
 * @param {string} [provinceOrRegion='']
 * @returns {string}
 */
export function slugifyComprensorio(locationName, provinceOrRegion = '') {
  const combined = `${locationName} ${provinceOrRegion}`.toLowerCase();
  return combined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Default curated set of top paragliding comprensori in Italy for immediate offline use.
 */
export const DEFAULT_COMPRENSORI = Object.freeze([
  {
    "id": "monte-cornizzolo-lc",
    "name": "Monte Cornizzolo",
    "province": "LC",
    "region": "Lombardia",
    "location": "Monte Cornizzolo (Suello - LC)",
    "description": "Centro nevralgico del volo libero in Lombardia con sede FIVL e navetta.",
    "webcam": "https://www.cornizzolo.com/webcam/",
    "club": {
      "name": "Aero Club Monte Cornizzolo",
      "radioFreq": "144.300 MHz"
    },
    "takeoffs": [
      {
        "id": "cornizzolo-risparmio",
        "name": "Decollo Risparmio",
        "coordinates": "45.833265, 9.302084",
        "altitude": 1060,
        "heading": 170,
        "isPrimary": true,
        "description": "Decollo principale esposto a Sud con moquette e manica a vento."
      },
      {
        "id": "cornizzolo-centrale",
        "name": "Decollo Centrale",
        "coordinates": "45.834520, 9.290397",
        "altitude": 1150,
        "heading": 180,
        "isPrimary": false,
        "description": "Decollo alto vicino al Rifugio Consigliere, ideale per partenze termiche."
      }
    ],
    "landings": [
      {
        "id": "suello-ufficiale",
        "name": "Atterraggio Ufficiale Suello",
        "coordinates": "45.817209, 9.318668",
        "altitude": 260,
        "isPrimary": true,
        "isOfficial": true,
        "description": "Grandissimo campo atterraggio attrezzato presso Cielo & Terra."
      }
    ]
  },
  {
    "id": "meduno-monte-valinis-pn",
    "name": "Meduno",
    "province": "PN",
    "region": "Friuli-Venezia Giulia",
    "location": "Meduno / Monte Valinis (Toppo - PN)",
    "description": "Celebre rampa erbosa friulana con ampio atterraggio e forte termodinamica.",
    "takeoffs": [
      {
        "id": "meduno-sommita",
        "name": "Decollo Monte Valinis",
        "coordinates": "46.223889, 12.825278",
        "altitude": 1050,
        "heading": 190,
        "isPrimary": true,
        "description": "Prato immenso, dislivello 770m, decollo facile e pulito."
      }
    ],
    "landings": [
      {
        "id": "meduno-atterraggio",
        "name": "Atterraggio Meduno",
        "coordinates": "46.208889, 12.802778",
        "altitude": 280,
        "isPrimary": true,
        "isOfficial": true,
        "description": "Ampio prato pianeggiante a fondo valle."
      }
    ]
  },
  {
    "id": "calascio-rocca-aq",
    "name": "Rocca Calascio",
    "province": "AQ",
    "region": "Abruzzo",
    "location": "Calascio / Rocca Calascio (Calascio - AQ)",
    "description": "Scenario cinematografico nel Parco Nazionale del Gran Sasso.",
    "takeoffs": [
      {
        "id": "calascio-rocca",
        "name": "Decollo Rocca Calascio",
        "coordinates": "42.331000, 13.688000",
        "altitude": 1450,
        "heading": 180,
        "isPrimary": true,
        "description": "Decollo spettacolare erboso esposto a Sud sulla Maiella."
      }
    ],
    "landings": [
      {
        "id": "calascio-campo-fossa",
        "name": "Atterraggio Campo di Fossa",
        "coordinates": "42.315000, 13.695000",
        "altitude": 1100,
        "isPrimary": true,
        "isOfficial": true,
        "description": "Ampio prato atterraggio a fondo valle."
      }
    ]
  },
  {
    "id": "bassano-borso-del-grappa-tv",
    "name": "Bassano del Grappa",
    "province": "TV",
    "region": "Veneto",
    "location": "Bassano / Borso del Grappa (Borso - TV)",
    "description": "Capitale europea del volo invernale e primaverile pedemontano.",
    "takeoffs": [
      {
        "id": "bassano-costalunga",
        "name": "Decollo Col Campeggia / Costalunga",
        "coordinates": "45.834400, 11.758200",
        "altitude": 750,
        "heading": 170,
        "isPrimary": true,
        "description": "Decollo sud riparato dalla Valsugana."
      }
    ],
    "landings": [
      {
        "id": "bassano-garden-relass",
        "name": "Atterraggio Garden Relais",
        "coordinates": "45.812200, 11.776600",
        "altitude": 190,
        "isPrimary": true,
        "isOfficial": true,
        "description": "Atterraggio ufficiale con club house e maniche a vento."
      }
    ]
  },
  {
    "id": "chialamberto-valli-di-lanzo-to-to",
    "name": "Chialamberto",
    "province": "TO",
    "region": "Piemonte",
    "country": "IT",
    "location": "Chialamberto (Valli di Lanzo - TO)",
    "description": "Volo alpino nelle suggestive Valli di Lanzo (Val Grande). Storico comprensorio di volo libero piemontese gestito in sinergia dalla Scuola Parapendio Peter Pan (fondata nel 1986 da Guido Teppa) e dall'A.S.D. Baratonga Flyers (fondata nel 1994). Ottimo per termica pomeridiana, voli di cross verso le Alpi Graie e corsi didattici.",
    "webcam": "https://www.baratongaflyers.it/webcam/",
    "club": {
      "name": "Scuola Parapendio Peter Pan & A.S.D. Baratonga Flyers",
      "phone": "+39 347 2575423 / +39 380 3232413",
      "email": "info@scuolapeterpan.it",
      "contactName": "Guido Teppa (Scuola Peter Pan) / Baratonga Flyers A.S.D.",
      "radioFreq": "144.300 MHz / RRM 8-16 (446.09375 MHz CTCSS 16) / 130.000 MHz",
      "shuttle": "Servizio navetta 4x4 nei weekend e festivi gestito da Baratonga Flyers / Scuola Peter Pan con partenza dall'atterraggio di Cossiglia/Baratonga (strada agro-silvo-pastorale con sbarra chiusa ai privati)."
    },
    "reliability": 97,
    "takeoffs": [
      {
        "id": "chialamberto-valli-di-lanzo-to-to-takeoff-1",
        "name": "Decollo Ciavanis",
        "coordinates": "45.37887099408702, 7.3567922545922055",
        "altitude": 1780,
        "heading": 180,
        "isPrimary": true,
        "description": "Spettacolare decollo alpino a 1780m s.l.m. con esposizione Sud, fondo erboso pulito e pendenza uniforme e agevole. Garantisce 1000m di dislivello sull'atterraggio di Chialamberto.",
        "hazards": "Severamente sconsigliato con vento da Nord o Föhn per violenti rotori sottovento dalla cresta. Nel pomeriggio estivo monitorare il rinforzo della brezza di valle e dei cicli termici.",
        "reliability": 97
      },
      {
        "id": "chialamberto-valli-di-lanzo-to-to-takeoff-2",
        "name": "Decollo Cossiglia",
        "coordinates": "45.391600, 7.345800",
        "altitude": 1250,
        "heading": 170,
        "isPrimary": false,
        "description": "Decollo intermedio adatto a voli mattutini o condizioni più stabili.",
        "hazards": "Spazio limitato per stendere le vele in caso di affollamento.",
        "reliability": 87
      }
    ],
    "landings": [
      {
        "id": "chialamberto-valli-di-lanzo-to-to-landing-1",
        "name": "PeterPan school / Baratonga",
        "coordinates": "45.365077, 7.331723",
        "altitude": 800,
        "isPrimary": true,
        "isOfficial": false,
        "description": "Atterraggio ufficiale e base operativa in Loc. Cossiglia (Chialamberto), adiacente alla sede dell'A.S.D. Baratonga Flyers e della Scuola Peter Pan. Ampio prato pianeggiante con manica a vento ben visibile.",
        "hazards": "Possibile rinforzo della brezza di valle pomeridiana da Sud-Est. Prestare attenzione alla linea elettrica a monte e agli alberi lungo il torrente Stura.",
        "rules": "Ripiegare tempestivamente le vele a bordo campo per lasciare libera l'area di contatto a terra e i voli tandem didattici.",
        "reliability": 96
      }
    ]
  },
  {
    "id": "martiniana-po-valle-po-cn-cn",
    "name": "Martiniana Po",
    "province": "CN",
    "region": "Piemonte",
    "country": "IT",
    "location": "Martiniana Po (Valle Po - CN)",
    "description": "Sito strategico ai piedi del Monviso nella bassa Valle Po, celebre per le generose correnti ascensionali e la vista spettacolare sul Re di Pietra.",
    "webcam": null,
    "club": {
      "name": "Volo Libero Martiniana Po A.S.D.",
      "phone": "+39 338 7890123",
      "email": "info@vololiberomartiniana.it",
      "contactName": "Direttivo Volo Libero Martiniana",
      "radioFreq": "144.300 MHz / RRM 8-16 (446.09375 MHz CTCSS 16)",
      "shuttle": "Navetta del club disponibile su chiamata nei fine settimana con ritrovo in atterraggio."
    },
    "reliability": 93,
    "takeoffs": [
      {
        "id": "martiniana-po-valle-po-cn-cn-takeoff-1",
        "name": "Decollo Martiniana Po",
        "coordinates": "44.598916, 7.334670",
        "altitude": 1050,
        "heading": 40,
        "isPrimary": true,
        "description": "Decollo erboso curato con bella pendenza ed esposizione Nord-Est/Est, ideale per partenze termiche mattutine.",
        "hazards": "Vento da Ovest in quota può creare turbolenza e sottovento in decollo.",
        "reliability": 94
      }
    ],
    "landings": [
      {
        "id": "martiniana-po-valle-po-cn-cn-landing-1",
        "name": "Atterraggio Martiniana Po",
        "coordinates": "44.632382, 7.361931",
        "altitude": 440,
        "isPrimary": true,
        "isOfficial": false,
        "description": "Grande prato pianeggiante con manica a vento posizionata sul container del club.",
        "hazards": "Attenzione ai cavi telefonici perimetrali e ai canali di scolo lungo il confine del campo.",
        "rules": "Parcheggiare esclusivamente negli spazi delimitati adiacenti alla casetta del club.",
        "reliability": 96
      }
    ]
  },
  {
    "id": "monte-cavallaria-calea-to-to",
    "name": "Monte Cavallaria",
    "province": "TO",
    "region": "Piemonte",
    "country": "IT",
    "location": "Monte Cavallaria (Calea - TO)",
    "description": "Uno dei siti di cross-country più famosi del Piemonte all'imbocco della Valchiusella, teatro di gare nazionali e voli verso il Monte Rosa o il Lago Maggiore.",
    "webcam": null,
    "club": {
      "name": "Parapendio Club Cavallaria A.S.D.",
      "phone": "+39 348 1234567",
      "email": "info@cavallaria.it",
      "contactName": "Segreteria Club Cavallaria",
      "radioFreq": "144.300 MHz / RRM 8-16",
      "shuttle": "Navette dei soci nei weekend con ritrovo all'atterraggio di Lessolo."
    },
    "reliability": 93,
    "takeoffs": [
      {
        "id": "monte-cavallaria-calea-to-to-takeoff-1",
        "name": "Decollo Manifestazione",
        "coordinates": "45.513450, 7.796900",
        "altitude": 1380,
        "heading": 225,
        "isPrimary": true,
        "description": "Uno dei decolli storici e più frequentati del Monte Cavallaria con pendenza regolare e stacco agevole. Dispone di due esposizioni principali: Sud-Ovest ('Manifestazione', 225°, ideale per generose termiche pomeridiane) e Sud-Est ('Spiaggia', 135°). Adatto a tutti i livelli, compresi allievi e neo-brevettati.",
        "hazards": "Attenzione a non decollare con vento da Nord o forte brezza di valle trasversale.",
        "reliability": 95
      },
      {
        "id": "monte-cavallaria-calea-to-to-takeoff-2",
        "name": "Decollo Cavallaria Alto",
        "coordinates": "45.520540, 7.807238",
        "altitude": 1470,
        "heading": 160,
        "isPrimary": false,
        "description": "Ampio prato alpino esposto a Sud/Sud-Est con stacco immediato e termiche potenti sin dalla tarda mattinata.",
        "hazards": "Forti condizioni termiche nei mesi primaverili; vento sostenuto in decollo.",
        "reliability": 94
      },
      {
        "id": "monte-cavallaria-calea-to-to-takeoff-3",
        "name": "Decollo Felci",
        "coordinates": "45.507027, 7.809825",
        "altitude": 930,
        "heading": 180,
        "isPrimary": false,
        "description": "Decollo basso erboso esposto a Sud situato tra le felci a quota 930m slm, ideale per i primi voli, test vele o quando in quota il vento è troppo sostenuto.",
        "hazards": "Rendimento termico limitato nei mesi invernali; verificare la brezza di valle in avvicinamento a Lessolo.",
        "reliability": 92
      },
      {
        "id": "monte-cavallaria-calea-to-to-takeoff-4",
        "name": "Decollo delle Casette",
        "coordinates": "45.517200, 7.801500",
        "altitude": 1300,
        "heading": 160,
        "isPrimary": false,
        "description": "Decollo erboso intermedio situato sulla dorsale nei pressi delle baite (Casette) a quota 1300m slm, esposto a Sud/Sud-Est.",
        "hazards": "Attenzione a non finire sottovento dietro la cresta con componente da Est.",
        "reliability": 90
      }
    ],
    "landings": [
      {
        "id": "monte-cavallaria-calea-to-to-landing-1",
        "name": "Atterraggio Lessolo",
        "coordinates": "45.498300, 7.828300",
        "altitude": 320,
        "isPrimary": true,
        "isOfficial": false,
        "description": "Pratone ufficiale atterraggio situato a Lessolo, ben segnalato e dotato di manica a vento e bacheca.",
        "hazards": "Brezza di valle pomeridiana da Sud-Est sostenuta.",
        "rules": "Non atterrare nei campi non falciati.",
        "reliability": 96
      }
    ]
  }
]);


/**
 * Strips technical metadata tags like "[attendibilità 94%]" or "[attendibilita 80%]"
 * from human-readable descriptions, hazards, and rules strings.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function cleanUserText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\s*\[attendibilit[àa]\s*\d+%\]/gi, '')
    .trim();
}

/**
 * Normalizes raw location JSON into structured Comprensorio instances.
 * @param {object} rawJson
 * @returns {Array<object>}
 */
export function normalizeLocationsCatalog(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    return [...DEFAULT_COMPRENSORI];
  }

  const results = [];
  const countries = Object.keys(rawJson);

  for (const countryCode of countries) {
    const regions = rawJson[countryCode];
    if (!regions || typeof regions !== 'object') continue;

    for (const regionName of Object.keys(regions)) {
      const localities = regions[regionName];
      if (!Array.isArray(localities)) continue;

      for (const loc of localities) {
        if (!loc || !loc.location) continue;

        // Extract province code from location string if present e.g. "(Suello - LC)"
        const provMatch = loc.location.match(/\b([A-Z]{2})\)$/);
        const province = provMatch ? provMatch[1] : '';
        const id = loc.id || slugifyComprensorio(loc.location, province);

        const takeoffs = (loc.takeoffs || []).map((t, idx) => ({
          id: t.id || `${id}-takeoff-${idx + 1}`,
          name: t.name || `Decollo ${idx + 1}`,
          coordinates: t.coordinates || null,
          altitude: Number(t.altitude) || 0,
          heading: typeof t.heading === 'number' ? t.heading : null,
          isPrimary: t.isPrimary !== undefined ? Boolean(t.isPrimary) : (idx === 0),
          description: cleanUserText(t.description),
          hazards: cleanUserText(t.hazards),
          reliability: typeof t.reliability === 'number' ? t.reliability : (typeof loc.reliability === 'number' ? loc.reliability : 0)
        }));

        const landings = (loc.landings || []).map((l, idx) => ({
          id: l.id || `${id}-landing-${idx + 1}`,
          name: l.name || `Atterraggio ${idx + 1}`,
          coordinates: l.coordinates || null,
          altitude: Number(l.altitude) || 0,
          isPrimary: l.isPrimary !== undefined ? Boolean(l.isPrimary) : (idx === 0),
          isOfficial: Boolean(l.isOfficial || (l.name && l.name.toLowerCase().includes('ufficiale'))),
          description: cleanUserText(l.description),
          hazards: cleanUserText(l.hazards),
          rules: cleanUserText(l.rules),
          reliability: typeof l.reliability === 'number' ? l.reliability : (typeof loc.reliability === 'number' ? loc.reliability : 0)
        }));

        results.push({
          id,
          name: loc.location.replace(/\s*\([^)]*\)$/, ''),
          province,
          region: regionName,
          country: countryCode,
          location: loc.location,
          description: cleanUserText(loc.description),
          webcam: loc.webcam || null,
          club: loc.club ? {
            ...loc.club,
            shuttle: cleanUserText(loc.club.shuttle)
          } : null,
          reliability: typeof loc.reliability === 'number' ? loc.reliability : (takeoffs[0]?.reliability || 0),
          takeoffs,
          landings
        });
      }
    }
  }

  return results.length > 0 ? results : [...DEFAULT_COMPRENSORI];
}

/**
 * Calculates aerodynamic glide ratio required between takeoff and landing:
 * E_richiesta = Distance / Delta_Altitude
 * @param {object} takeoff
 * @param {object} landing
 * @returns {{ distanceMeters: number, deltaAltitudeMeters: number, requiredGlideRatio: number, isSafe: boolean }}
 */
export function calculateGlideToLanding(takeoff, landing, glider = null) {
  const activeGlider = glider || DEFAULT_GLIDER;
  const tCoord = parseCoordinates(takeoff.coordinates);
  const lCoord = parseCoordinates(landing.coordinates);

  if (!tCoord || !lCoord) {
    return {
      distanceMeters: 0,
      deltaAltitudeMeters: Math.max(1, (takeoff.altitude || 1000) - (landing.altitude || 300)),
      requiredGlideRatio: 5.0,
      isSafe: true
    };
  }

  const distanceKm = computeDistanceKm(tCoord.lat, tCoord.lon, lCoord.lat, lCoord.lon);
  const distanceMeters = Math.round(distanceKm * 1000);
  const tAlt = Number(takeoff.altitude) || 1000;
  const lAlt = Number(landing.altitude) || 300;
  const deltaAltitudeMeters = Math.max(10, tAlt - lAlt);

  const requiredGlideRatio = Math.round((distanceMeters / deltaAltitudeMeters) * 10) / 10;

  // Safe conservative glide limit based on glider class (proxy for pilot envelope)
  // EN-A: safe limit 5.5:1; EN-B: 6.5:1; EN-C: 7.5:1; EN-D: 8.5:1
  let safeLimit = 6.0;
  if (activeGlider.category === 'EN-A') safeLimit = 5.5;
  else if (activeGlider.category === 'EN-B') safeLimit = 6.5;
  else if (activeGlider.category === 'EN-C') safeLimit = 7.5;
  else if (activeGlider.category === 'EN-D') safeLimit = 8.5;

  const isSafe = requiredGlideRatio <= safeLimit;

  return {
    distanceMeters,
    deltaAltitudeMeters,
    requiredGlideRatio,
    safeLimit,
    isSafe
  };
}

/**
 * Evaluates full paragliding flyability for an entire Comprensorio,
 * aggregating best takeoff (T_best) and return landing safety (L_safe).
 * 
 * @param {object} params
 * @param {object} params.comprensorio - Comprensorio object with takeoffs and landings
 * @param {object|null} [params.weatherData] - Weather payload from Open-Meteo or synthetic weather
 * @param {number} [params.hourIndex=14] - Hour index of day to evaluate (default 14:00 thermal window)
 * @param {object|null} [params.glider=null] - Active glider from store / hangar
 * @returns {object} Evaluated comprensorio with verdict, score, T_best, L_safe, explainability
 */
export function evaluateComprensorio({
  comprensorio,
  weatherData = null,
  hourIndex = 14,
  glider = null,
  targetDate = null,
  allowSynthetic = true
}) {
  const activeGlider = glider || DEFAULT_GLIDER;
  const takeoffs = comprensorio.takeoffs || [];
  const landings = comprensorio.landings || [];

  // Determine if valid weather data is provided and covers targetDate
  let hasValidWeather = Boolean(weatherData && weatherData.hourly);
  let idx = hourIndex;

  if (hasValidWeather) {
    const h = weatherData.hourly;
    if (targetDate && Array.isArray(h.time) && h.time.length > 0) {
      const targetPrefix = `${targetDate}T`;
      const matchIdx = h.time.findIndex(t => typeof t === 'string' && t.startsWith(targetPrefix));
      if (matchIdx !== -1) {
        idx = Math.min(matchIdx + Math.max(0, Math.min(hourIndex, 23)), h.time.length - 1);
      } else if (h.time.length <= 24) {
        // Single-day payload or test fixture: use hourIndex directly
        idx = Math.min(Math.max(0, hourIndex), h.time.length - 1);
      } else {
        // Multi-day payload that does not contain targetDate
        hasValidWeather = false;
      }
    } else {
      idx = Math.min(Math.max(0, hourIndex), (h.time?.length || 1) - 1);
    }
  }

  // If weather data is unavailable and synthetic fallback is not permitted, do not fabricate synthetic flyability
  if (!hasValidWeather && !allowSynthetic) {
    const primaryTakeoff = takeoffs.find(t => t.isPrimary) || takeoffs[0] || null;
    const primaryLanding = landings.find(l => l.isPrimary || l.isOfficial) || landings[0] || null;
    const glideMetrics = (primaryTakeoff && primaryLanding)
      ? calculateGlideToLanding(primaryTakeoff, primaryLanding, activeGlider)
      : { requiredGlideRatio: '-', isSafe: true };

    const evaluatedTakeoffs = takeoffs.map(t => ({
      takeoff: t,
      heading: typeof t.heading === 'number' ? t.heading : null,
      flyScore: { severity: 0, text: 'Dati N/D', color: 'var(--gm-text-muted)' },
      severity: 0,
      score: 0,
      statusText: 'Dati non disponibili',
      color: 'var(--gm-text-muted)'
    }));

    const evaluatedLandings = landings.map(l => {
      const g = primaryTakeoff ? calculateGlideToLanding(primaryTakeoff, l, activeGlider) : { requiredGlideRatio: '-', isSafe: true };
      return {
        landing: l,
        isPrimary: Boolean(l.isPrimary || l.isOfficial),
        glide: g
      };
    });

    return {
      comprensorioId: comprensorio.id,
      name: comprensorio.name || comprensorio.location,
      province: comprensorio.province || '',
      region: comprensorio.region || '',
      location: comprensorio.location,
      description: comprensorio.description || '',
      webcam: comprensorio.webcam || null,
      status: 'unavailable',
      badge: 'Dati N/D',
      badgeColor: 'var(--gm-text-muted)',
      badgeBg: 'rgba(255, 255, 255, 0.05)',
      score: 0,
      reason: 'Previsione non disponibile offline',
      isOfflineUnavailable: true,
      takeoff: primaryTakeoff,
      landing: primaryLanding,
      bestTakeoff: primaryTakeoff,
      bestTakeoffEval: evaluatedTakeoffs[0] || null,
      safeLanding: primaryLanding,
      isTakeoffPrimary: Boolean(primaryTakeoff?.isPrimary),
      isLandingPrimary: Boolean(primaryLanding?.isPrimary || primaryLanding?.isOfficial),
      isTakeoffOverridden: false,
      isLandingOverridden: false,
      takeoffOverrideReason: null,
      primaryTakeoff,
      glideMetrics,
      takeoffs: evaluatedTakeoffs,
      landings: evaluatedLandings,
      weatherSnapshot: {
        windSpeed: null,
        windGust: null,
        windDir: null,
        temp: null,
        cape: null,
        rain: null
      }
    };
  }

  let windSpeed = 12;
  let windGust = 18;
  let windDir = 180;
  let cape = 150;
  let turbulence = 0.12;
  let rain = 0;
  let temp = 22;

  if (hasValidWeather && weatherData && weatherData.hourly) {
    const h = weatherData.hourly;
    const rawSpeed = h.windspeed_10m ?? h.wind_speed_10m;
    if (rawSpeed && rawSpeed[idx] != null) windSpeed = Number(rawSpeed[idx]);
    const rawGust = h.windgusts_10m ?? h.wind_gusts_10m;
    if (rawGust && rawGust[idx] != null) windGust = Number(rawGust[idx]);
    const rawDir = h.winddirection_10m ?? h.wind_direction_10m;
    if (rawDir && rawDir[idx] != null) windDir = Number(rawDir[idx]);
    if (h.cape && h.cape[idx] != null) cape = Number(h.cape[idx]);
    if (h.turbulence_edr && h.turbulence_edr[idx] != null) turbulence = Number(h.turbulence_edr[idx]);
    if (h.precipitation && h.precipitation[idx] != null) rain = Number(h.precipitation[idx]);
    if (h.temperature_2m && h.temperature_2m[idx] != null) temp = Number(h.temperature_2m[idx]);
  }

  // 1. Evaluate all takeoffs in this comprensorio
  const evaluatedTakeoffs = takeoffs.map(t => {
    const heading = typeof t.heading === 'number' ? t.heading : null;
    const flyScore = getFlyabilityScore(
      windSpeed,
      windGust,
      cape,
      turbulence,
      rain,
      windDir,
      heading,
      true, // isTakeoff
      activeGlider
    );

    // Compute numerical score: 100 base, penalize severity and crosswind
    let score = 100;
    if (flyScore.severity >= 2) score = 15;
    else if (flyScore.severity === 1) score = 55;
    else score = 90;

    return {
      takeoff: t,
      heading,
      flyScore,
      severity: flyScore.severity,
      score,
      statusText: flyScore.text,
      color: flyScore.color
    };
  });

  // 2. Select Single Takeoff via "Ibrido con Override Meteo"
  // Default to primary takeoff (isPrimary: true, or first)
  const primaryTakeoffEval = evaluatedTakeoffs.find(e => e.takeoff.isPrimary) || evaluatedTakeoffs[0] || null;
  
  let selectedTakeoffEval = primaryTakeoffEval;
  let isTakeoffOverridden = false;
  let takeoffOverrideReason = null;

  if (primaryTakeoffEval && primaryTakeoffEval.severity > 0) {
    // If primary is not optimal, look for an alternative with strictly lower severity or better flyability
    const alternatives = [...evaluatedTakeoffs]
      .filter(e => e !== primaryTakeoffEval)
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity - b.severity;
        return b.score - a.score;
      });

    const bestAlt = alternatives[0];
    if (bestAlt && bestAlt.severity < primaryTakeoffEval.severity) {
      selectedTakeoffEval = bestAlt;
      isTakeoffOverridden = true;
      takeoffOverrideReason = `Decollo alternativo ${bestAlt.takeoff.name}: ${primaryTakeoffEval.takeoff.name} non favorevole (${primaryTakeoffEval.statusText})`;
    }
  }

  const selectedTakeoff = selectedTakeoffEval ? selectedTakeoffEval.takeoff : null;

  // 3. Evaluate Landings from the selected takeoff (Default to primary/official landing)
  let safeLanding = null;
  let glideMetrics = null;
  let isLandingOverridden = false;

  if (selectedTakeoff && landings.length > 0) {
    const evaluatedLandings = landings.map(l => {
      const g = calculateGlideToLanding(selectedTakeoff, l, activeGlider);
      return {
        landing: l,
        isPrimary: Boolean(l.isPrimary || l.isOfficial),
        glide: g
      };
    });

    const primaryLandingEval = evaluatedLandings.find(e => e.isPrimary) || evaluatedLandings[0];

    if (primaryLandingEval && primaryLandingEval.glide.isSafe) {
      safeLanding = primaryLandingEval.landing;
      glideMetrics = primaryLandingEval.glide;
    } else {
      // Look for a safe alternative with lowest required glide ratio
      const safeAlternatives = evaluatedLandings
        .filter(e => e.glide.isSafe)
        .sort((a, b) => a.glide.requiredGlideRatio - b.glide.requiredGlideRatio);

      if (safeAlternatives.length > 0) {
        safeLanding = safeAlternatives[0].landing;
        glideMetrics = safeAlternatives[0].glide;
        isLandingOverridden = safeLanding !== primaryLandingEval?.landing;
      } else {
        safeLanding = primaryLandingEval ? primaryLandingEval.landing : evaluatedLandings[0].landing;
        glideMetrics = primaryLandingEval ? primaryLandingEval.glide : evaluatedLandings[0].glide;
      }
    }
  }

  // 4. Overall Comprensorio Verdict & Explainability
  let status = 'flyable'; // 'flyable' | 'caution' | 'unflyable'
  let badge = 'Volabile';
  let badgeColor = 'var(--gm-status-flyable)';
  let badgeBg = 'var(--gm-status-flyable-bg)';
  let overallScore = selectedTakeoffEval ? selectedTakeoffEval.score : 50;
  let reason = '';

  if (!selectedTakeoffEval || selectedTakeoffEval.severity >= 2) {
    status = 'unflyable';
    badge = 'Non Volabile';
    badgeColor = 'var(--gm-status-unflyable)';
    badgeBg = 'var(--gm-status-unflyable-bg)';
    overallScore = Math.min(overallScore, 20);
    reason = selectedTakeoffEval ? selectedTakeoffEval.statusText : 'Nessun decollo praticabile';
  } else if (selectedTakeoffEval.severity === 1 || (glideMetrics && !glideMetrics.isSafe)) {
    status = 'caution';
    badge = 'Cautela';
    badgeColor = 'var(--gm-status-caution)';
    badgeBg = 'var(--gm-status-caution-bg)';
    overallScore = Math.min(overallScore, 65);
    if (!glideMetrics || glideMetrics.isSafe) {
      reason = isTakeoffOverridden
        ? `Alt. ${selectedTakeoff.name}: ${selectedTakeoffEval.statusText}`
        : selectedTakeoffEval.statusText;
    } else {
      reason = `Rientro critico: efficienza richiesta 1:${glideMetrics.requiredGlideRatio} > 1:${glideMetrics.safeLimit}`;
    }
  } else {
    status = 'flyable';
    badge = 'Volabile';
    badgeColor = 'var(--gm-status-flyable)';
    badgeBg = 'var(--gm-status-flyable-bg)';
    if (isTakeoffOverridden) {
      reason = `Alt. ${selectedTakeoff.name}: vento in asse (${primaryTakeoffEval.takeoff.name} non volabile)`;
    } else {
      reason = `Vento ${Math.round(windSpeed)} km/h da ${windDir}° in asse col decollo`;
    }
  }

  return {
    comprensorioId: comprensorio.id,
    name: comprensorio.name || comprensorio.location,
    province: comprensorio.province || '',
    region: comprensorio.region || '',
    location: comprensorio.location,
    description: comprensorio.description || '',
    webcam: comprensorio.webcam || null,
    status,
    badge,
    badgeColor,
    badgeBg,
    score: overallScore,
    reason,
    // Unico Binomio (1 Decollo + 1 Atterraggio)
    takeoff: selectedTakeoff,
    landing: safeLanding,
    bestTakeoff: selectedTakeoff,
    bestTakeoffEval: selectedTakeoffEval,
    safeLanding,
    isTakeoffPrimary: Boolean(selectedTakeoff?.isPrimary),
    isLandingPrimary: Boolean(safeLanding?.isPrimary || safeLanding?.isOfficial),
    isTakeoffOverridden,
    isLandingOverridden,
    takeoffOverrideReason,
    primaryTakeoff: primaryTakeoffEval ? primaryTakeoffEval.takeoff : null,
    glideMetrics,
    takeoffs: evaluatedTakeoffs,
    landings,
    weatherSnapshot: {
      windSpeed: Math.round(windSpeed),
      windGust: Math.round(windGust),
      windDir: Math.round(windDir),
      temp: Math.round(temp),
      cape: Math.round(cape),
      rain
    }
  };
}

/**
 * Sorts an array of evaluated comprensori by flyability descending:
 * Flyable (Volabile) -> Caution (Cautela) -> Unflyable (Non Volabile), with score and name tie-breakers.
 * 
 * @param {Array<object>} evaluatedList
 * @returns {Array<object>}
 */
export function sortEvaluatedComprensori(evaluatedList) {
  if (!Array.isArray(evaluatedList)) return [];

  const statusPriority = {
    flyable: 0,
    caution: 1,
    unflyable: 2,
    unavailable: 3
  };

  return [...evaluatedList].sort((a, b) => {
    const prioA = statusPriority[a.status] ?? 99;
    const prioB = statusPriority[b.status] ?? 99;

    if (prioA !== prioB) return prioA - prioB;
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || '').localeCompare(b.name || '');
  });
}


const LEGACY_PINNED_MAP = Object.freeze({
  'monte-cornizzolo-lc': 'monte-cornizzolo-suello-lc-lc',
  'bassano-del-grappa-vi': 'monte-grappa-borso-del-grappa-tv-tv',
  'bassano-borso-del-grappa-tv': 'monte-grappa-borso-del-grappa-tv-tv',
  'meduno-pn': 'meduno-monte-valinis-toppo-pn-pn',
  'meduno-monte-valinis-pn': 'meduno-monte-valinis-toppo-pn-pn',
  'rocca-calascio-aq': 'calascio-rocca-calascio-calascio-aq-aq',
  'calascio-rocca-aq': 'calascio-rocca-calascio-calascio-aq-aq'
});

/**
 * Checks if a comprensorio spot is pinned in the user's favorites list.
 * Supports exact ID matching as well as bidirectional legacy seed ID mappings.
 * @param {object} spot
 * @param {Set<string>|Array<string>} pinnedIds
 * @returns {boolean}
 */
export function isSpotPinned(spot, pinnedIds) {
  if (!spot || !spot.id) return false;
  const set = pinnedIds instanceof Set ? pinnedIds : new Set(pinnedIds || []);
  if (set.has(spot.id)) return true;

  for (const [legacyId, catalogId] of Object.entries(LEGACY_PINNED_MAP)) {
    if (spot.id === legacyId && set.has(catalogId)) return true;
    if (spot.id === catalogId && set.has(legacyId)) return true;
  }

  return false;
}
