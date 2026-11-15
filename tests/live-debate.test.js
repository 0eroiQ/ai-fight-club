import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createDashboard } from '../server/index.js';
import { freeModels } from '../server/debate.js';
import { collectActionsDebate } from '../server/actions-debate.js';

const mission = 'Kamere i vrata trebaju raditi i kad internet padne.';

async function startServer(t, fetchModel, apiKey = 'test-only', bridge) {
  const server = createDashboard({ apiKey, fetchModel, bridge }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin,
    post: (headers = {}) => fetch(origin + '/ai-fight-club/api/debate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ mission }),
    }),
  };
}

test('live models receive the mission and prior replies in order', async t => {
  const requests = [];
  const { post, origin } = await startServer(t, (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    requests.push(JSON.parse(options.body));
    return Response.json({ choices: [{ message: { content: 'Reply ' + requests.length } }] });
  });
  const status = await fetch(origin + '/ai-fight-club/api/status').then(response => response.json());
  assert.deepEqual(status, { live: true, models: freeModels });
  const response = await post();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /ndjson/);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.slice(0, -1).map(event => event.agentId), ['architect', 'engineer', 'ux', 'critic', 'qa', 'security', 'architect']);
  assert.deepEqual(requests.map(request => request.model), events.slice(0, -1).map(event => freeModels[event.agentId]));
  for (const [index, request] of requests.entries()) {
    const context = JSON.parse(request.messages[1].content);
    assert.equal(context.mission, mission);
    assert.deepEqual(context.transcript.map(turn => turn.reply), events.slice(0, index).map(event => event.message));
    assert.equal(request.tools, undefined);
  }
  assert.deepEqual(events.at(-1), { type: 'complete', messages: 7 });
});

