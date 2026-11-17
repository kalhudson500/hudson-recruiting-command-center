import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installGmail} from '../gmail-oauth.js';
import {installSecurity} from '../security.js';
test('Google connection binds state to session, encrypts tokens, suppresses contacts and prevents duplicate sends',async()=>{
const db=new DatabaseSync(':memory:'),DIR=fs.mkdtempSync(path.join(os.tmpdir(),'kps-oauth-'));
const ctx={db,DIR,one:(q,...p)=>db.prepare(q).get(...p),query:(q,...p)=>db.prepare(q).all(...p),run:(q,...p)=>db.prepare(q).run(...p),body:async r=>r.payload,json:(res,status,value,headers={})=>Object.assign(res,{status,value,headers})};
db.exec('CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER)');ctx.run('INSERT INTO sessions VALUES(?,?)','session-one',Date.now()+600000);installSecurity(ctx);
let sendCount=0,user='management@accesskps.com',failSend=false;
const gmail=installGmail({...ctx,env:{GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'},fetchImpl:async(url,options)=>{
 if(url.includes('/token'))return {ok:true,json:async()=>({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/gmail.send'})};
 if(url.includes('/userinfo'))return {ok:true,json:async()=>({email:user,email_verified:true})};
 if(url.includes('/messages/send')){sendCount++;if(failSend)throw Error('timeout');const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();assert.match(mime,/From: Mark Hudson/);assert.match(mime,/Content-Type: text\/plain/);return {ok:true,json:async()=>({id:'google-message'})}}
 throw Error('Unexpected URL');
}});
const begin=async()=>{const r={};await gmail.route({},r,'/api/gmail/connect','POST',{token_hash:'session-one'});return {url:new URL(r.value.url),cookie:r.headers['Set-Cookie'].split(';')[0]}};
const cb=async(a,cookie=a.cookie)=>{const res={writeHead(status,headers){this.status=status;this.headers=headers},end(){}};await gmail.callback({headers:{cookie}},res,new URL('https://example.com/api/gmail/callback?code=test&state='+a.url.searchParams.get('state')));return res};
try{
const a=await begin();assert.equal(a.url.searchParams.get('code_challenge_method'),'S256');assert.match((await cb(a,'')).headers.Location,/expired/);
user='wrong@gmail.com';assert.match((await cb(a)).headers.Location,/wrong_account/);assert.equal(ctx.one('SELECT * FROM gmail_connection'),undefined);
user='management@accesskps.com';assert.match((await cb(await begin())).headers.Location,/connected/);assert.match((await cb(a)).headers.Location,/expired/);
const row=ctx.one('SELECT * FROM gmail_connection');assert.ok(!row.tokens.includes('private-refresh'));assert.equal(fs.statSync(path.join(DIR,'gmail-token.key')).mode&0o777,0o600);
ctx.run("UPDATE security_settings SET postal_address='123 Business Ave',phone='9095551234'");
const lead=ctx.one("SELECT * FROM security_leads WHERE email!='' LIMIT 1");
const request={payload:{lead_id:lead.id,subject:'Security proposal',message:'Hello manager',request_id:'11111111-1111-4111-8111-111111111111',confirm:true}};
let r={};await gmail.route(request,r,'/api/gmail/send','POST');assert.equal(r.value.ok,true);assert.equal(sendCount,1);
r={};await gmail.route(request,r,'/api/gmail/send','POST');assert.equal(r.value.already_sent,true);assert.equal(sendCount,1);
assert.equal(ctx.one('SELECT count(*) n FROM security_activity WHERE kind=?','Email sent').n,1);
request.payload.request_id='22222222-2222-4222-8222-222222222222';ctx.run("INSERT INTO suppression(email) VALUES(?)",lead.email.toLowerCase());await assert.rejects(gmail.route(request,{},'/api/gmail/send','POST'),/opted out/);assert.equal(sendCount,1);
ctx.run('DELETE FROM suppression');failSend=true;await assert.rejects(gmail.route(request,{},'/api/gmail/send','POST'),/Check Gmail Sent/);await assert.rejects(gmail.route(request,{},'/api/gmail/send','POST'),/already attempted/);assert.equal(sendCount,2);
}finally{db.close();fs.rmSync(DIR,{recursive:true,force:true})}
});
