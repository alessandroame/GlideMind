/**
 * scripts/generate-icons.mjs
 * Deterministic generation of PWA icons and Apple Touch Icon from master SVG
 * using headless Chrome / Edge. Zero external npm dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const iconsDir = path.join(projectRoot, 'assets', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Locate Chrome or Edge
function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const bin of candidates) {
    if (fs.existsSync(bin)) {
      return bin;
    }
  }

  throw new Error('Nessun browser Chromium trovato per la rasterizzazione delle icone.');
}

const wingSvgContent = fs.readFileSync(path.join(iconsDir, 'glidemind-wing.svg'), 'utf-8');

const targets = [
  {
    name: 'icon-512.png',
    size: 512,
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 512px; height: 512px;
      background: #0b0d12;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .container {
      width: 512px; height: 512px;
      display: flex; align-items: center; justify-content: center;
    }
    svg { width: 440px; height: 440px; }
  </style>
</head>
<body>
  <div class="container">
    ${wingSvgContent}
  </div>
</body>
</html>`
  },
  {
    name: 'icon-192.png',
    size: 192,
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 192px; height: 192px;
      background: #0b0d12;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .container {
      width: 192px; height: 192px;
      display: flex; align-items: center; justify-content: center;
    }
    svg { width: 164px; height: 164px; }
  </style>
</head>
<body>
  <div class="container">
    ${wingSvgContent}
  </div>
</body>
</html>`
  },
  {
    name: 'icon-maskable-512.png',
    size: 512,
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 512px; height: 512px;
      background: #0b0d12;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    /* Safe-zone circular 80% boundary requires max 380px symbol size */
    .container {
      width: 512px; height: 512px;
      display: flex; align-items: center; justify-content: center;
    }
    svg { width: 340px; height: 340px; }
  </style>
</head>
<body>
  <div class="container">
    ${wingSvgContent}
  </div>
</body>
</html>`
  },
  {
    name: 'apple-touch-icon.png',
    size: 180,
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 180px; height: 180px;
      background: #0b0d12;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .container {
      width: 180px; height: 180px;
      display: flex; align-items: center; justify-content: center;
    }
    svg { width: 150px; height: 150px; }
  </style>
</head>
<body>
  <div class="container">
    ${wingSvgContent}
  </div>
</body>
</html>`
  }
];

export function generateAllIcons() {
  const browserBin = findBrowser();
  console.log(`[Icon Generator] Browser individuato: ${browserBin}`);

  const tmpHtmlPath = path.join(projectRoot, 'tmp_icon_render.html');

  for (const target of targets) {
    const outPath = path.join(iconsDir, target.name);
    fs.writeFileSync(tmpHtmlPath, target.html, 'utf-8');

    const fileUrl = 'file:///' + tmpHtmlPath.replace(/\\/g, '/');
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--window-size=${target.size},${target.size}`,
      `--screenshot=${outPath}`,
      fileUrl
    ];

    const result = spawnSync(browserBin, args, { stdio: 'ignore' });
    if (result.error) {
      throw result.error;
    }

    if (fs.existsSync(outPath)) {
      const stats = fs.statSync(outPath);
      console.log(`[Icon Generator] Generata ${target.name} (${target.size}x${target.size}px, ${stats.size} byte)`);
    } else {
      throw new Error(`Generazione fallita per ${target.name}`);
    }
  }

  if (fs.existsSync(tmpHtmlPath)) {
    fs.unlinkSync(tmpHtmlPath);
  }

  console.log('[Icon Generator] Bundle iconografico PWA generato con successo.');
}

if (process.argv[1] && process.argv[1].endsWith('generate-icons.mjs')) {
  generateAllIcons();
}
