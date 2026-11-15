import './style.css';
import {AGENTS,DEFAULT_REQUEST,createDemoDebate,summarizeRun,validateRequest} from './council.js';

const root=document.getElementById('app');
let timer=null;
let live=false;
const localDashboard = location.origin === 'http://127.0.0.1:4173';
const bridgeOrigin = localDashboard ? '' : import.meta.env.VITE_COUNCIL_BRIDGE_ORIGIN?.trim();
const liveApiBase = bridgeOrigin ? bridgeOrigin + import.meta.env.BASE_URL + 'api/' : './api/';
root.innerHTML = [
'<div class="shell"><aside class="sidebar">',
'<div class="brand"><div class="brandmark">✳</div><div><b>AI FIGHT CLUB</b><small>ENGINEERING COUNCIL</small></div></div>',
'<div class="nav-label">WORKSPACE</div>',
'<div class="nav selected">◈ &nbsp; Mission Control</div>',
'<div class="nav">⌘ &nbsp; Agent Council</div>',
'<div class="nav">▤ &nbsp; Review Queue</div>',
'<div class="nav">◷ &nbsp; Run History</div>',
'<div class="sidebar-bottom" id="sidebar-mode"><span class="green-dot"></span> SIMULATION MODE<small>No API keys needed</small></div>',
'</aside><main><header><span>WORKSPACE &nbsp; / &nbsp; MISSION CONTROL</span><span class="topright"><em id="environment">DEMO ENVIRONMENT</em><strong>E</strong></span></header>',
'<div class="content"><div class="intro"><div><div class="eyebrow">● &nbsp; COMMAND CENTER &nbsp;·&nbsp; V0.1</div><h1>Mission Control<span>.</span></h1><p>One request. Six minds. Zero unauthorized decisions.</p></div><div class="online">● &nbsp; SYSTEM ONLINE</div></div>',
'<section class="metrics"><div><label>COUNCIL MEMBERS</label><h3>06 <span>/ 06</span></h3><p>Ready to deliberate</p></div><div><label>OPERATING MODE</label><h3 class="mode" id="mode">DEMO</h3><p id="mode-description">Simulated agent responses</p></div><div><label>PRODUCTION CHANGES</label><h3>00</h3><p>Protected by design</p></div></section>',
'<div class="workgrid"><section class="panel mission"><div class="panelhead"><span>✧</span><h2>New Mission</h2><small>01 / BRIEF</small></div><p class="hint">Describe your requirements. The council will debate the approach before any code is written.</p><form id="mission-form"><label class="fieldlabel" for="mission">MISSION DIRECTIVE</label><textarea id="mission" maxlength="3000" spellcheck="false"></textarea><div id="bridge-access" hidden><label class="fieldlabel" for="bridge-password">Dashboard password</label><input id="bridge-password" type="password" maxlength="64" autocomplete="off" spellcheck="false"></div><div class="mission-actions"><span>⌑ &nbsp; No deployments · No repo changes</span><button id="launch" type="submit">▶ &nbsp; Start Debate</button></div></form><p id="notice" role="status" aria-live="polite"></p></section>',
'<section class="panel"><div class="panelhead"><span>♧</span><h2>The Council</h2><small>06 AGENTS</small></div><div id="agents" class="agents"></div><p class="fineprint" id="provider-note">The demo uses scripted replies. Imported debates show the model for each reply.</p></section></div>',
'<section class="panel actions-bridge" id="actions-bridge"><h2>Live debate on GitHub</h2><p>Open GitHub Actions, select Run workflow, and enter a public mission. Download and unzip the transcript from the run, then choose debate.json here.</p><div><a href="https://github.com/0eroiQ/ai-fight-club/actions/workflows/live-debate.yml">Open debate workflow</a><label for="transcript-file">Import transcript <input type="file" id="transcript-file" accept=".json,application/json"></label></div><p id="import-status" role="status" hidden></p></section>',
'<section class="panel debate"><div class="panelhead"><span>☷</span><h2>Debate Room</h2><small class="state" id="state">AWAITING MISSION</small></div><p id="transcript-mission" hidden></p><div id="feed" class="feed"><div class="empty">⌁<strong>The council is waiting.</strong><p>Submit a mission to watch the simulated debate unfold.</p></div></div><div class="feedfoot"><span id="count">0 messages</span><span>Approval gate: <b>Human review required</b></span></div></section>',
'<footer><span>AI FIGHT CLUB &nbsp; / &nbsp; Built for thoughtful engineering</span><span id="footer-mode">SIMULATION ONLY &nbsp; ● &nbsp; NO CODE EXECUTION</span></footer>',
'</div></main></div>'
].join('');

