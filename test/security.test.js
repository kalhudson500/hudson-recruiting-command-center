import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installSecurity} from '../security.js';
test('security sales records persist independently, validate updates, and preserve opt-outs on restart',async()=>{
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE coaches(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO coaches VALUES(1,\'Keep recruiting data\')');
const ctx={db,query:(s,...p)=>db.prepare(s).all(...p),one:(s,...p)=>db.prepare(s).get(...p),run:(s,...p)=>db.prepare(s).run(...p),body:async r=>r.payload,json:(r,status,value)=>Object.assign(r,{status,value})};
let route=installSecurity(ctx),r={};await route({},r,'/api/security/leads','GET');assert.equal(r.value.leads.length,8);
const id=r.value.leads[0].id;await route({payload:{stage:'Proposal sent',proposal_value:2400,opted_out:true,next_followup:'2026-12-01'}},{},'/api/security/leads/'+id,'PATCH');
route=installSecurity(ctx);r={};await route({},r,'/api/security/leads','GET');assert.equal(r.value.leads.length,8);const l=r.value.leads.find(l=>l.id===id);assert.equal(l.opted_out,1);assert.equal(l.stage,'Proposal sent');assert.equal(l.proposal_value,2400);
assert.equal(ctx.one('SELECT name FROM coaches WHERE id=1').name,'Keep recruiting data');
await assert.rejects(route({payload:{stage:'invalid'}},{},'/api/security/leads/'+id,'PATCH'),/Invalid stage/);
await assert.rejects(route({payload:{source_url:'javascript:alert(1)'}},{},'/api/security/leads/'+id,'PATCH'),/HTTPS/);
await assert.rejects(route({payload:{organization:'Bad',email:'wrong'}},{},'/api/security/leads','POST'),/Invalid email/);
await assert.rejects(route({payload:{organization:l.organization,contact:l.contact,email:l.email}},{},'/api/security/leads','POST'),/already exists/);
db.close();
});
