import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { createDashboard } from '../server/index.js';

const password = randomBytes(32).toString('hex');
const key = process.env.OPENROUTER_API_KEY?.trim();
delete process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('The OpenRouter secret is unavailable.');
const bridgeOrigin = 'https://bridge.example.test:9443';
const pagesOrigin = 'https://0eroiq.github.io';
const asset = name => new URL(name, new URL('../dist/', import.meta.url));
const calls = [];
const { promise: canReply, resolve: releaseReply } = Promise.withResolvers();
const backend = createDashboard({
  apiKey: key,
  bridge: { origin: bridgeOrigin, password },
  async fetchModel(url, options) {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    if (options.headers.Authorization !== 'Bearer ' + key) throw new Error('Unexpected provider authorization.');
    const body = JSON.parse(options.body);
    assert.match(body.model, /:free$/);
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0 });
    assert(!JSON.stringify(body).includes(password));
    calls.push(body);
    if (calls.length === 2) await canReply;
    return fetch(url,options);
  },
}).listen(0, '127.0.0.1');
await once(backend, 'listening');
const proxy = createServer({
  key: await readFile(new URL('./key.pem', import.meta.url)),
  cert: await readFile(new URL('./cert.pem', import.meta.url)),
}, (req, res) => {
  const outgoing = request('http://127.0.0.1:' + backend.address().port + req.url, {
    method: req.method,
    headers: { ...req.headers, 'x-forwarded-proto': 'https' },
  }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers);
    res.flushHeaders();
    upstream.pipe(res);
  });
  res.on('close', () => outgoing.destroy());
  outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502).end(); });
  req.pipe(outgoing);
}).listen(9443, '127.0.0.1');
await once(proxy, 'listening');
let browser;
try {
  browser = await chromium.launch({
    args: ['--host-resolver-rules=MAP bridge.example.test 127.0.0.1', '--no-proxy-server', '--disable-features=LocalNetworkAccessChecks'],
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport:{width:390,height:820} });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route(pagesOrigin + '/ai-fight-club/**', async route => {
    const path = new URL(route.request().url()).pathname.slice('/ai-fight-club/'.length) || 'index.html';
    assert.match(path, /^(index\.html|assets\/[\w-]+\.(js|css))$/);
    const type = {html:'text/html',js:'text/javascript',css:'text/css'}[path.split('.').at(-1)];
    const body = await readFile(asset(path));
    assert(!body.includes(key) && !body.includes(password));
    await route.fulfill({ status:200, contentType:type, body });
  });
  await page.goto(pagesOrigin + '/ai-fight-club/');
  const start = page.getByRole('button', {name:/Start Live Debate/});
  await start.waitFor({state:'visible',timeout:12000});
  assert.equal(await page.getByRole('button',{name:'Import transcript'}).isVisible(),false);
  const secret = page.getByLabel('Dashboard password');
  await page.getByLabel('MISSION DIRECTIVE').fill('Design a small public library catalogue. Debate whether subject folders or search should be the default, considering accessibility and offline use.');
  await secret.fill('a'.repeat(64));
  await start.click();
  await page.getByText('The dashboard password is incorrect.').waitFor();
  assert.equal(calls.length,0);
  assert.equal(await secret.inputValue(),'');
  await secret.fill(password);
  await start.click();
  const replies = page.locator('#feed article');
  const notice = page.locator('#notice');
  const state = page.locator('#state');
  await replies.first().or(page.getByText('DEBATE INTERRUPTED',{exact:true})).waitFor({timeout:75000});
  if ((await state.innerText()).includes('INTERRUPTED')) throw new Error(await notice.innerText());
  assert.equal(await replies.count(),1);
  assert.equal(await page.getByText('LIVE DEBATE COMPLETE').count(),0);
  releaseReply();
  await page.getByText('LIVE DEBATE COMPLETE').or(page.getByText('DEBATE INTERRUPTED',{exact:true})).waitFor({timeout:445000});
  if ((await state.innerText()).includes('INTERRUPTED')) throw new Error(await notice.innerText());
  assert.equal(await replies.count(),7);
  assert.match(await replies.last().innerText(),/RESOLUTION\s+#07/);
  assert.equal(await page.locator('#feed img').count(),0);
  assert.equal(await secret.inputValue(),'');
  assert.equal(calls.length,7);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);

  const proof = {
    status: await state.innerText(),
    replies: await replies.allInnerTexts(),
    models: calls.map(call => call.model),
    synthesis: await replies.last().innerText(),
  };
  const proofJson = JSON.stringify(proof,null,2);
  if (proofJson.includes(key) || proofJson.includes(password)) throw new Error('A private credential appeared in the proof.');
  await writeFile('bridge-browser-proof.json',proofJson);
  console.log('HTTPS browser validation displayed all seven real free-model replies, including #07 RESOLUTION.');
} finally {
  releaseReply();
  await browser?.close();
  proxy.close();
  backend.close();
}
