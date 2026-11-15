import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateRequest } from '../src/council.js';
import { runDebate } from './debate.js';

export async function collectActionsDebate({ mission, apiKey, fetchModel }) {
  const events = [];
  for await (const event of runDebate(mission, {
    apiKey,
    fetchModel,
    freeOnly: true,
    signal: AbortSignal.timeout(8 * 60_000),
  })) {
    events.push(event);
  }
  if (!['error', 'complete'].includes(events.at(-1)?.type)) {
    events.push({ type: 'error', message: 'The council reached its time limit.' });
  }
  return { version: 1, mission, events };
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const mission = process.env.DEBATE_MISSION?.trim() || '';
  if (!apiKey) {
    console.error('The GitHub Actions OpenRouter secret is missing.');
    return 1;
  }
  if (mission.length > 3000 || validateRequest(mission) || mission.includes(apiKey)) {
    console.error('Enter a public mission between 12 and 3000 characters, without credentials.');
    return 1;
  }
  const transcript = await collectActionsDebate({ mission, apiKey });
  await writeFile('debate.json', JSON.stringify(transcript, null, 2) + '\n', { flag: 'wx' });
  if (transcript.events.at(-1)?.type !== 'complete') {
    console.error('The council was interrupted. See the transcript artifact for available replies.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    console.error('The debate could not be saved.');
    process.exitCode = 1;
  });
}