test('a foreign origin cannot start a debate', async t => {
  let called = false;
  const { post } = await startServer(t, () => { called = true; });
  const response = await post({ Origin: 'https://other.example' });
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test('provider failures preserve earlier replies without claiming completion', async t => {
  let calls = 0;
  const { post } = await startServer(t, () => {
    calls++;
    return calls === 1
      ? Response.json({ choices: [{ message: { content: 'First reply' } }] })
      : new Response('internal details', { status: 402 });
  });
  const response = await post();
  const result = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(result.map(event => event.type), ['message', 'error']);
  assert.match(result[1].message, /insufficient credit/);
  assert.equal(calls, 2);
});

test('the Pages bridge authenticates the owner and streams seven free replies without disclosing credentials', async t => {
  const key = 'test-openrouter-key';
  const password = 'f'.repeat(64);
  const pagesOrigin = 'https://0eroiq.github.io';
  const access = {
    Host: 'bridge.example.test',
    Origin: pagesOrigin,
    'X-Forwarded-Proto': 'https',
    Authorization: 'Basic ' + Buffer.from('council:' + password).toString('base64'),
  };
  const calls = [];
  const { origin } = await startServer(t, (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    assert(!JSON.stringify(options).includes(password));
    const request = JSON.parse(options.body);
    assert.match(request.model, /:free$/);
    assert.deepEqual(request.provider, {
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0, request: 0 },
    });
    calls.push(request.model);
    return Response.json({ choices: [{ message: { content: 'Reply ' + calls.length + ' ' + key } }] });
  }, key, { origin: 'https://bridge.example.test', password });

  const request = (method, headers = {}, path = 'debate') => new Promise((resolve, reject) => {
    const req = httpRequest(origin + '/ai-fight-club/api/' + path, {
      method, headers: { ...access, 'Content-Type': 'application/json', ...headers },
    }, async response => {
      try {
        const chunks = await Array.fromAsync(response);
        resolve(new Response(chunks.length ? Buffer.concat(chunks) : null, {
          status: response.statusCode, headers: response.headers,
        }));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
    req.end(method === 'POST' ? JSON.stringify({ mission }) : undefined);
  });
  const preflight = await request('OPTIONS', {
    Authorization: '',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  const status = await request('GET', { Authorization: '' }, 'status');
  assert.deepEqual(await status.json(), { live: true, models: freeModels });
  assert.equal((await request('POST', { Authorization: 'Basic wrong' })).status, 401);
  const foreign = await request('POST', { Origin: 'https://other.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  assert.equal((await request('POST', { 'X-Forwarded-Proto': 'http' })).status, 403);
  assert.equal((await request('POST', { Host: 'other.example' })).status, 403);
  assert.equal(calls.length, 0);

  const response = await request('POST');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
  const body = await response.text();
  assert(!body.includes(key));
  assert(!body.includes(password));
  const events = body.trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 7);
  assert.equal(new Set(calls).size, 6);
  assert.equal(events[6].tag, 'RESOLUTION');
  assert.deepEqual(events[7], { type: 'complete', messages: 7 });
});

test('the Actions debate is limited to seven free calls and redacts credentials in output', async () => {
  const apiKey = 'fixture-openrouter-key';
  const models = [];
  const transcript = await collectActionsDebate({
    mission,
    apiKey,
    fetchModel(url, options) {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer ' + apiKey);
      const request = JSON.parse(options.body);
      assert.match(request.model, /:free$/);
      assert.equal(request.models, undefined);
      assert.equal(request.tools, undefined);
      assert.deepEqual(request.plugins, [{ id: 'web', enabled: false }]);
      assert.deepEqual(request.provider, {
        allow_fallbacks: false,
        max_price: { prompt: 0, completion: 0, request: 0 },
      });
      assert.doesNotMatch(options.body, /fixture-openrouter-key/);
      models.push(request.model);
      return Response.json({ choices: [{ message: { content: 'Reply ' + apiKey } }] });
    },
  });
  assert.equal(transcript.version, 1);
  assert.equal(models.length, 7);
  assert.equal(new Set(models).size, 6);
  assert.equal(models[0], models.at(-1));
  assert.deepEqual(transcript.events.at(-1), { type: 'complete', messages: 7 });
  assert.doesNotMatch(JSON.stringify(transcript), /fixture-openrouter-key/);
});

test('the Actions debate stops at a rate limit and keeps the replies it received', async () => {
  let calls = 0;
  const { events } = await collectActionsDebate({
    mission,
    apiKey: 'test-only',
    fetchModel() {
      calls++;
      return calls === 1
        ? Response.json({ choices: [{ message: { content: 'First reply' } }] })
        : new Response('raw provider detail', { status: 429 });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(events.map(event => event.type), ['message', 'error']);
  assert.match(events.at(-1).message, /rate-limited/);
  assert.doesNotMatch(JSON.stringify(events), /raw provider detail/);
});

test('resuming a saved Actions debate preserves completed replies and sends only the missing turns', async () => {
  const apiKey = 'fixture-only';
  let attempts = 0;
  const checkpoint = await collectActionsDebate({
    mission, apiKey,
    fetchModel() {
      return ++attempts <= 5
        ? Response.json({ choices: [{ message: { content: 'Original reply ' + attempts } }] })
        : new Response(null, { status: 429 });
    },
  });
  const saved = checkpoint.events.slice(0, -1);
  assert.equal(saved.length, 5);

  const requests = [];
  const complete = await collectActionsDebate({
    mission, apiKey, checkpoint: JSON.parse(JSON.stringify(checkpoint)),
    fetchModel(_url, options) {
      const request = JSON.parse(options.body);
      requests.push(request);
      assert.match(request.model, /:free$/);
      assert.deepEqual(request.provider.max_price, { prompt: 0, completion: 0, request: 0 });
      return Response.json({ choices: [{ message: { content: 'Resumed reply ' + requests.length } }] });
    },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(complete.events.slice(0, 5), saved);
  assert.deepEqual(requests.map(request => JSON.parse(request.messages[1].content).transcript.map(turn => turn.reply)), [
    saved.map(event => event.message),
    [...saved.map(event => event.message), 'Resumed reply 1'],
  ]);
  assert.deepEqual(complete.events.slice(5, 7).map(({ step, tag }) => [step, tag]), [
    [6, 'SECURITY'], [7, 'RESOLUTION'],
  ]);
  assert.deepEqual(complete.events.at(-1), { type: 'complete', messages: 7 });
});

test('a bad or already complete checkpoint is rejected before any model call', async () => {
  const reply = {
    type: 'message', agentId: 'architect', tag: 'PROPOSAL', step: 1,
    model: 'nvidia/nemotron-3.5-lightning:free', message: 'Saved reply',
  };
  const failure = { type: 'error' };
  let calls = 0;
  for (const checkpoint of [
    { version: 1, mission: 'A different mission with different replies', events: [reply, failure] },
    { version: 1, mission, events: [{ ...reply, step: 2 }, failure] },
    { version: 1, mission, events: [{ ...reply, model: 'nvidia/nemotron-3.5-lightning' }, failure] },
    { version: 1, mission, events: [{ ...reply, message: 'abc fixture-only' }, failure] },
    { version: 1, mission, events: [reply, { type: 'complete', messages: 7 }] },
  ]) {
    await assert.rejects(collectActionsDebate({
      mission, apiKey: 'fixture-only', checkpoint, fetchModel() { calls++; },
    }), /saved transcript/);
  }
  assert.equal(calls, 0);
});
