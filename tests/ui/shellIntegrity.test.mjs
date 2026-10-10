import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

describe('GlideMind Phase 2 - Shell & Design System Integrity', () => {
  it('should have index.html under 200 lines with required semantic landmarks', () => {
    const indexPath = path.join(projectRoot, 'index.html');
    assert.ok(fs.existsSync(indexPath), 'index.html must exist');

    const htmlContent = fs.readFileSync(indexPath, 'utf-8');
    const lines = htmlContent.split('\n');
    assert.ok(lines.length < 200, `index.html must be < 200 lines, found ${lines.length}`);

    // Verify key landmark IDs
    assert.ok(htmlContent.includes('id="app-root"'), 'Must have #app-root');
    assert.ok(htmlContent.includes('id="desktop-nav-bar"'), 'Must have #desktop-nav-bar');
    assert.ok(htmlContent.includes('id="main-view"'), 'Must have #main-view');
    assert.ok(htmlContent.includes('id="bottom-nav-bar"'), 'Must have #bottom-nav-bar');
    assert.ok(htmlContent.includes('id="sheet-container"'), 'Must have #sheet-container');
    assert.ok(htmlContent.includes('viewport-fit=cover'), 'Must specify viewport-fit=cover');
  });

  it('should have css/theme.css defining aeronautical design tokens and Fitts touch floor', () => {
    const cssPath = path.join(projectRoot, 'css/theme.css');
    assert.ok(fs.existsSync(cssPath), 'css/theme.css must exist');

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Token definitions
    assert.ok(cssContent.includes('--gm-bg-base'), 'Must define --gm-bg-base');
    assert.ok(cssContent.includes('--gm-bg-card'), 'Must define --gm-bg-card');
    assert.ok(cssContent.includes('--gm-accent'), 'Must define --gm-accent');
    assert.ok(cssContent.includes('--gm-status-flyable'), 'Must define --gm-status-flyable');
    assert.ok(cssContent.includes('--gm-status-caution'), 'Must define --gm-status-caution');
    assert.ok(cssContent.includes('--gm-status-unflyable'), 'Must define --gm-status-unflyable');
    assert.ok(cssContent.includes('--gm-touch-min: 48px;'), 'Must enforce 48px Fitts touch floor');
    assert.ok(cssContent.includes('100dvh'), 'Must use 100dvh for mobile viewport consistency');
    assert.ok(cssContent.includes('.gm-carousel'), 'Must define .gm-carousel class');
    assert.ok(cssContent.includes('scroll-snap-type: x mandatory'), 'Carousel must use snap scrolling');
  });

  it('should enforce CSS layout safeguards against card duplication and invisible heading displacement', () => {
    const cssPath = path.join(projectRoot, 'css/theme.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Safeguard 1: .gm-spot-card must be declared exactly once as a standalone block
    const standaloneMatches = cssContent.match(/^\.gm-spot-card\s*\{/gm);
    assert.equal(
      standaloneMatches ? standaloneMatches.length : 0,
      1,
      'Must have exactly ONE standalone .gm-spot-card declaration in css/theme.css'
    );

    // Safeguard 2: .gm-spot-card must be 100% responsive width (never fixed width on mobile)
    assert.ok(
      cssContent.includes('.gm-spot-card {\n  width: 100%;') ||
      cssContent.includes('.gm-spot-card {\r\n  width: 100%;') ||
      /\.gm-spot-card\s*\{[^}]*width:\s*100%/.test(cssContent),
      '.gm-spot-card must declare width: 100% for mobile responsiveness'
    );

    // Safeguard 3: .sr-only must be defined with position: absolute to prevent visual layout shifts
    assert.ok(cssContent.includes('.sr-only {'), 'Must define .sr-only utility class');
    assert.ok(
      /\.sr-only\s*\{[^}]*position:\s*absolute/.test(cssContent),
      '.sr-only must have position: absolute'
    );
  });

  it('should enforce modal sheet visibility and desktop scale/opacity transition safeguards', () => {
    const cssPath = path.join(projectRoot, 'css/theme.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Base active sheet must guarantee opacity: 1
    assert.ok(
      /#sheet-container\.active\s+\.gm-sheet\s*\{[^}]*opacity:\s*1;/m.test(cssContent),
      'Base #sheet-container.active .gm-sheet must specify opacity: 1'
    );

    // Desktop media query must explicitly declare scale(1) and opacity: 1 for active sheet
    const desktopMediaQueryRegex = /@media\s*\([^)]*min-width:\s*768px[^)]*\)\s*and\s*\([^)]*min-height:\s*550px[^)]*\)\s*\{([\s\S]*?)(?=\n\/\*|\n@media|$)/g;
    let match;
    let foundDesktopSheetActive = false;
    while ((match = desktopMediaQueryRegex.exec(cssContent)) !== null) {
      const block = match[1];
      if (
        block.includes('#sheet-container.active .gm-sheet') &&
        block.includes('transform: scale(1)') &&
        block.includes('opacity: 1')
      ) {
        foundDesktopSheetActive = true;
        break;
      }
    }

    assert.ok(
      foundDesktopSheetActive,
      'Desktop media query must define #sheet-container.active .gm-sheet with transform: scale(1) and opacity: 1'
    );
  });
});
