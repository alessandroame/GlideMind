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
});

