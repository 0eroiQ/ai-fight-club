export const AGENTS = [
  {id:'architect',name:'Nemotron',role:'System Architect',provider:'NVIDIA / OpenRouter',color:'#68d391',icon:'N'},
  {id:'ux',name:'Claude',role:'UX Reviewer',provider:'Anthropic (optional)',color:'#e8a77c',icon:'C'},
  {id:'engineer',name:'Qwen',role:'Lead Engineer',provider:'Open-weight / local',color:'#9ba7ff',icon:'Q'},
  {id:'critic',name:'Grok',role:'Critical Reviewer',provider:'xAI (optional)',color:'#f1c571',icon:'G'},
  {id:'qa',name:'Gemma',role:'Quality Assurance',provider:'Open-weight / local',color:'#72cce5',icon:'M'},
  {id:'security',name:'DeepSeek',role:'Security Reviewer',provider:'Open-weight / local',color:'#dc8dee',icon:'D'}
];
export const DEFAULT_REQUEST = 'Build Noiro Collections as one horizontal row of folders. Clicking a folder opens its collections inside. Do not display every collection as a separate row.';
export function normalizeRequest(v){return String(v||'').trim().replace(/\s+/g,' ')}
export function validateRequest(v){const t=normalizeRequest(v);return t.length>=12&&t.length<=3000?null:'Enter a mission between 12 and 3000 characters.'}
const lines=[
 ['architect','PROPOSAL','Use one horizontal folder row with a nested collection view. Preserve the existing API.'],
 ['engineer','PLAN','Implement a folder card and drill-down view, keeping the collection items nested.'],
 ['ux','REVIEW','The user explicitly requested one row, not ten separate catalog rows. Ensure keyboard accessibility.'],
 ['critic','CHALLENGE','Reject any design that flattens folders. Back navigation also needs to work.'],
 ['qa','TEST PLAN','Check folder row, drill-down, back action, mobile layout, and keyboard navigation.'],
 ['security','SECURITY','Treat external catalog titles as untrusted text. Validate external destinations.'],
 ['architect','RESOLUTION','Proposal agrees with the original user intent: folder row with nested contents.'],
 ['qa','DISCLAIMER','This discussion is scripted. No real AI calls, code generation, or QA execution occurred.']
];
export function createDemoDebate(request){
  const err=validateRequest(request);if(err)throw Error(err);
  return lines.map(([id,tag,message],i)=>({id:String(i+1),agent:AGENTS.find(a=>a.id===id),tag,message,step:i+1}));
}
export function summarizeRun(events){return {messages:events.length,agents:new Set(events.map(e=>e.agent.id)).size,approved:false,codeGenerated:false,testsPassed:false,mode:'SIMULATION'}}
