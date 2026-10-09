/**
 * GlideMind - Metadata Sanitizer & Text Decoupling Tool
 * 
 * Sanitizes paragliding locations catalog:
 * 1. Extracts technical "[attendibilità XX%]" tags from human-readable text strings
 *    (description, hazards, rules, shuttle, access).
 * 2. Elevates the extracted percentage into explicit structured numeric `reliability: XX` fields.
 * 3. Strips technical metadata from UI text, ensuring clean, legible outdoor microcopy.
 * 4. Updates data/locations.json and data/staging-locations.json deterministically.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATTENDIBILITA_REGEX = /\s*\[attendibilit[àa]\s*(\d+)%\]/i;

/**
 * Extracts reliability percentage from a string if present, and returns the cleaned text.
 * @param {string|null|undefined} text
 * @returns {{ cleanedText: string, extractedScore: number|null }}
 */
export function extractAndCleanMetadata(text) {
  if (typeof text !== 'string') return { cleanedText: '', extractedScore: null };

  const match = text.match(ATTENDIBILITA_REGEX);
  const extractedScore = match ? parseInt(match[1], 10) : null;
  const cleanedText = text
    .replace(/\s*\[attendibilit[àa]\s*\d+%\]/gi, '')
    .trim();

  return { cleanedText, extractedScore };
}

/**
 * Recursively cleans and structures a single spot or comprensorio object.
 * @param {object} item
 * @returns {{ item: object, strippedCount: number }}
 */
export function sanitizeSpotEntity(item) {
  if (!item || typeof item !== 'object') return { item, strippedCount: 0 };
  let strippedCount = 0;

  // Clean description
  if (typeof item.description === 'string') {
    const { cleanedText, extractedScore } = extractAndCleanMetadata(item.description);
    if (extractedScore !== null) {
      strippedCount++;
      if (typeof item.reliability !== 'number') item.reliability = extractedScore;
    }
    item.description = cleanedText;
  }

  // Clean hazards
  if (typeof item.hazards === 'string') {
    const { cleanedText, extractedScore } = extractAndCleanMetadata(item.hazards);
    if (extractedScore !== null) {
      strippedCount++;
      if (typeof item.reliability !== 'number') item.reliability = extractedScore;
    }
    item.hazards = cleanedText;
  }

  // Clean rules
  if (typeof item.rules === 'string') {
    const { cleanedText, extractedScore } = extractAndCleanMetadata(item.rules);
    if (extractedScore !== null) {
      strippedCount++;
      if (typeof item.reliability !== 'number') item.reliability = extractedScore;
    }
    item.rules = cleanedText;
  }

  // Clean access
  if (typeof item.access === 'string') {
    const { cleanedText, extractedScore } = extractAndCleanMetadata(item.access);
    if (extractedScore !== null) {
      strippedCount++;
      if (typeof item.reliability !== 'number') item.reliability = extractedScore;
    }
    item.access = cleanedText;
  }

  // Clean club.shuttle
  if (item.club && typeof item.club === 'object') {
    if (typeof item.club.shuttle === 'string') {
      const { cleanedText, extractedScore } = extractAndCleanMetadata(item.club.shuttle);
      if (extractedScore !== null) strippedCount++;
      item.club.shuttle = cleanedText;
    }
  }

  // Process nested takeoffs
  if (Array.isArray(item.takeoffs)) {
    for (const t of item.takeoffs) {
      const res = sanitizeSpotEntity(t);
      strippedCount += res.strippedCount;
      if (typeof t.reliability !== 'number' && typeof item.reliability === 'number') {
        t.reliability = item.reliability;
      }
    }
  }

  // Process nested landings
  if (Array.isArray(item.landings)) {
    for (const l of item.landings) {
      const res = sanitizeSpotEntity(l);
      strippedCount += res.strippedCount;
      if (typeof l.reliability !== 'number' && typeof item.reliability === 'number') {
        l.reliability = item.reliability;
      }
    }
  }

  return { item, strippedCount };
}

/**
 * Sanitizes data/locations.json file in place.
 * @param {string} filePath
 * @returns {{ file: string, totalStripped: number, totalEntities: number }}
 */
export function sanitizeCatalogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Sanitizer] File non trovato: ${filePath}`);
    return { file: filePath, totalStripped: 0, totalEntities: 0 };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  let totalStripped = 0;
  let totalEntities = 0;

  if (Array.isArray(data)) {
    // Array of comprensori (e.g. staging-locations.json)
    for (const comp of data) {
      totalEntities++;
      const { strippedCount } = sanitizeSpotEntity(comp);
      totalStripped += strippedCount;
    }
  } else if (typeof data === 'object') {
    // Hierarchical catalog (e.g. locations.json with IT -> Region -> Comprensori)
    for (const country of Object.keys(data)) {
      const regions = data[country];
      if (typeof regions !== 'object') continue;
      for (const region of Object.keys(regions)) {
        const comps = regions[region];
        if (!Array.isArray(comps)) continue;
        for (const comp of comps) {
          totalEntities++;
          const { strippedCount } = sanitizeSpotEntity(comp);
          totalStripped += strippedCount;
        }
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[Sanitizer] Bonificato ${filePath}: rimossi ${totalStripped} tag testuali da ${totalEntities} comprensori.`);
  return { file: filePath, totalStripped, totalEntities };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targetLocations = path.resolve(__dirname, '../data/locations.json');
  const targetStaging = path.resolve(__dirname, '../data/staging-locations.json');

  console.log('[Sanitizer] Avvio bonifica metadati testuali in dati territoriali...');
  sanitizeCatalogFile(targetLocations);
  if (fs.existsSync(targetStaging)) {
    sanitizeCatalogFile(targetStaging);
  }
}
