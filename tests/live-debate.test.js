import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createDashboard } from '../server/index.js';
import { liveModels } from '../server/debate.js';
import { collectActionsDebate } from '../server/actions-debate.js';

const mission = 'Kamere i vrata trebaju raditi i kad internet padne.';

async function startServer(t, fetchModel, apiKey = 'test-only') {
  const server = createDashboard({ apiKey, fetchModel }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin,
    post: (headers = {}, approvePaid = true) => fetch(origin + '/ai-fight-club/api/debate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ mission, approvePaid }),
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
  assert.deepEqual(status, { live: true, models: liveModels });
  const response = await post();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /ndjson/);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.slice(0, -1).map(event => event.agentId), ['architect', 'engineer', 'ux', 'critic', 'qa', 'security', 'architect']);
  assert.deepEqual(requests.map(request => request.model), events.slice(0, -1).map(event => liveModels[event.agentId]));
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

test('the local dashboard requires approval before any potentially paid request', async t => {
  let called = false;
  const { post } = await startServer(t, () => { called = true; });
  const response = await post({}, false);
  assert.equal(response.status, 400);
  assert.equal(called, false);
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
