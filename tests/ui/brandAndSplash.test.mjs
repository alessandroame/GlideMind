import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

describe('GlideMind Phase 2-bis - Brand Identity, Icon Bundle & Splash Screen Integrity', () => {
  it('should have all real icon files exported with valid dimensions and non-zero size', () => {
    const requiredIcons = [
      { file: 'assets/icons/icon-512.png', minBytes: 50000 },
      { file: 'assets/icons/icon-192.png', minBytes: 15000 },
      { file: 'assets/icons/apple-touch-icon.png', minBytes: 15000 },
      { file: 'assets/icons/icon-maskable-512.png', minBytes: 50000 },
      { file: 'assets/icons/favicon-32.png', minBytes: 500 },
      { file: 'assets/brand/glidemind_splash.jpg', minBytes: 50000 }
    ];

    for (const icon of requiredIcons) {
      const p = path.join(projectRoot, icon.file);
      assert.ok(fs.existsSync(p), `Icon asset must exist on disk: ${icon.file}`);
      const stats = fs.statSync(p);
      assert.ok(
        stats.size >= icon.minBytes,
        `Icon ${icon.file} must be a real high-res image (found ${stats.size} bytes, min ${icon.minBytes})`
      );
    }
  });

  it('should have a valid Web App Manifest referencing the icons and standalone display', () => {
    const manifestPath = path.join(projectRoot, 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.short_name, 'GlideMind');
    assert.equal(manifest.name, 'GlideMind - Free Flight Aerology & Logbook');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'portrait-primary');
    assert.equal(manifest.background_color, '#0b0d12');
    assert.equal(manifest.theme_color, '#0b0d12');

    assert.ok(Array.isArray(manifest.icons), 'Manifest must declare icons array');
    const icon192 = manifest.icons.find(i => i.sizes === '192x192');
    assert.ok(icon192, 'Manifest must declare 192x192 icon');
    const icon512 = manifest.icons.find(i => i.sizes === '512x512' && !i.purpose);
    assert.ok(icon512, 'Manifest must declare standard 512x512 icon');
    const maskable = manifest.icons.find(i => i.purpose === 'maskable');
    assert.ok(maskable, 'Manifest must declare maskable icon');
  });

  it('should link the real icons, manifest, and splash screen in index.html without exceeding 200 lines', () => {
    const indexPath = path.join(projectRoot, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');
    const lines = html.split('\n');

    assert.ok(lines.length < 200, `index.html must stay under 200 lines (currently ${lines.length})`);
    assert.ok(html.includes('manifest.webmanifest'), 'index.html must link manifest.webmanifest');
    assert.ok(html.includes('apple-touch-icon.png'), 'index.html must link apple-touch-icon');
    assert.ok(html.includes('favicon-32.png') || html.includes('icon-192.png'), 'index.html must link favicon');
    assert.ok(html.includes('id="gm-splash-screen"'), 'index.html must contain #gm-splash-screen overlay');
    assert.ok(html.includes('id="gm-landscape-guard"'), 'index.html must contain #gm-landscape-guard');
    assert.ok(html.includes('class="gm-brand-icon"'), 'index.html must display brand icon in header');
  });

  it('should define splash screen styles with Doherty transition in css/theme.css', () => {
    const cssPath = path.join(projectRoot, 'css/theme.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('#gm-splash-screen'), 'theme.css must style #gm-splash-screen');
    assert.ok(css.includes('glidemind_splash.jpg'), 'theme.css must use glidemind_splash.jpg background');
    assert.ok(css.includes('.gm-splash-hidden'), 'theme.css must define .gm-splash-hidden dismiss state');
    assert.ok(css.includes('pointer-events: none'), 'Dismissed splash must not trap pointer events');
    assert.ok(css.includes('.gm-brand-icon'), 'theme.css must style .gm-brand-icon');
    assert.ok(css.includes('#gm-landscape-guard'), 'theme.css must style #gm-landscape-guard');
    assert.ok(css.includes('min-height: 550px'), 'theme.css must guard desktop breakpoint with min-height: 550px');
  });

  it('should export dismissSplashScreen in ui/app.js and handle DOM absence safely', async () => {
    const appModule = await import('../../ui/app.js');
    assert.equal(typeof appModule.dismissSplashScreen, 'function', 'app.js must export dismissSplashScreen');

    // Executing in Node (where document is undefined or mocked) must not throw
    assert.doesNotThrow(() => {
      appModule.dismissSplashScreen();
    }, 'dismissSplashScreen must safely handle headless Node environment');
  });
});
