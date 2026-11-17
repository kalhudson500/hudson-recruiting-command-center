import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const mailbox='management@accesskps.com';
const redirect='https://hudson-recruiting-command-center.onrender.com/api/gmail/callback';
const scope='openid email https://www.googleapis.com/auth/gmail.send';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export function installGmail({db,one,run,body,json,DIR,env=process.env,fetchImpl=fetch}){
 db.exec(`CREATE TABLE IF NOT EXISTS gmail_oauth_states(state_hash TEXT PRIMARY KEY,session_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS gmail_connection(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,tokens TEXT NOT NULL,connected_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS gmail_sends(request_id TEXT PRIMARY KEY,lead_id INTEGER NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 let encryptionKey;
 function key(){if(encryptionKey)return encryptionKey;const filename=path.join(DIR,'gmail-token.key');try{fs.writeFileSync(filename,crypto.randomBytes(32),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}encryptionKey=fs.readFileSync(filename);if(encryptionKey.length!==32)throw Error('Invalid mailbox encryption key');return encryptionKey}
 function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);const bytes=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64')}
 function unseal(value){const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString())}
 const configured=()=>Boolean(env.GOOGLE_CLIENT_ID?.trim()&&env.GOOGLE_CLIENT_SECRET?.trim());
 async function tokenRequest(params){const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env.GOOGLE_CLIENT_ID?.trim(),client_secret:env.GOOGLE_CLIENT_SECRET?.trim()}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Google authorization failed. Reconnect Gmail or check the Google client settings.');return r.json()}
 async function access(){const row=one('SELECT * FROM gmail_connection WHERE id=1');if(!row||row.email!==mailbox)throw Error('Connect your KPS Gmail account first');let tokens=unseal(row.tokens);if(!tokens.access_token||tokens.expires_at<Date.now()+60000){const t=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token});tokens={...tokens,...t,expires_at:Date.now()+Number(t.expires_in||3600)*1000};run('UPDATE gmail_connection SET tokens=? WHERE id=1',seal(tokens))}return tokens.access_token}
 function bounce(res,result){res.writeHead(303,{'Location':'/?gmail='+result,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':'gmail_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail/callback; Max-Age=0'});res.end()}
 async function callback(req,res,u){
 const state=u.searchParams.get('state')||'',cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('gmail_state='))?.slice(12)||'';
 const row=one('SELECT * FROM gmail_oauth_states WHERE state_hash=?',digest(state));
 if(!state||!cookie||digest(cookie)!==digest(state)||!row||row.expires<Date.now()||!one('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?',row.session_hash,Date.now()))return bounce(res,'expired');
 run('DELETE FROM gmail_oauth_states WHERE state_hash=?',digest(state));
 if(u.searchParams.has('error'))return bounce(res,'cancelled');
 try{
 const code=u.searchParams.get('code');if(!code)throw Error('Missing authorization code');
 const t=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:row.verifier});
 if(!(t.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.send'))return bounce(res,'permission');
 const r=await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Identity check failed');const user=await r.json();
 if(user.email?.toLowerCase()!==mailbox||user.email_verified!==true)return bounce(res,'wrong_account');
 const previous=one('SELECT tokens FROM gmail_connection WHERE id=1'),refresh=t.refresh_token||(previous?unseal(previous.tokens).refresh_token:'');
 if(!refresh)return bounce(res,'reconnect');
 run('INSERT INTO gmail_connection(id,email,tokens) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,tokens=excluded.tokens,connected_at=CURRENT_TIMESTAMP',mailbox,seal({...t,refresh_token:refresh,expires_at:Date.now()+Number(t.expires_in||3600)*1000}));
 return bounce(res,'connected');
 }catch{return bounce(res,'failed')}
 }
 async function route(req,res,p,method,s){
 if(!p.startsWith('/api/gmail/'))return false;
 if(p==='/api/gmail/status'&&method==='GET'){const row=one('SELECT email,connected_at FROM gmail_connection WHERE id=1');json(res,200,{configured:configured(),connected:!!row,email:row?.email||mailbox,connected_at:row?.connected_at||'',mode:'send-only'});return true}
 if(p==='/api/gmail/connect'&&method==='POST'){
 if(!configured())throw Error('Google Client ID and Client Secret are missing in Render settings');
 const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
 run('DELETE FROM gmail_oauth_states WHERE expires<?',Date.now());run('INSERT INTO gmail_oauth_states VALUES(?,?,?,?)',digest(state),s.token_hash,verifier,Date.now()+10*60000);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID.trim(),redirect_uri:redirect,response_type:'code',scope,access_type:'offline',prompt:'consent select_account',login_hint:mailbox,state,code_challenge:digestBase64(verifier),code_challenge_method:'S256'}))url.searchParams.set(k,v);
 json(res,200,{url:url.href},{'Set-Cookie':'gmail_state='+state+'; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail/callback; Max-Age=600'});return true}
 if(p==='/api/gmail/disconnect'&&method==='POST'){
 const row=one('SELECT tokens FROM gmail_connection WHERE id=1');
 if(row){const t=unseal(row.tokens);try{await fetchImpl('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:t.refresh_token}),signal:AbortSignal.timeout(10000)})}catch{}}
 run('DELETE FROM gmail_connection');json(res,200,{ok:true});return true}
 if(p==='/api/gmail/test'&&method==='POST'){await access();json(res,200,{ok:true,email:mailbox});return true}
 if(p==='/api/gmail/send'&&method==='POST'){
 const b=await body(req);if(b.confirm!==true)throw Error('Review and confirm the message before sending');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.request_id||''))throw Error('Invalid send request ID');
 const prior=one('SELECT status,provider_id FROM gmail_sends WHERE request_id=?',b.request_id);
 if(prior){if(prior.status==='sent'){json(res,200,{ok:true,already_sent:true});return true}throw Error('This send was already attempted. Check Gmail Sent before creating another draft.')}
 const lead=one('SELECT * FROM security_leads WHERE id=?',Number(b.lead_id));
 if(!lead||!lead.email||!/^([^\s@<>]+)@([^\s@<>]+)\.[^\s@<>]+$/.test(lead.email))throw Error('Valid prospect email required');
 if(lead.opted_out||one('SELECT email FROM suppression WHERE lower(email)=lower(?)',lead.email))throw Error('This contact opted out');
 const settings=one('SELECT * FROM security_settings WHERE id=1');if(!settings?.postal_address?.trim())throw Error('Save your company postal address in Outreach settings first');
 const subject=String(b.subject||'').trim(),message=String(b.message||'').trim();if(!subject||subject.length>500||/[\r\n]/.test(subject)||!message||message.length>20000)throw Error('Valid subject and message required');
 const token=await access();
 // Persist an attempt before calling Google. Uncertain sends cannot be blindly retried.
 run("INSERT INTO gmail_sends(request_id,lead_id,recipient,subject,status) VALUES(?,?,?,?,'sending')",b.request_id,lead.id,lead.email,subject);
 const footer='\n\nBusiness solicitation for KPS Security services.\n'+settings.postal_address+'\nTo stop future marketing emails, reply "unsubscribe".';
 const text=message+footer;
 const mime=['From: Mark Hudson | KPS Security <'+mailbox+'>','To: '+lead.email,'Subject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n')].join('\r\n');
 try{
 const r=await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Google send not confirmed');const result=await r.json();if(!result.id)throw Error('Missing confirmation');
 db.exec('BEGIN');try{run("UPDATE gmail_sends SET status='sent',provider_id=? WHERE request_id=?",result.id,b.request_id);run("INSERT INTO security_activity(lead_id,kind,detail) VALUES(?,'Email sent',?)",lead.id,subject+' · Gmail accepted');run("UPDATE security_leads SET stage=CASE WHEN stage='Research' THEN 'Contacted' ELSE stage END,updated_at=CURRENT_TIMESTAMP WHERE id=?",lead.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 json(res,200,{ok:true});return true;
 }catch{run("UPDATE gmail_sends SET status='unknown' WHERE request_id=? AND status!='sent'",b.request_id);throw Error('Send confirmation was interrupted. Check Gmail Sent before sending again.')}
 }
 json(res,404,{error:'Gmail endpoint not found'});return true;
 }
 return {route,callback};
}
function digestBase64(s){return crypto.createHash('sha256').update(s).digest('base64url')}