const mission=document.getElementById('mission'),launch=document.getElementById('launch'),feed=document.getElementById('feed'),status=document.getElementById('state'),notice=document.getElementById('notice'),count=document.getElementById('count');
const transcriptMission = document.getElementById('transcript-mission');
const fileInput = document.getElementById('transcript-file');
const importStatus = document.getElementById('import-status');
const bridgePassword = document.getElementById('bridge-password');
mission.value=DEFAULT_REQUEST;
const allAgents=document.getElementById('agents');
for(const a of AGENTS){
  const card=document.createElement('div');card.className='agent';
  const avatar=document.createElement('span');avatar.className='avatar';avatar.style.setProperty('--accent',a.color);avatar.textContent=a.icon;
  const details=document.createElement('div');const name=document.createElement('b');name.textContent=a.name;
  const role=document.createElement('span');role.textContent=a.role;
  const provider=document.createElement('small');provider.textContent=a.provider;provider.dataset.agentId=a.id;
  details.append(name,role,provider);card.append(avatar,details);allAgents.append(card);
}
function addMessage(entry){
  const item=document.createElement('article');item.className='message';
  const avatar=document.createElement('span');avatar.className='avatar';avatar.style.setProperty('--accent',entry.agent.color);avatar.textContent=entry.agent.icon;
  const body=document.createElement('div');body.className='body';
  const heading=document.createElement('div');heading.className='msghead';
  const name=document.createElement('b');name.textContent=entry.label || entry.agent.name;
  const tag=document.createElement('em');tag.textContent=entry.tag;
  const step=document.createElement('small');step.textContent='#'+String(entry.step).padStart(2,'0');
  tag.title=entry.model || '';
  heading.append(name,tag,step);
  const p=document.createElement('p');p.textContent=entry.message;
  body.append(heading,p);item.append(avatar,body);feed.append(item);feed.scrollTop=feed.scrollHeight;
}

function parseTranscript(text) {
  const data = JSON.parse(text);
  const invalid = new Error('Choose a valid debate.json from a GitHub Actions run.');
  if (data?.version !== 1 || typeof data.mission !== 'string' || data.mission.length > 3000 ||
      validateRequest(data.mission) || !Array.isArray(data.events) || data.events.length > 8) throw invalid;

  const terminal = data.events.at(-1);
  const replies = data.events.slice(0, -1).map((event, index) => {
    const agent = AGENTS.find(candidate => candidate.id === event?.agentId);
    if (!agent || event.type !== 'message' || event.step !== index + 1 ||
        typeof event.tag !== 'string' || typeof event.message !== 'string' ||
        typeof event.model !== 'string' || !event.model.endsWith(':free')) throw invalid;
    return { ...event, agent, label: event.model };
  });
  if (terminal?.type === 'complete' && terminal.messages === 7 && replies.length === 7) {
    return { mission: data.mission, replies, complete: true };
  }
  if (terminal?.type === 'error' && typeof terminal.message === 'string' && replies.length < 7) {
    return { mission: data.mission, replies, error: terminal.message };
  }
  throw invalid;
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  importStatus.hidden = false;
  try {
    if (file.size > 128 * 1024) throw new Error('The transcript file is too large.');
    const result = parseTranscript(await file.text());
    if (launch.disabled) throw new Error('Wait for the current discussion to finish before importing.');
    feed.replaceChildren();
    transcriptMission.textContent = result.mission;
    transcriptMission.hidden = false;
    for (const reply of result.replies) addMessage(reply);
    feed.scrollTop = 0;
    count.textContent = result.replies.length + ' messages';
    status.textContent = result.complete ? '✓ GITHUB ACTIONS DEBATE COMPLETE' : 'GITHUB ACTIONS DEBATE INTERRUPTED';
    status.className = result.complete ? 'state complete' : 'state';
    notice.textContent = '';
    importStatus.textContent = result.error || 'Transcript loaded in the Debate Room.';
  } catch (error) {
    importStatus.textContent = error instanceof SyntaxError ? 'Choose a valid debate.json file.' : error.message;
  }
});

document.getElementById('mission-form').addEventListener('submit', event => {
  event.preventDefault();
  if(launch.disabled || timer!==null)return;
  const error=validateRequest(mission.value);if(error){notice.textContent=error;return;}
  if(live){
    void startLiveDebate();
    return;
  }
  const events=createDemoDebate(mission.value);let cursor=0;
  transcriptMission.hidden = true;
  importStatus.hidden = true;
  feed.replaceChildren();notice.textContent='';count.textContent='0 messages';status.textContent='● DISCUSSION IN PROGRESS';status.className='state active';launch.disabled=true;launch.textContent='Debating…';
  timer=setInterval(()=>{
    if(cursor>=events.length){
      clearInterval(timer);timer=null;launch.disabled=false;launch.textContent='↻ Run Again';
      status.textContent='✓ SIMULATION COMPLETE';status.className='state complete';
      const summary=summarizeRun(events);
      notice.textContent='Demo complete: '+summary.messages+' scripted messages from '+summary.agents+' roles. No real AI calls, code changes, or agent tests were performed.';
      return;
    }
    addMessage(events[cursor]);cursor++;count.textContent=cursor+' messages';
  },470);
});

