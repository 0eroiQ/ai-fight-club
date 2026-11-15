import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { validateRequest } from '../src/council.js';
import { liveModels, runDebate } from './debate.js';

const host = '127.0.0.1';
const port = 4173;
const origin = 'http://' + host + ':' + port;
const base = '/ai-fight-club/';
const dist = new URL('../dist/', import.meta.url);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readDebateRequest(req) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function createDashboard({ apiKey, fetchModel }) {
  let running = false;

  return createServer({ requestTimeout: 15_000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.headers.host !== host + ':' + (req.socket.localPort || port)) {
      return json(res, 403, { error: 'Use the local dashboard address.' });
    }
    if (req.method === 'GET' && req.url === base + 'api/status') {
      return json(res, 200, { live: Boolean(apiKey), models: liveModels });
    }
    if (req.method === 'POST' && req.url === base + 'api/debate') {
      const requestOrigin = 'http://' + req.headers.host;
      if (req.headers.origin !== requestOrigin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        return json(res, 403, { error: 'Start the debate from the local dashboard.' });
      }
      if (!apiKey) return json(res, 503, { error: 'The server needs an OpenRouter key.' });
      if (running) return json(res, 409, { error: 'A debate is already running.' });
      running = true;
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      try {
        const request = await readDebateRequest(req);
        const mission = request?.mission;
        if (typeof mission !== 'string' || mission.length > 3000 || validateRequest(mission)) {
          return json(res, 400, { error: 'Enter a mission between 12 and 3000 characters.' });
        }
        if (request.approvePaid !== true) {
          return json(res, 400, { error: 'Confirm OpenRouter charges before starting a local debate.' });
        }

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.flushHeaders();
        for await (const event of runDebate(mission.trim(), { apiKey, signal: controller.signal, fetchModel })) {
          if (controller.signal.aborted) break;
          res.write(JSON.stringify(event) + '\n');
        }
        res.end();
      } catch {
        if (!res.headersSent && !res.destroyed) json(res, 400, { error: 'The debate request could not be read.' });
        else res.end();
      } finally {
        running = false;
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    if (req.method === 'GET' && req.url?.startsWith(base)) {
      const relativePath = req.url.slice(base.length);
      const asset = /^assets\/[\w-]+\.(js|css)$/.exec(relativePath);
      if (!relativePath || asset) {
        const mime = { js: 'text/javascript', css: 'text/css' };
        try {
          const data = await readFile(new URL(relativePath || 'index.html', dist));
          res.writeHead(200, {
            'Content-Type': (asset ? mime[asset[1]] : 'text/html') + '; charset=utf-8',
            'Cache-Control': 'no-cache',
          });
          return res.end(data);
        } catch {
          return json(res, 404, { error: 'Dashboard build missing. Run npm run build.' });
        }
      }
    }
    return json(res, 404, { error: 'Not found.' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) console.warn('Demo mode: OPENROUTER_API_KEY is missing.');
  createDashboard({ apiKey }).listen(port, host, () => console.log('Dashboard: ' + origin + base));
}
