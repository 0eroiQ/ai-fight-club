import './style.css';
import {AGENTS,DEFAULT_REQUEST,createDemoDebate,summarizeRun,validateRequest} from './council.js';

const root=document.getElementById('app');
let timer=null;
let live=false;
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
'<div class="workgrid"><section class="panel mission"><div class="panelhead"><span>✧</span><h2>New Mission</h2><small>01 / BRIEF</small></div><p class="hint">Describe your requirements. The council will debate the approach before any code is written.</p><label class="fieldlabel" for="mission">MISSION DIRECTIVE</label><textarea id="mission" maxlength="3000" spellcheck="false"></textarea><div class="mission-actions"><span>⌑ &nbsp; No deployments · No repo changes</span><button id="launch">▶ &nbsp; Start Debate</button></div><p id="notice" role="status" aria-live="polite"></p></section>',
'<section class="panel"><div class="panelhead"><span>♧</span><h2>The Council</h2><small>06 AGENTS</small></div><div id="agents" class="agents"></div><p class="fineprint" id="provider-note">Agent identities are illustrative. No live AI providers are connected in this version.</p></section></div>',
'<section class="panel debate"><div class="panelhead"><span>☷</span><h2>Debate Room</h2><small class="state" id="state">AWAITING MISSION</small></div><div id="feed" class="feed"><div class="empty">⌁<strong>The council is waiting.</strong><p>Submit a mission to watch the simulated debate unfold.</p></div></div><div class="feedfoot"><span id="count">0 messages</span><span>Approval gate: <b>Human review required</b></span></div></section>',
'<footer><span>AI FIGHT CLUB &nbsp; / &nbsp; Built for thoughtful engineering</span><span id="footer-mode">SIMULATION ONLY &nbsp; ● &nbsp; NO CODE EXECUTION</span></footer>',
'</div></main></div>'
].join('');

const mission=document.getElementById('mission'),launch=document.getElementById('launch'),feed=document.getElementById('feed'),status=document.getElementById('state'),notice=document.getElementById('notice'),count=document.getElementById('count');
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
  const name=document.createElement('b');name.textContent=entry.agent.name;
  const tag=document.createElement('em');tag.textContent=entry.tag;
  const step=document.createElement('small');step.textContent='#'+String(entry.step).padStart(2,'0');
  tag.title=entry.model || '';
  heading.append(name,tag,step);
  const p=document.createElement('p');p.textContent=entry.message;
  body.append(heading,p);item.append(avatar,body);feed.append(item);feed.scrollTop=feed.scrollHeight;
}
launch.addEventListener('click',()=>{
  if(launch.disabled || timer!==null)return;
  const error=validateRequest(mission.value);if(error){notice.textContent=error;return;}
  if(live){
    void startLiveDebate();
    return;
  }
  const events=createDemoDebate(mission.value);let cursor=0;
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
    const response = await fetch('./api/status', { cache: 'no-store' });
    if (!response.ok) return;
    const settings = await response.json();
    if (!settings.live) {
      notice.textContent = 'Demo mode. Set OPENROUTER_API_KEY on the local server to enable live debates.';
      return;
    }

    live = true;
    document.getElementById('sidebar-mode').textContent = 'LIVE COUNCIL';
    document.getElementById('environment').textContent = 'PRIVATE LOCAL SESSION';
    document.getElementById('mode').textContent = 'LIVE';
    document.getElementById('mode-description').textContent = 'Six models via OpenRouter';
    document.getElementById('provider-note').textContent = 'Live mode sends the mission and earlier replies to OpenRouter and its model providers.';
    document.getElementById('footer-mode').textContent = 'LIVE DISCUSSION · NO CODE EXECUTION';
    for (const provider of allAgents.querySelectorAll('[data-agent-id]')) {
      provider.textContent = settings.models[provider.dataset.agentId];
      provider.title = provider.textContent;
    }
    const emptyHint = feed.querySelector('.empty p');
    if (emptyHint) emptyHint.textContent = 'Submit a mission to start a live debate across six models.';
    launch.textContent = '▶ Start Live Debate';
  } catch {
    notice.textContent = 'The local server could not be reached. Demo mode is available.';
  } finally {
    launch.disabled = false;
  }
}

async function startLiveDebate(){
  launch.disabled = true;
  launch.textContent = 'Debating…';
  feed.replaceChildren();
  notice.textContent = '';
  count.textContent = '0 messages';
  status.textContent = '● LIVE DISCUSSION';
  status.className = 'state active';

  try {
    const response = await fetch('./api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission: mission.value }),
    });
    if (!response.ok) {
      const failure = await response.json();
      throw new Error(failure.error);
    }

    let pending = '';
    let complete = false;
    for await (const fragment of response.body.pipeThrough(new TextDecoderStream())) {
      pending += fragment;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const event = JSON.parse(line);
        const agent = AGENTS.find(candidate => candidate.id === event.agentId);
        if (event.type === 'error') {
          throw new Error((agent ? agent.name + ': ' : '') + event.message);
        }
        if (event.type === 'message') {
          addMessage({ ...event, agent });
          count.textContent = event.step + ' messages';
        }
        if (event.type === 'complete') {
          complete = true;
          notice.textContent = 'Live debate complete: ' + event.messages + ' replies across six models. Review the proposed next steps.';
        }
      }
    }
    if (!complete) throw new Error('The connection closed before the debate finished.');

    status.textContent = '✓ LIVE DEBATE COMPLETE';
    status.className = 'state complete';
  } catch (error) {
    status.textContent = 'DEBATE INTERRUPTED';
    status.className = 'state';
    notice.textContent = error.message || 'The live debate could not be completed.';
  } finally {
    launch.disabled = false;
    launch.textContent = '↻ Start Live Debate';
  }
}

if (location.hostname === '127.0.0.1' && location.port === '4173') {
  void configureLiveMode();
}
