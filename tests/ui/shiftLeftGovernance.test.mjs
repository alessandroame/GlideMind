/**
 * GlideMind - Shift-Left Quality Gate & Architectural Governance Tests
 * 
 * Enforces ex-ante quality gates across the codebase:
 * 1. Headless Core Isolation (Zero DOM dependencies in core/)
 * 2. Novice Pilot Vocabulary & Anti-Gergo (Plain-language translation of aerodynamic/aerological metrics)
 * 3. Laws of UX & Ergonomic Standards (Touch target floor, zero naked numbers, progressive disclosure)
 * 4. Dual High-Contrast Sunlight Theme Declarations
 * 5. Banned Decorative Emojis and Marketing Payoff Sanitization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

describe('Shift-Left Quality Gate & Architectural Governance', () => {
  const coreDir = resolve('core');
  const viewsDir = resolve('ui/views');
  const cssFile = resolve('css/theme.css');

  it('Gate 1 (Headless Core): ensures core modules never directly reference DOM objects', () => {
    const coreFiles = readdirSync(coreDir).filter(f => f.endsWith('.js'));
    const forbiddenDomTokens = [
      'document.getElementById',
      'document.querySelector',
      'document.createElement',
      'window.addEventListener',
      'window.location',
      'HTMLElement'
    ];

    for (const file of coreFiles) {
      const src = readFileSync(join(coreDir, file), 'utf-8');
      for (const token of forbiddenDomTokens) {
        assert.ok(
          !src.includes(token),
          `Module core/${file} must be 100% headless. Found forbidden DOM reference: "${token}"`
        );
      }
    }
  });

  it('Gate 1 (Storage Abstraction): ensures core/store.js utilizes injectable adapter pattern', () => {
    const storeSrc = readFileSync(join(coreDir, 'store.js'), 'utf-8');
    assert.ok(
      storeSrc.includes('createInMemoryStorageAdapter'),
      'store.js must export createInMemoryStorageAdapter for Node.js execution'
    );
    assert.ok(
      storeSrc.includes('createLocalStorageAdapter'),
      'store.js must export createLocalStorageAdapter with safe fallback'
    );
  });

  it('Gate 2 (Novice Pilot Spec): enforces phenomenological translations for aerological metrics', () => {
    const viewFiles = readdirSync(viewsDir).filter(f => f.endsWith('.js'));

    for (const file of viewFiles) {
      const src = readFileSync(join(viewsDir, file), 'utf-8');

      // Check LCL
      if (src.includes('LCL')) {
        const hasPlainLangLcl = src.includes('Base Nubi') || src.includes('Base Cumulo') || src.includes('nubi');
        assert.ok(
          hasPlainLangLcl,
          `View ui/views/${file} mentions LCL without plain-language context (Base Nubi / Base Cumulo)`
        );
      }

      // Check CAPE
      if (src.includes('CAPE')) {
        const hasPlainLangCape = src.includes('Instabilit') || src.includes('Temporali') || src.includes('instabilit');
        assert.ok(
          hasPlainLangCape,
          `View ui/views/${file} mentions CAPE without plain-language context (Instabilità / Temporali)`
        );
      }

      // Check EDR
      if (src.includes('EDR')) {
        const hasPlainLangEdr = src.includes('Turbolenza') || src.includes('turbolenza');
        assert.ok(
          hasPlainLangEdr,
          `View ui/views/${file} mentions EDR without plain-language context (Turbolenza)`
        );
      }
    }
  });

  it('Gate 3 (Laws of UX - Progressive Disclosure): prevents naked numbers and unreferenced arrows in scrubbers', () => {
    const forecastViewSrc = readFileSync(join(viewsDir, 'ForecastView.js'), 'utf-8');
    assert.ok(
      !forecastViewSrc.includes('compact-wind'),
      'ForecastView must not render isolated naked wind numbers in timeline scrubber slots'
    );
    assert.ok(
      !forecastViewSrc.includes('compact-arrow'),
      'ForecastView must not render unreferenced directional arrows in timeline scrubber slots'
    );
  });

  it('Gate 3 (Laws of UX - Ergonomic Floor): verifies touch target floor and landscape guard in theme.css', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    assert.ok(
      themeSrc.includes('--gm-touch-min: 48px;') || themeSrc.includes('--gm-touch-min: 44px;'),
      'theme.css must define touch minimum standard (--gm-touch-min >= 44px)'
    );
    assert.ok(
      themeSrc.includes('#gm-landscape-guard'),
      'theme.css must declare landscape guard for mobile ergonomics (#gm-landscape-guard)'
    );
    assert.ok(
      themeSrc.includes('touch-action: pan-x;') || themeSrc.includes('touch-action: pan-y;'),
      'theme.css must declare cooperative touch gestures to eliminate unintended scrolls'
    );
  });

  it('Gate 4 (Outdoor Sunlight Theme): verifies dual-theme contrast declarations in theme.css', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    assert.ok(
      themeSrc.includes('[data-theme="light"]'),
      'theme.css must support Sunlight Light Mode via [data-theme="light"]'
    );
    assert.ok(
      themeSrc.includes('--gm-bg-base'),
      'theme.css must declare background custom properties for dual-theme engine'
    );
    assert.ok(
      themeSrc.includes('--gm-text-primary'),
      'theme.css must declare text custom properties for dual-theme engine'
    );
    assert.ok(
      themeSrc.includes('--gm-status-flyable: #22c55e;'),
      'theme.css must declare vibrant green status color matching dark mode'
    );
    assert.ok(
      themeSrc.includes('--gm-status-caution: #eab308;'),
      'theme.css must declare vibrant yellow status color matching dark mode'
    );
    assert.ok(
      themeSrc.includes('--gm-status-unflyable: #ef4444;'),
      'theme.css must declare vibrant red status color matching dark mode'
    );
  });

  it('Gate 5 (Sobriety & Clean Microcopy): enforces absence of banned decorative emojis in view markup', () => {
    const viewFiles = readdirSync(viewsDir).filter(f => f.endsWith('.js'));
    const bannedEmojis = ['📈', '🎙️', '⏱️', 'ℹ️', '🚀', '✨', '🔥', '🎉'];

    for (const file of viewFiles) {
      const src = readFileSync(join(viewsDir, file), 'utf-8');
      for (const emoji of bannedEmojis) {
        assert.ok(
          !src.includes(emoji),
          `View ui/views/${file} contains banned decorative emoji: "${emoji}". Must adhere to engineering sobriety.`
        );
      }
    }
  });

  it('Gate 5 (Flexbox Anti-Truncation): ensures flight labels prevent name clipping', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    assert.ok(
      themeSrc.includes('.gm-flight-label'),
      'theme.css must define .gm-flight-label flexbox container'
    );
    assert.ok(
      themeSrc.includes('.gm-flight-target'),
      'theme.css must define .gm-flight-target for spot names'
    );
  });

  it('Gate 4 (Frosted Glass & Control Safeguards): ensures mini-map select controls enforce no-repeat to prevent SVG icon tiling', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    assert.ok(
      themeSrc.includes('.gm-mini-map-layer-select'),
      'theme.css must define .gm-mini-map-layer-select'
    );
    assert.ok(
      themeSrc.includes('background-repeat: no-repeat, no-repeat !important;'),
      'theme.css must enforce no-repeat on multi-layer background to prevent SVG chevron repeating artifacts'
    );
  });

  it('Gate 2 (UI Design System - Token Consistency): ensures view markup never hardcodes hex colors in inline style attributes', () => {
    const viewFiles = readdirSync(viewsDir).filter(f => f.endsWith('.js'));
    const hexInStyleRegex = /style="[^"]*#[0-9a-fA-F]{3,6}/;

    for (const file of viewFiles) {
      const src = readFileSync(join(viewsDir, file), 'utf-8');
      const match = src.match(hexInStyleRegex);
      assert.ok(
        !match,
        `View ui/views/${file} contains hardcoded hex color in style attribute: "${match?.[0]}". Must use var(--gm-*) design tokens.`
      );
    }
  });

  it('Gate 2 (UI Design System - Component Primitives): verifies theme.css defines canonical design primitives', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    const requiredPrimitives = [
      '.gm-card',
      '.gm-btn-primary',
      '.gm-btn-secondary',
      '.gm-badge',
      '.gm-badge-flyable',
      '.gm-badge-caution',
      '.gm-badge-unflyable',
      '.gm-badge-severe',
      '.gm-section-title',
      '.gm-stat-grid'
    ];

    for (const primitive of requiredPrimitives) {
      assert.ok(
        themeSrc.includes(primitive),
        `theme.css must define canonical UI primitive: "${primitive}"`
      );
    }
  });

  it('Gate 3 (CSS Governance): ensures theme.css has zero duplicate top-level selectors in the same media context', () => {
    const lines = readFileSync(cssFile, 'utf-8').split(/\r?\n/);
    let depth = 0;
    let mediaContext = '';
    let selectorBuffer = [];
    const seenSelectors = new Map();

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('@media')) {
        mediaContext = trimmed;
      }
      if (depth === 0 && trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
        selectorBuffer.push(trimmed);
        if (trimmed.endsWith('{')) {
          const fullSelector = selectorBuffer.join(' ').slice(0, -1).trim();
          selectorBuffer = [];
          const key = `${mediaContext} :: ${fullSelector}`;
          assert.ok(
            !seenSelectors.has(key),
            `Duplicate CSS selector "${fullSelector}" in context "${mediaContext || 'root'}" at line ${idx + 1} (first declared at line ${seenSelectors.get(key)})`
          );
          seenSelectors.set(key, idx + 1);
        }
      } else if (depth === 0 && (trimmed.startsWith('/*') || trimmed.startsWith('*') || !trimmed)) {
        if (!trimmed) selectorBuffer = [];
      }
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            mediaContext = '';
            selectorBuffer = [];
          }
        }
      }
    });
  });

  it('Gate 4 (PWA Offline-First): ensures sw.js exists and implements Cache-First shell + Open-Meteo pass-through', () => {
    const swPath = resolve('sw.js');
    const swSrc = readFileSync(swPath, 'utf-8');
    assert.ok(swSrc.includes('CACHE_NAME'), 'sw.js must define a versioned CACHE_NAME');
    assert.ok(swSrc.includes('open-meteo.com'), 'sw.js must declare pass-through for open-meteo.com');
    const appSrc = readFileSync(resolve('ui/app.js'), 'utf-8');
    assert.ok(
      appSrc.includes("serviceWorker.register('./sw.js')"),
      'ui/app.js must register ./sw.js on bootstrap'
    );
  });

  it('Gate 5 (Engineering Sobriety): ensures core and ui modules contain zero banned military/hype terms', () => {
    const bannedTerms = [/Sito strategico/i, /scansione tattica/i, /bulletproof/i, /game-changer/i, /silver bullet/i];
    const filesToScan = [
      ...readdirSync(coreDir).filter(f => f.endsWith('.js')).map(f => join(coreDir, f)),
      ...readdirSync(viewsDir).filter(f => f.endsWith('.js')).map(f => join(viewsDir, f))
    ];

    for (const filePath of filesToScan) {
      const src = readFileSync(filePath, 'utf-8');
      for (const regex of bannedTerms) {
        assert.ok(
          !regex.test(src),
          `File ${filePath} contains banned terminology matching ${regex}`
        );
      }
    }
  });

  it('Gate 5 (Cognitive Memory Hygiene): enforces MEMORY.md <= 200 lines and WORKLOG.md <= 300 lines ceilings', () => {
    const memoryPath = resolve('MEMORY.md');
    const memorySrc = readFileSync(memoryPath, 'utf-8');
    const memoryLines = memorySrc.split(/\r?\n/);

    assert.ok(
      memoryLines.length <= 200,
      `MEMORY.md exceeds the 200-line ceiling (found ${memoryLines.length} lines). Update domain sections in-place or move static checks to shiftLeftGovernance.test.mjs.`
    );

    const h2Headers = memoryLines.filter(l => l.startsWith('## '));
    assert.ok(
      h2Headers.length <= 8,
      `MEMORY.md has ${h2Headers.length} top-level sections (max 8 allowed). Do not append numbered task logs to MEMORY.md.`
    );

    const worklogPath = resolve('WORKLOG.md');
    const worklogSrc = readFileSync(worklogPath, 'utf-8');
    const worklogLines = worklogSrc.split(/\r?\n/);

    assert.ok(
      worklogLines.length <= 300,
      `WORKLOG.md exceeds the 300-line rolling window ceiling (found ${worklogLines.length} lines). Archive older entries to .agents/archive/.`
    );

    const desiderataPath = resolve('DESIDERATA.md');
    const desiderataSrc = readFileSync(desiderataPath, 'utf-8');
    const desiderataLines = desiderataSrc.split(/\r?\n/);

    assert.ok(
      desiderataLines.length <= 80 && Buffer.byteLength(desiderataSrc, 'utf-8') <= 8192,
      `DESIDERATA.md exceeds compactness ceiling (${desiderataLines.length} lines, ${Buffer.byteLength(desiderataSrc, 'utf-8')} bytes; max 80 lines / 8 KB). Keep table cells concise (< 160 chars).`
    );
  });

  it('Gate 4 (WCAG AAA Unflyable Pill Contrast): verifies high-luminance red text token on dark and light themes', () => {
    const themeSrc = readFileSync(cssFile, 'utf-8');
    assert.ok(
      themeSrc.includes('--gm-status-unflyable-text: #fca5a5;'),
      'theme.css must define high-luminance --gm-status-unflyable-text: #fca5a5 for dark mode pills'
    );
    assert.ok(
      themeSrc.includes('--gm-status-unflyable-text: #b91c1c;'),
      'theme.css must define high-contrast --gm-status-unflyable-text: #b91c1c for light mode pills'
    );
    assert.ok(
      themeSrc.includes('.gm-trend-sub-badge.status-unflyable'),
      'theme.css must define .gm-trend-sub-badge.status-unflyable for trend side-panel badges'
    );
    assert.ok(
      themeSrc.includes('.gm-map-scrubber-spot-pill.status-unflyable'),
      'theme.css must define .gm-map-scrubber-spot-pill.status-unflyable for timeline scrubber reason pill'
    );
  });

  it('Gate 5 (Agent Instructions & Skill Governance): enforces valid YAML frontmatter, 80-250 char directive descriptions, and clean rule links', () => {
    const skillsRoot = resolve('.agents/skills');
    const skillDirs = readdirSync(skillsRoot, { withFileTypes: true }).filter(d => d.isDirectory());

    for (const dir of skillDirs) {
      const skillPath = join(skillsRoot, dir.name, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      const lines = content.split(/\r?\n/);

      assert.ok(
        lines.length <= 200,
        `Skill .agents/skills/${dir.name}/SKILL.md exceeds 200-line ceiling (${lines.length} lines)`
      );

      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      assert.ok(fmMatch, `Skill .agents/skills/${dir.name}/SKILL.md is missing valid YAML frontmatter`);

      const fmLines = fmMatch[1].split(/\r?\n/);
      let descParts = [];
      let inDesc = false;
      for (const l of fmLines) {
        if (l.startsWith('description:')) {
          const rest = l.slice('description:'.length).trim();
          if (rest !== '>-' && rest !== '>' && rest !== '|') {
            const isQuoted = (rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'"));
            assert.ok(
              isQuoted || !rest.includes(': '),
              `Skill .agents/skills/${dir.name}/SKILL.md contains unquoted ': ' in inline description`
            );
            descParts.push(rest.replace(/^['"]|['"]$/g, ''));
          }
          inDesc = true;
        } else if (inDesc && /^\s+/.test(l)) {
          descParts.push(l.trim());
        } else if (/^[a-zA-Z0-9_-]+:/.test(l)) {
          inDesc = false;
        }
      }
      const desc = descParts.join(' ').trim();
      assert.ok(
        desc.length >= 80 && desc.length <= 250,
        `Skill .agents/skills/${dir.name}/SKILL.md description length (${desc.length}) must be between 80 and 250 chars`
      );
      assert.ok(
        /(Use this skill when|Use this skill to|Utilizza questa skill quando)/i.test(desc),
        `Skill .agents/skills/${dir.name}/SKILL.md description must include directive trigger ('Use this skill when...' / 'Utilizza questa skill quando...')`
      );
    }

    const rulesRoot = resolve('.agents/rules');
    const ruleFiles = readdirSync(rulesRoot).filter(f => f.endsWith('.md'));
    for (const rf of ruleFiles) {
      const ruleSrc = readFileSync(join(rulesRoot, rf), 'utf-8');
      assert.ok(
        !ruleSrc.includes('c:/github/antigravity-plugins'),
        `Rule .agents/rules/${rf} must reference active global plugins in C:/Users/aame/.gemini/config/plugins instead of c:/github/antigravity-plugins`
      );
    }
  });
});



