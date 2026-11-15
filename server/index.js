import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { validateRequest } from '../src/council.js';
import { freeModels, runDebate } from './debate.js';

const host = '127.0.0.1';
const port = 4173;
const origin = 'http://' + host + ':' + port;
const base = '/ai-fight-club/';
const dist = new URL('../dist/', import.meta.url);
const pagesOrigin = 'https://0eroiq.github.io';
const statusPath = base + 'api/status';
const debatePath = base + 'api/debate';

function authorizationDigest(value) {
  return createHash('sha256').update(value).digest();
}

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

export function createDashboard({ apiKey, fetchModel, bridge }) {
  let bridgeHost;
  let expectedAuthorization;
  if (bridge) {
    const address = new URL(bridge.origin);
    if (address.protocol !== 'https:' || address.origin !== bridge.origin ||
        !/^[0-9a-f]{64}$/.test(bridge.password || '') || !apiKey || apiKey === bridge.password) {
      throw new Error('The bridge requires an HTTPS origin, an OpenRouter key and a separate generated password.');
    }
    bridgeHost = address.host;
    expectedAuthorization = authorizationDigest('Basic ' + Buffer.from('council:' + bridge.password).toString('base64'));
  }
  let running = false;

  return createServer({ requestTimeout: 15_000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const requestOrigin = bridge ? pagesOrigin : 'http://' + req.headers.host;
    if (bridge) {
      res.setHeader('Vary', 'Origin');
      if (req.headers.host !== bridgeHost || req.headers['x-forwarded-proto'] !== 'https' ||
          req.headers.origin !== pagesOrigin) {
        return json(res, 403, { error: 'Use the authorized dashboard over HTTPS.' });
      }
      res.setHeader('Access-Control-Allow-Origin', pagesOrigin);
      if (req.method === 'OPTIONS' && req.url === debatePath) {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        });
        return res.end();
      }
    } else if (req.headers.host !== host + ':' + (req.socket.localPort || port)) {
      return json(res, 403, { error: 'Use the local dashboard address.' });
    }
    if (req.method === 'GET' && req.url === statusPath) {
      return json(res, 200, { live: Boolean(apiKey), models: freeModels });
    }
    if (req.method === 'POST' && req.url === debatePath) {
      if (req.headers.origin !== requestOrigin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        return json(res, 403, { error: 'Start the debate from the dashboard.' });
      }
      if (bridge && !timingSafeEqual(expectedAuthorization, authorizationDigest(req.headers.authorization || ''))) {
        return json(res, 401, { error: 'The dashboard password is incorrect.' });
      }
      if (!apiKey) return json(res, 503, { error: 'The server needs an OpenRouter key.' });
      if (running) return json(res, 409, { error: 'A debate is already running.' });
      running = true;
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      let heartbeat;
      try {
        const request = await readDebateRequest(req);
        const mission = request?.mission;
        if (typeof mission !== 'string' || mission.length > 3000 || validateRequest(mission) ||
            mission.includes(apiKey) || (bridge && mission.includes(bridge.password))) {
          return json(res, 400, { error: 'Enter a mission between 12 and 3000 characters without credentials.' });
        }

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        heartbeat = setInterval(() => res.write('\n'), 15_000);
        for await (const event of runDebate(mission.trim(), { apiKey, signal: controller.signal, fetchModel })) {
          if (controller.signal.aborted) break;
          res.write(JSON.stringify(event) + '\n');
        }
        res.end();
      } catch {
        if (!res.headersSent && !res.destroyed) json(res, 400, { error: 'The debate request could not be read.' });
        else res.end();
      } finally {
        clearInterval(heartbeat);
        running = false;
      }
      return;
    }

    if (bridge) return json(res, 404, { error: 'Not found.' });
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
  const bridgeOrigin = process.env.COUNCIL_BRIDGE_ORIGIN?.trim();
  const bridgePassword = process.env.COUNCIL_BRIDGE_PASSWORD?.trim();
  const bridge = bridgeOrigin || bridgePassword ? { origin: bridgeOrigin, password: bridgePassword } : undefined;
  try {
    if (!apiKey && !bridge) console.warn('Demo mode: OPENROUTER_API_KEY is missing.');
    createDashboard({ apiKey, bridge }).listen(port, host, () => {
      console.log(bridge ? 'Council bridge listening on loopback.' : 'Dashboard: ' + origin + base);
    });
  } catch {
    console.error('Set a valid COUNCIL_BRIDGE_ORIGIN, a generated COUNCIL_BRIDGE_PASSWORD and OPENROUTER_API_KEY to start the bridge.');
    process.exitCode = 1;
  }
}
