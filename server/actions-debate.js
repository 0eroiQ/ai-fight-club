import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateRequest } from '../src/council.js';
import { interruptedReplies, runDebate } from './debate.js';

export async function collectActionsDebate({ mission, apiKey, fetchModel, checkpoint }) {
  if (checkpoint !== undefined && (checkpoint?.version !== 1 || checkpoint.mission !== mission)) {
    throw new Error('The saved transcript has an unsupported version or a different mission.');
  }
  const previousReplies = checkpoint === undefined ? [] : interruptedReplies(checkpoint.events, apiKey);
  const events = [...previousReplies];
  for await (const event of runDebate(mission, {
    apiKey,
    fetchModel,
    previousReplies,
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
  const requestedMission = process.env.DEBATE_MISSION?.trim() || '';
  if (!apiKey) {
    console.error('The GitHub Actions OpenRouter secret is missing.');
    return 1;
  }
  let checkpoint;
  if (process.env.RESUME_RUN_ID) {
    if (requestedMission) {
      console.error('Leave the mission blank when resuming a debate.');
      return 1;
    }
    try {
      const path = 'resume/debate.json';
      if ((await stat(path)).size > 128 * 1024) throw new Error();
      checkpoint = JSON.parse(await readFile(path, 'utf8'));
      if (checkpoint?.version !== 1) throw new Error();
    } catch {
      console.error('The previous run did not provide a valid interrupted free debate transcript.');
      return 1;
    }
  }
  const mission = checkpoint === undefined ? requestedMission : checkpoint.mission;
  if (typeof mission !== 'string' || mission.length > 3000 || validateRequest(mission) || mission.includes(apiKey)) {
    console.error('Enter a public mission between 12 and 3000 characters, without credentials.');
    return 1;
  }
  const transcript = await collectActionsDebate({ mission, apiKey, checkpoint });
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