async function configureLiveMode(){
  launch.disabled = true;
  try {
    const response = await fetch(liveApiBase + 'status', {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error();
    const settings = await response.json();
    if (!settings.live) {
      if (bridgeOrigin) throw new Error();
      notice.textContent = 'Demo mode. Set OPENROUTER_API_KEY on the local server to enable live debates.';
      return;
    }
    if (!AGENTS.every(({ id }) => typeof settings.models?.[id] === 'string' && settings.models[id].endsWith(':free'))) {
      throw new Error();
    }

    live = true;
    document.getElementById('actions-bridge').hidden = true;
    document.getElementById('bridge-access').hidden = !bridgeOrigin;
    bridgePassword.required = Boolean(bridgeOrigin);
    document.getElementById('sidebar-mode').textContent = 'LIVE COUNCIL';
    document.getElementById('environment').textContent = bridgeOrigin ? 'LIVE DASHBOARD' : 'PRIVATE LOCAL SESSION';
    document.getElementById('mode').textContent = 'LIVE';
    document.getElementById('mode-description').textContent = 'Six free models via OpenRouter';
    document.getElementById('provider-note').textContent = 'The council sends the mission and earlier replies to OpenRouter and its model providers.';
    document.getElementById('footer-mode').textContent = 'LIVE DISCUSSION · NO CODE EXECUTION';
    for (const provider of allAgents.querySelectorAll('[data-agent-id]')) {
      provider.textContent = settings.models[provider.dataset.agentId];
      provider.title = provider.textContent;
    }
    const emptyHint = feed.querySelector('.empty p');
    if (emptyHint) emptyHint.textContent = 'Submit a mission to start a live debate across six models.';
    launch.textContent = '▶ Start Live Debate';
  } catch {
    notice.textContent = bridgeOrigin
      ? 'The live council is unavailable. Reload to reconnect.'
      : 'The local server could not be reached. Demo mode is available.';
    if (bridgeOrigin) launch.textContent = 'Live Debate Unavailable';
  } finally {
    launch.disabled = Boolean(bridgeOrigin) && !live;
  }
}

async function startLiveDebate(){
  const headers = { 'Content-Type': 'application/json' };
  if (bridgeOrigin) {
    if (!/^[0-9a-f]{64}$/.test(bridgePassword.value)) {
      notice.textContent = 'Enter the generated dashboard password.';
      bridgePassword.focus();
      return;
    }
    headers.Authorization = 'Basic ' + btoa('council:' + bridgePassword.value);
    bridgePassword.value = '';
  }
  launch.disabled = true;
  launch.textContent = 'Debating…';
  transcriptMission.hidden = true;
  importStatus.hidden = true;
  feed.replaceChildren();
  notice.textContent = '';
  count.textContent = '0 messages';
  status.textContent = '● LIVE DISCUSSION';
  status.className = 'state active';

  try {
    const response = await fetch(liveApiBase + 'debate', {
      method: 'POST',
      headers,
      credentials: 'omit',
      redirect: 'error',
      body: JSON.stringify({ mission: mission.value }),
    });
    if (!response.ok) {
      const failure = await response.json();
      throw new Error(failure.error);
    }

    let pending = '';
    let complete = false;
    let replies = 0;
    for await (const fragment of response.body.pipeThrough(new TextDecoderStream())) {
      pending += fragment;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        if (complete) throw new Error('The council sent data after the end of the debate.');
        const event = JSON.parse(line);
        const agent = AGENTS.find(candidate => candidate.id === event.agentId);
        if (event.type === 'error') {
          throw new Error((agent ? agent.name + ': ' : '') + event.message);
        }
        if (event.type === 'message') {
          if (!agent || event.step !== replies + 1 || event.step > 7 ||
              typeof event.model !== 'string' || !event.model.endsWith(':free') ||
              (event.step === 7 && event.tag !== 'RESOLUTION')) {
            throw new Error('The council returned an unexpected reply.');
          }
          addMessage({ ...event, agent, label: event.model });
          count.textContent = ++replies + ' messages';
        }
        if (event.type === 'complete') {
          if (replies !== 7 || event.messages !== 7) throw new Error('The council did not return all seven replies.');
          complete = true;
        }
      }
    }
    if (!complete || pending.trim()) throw new Error('The connection closed before the debate finished.');

    status.textContent = '✓ LIVE DEBATE COMPLETE';
    status.className = 'state complete';
    notice.textContent = 'The council returned seven replies, including the final synthesis.';
  } catch (error) {
    status.textContent = 'DEBATE INTERRUPTED';
    status.className = 'state';
    notice.textContent = error.message || 'The live debate could not be completed.';
  } finally {
    launch.disabled = false;
    launch.textContent = '↻ Start Live Debate';
  }
}

if (localDashboard) {
  document.getElementById('actions-bridge').hidden = true;
}
if (localDashboard || bridgeOrigin) void configureLiveMode();
