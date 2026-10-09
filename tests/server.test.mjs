import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('GlideMind Static Dev Server Integration', () => {
  let server;
  let serverPort;

  before(async () => {
    const MIME_TYPES = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    };

    server = http.createServer((req, res) => {
      let pathname = req.url.split('?')[0];
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
          res.end();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should serve index.html with text/html at root /', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('id="app-root"'));
    assert.ok(text.includes('GlideMind'));
  });

  it('should serve css/theme.css with text/css', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/css/theme.css`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/css'));
    const text = await res.text();
    assert.ok(text.includes('--gm-bg-base'));
  });

  it('should serve ui/app.js with application/javascript', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/ui/app.js`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('javascript'));
  });

  it('should serve data/locations.json with application/json containing valid catalog', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/data/locations.json`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const data = await res.json();
    assert.ok(data.IT, 'Catalog should contain IT country data');
  });
});
