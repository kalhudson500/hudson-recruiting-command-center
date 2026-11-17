import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {installAssistantAccess,assistantAllowed} from '../assistant-access.js';
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
function setup(expires=Date.now()+60000){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,salt TEXT,hash TEXT)');
 db.prepare('INSERT INTO users(username) VALUES(?)').run('admin');
 const one=(q,...p)=>db.prepare(q).get(...p),run=(q,...p)=>db.prepare(q).run(...p);
 const handler=installAssistantAccess({db,one,run,body:async req=>req,json:(res,status,data)=>Object.assign(res,{status,data}),passwordHash:(p,s)=>crypto.scryptSync(p,s,64).toString('hex'),env:{KPS_ASSISTANT_EMAIL:'assistant@example.com',KPS_ASSISTANT_INVITE_HASH:digest('secret-token'),KPS_ASSISTANT_INVITE_EXPIRES:String(expires)}});
 return {db,one,call:async b=>{const res={};await handler(b,res,'/api/activate','POST');return res}};
}
test('activation preserves owner, hashes password, creates scoped login and consumes invitation',async()=>{
 const {one,call}=setup();assert.equal(one('SELECT role FROM users').role,'owner');
 assert.equal((await call({token:'bad',password:'password-long-enough'})).status,400);
 assert.equal((await call({token:'secret-token',password:'short'})).status,400);
 const r=await call({token:'secret-token',password:'password-long-enough'});assert.equal(r.status,201);
 const u=one("SELECT * FROM users WHERE username='assistant@example.com'");assert.equal(u.role,'security_assistant');assert.equal(u.hash,crypto.scryptSync('password-long-enough',u.salt,64).toString('hex'));
 assert.equal((await call({token:'secret-token',password:'another-long-password'})).status,400);
});
test('expired invitation cannot create login',async()=>{const {call,one}=setup(Date.now()-1000);assert.equal((await call({token:'secret-token',password:'password-long-enough'})).status,400);assert.equal(one('SELECT count(*) n FROM users').n,1)});
test('assistant scope excludes recruiting, mailbox sending and owner settings',()=>{
 for(const [p,m] of [['/api/security/leads','GET'],['/api/security/leads','POST'],['/api/security/leads/1','PATCH'],['/api/security/leads/1/activity','POST'],['/api/logout','POST']])assert.equal(assistantAllowed(p,m),true);
 for(const [p,m] of [['/api/coaches','GET'],['/api/campaigns/1/send','POST'],['/api/gmail/send','POST'],['/api/gmail/connect','POST'],['/api/security/settings','POST'],['/api/security/leads/1','DELETE']])assert.equal(assistantAllowed(p,m),false);
});
