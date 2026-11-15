import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENTS,DEFAULT_REQUEST,createDemoDebate,summarizeRun,validateRequest} from '../src/council.js';
test('six distinct roles',()=>assert.equal(new Set(AGENTS.map(a=>a.id)).size,6));
test('input validation',()=>{assert.ok(validateRequest('short'));assert.equal(validateRequest(DEFAULT_REQUEST),null)});
test('scripted debate order',()=>{const d=createDemoDebate(DEFAULT_REQUEST);assert.equal(d.length,8);assert.deepEqual(d.map(x=>x.step),[1,2,3,4,5,6,7,8])});
test('cannot mistake scripted output for validated work',()=>{const s=summarizeRun(createDemoDebate(DEFAULT_REQUEST));assert.equal(s.approved,false);assert.equal(s.codeGenerated,false);assert.equal(s.testsPassed,false)});
