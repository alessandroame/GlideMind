import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'docs', 'audit-screenshots');
const ARTIFACT_DIR = 'C:\\Users\\aless\\.gemini\\antigravity\\brain\\5f203de4-2f04-48d2-a170-a5bf9aff6d60';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const HTTP_PORT = 3344;
const CDP_PORT = 9444;

// Ensure output directories exist
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

// Basic MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Start local dev server
const server = http.createServer((req, res) => {
  let safeUrl;
  try {
    safeUrl = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  let pathname = decodeURIComponent(safeUrl.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(ROOT_DIR, pathname));
  const relative = path.relative(ROOT_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end(`Not found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

await new Promise((resolve) => server.listen(HTTP_PORT, resolve));
console.log(`[DevServer] Running at http://localhost:${HTTP_PORT}`);

// Spawn Chrome with debugging port
const profileDir = path.join(ROOT_DIR, '.tmp_audit_profile');
fs.mkdirSync(profileDir, { recursive: true });

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDir}`,
  'about:blank'
]);

let cdpWs = null;
let msgId = 1;

async function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          cdpWs.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (e) {
        reject(e);
      }
    };
    cdpWs.addEventListener('message', handler);
    cdpWs.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expr) {
  const res = await cdpSend('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : undefined;
}

try {
  // Wait for Chrome debugging endpoint
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (v.ok) break;
    } catch {}
  }

  // Create new page
  const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://localhost:${HTTP_PORT}`, { method: 'PUT' });
  const target = await newTargetRes.json();
  cdpWs = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (cdpWs.onopen = resolve));

  await cdpSend('Page.enable');
  await cdpSend('DOM.enable');
  await cdpSend('Runtime.enable');

  console.log('[CDP] Connected and initialized page.');

  // Wait for application to bootstrap
  await new Promise((r) => setTimeout(r, 1200));

  // Seed sample flights and store state
  console.log('[Audit] Seeding flights and sample state...');
  await evalJs(`
    (async () => {
      const mockFlight = {
        meta: {
          id: 'fl_cornizzolo_audit_12',
          flightNumber: 12,
          date: '2026-10-10',
          takeoffTime: '12:00',
          landingTime: '12:45',
          durationMinutes: 45,
          site: 'Monte Cornizzolo',
          siteName: 'Decollo Risparmio -> Suello',
          glider: 'Axis Compact 4',
          gliderClass: 'EN-A',
          maxAltMsl: 1480,
          maxGainMeters: 420,
          maxClimbRate: 3.2,
          maxSinkRate: -2.1,
          accumulatedClimbMeters: 550,
          distanceKm: 8.4,
          notes: 'Volo di addestramento veleggiato con ottima stabilità e debriefing positivo.'
        },
        raw: {
          id: 'fl_cornizzolo_audit_12',
          decimatedPoints: [
            { timeSeconds: 0, alt: 1060, lat: 45.8, lon: 9.29, vario: 0 },
            { timeSeconds: 120, alt: 1250, lat: 45.802, lon: 9.292, vario: 1.8 },
            { timeSeconds: 300, alt: 1480, lat: 45.805, lon: 9.295, vario: 2.5 },
            { timeSeconds: 600, alt: 1300, lat: 45.81, lon: 9.30, vario: -0.9 },
            { timeSeconds: 900, alt: 1100, lat: 45.815, lon: 9.31, vario: 0.4 },
            { timeSeconds: 1500, alt: 800, lat: 45.816, lon: 9.315, vario: -1.2 },
            { timeSeconds: 2400, alt: 260, lat: 45.817, lon: 9.32, vario: -0.5 }
          ]
        },
        telemetry: {
          thermals: [
            { id: 'T1', startTime: '12:05', durationSeconds: 320, altGain: 350, maxClimb: 2.8, avgClimb: 1.5, driftSpeedKmH: 12, originDeg: 190, turnCount: 8, efficiencyPercent: 78 }
          ],
          maneuvers: [
            { type: '360', startTime: '12:15', durationSeconds: 40, turns: 2, sinkRate: -3.5, label: 'Sondaggio 360°' },
            { type: 'pendolate', startTime: '12:22', durationSeconds: 18, pendolateCount: 4, label: 'Inversioni di rollio' }
          ]
        }
      };

      if (window.__GLIDEMIND__ && window.__GLIDEMIND__.logbookManager) {
        await window.__GLIDEMIND__.logbookManager.saveFlight(mockFlight.meta, mockFlight.raw);
        const all = await window.__GLIDEMIND__.logbookManager.getAllFlights();
        window.__GLIDEMIND__.store.setState({ flights: all });
      }
    })()
  `);

  const auditResults = [];

  // Scenarios to capture
  const scenarios = [
    // 1. Home Dashboard
    { name: '01_home_dashboard', route: '#home', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Home Dashboard (Dark Cockpit, Mobile)' },
    { name: '01_home_dashboard', route: '#home', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Home Dashboard (Sunlight Mode, Mobile)' },
    { name: '01_home_dashboard', route: '#home', theme: 'dark', vp: { width: 1280, height: 800 }, desc: 'Home Dashboard (Dark Cockpit, Desktop)' },

    // 2. Weather Forecast
    { name: '02_forecast_standard', route: '#forecast', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Forecast Standard (Dark Cockpit, Mobile)' },
    { name: '02_forecast_standard', route: '#forecast', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Forecast Standard (Sunlight Mode, Mobile)' },
    { name: '02_forecast_standard', route: '#forecast', theme: 'dark', vp: { width: 1280, height: 800 }, desc: 'Forecast Standard (Dark Cockpit, Desktop)' },
    
    // 3. Forecast Mode: Solo Grafici
    { 
      name: '03_forecast_charts_mode', 
      route: '#forecast', 
      theme: 'dark', 
      vp: { width: 390, height: 844 }, 
      desc: 'Forecast Solo Grafici (Dark Cockpit, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          const btn = document.querySelector('#forecast-view-charts-btn') || document.querySelector('[data-action="toggle-charts-mode"]');
          if (btn) btn.click();
        `);
      }
    },

    // 4. Forecast Overlay: Analisi Volo Comprensorio & Procedure
    {
      name: '04_forecast_flight_analysis_overlay',
      route: '#forecast',
      theme: 'dark',
      vp: { width: 390, height: 844 },
      desc: 'Overlay Analisi Volo Comprensorio (Dark, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          const expandBtn = document.querySelector('.gm-mini-map-expand-btn') || document.querySelector('[data-action="open-full-map"]');
          if (expandBtn) expandBtn.click();
        `);
      }
    },

    // 5. Spot Map
    { name: '05_spot_map', route: '#map', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Mappa Comprensori (Dark Cockpit, Mobile)' },
    { name: '05_spot_map', route: '#map', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Mappa Comprensori (Sunlight Mode, Mobile)' },
    { name: '05_spot_map', route: '#map', theme: 'dark', vp: { width: 1280, height: 800 }, desc: 'Mappa Comprensori (Dark Cockpit, Desktop)' },

    // 6. Logbook: Elenco Voli
    { name: '06_logbook_flights', route: '#logbook', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Logbook Feed Voli (Dark, Mobile)' },
    { name: '06_logbook_flights', route: '#logbook', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Logbook Feed Voli (Sunlight Mode, Mobile)' },
    { name: '06_logbook_flights', route: '#logbook', theme: 'dark', vp: { width: 1280, height: 800 }, desc: 'Logbook Feed Voli (Dark, Desktop)' },

    // 7. Logbook: Statistiche & Pilot Currency
    {
      name: '07_logbook_stats_currency',
      route: '#logbook',
      theme: 'dark',
      vp: { width: 390, height: 844 },
      desc: 'Logbook Statistiche & Currency (Dark, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          const statsTab = document.querySelector('[data-tab="stats"]') || document.querySelector('.gm-logbook-tab-btn:nth-child(2)');
          if (statsTab) statsTab.click();
        `);
      }
    },

    // 8. Flight Detail Sheet: Schermata Pieno Schermo
    {
      name: '08_flight_detail_sheet',
      route: '#logbook',
      theme: 'dark',
      vp: { width: 390, height: 844 },
      desc: 'Dettaglio Volo Completo con Telemetria Multi-Canale & Debriefing (Dark, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          if (window.__GLIDEMIND__ && window.__GLIDEMIND__.openFlightDetailSheet) {
            window.__GLIDEMIND__.openFlightDetailSheet('fl_cornizzolo_audit_12');
          }
        `);
      }
    },
    {
      name: '08_flight_detail_sheet',
      route: '#logbook',
      theme: 'light',
      vp: { width: 390, height: 844 },
      desc: 'Dettaglio Volo Completo (Sunlight Mode, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          if (window.__GLIDEMIND__ && window.__GLIDEMIND__.openFlightDetailSheet) {
            window.__GLIDEMIND__.openFlightDetailSheet('fl_cornizzolo_audit_12');
          }
        `);
      }
    },

    // 9. Track Setup Sheet: Trimming & Calibrazione Quote
    {
      name: '09_track_setup_sheet',
      route: '#logbook',
      theme: 'dark',
      vp: { width: 390, height: 844 },
      desc: 'Setup Traccia & Calibrazione Quote (Dark, Mobile)',
      beforeCapture: async () => {
        await evalJs(`
          const setupBtn = document.querySelector('#btn-open-track-setup') || document.querySelector('[data-action="open-track-setup"]');
          if (setupBtn) setupBtn.click();
        `);
      }
    },

    // 10. Flight Replay 3D
    { name: '10_flight_replay_3d', route: '#replay', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Replay Traiettoria 3D (Dark, Mobile)' },
    { name: '10_flight_replay_3d', route: '#replay', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Replay Traiettoria 3D (Sunlight Mode, Mobile)' },
    { name: '10_flight_replay_3d', route: '#replay', theme: 'dark', vp: { width: 1280, height: 800 }, desc: 'Replay Traiettoria 3D (Dark, Desktop)' },

    // 11. Settings & Preferences
    { name: '11_settings_view', route: '#settings', theme: 'dark', vp: { width: 390, height: 844 }, desc: 'Impostazioni & Vele (Dark, Mobile)' },
    { name: '11_settings_view', route: '#settings', theme: 'light', vp: { width: 390, height: 844 }, desc: 'Impostazioni & Vele (Sunlight Mode, Mobile)' }
  ];

  console.log(`[Audit] Executing ${scenarios.length} capture scenarios...`);

  for (const scen of scenarios) {
    const isMobile = scen.vp.width < 768;
    const vpTag = isMobile ? 'mobile' : 'desktop';
    const filename = `${scen.name}_${scen.theme}_${vpTag}.png`;
    const targetFile = path.join(SCREENSHOT_DIR, filename);
    const artifactFile = path.join(ARTIFACT_DIR, filename);

    // Set viewport
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: scen.vp.width,
      height: scen.vp.height,
      deviceScaleFactor: 2,
      mobile: isMobile
    });

    // Navigate to route
    await evalJs(`
      if (window.__GLIDEMIND__ && window.__GLIDEMIND__.router) {
        window.__GLIDEMIND__.router.navigate('${scen.route}');
      } else {
        window.location.hash = '${scen.route}';
      }
    `);

    // Set theme
    await evalJs(`
      if (window.__GLIDEMIND__ && window.__GLIDEMIND__.applyTheme) {
        window.__GLIDEMIND__.applyTheme('${scen.theme}');
      } else {
        document.documentElement.setAttribute('data-theme', '${scen.theme}');
      }
    `);

    // Run custom beforeCapture hooks
    if (typeof scen.beforeCapture === 'function') {
      try {
        await scen.beforeCapture();
      } catch (err) {
        console.warn(`[Audit] beforeCapture warning for ${filename}:`, err.message);
      }
    }

    // Wait for DOM settles
    await new Promise((r) => setTimeout(r, 600));

    // Run DOM Heuristic Audit inside page
    const domAudit = await evalJs(`
      (() => {
        const issues = [];
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        // 1. Horizontal page overflow check
        const scrollW = document.documentElement.scrollWidth;
        const clientW = document.documentElement.clientWidth;
        if (scrollW > clientW + 2) {
          issues.push({
            type: 'HORIZONTAL_OVERFLOW',
            severity: 'P0',
            detail: 'ScrollWidth (' + scrollW + 'px) exceeds clientWidth (' + clientW + 'px) by ' + (scrollW - clientW) + 'px.'
          });
        }

        // 2. Touch target check (< 44px)
        const interactive = Array.from(document.querySelectorAll('button, a, input, select, [role="button"], [role="tab"], [role="radio"]'));
        const smallTargets = [];
        for (const el of interactive) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            if ((rect.width < 40 || rect.height < 40) && !el.closest('.gm-splash-screen')) {
              smallTargets.push({
                tag: el.tagName,
                id: el.id || el.className || 'unnamed',
                text: (el.textContent || '').trim().substring(0, 30),
                dimensions: Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px'
              });
            }
          }
        }
        if (smallTargets.length > 0) {
          issues.push({
            type: 'TOUCH_TARGET_SUB_44PX',
            severity: 'P1',
            count: smallTargets.length,
            samples: smallTargets.slice(0, 5)
          });
        }

        // 3. Decorative banned emojis check
        const bannedEmojiRegex = /[📈🎙️⏱️ℹ️🚀✨🔥🎉💡]/u;
        const textNodes = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while (n = walker.nextNode()) {
          if (bannedEmojiRegex.test(n.nodeValue)) {
            textNodes.push(n.nodeValue.trim().substring(0, 40));
          }
        }
        if (textNodes.length > 0) {
          issues.push({
            type: 'BANNED_DECORATIVE_EMOJI',
            severity: 'P2',
            samples: textNodes.slice(0, 3)
          });
        }

        // 4. Flexbox text truncation check
        const textContainers = Array.from(document.querySelectorAll('.flex, [class*="flex"]'));
        let flexTruncations = 0;
        for (const fc of textContainers) {
          for (const ch of fc.children) {
            if (ch.scrollWidth > ch.clientWidth + 4 && getComputedStyle(ch).overflow !== 'visible') {
              flexTruncations++;
            }
          }
        }
        if (flexTruncations > 0) {
          issues.push({
            type: 'FLEX_TEXT_CLIPPING',
            severity: 'P2',
            count: flexTruncations
          });
        }

        return {
          issues,
          pageHeight: document.documentElement.scrollHeight,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      })()
    `);

    // Capture full page screenshot
    const shot = await cdpSend('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(targetFile, buf);
    fs.writeFileSync(artifactFile, buf);

    console.log(`[Screenshot] Saved ${filename} (${Math.round(buf.length / 1024)} KB, ${domAudit.pageHeight}px height)`);

    auditResults.push({
      scenario: scen.desc,
      file: filename,
      bytes: buf.length,
      pageHeight: domAudit.pageHeight,
      issues: domAudit.issues
    });
  }

  // Save audit data manifest
  const manifestPath = path.join(SCREENSHOT_DIR, 'audit-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(auditResults, null, 2));
  console.log(`[Audit Complete] Manifest saved to ${manifestPath}`);

  // Graceful browser shutdown
  await cdpSend('Browser.close').catch(() => {});
} catch (err) {
  console.error('[Audit Fatal Error]:', err);
} finally {
  server.close();
  try {
    chrome.kill();
  } catch {}
  // Cleanup temp profile directory with short delay
  setTimeout(() => {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }, 1000);
}
