import http from 'node:http';
import {installCalifornia} from './california.js';
import {installCaliforniaFocus} from './california-focus.js';
import { createEmailSender, emailStatus } from './email.js';
import { installHbcu } from './hbcu.js';
import { installCollector, normalize } from './collector.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

const PORT=Number(process.env.PORT||3000), HOST=process.env.HOST||'127.0.0.1';
const DIR=process.env.DATA_DIR||path.resolve('data'); fs.mkdirSync(DIR,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(DIR,'hudson.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY, name TEXT NOT NULL, division TEXT NOT NULL CHECK(division IN ('FBS','FCS','D2','D3')), conference TEXT DEFAULT '', state TEXT DEFAULT '', staff_url TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(name,division));
CREATE TABLE IF NOT EXISTS coaches(id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT DEFAULT '', email TEXT DEFAULT '', x_url TEXT DEFAULT '', instagram_url TEXT DEFAULT '', source_url TEXT DEFAULT '', verified_at TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified','stale')), notes TEXT DEFAULT '', opted_out INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS prospects(id INTEGER PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL, coach_id INTEGER REFERENCES coaches(id) ON DELETE SET NULL, stage TEXT NOT NULL DEFAULT 'not_contacted', notes TEXT DEFAULT '', next_followup TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS campaigns(id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','completed')), approved_at TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS campaign_recipients(id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, coach_id INTEGER NOT NULL REFERENCES coaches(id), state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed','skipped')), sent_at TEXT DEFAULT '', error TEXT DEFAULT '', UNIQUE(campaign_id,coach_id));
CREATE TABLE IF NOT EXISTS contact_candidates(id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT DEFAULT '', email TEXT DEFAULT '', x_url TEXT DEFAULT '', instagram_url TEXT DEFAULT '', source_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(school_id,email,source_url));
CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY, coach_id INTEGER REFERENCES coaches(id) ON DELETE SET NULL, kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY, reason TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
if(!db.prepare("PRAGMA table_info(coaches)").all().some(c=>c.name==='phone'))db.exec("ALTER TABLE coaches ADD COLUMN phone TEXT DEFAULT ''");
db.exec("CREATE TABLE IF NOT EXISTS directory_scans(school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE, source_url TEXT NOT NULL, status TEXT NOT NULL, emails INTEGER DEFAULT 0, social INTEGER DEFAULT 0, scanned_at TEXT DEFAULT CURRENT_TIMESTAMP, error TEXT DEFAULT '')");
db.exec("CREATE TABLE IF NOT EXISTS directory_discovery(school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE, suggested_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', checked_at TEXT DEFAULT CURRENT_TIMESTAMP, error TEXT DEFAULT '')");
const query=(sql,...p)=>db.prepare(sql).all(...p), one=(sql,...p)=>db.prepare(sql).get(...p), run=(sql,...p)=>db.prepare(sql).run(...p);
const hash=(x)=>crypto.createHash('sha256').update(x).digest('hex');
function passwordHash(p,salt){return crypto.scryptSync(p,salt,64).toString('hex')}
if(!one('SELECT id FROM users LIMIT 1')){
 const password=process.env.ADMIN_PASSWORD;
 if(!password||password.length<12){console.error('First run: set ADMIN_PASSWORD to a strong password (12+ characters).');process.exit(1)}
 const salt=crypto.randomBytes(16).toString('hex');run('INSERT INTO users(username,salt,hash) VALUES(?,?,?)',process.env.ADMIN_USER||'admin',salt,passwordHash(password,salt));console.log('Admin account created. Remove ADMIN_PASSWORD from environment after first run.');
}
function json(res,status,obj,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(obj))}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1).trim()]}))}
function session(req){const token=cookies(req).sid;if(!token)return null;return one('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',hash(token),Date.now())}
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function requireText(v,label,max=500){let s=clean(v,max);if(!s)throw Error(label+' is required');return s}
function phoneValid(v){return !v||(/^[+0-9().\- xext]{7,40}$/i.test(v)&&/[0-9]{7}/.test(v.replace(/\D/g,'')))}
function emailValid(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function safeUrl(v){if(!v)return '';const u=new URL(v);if(u.protocol!=='https:')throw Error('HTTPS URL required');if(u.username||u.password)throw Error('URL credentials not allowed');return u.href}
function checkCsrf(req,s){if(req.headers['x-csrf-token']!==s.csrf)throw Error('Invalid CSRF token')}
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>1e6)throw Error('Request too large')}return b?JSON.parse(b):{}}
function activity(coachId,kind,detail){run('INSERT INTO activities(coach_id,kind,detail) VALUES(?,?,?)',coachId||null,kind,detail)}
const athlete={name:'Kalel Hudson',class:'2027',positions:'DE / DT / LB',height:'6\'2"',weight:'260 lbs',gpa:'3.3',city:'San Bernardino, CA',hudl:'http://www.hudl.com/v/2UJypJ'};
function render(t,coach,school){return t.replace(/\{\{(coach_name|school|athlete_name|positions|class|gpa|hudl)\}\}/g,(_,k)=>({coach_name:coach.name,school:school.name,athlete_name:athlete.name,positions:athlete.positions,class:athlete.class,gpa:athlete.gpa,hudl:athlete.hudl})[k]);}
function isPrivate(ip){if(net.isIP(ip)===4){const a=ip.split('.').map(Number);return a[0]===10||a[0]===127||a[0]===0||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]>=224}return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80')||ip.startsWith('::ffff:')}
async function inspectUrl(url){let u=new URL(safeUrl(url));if(u.port&&u.port!=='443')throw Error('Only HTTPS default port allowed');const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>isPrivate(a.address)))throw Error('Blocked non-public host');return u.href}
async function collect(url){await inspectUrl(url);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);try{const r=await fetch(url,{signal:controller.signal,redirect:'manual',headers:{'User-Agent':'HudsonRecruitingDirectory/1.0 (manual public staff directory review)'}});if(!r.ok)throw Error('Source returned HTTP '+r.status);if(!String(r.headers.get('content-type')||'').includes('text/html'))throw Error('Source must be HTML');const html=(await r.text()).slice(0,600000);const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');const emails=[...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase()))].slice(0,150);const social=[...new Set((text.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|instagram\.com)\/[a-zA-Z0-9_.-]+/gi)||[]))].slice(0,150);return {emails,social}}finally{clearTimeout(timeout)}}
installHbcu(db);
const collector=installCollector({db,query,one,run,inspectUrl});
const california=installCalifornia({db,query,one,run,collector});
const focus=installCaliforniaFocus({db,query,one,run,california});
focus.sync();
collector.pause();collector.pauseX();
let sending=false;
async function dispatchCampaign(id,limit){if(sending)throw Error('Another batch is running');const camp=one('SELECT * FROM campaigns WHERE id=?',id);if(!camp||camp.status!=='approved')throw Error('Campaign requires approval');sending=true;let sent=0,failed=0,skipped=0;try{const sender=createEmailSender();await sender.verify();const recipients=query(`SELECT cr.id as recipient_id,c.*,s.name as school_name FROM campaign_recipients cr JOIN coaches c ON c.id=cr.coach_id JOIN schools s ON s.id=c.school_id WHERE cr.campaign_id=? AND cr.state='pending' ORDER BY cr.id LIMIT ?`,id,Math.min(limit,25));for(const c of recipients){if(!focus.active(c.id)||!emailValid(c.email)||c.opted_out||c.status!=='verified'||one('SELECT email FROM suppression WHERE email=?',c.email.toLowerCase())){run("UPDATE campaign_recipients SET state='skipped',error='Not eligible' WHERE id=?",c.recipient_id);skipped++;continue}const school={name:c.school_name};const subject=render(camp.subject,c,school),message=render(camp.body,c,school);try{await sender.send({to:c.email,subject,text:message+'\n\nIf you prefer no further recruiting emails, reply with "unsubscribe".',key:'hudson-'+id+'-'+c.recipient_id});run("UPDATE campaign_recipients SET state='sent',sent_at=CURRENT_TIMESTAMP,error='' WHERE id=?",c.recipient_id);activity(c.id,'email_sent',subject);sent++}catch(e){run("UPDATE campaign_recipients SET state='failed',error=? WHERE id=?",String(e.message).slice(0,250),c.recipient_id);failed++}await new Promise(r=>setTimeout(r,650))}if(!one("SELECT id FROM campaign_recipients WHERE campaign_id=? AND state='pending' LIMIT 1",id))run("UPDATE campaigns SET status='completed' WHERE id=?",id);return {sent,failed,skipped}}finally{sending=false}}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
async function handler(req,res){try{const u=new URL(req.url,'http://localhost'),p=u.pathname,method=req.method;if(p==='/api/login'&&method==='POST'){const b=await body(req),user=one('SELECT * FROM users WHERE username=?',clean(b.username,100));const derived=passwordHash(String(b.password||''),user?.salt||'0'.repeat(32));if(!user||!crypto.timingSafeEqual(Buffer.from(derived,'hex'),Buffer.from(user.hash,'hex')))return json(res,401,{error:'Invalid credentials'});const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',hash(token),user.id,csrf,Date.now()+7*864e5);return json(res,200,{ok:true,csrf},{'Set-Cookie':`sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`})}
if(p==='/api/session'){const s=session(req);return json(res,200,{authenticated:!!s,csrf:s?.csrf||null,athlete:s?athlete:null})}
if(p.startsWith('/api/')){const s=session(req);if(!s)return json(res,401,{error:'Login required'});if(method!=='GET')checkCsrf(req,s);if(p==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE token_hash=?',s.token_hash);return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
if(['/api/dashboard','/api/schools','/api/coaches','/api/campaigns','/api/prospects','/api/hbcu'].includes(p))focus.sync();
if(p==='/api/email/status'&&method==='GET')return json(res,200,emailStatus());
if(p==='/api/email/verify'&&method==='POST'){const sender=createEmailSender();await sender.verify();return json(res,200,{ok:true})}
if(p==='/api/hbcu'&&method==='GET'){installHbcu(db);return json(res,200,{schools:query('SELECT s.*, (SELECT COUNT(*) FROM coaches c WHERE c.school_id=s.id) coach_count FROM schools s WHERE s.is_hbcu=1 AND s.id IN (SELECT c.school_id FROM coaches c JOIN california_active a ON a.coach_id=c.id) ORDER BY s.name'),contacts:one('SELECT COUNT(*) total,SUM(length(c.email)>0) emails,SUM(length(c.x_url)>0) x_profiles FROM coaches c JOIN california_active a ON a.coach_id=c.id JOIN schools s ON s.id=c.school_id WHERE s.is_hbcu=1')});}
if(p==='/api/california'&&method==='GET')return json(res,200,california.status());
if(p==='/api/california/start'&&method==='POST')return json(res,200,california.start());
if(p==='/api/california/pause'&&method==='POST'){california.pause();return json(res,200,{ok:true});}
if(p==='/api/automation/status'&&method==='GET')return json(res,200,collector.status());
if(p==='/api/automation/x/start'&&method==='POST'){collector.startX();return json(res,200,{ok:true})}
if(p==='/api/automation/x/pause'&&method==='POST'){collector.pauseX();return json(res,200,{ok:true})}
if(p==='/api/automation/refresh-school'&&method==='POST'){const b=await body(req);collector.refreshSchool(b.school_id);return json(res,200,{ok:true})}
if(p==='/api/automation/start'&&method==='POST'){collector.start();return json(res,200,{ok:true})}
if(p==='/api/automation/pause'&&method==='POST'){collector.pause();return json(res,200,{ok:true})}
if(p==='/api/automation/retry'&&method==='POST'){collector.retry();collector.start();return json(res,200,{ok:true})}
if(p==='/api/dashboard')return json(res,200,{schools:one('SELECT COUNT(*) n FROM schools').n,californiaConfirmedSchools:one('SELECT COUNT(DISTINCT c.school_id) n FROM coaches c JOIN california_active a ON a.coach_id=c.id').n,coaches:one('SELECT COUNT(*) n FROM california_active').n,verified:one("SELECT COUNT(*) n FROM coaches c JOIN california_active a ON a.coach_id=c.id WHERE c.status='verified'").n,emailsSent:one("SELECT COUNT(*) n FROM campaign_recipients cr JOIN california_active a ON a.coach_id=cr.coach_id WHERE cr.state='sent'").n,followups:query("SELECT p.*,c.name coach,s.name school FROM prospects p JOIN california_active a ON a.coach_id=p.coach_id JOIN coaches c ON c.id=p.coach_id LEFT JOIN schools s ON s.id=p.school_id WHERE p.next_followup!='' ORDER BY p.next_followup LIMIT 10"),activities:query('SELECT ac.* FROM activities ac JOIN california_active a ON a.coach_id=ac.coach_id ORDER BY ac.id DESC LIMIT 12')});
if(p==='/api/schools'&&method==='GET')return json(res,200,query('SELECT * FROM schools ORDER BY name LIMIT 5000'));
if(p==='/api/schools'&&method==='POST'){const b=await body(req),division=clean(b.division);if(!['FBS','FCS','D2','D3'].includes(division))throw Error('Invalid division');const r=run('INSERT INTO schools(name,division,conference,state,staff_url) VALUES(?,?,?,?,?)',requireText(b.name,'School name',200),division,clean(b.conference),clean(b.state,30),safeUrl(b.staff_url));return json(res,201,{id:Number(r.lastInsertRowid)})}
if(p==='/api/schools/import'&&method==='POST'){const b=await body(req);if(!Array.isArray(b.rows)||b.rows.length>1500)throw Error('Import up to 1500 rows');let count=0;for(const x of b.rows){if(!['FBS','FCS','D2','D3'].includes(x.division)||!clean(x.name))continue;run('INSERT OR IGNORE INTO schools(name,division,conference,state,staff_url) VALUES(?,?,?,?,?)',clean(x.name,200),x.division,clean(x.conference),clean(x.state,30),x.staff_url?safeUrl(x.staff_url):'');count++}installHbcu(db);return json(res,200,{processed:count})}
if(p==='/api/directory-discovery/status'&&method==='GET'){
 return json(res,200,{missing:one("SELECT COUNT(*) n FROM schools WHERE staff_url=''").n,review:one("SELECT COUNT(*) n FROM directory_discovery WHERE status='review'").n,attempted:one("SELECT COUNT(*) n FROM directory_discovery").n,configured:Boolean(process.env.BRAVE_SEARCH_API_KEY)});
}
if(p==='/api/directory-discovery/suggestions'&&method==='GET'){
 return json(res,200,query("SELECT d.school_id,s.name,s.division,d.suggested_url,d.checked_at FROM directory_discovery d JOIN schools s ON s.id=d.school_id WHERE d.status='review' ORDER BY d.checked_at DESC LIMIT 100"));
}
if(p==='/api/directory-discovery/batch'&&method==='POST'){
 if(!process.env.BRAVE_SEARCH_API_KEY)return json(res,400,{error:'Set BRAVE_SEARCH_API_KEY in Render environment to enable official directory discovery.'});
 const b=await body(req),limit=Math.min(5,Math.max(1,Number(b.limit)||3));
 const targets=query("SELECT s.id,s.name,s.division FROM schools s LEFT JOIN directory_discovery d ON d.school_id=s.id WHERE s.staff_url='' AND d.school_id IS NULL ORDER BY s.id LIMIT ?",limit);
 let suggestions=0,failed=0;
 for(const school of targets){
  try{
   const search=new URL('https://api.search.brave.com/res/v1/web/search');
   search.searchParams.set('q',school.name+' football coaching staff athletics official site');
   search.searchParams.set('count','5');
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   let data;
   try{
    const response=await fetch(search,{headers:{'X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY,'Accept':'application/json'},signal:controller.signal,redirect:'manual'});
    if(!response.ok)throw Error('Search API HTTP '+response.status);
    data=await response.json();
   }finally{clearTimeout(timeout)}
   const candidates=(data.web?.results||[]).map(x=>x.url).filter(Boolean).filter(x=>{
    try{
     const u=new URL(x);
     return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(/\/sports\/football\/(coaches|staff)|\/sports\/football\/roster\/coaches|\/staff-directory/i.test(u.pathname))&&!/^(www\.)?(facebook|instagram|x|twitter|youtube|wikipedia)\.com$/i.test(u.hostname);
    }catch{return false}
   });
   const url=candidates[0]||'';
   run("INSERT INTO directory_discovery(school_id,suggested_url,status,error) VALUES(?,?,?,?)",school.id,url,url?'review':'no_match','');
   if(url)suggestions++;
  }catch(e){
   run("INSERT INTO directory_discovery(school_id,status,error) VALUES(?,?,?)",school.id,'error',clean(e.message,200));
   failed++;
  }
 }
 return json(res,200,{checked:targets.length,suggestions,failed,note:'Search results are suggestions only. Confirm the correct official athletics site before approving.'});
}
if(p==='/api/directory-discovery/approve'&&method==='POST'){
 const b=await body(req),id=Number(b.school_id);
 const suggestion=one("SELECT * FROM directory_discovery WHERE school_id=? AND status='review'",id);
 if(!suggestion)throw Error('No pending suggestion for school');
 const url=safeUrl(clean(b.url||suggestion.suggested_url,1000));
 if(!url)throw Error('Directory URL required');
 run("UPDATE schools SET staff_url=? WHERE id=? AND staff_url=''",url,id);
 run("UPDATE directory_discovery SET status='approved',suggested_url=?,checked_at=CURRENT_TIMESTAMP WHERE school_id=?",url,id);
 return json(res,200,{ok:true});
}
if(p==='/api/directory-scan/status'&&method==='GET'){
 const counts=one("SELECT COUNT(*) total, SUM(CASE WHEN staff_url!='' THEN 1 ELSE 0 END) with_url FROM schools");
 const scans=one("SELECT COUNT(*) attempted, SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) successful FROM directory_scans");
 return json(res,200,{total:counts.total,with_url:counts.with_url||0,attempted:scans.attempted||0,successful:scans.successful||0,pendingReview:one("SELECT COUNT(*) n FROM contact_candidates WHERE status='pending'").n});
}
if(p==='/api/directory-scan/batch'&&method==='POST'){
 const b=await body(req),limit=Math.min(5,Math.max(1,Number(b.limit)||3));
 const schoolsToScan=query("SELECT s.id,s.name,s.staff_url FROM schools s LEFT JOIN directory_scans d ON d.school_id=s.id WHERE s.staff_url!='' AND (d.school_id IS NULL OR (d.status='error' AND d.scanned_at < datetime('now','-7 days'))) ORDER BY s.id LIMIT ?",limit);
 let succeeded=0,failed=0,foundEmails=0,foundSocial=0;
 for(const school of schoolsToScan){
  try{
   const result=await collect(school.staff_url);
   for(const email of result.emails)run('INSERT OR IGNORE INTO contact_candidates(school_id,email,source_url) VALUES(?,?,?)',school.id,email,school.staff_url);
   for(const social of result.social){
    const col=social.includes('instagram.com')?'instagram_url':'x_url';
    run('INSERT OR IGNORE INTO contact_candidates(school_id,'+col+',source_url) VALUES(?,?,?)',school.id,social,school.staff_url);
   }
   run("INSERT INTO directory_scans(school_id,source_url,status,emails,social,scanned_at,error) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,'') ON CONFLICT(school_id) DO UPDATE SET source_url=excluded.source_url,status=excluded.status,emails=excluded.emails,social=excluded.social,scanned_at=CURRENT_TIMESTAMP,error=''",school.id,school.staff_url,'ok',result.emails.length,result.social.length);
   succeeded++;foundEmails+=result.emails.length;foundSocial+=result.social.length;
  }catch(e){
   run("INSERT INTO directory_scans(school_id,source_url,status,error,scanned_at) VALUES(?,?,?, ?,CURRENT_TIMESTAMP) ON CONFLICT(school_id) DO UPDATE SET source_url=excluded.source_url,status=excluded.status,error=excluded.error,scanned_at=CURRENT_TIMESTAMP",school.id,school.staff_url,'error',clean(e.message,200));
   failed++;
  }
 }
 return json(res,200,{scanned:schoolsToScan.length,succeeded,failed,foundEmails,foundSocial,note:'Contacts are candidates, not named verified coaches. Only schools with an official staff URL are scanned.'});
}
if(p==='/api/coaches/verify-batch'&&method==='POST'){
 const b=await body(req),limit=Math.min(10,Math.max(1,Number(b.limit)||10));
 const rows=query("SELECT c.id,c.name,c.email,c.source_url,s.staff_url FROM coaches c JOIN schools s ON s.id=c.school_id WHERE c.status!='verified' AND c.name!='' AND c.email!='' AND (c.source_url!='' OR s.staff_url!='') ORDER BY c.id LIMIT ?",limit);
 let verified=0,unmatched=0,failed=0;
 for(const c of rows){
  try{
   const url=c.source_url||c.staff_url;
   await inspectUrl(url);
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   let html='';
   try{
    const response=await fetch(url,{signal:controller.signal,redirect:'manual',headers:{'User-Agent':'HudsonRecruitingDirectory/1.0 (public staff verification)'}});
    if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))throw Error('Official source unavailable');
    html=(await response.text()).slice(0,600000);
   }finally{clearTimeout(timeout)}
   const matched=collector.parseDirectory(html,url).some(row=>normalize(row.name)===normalize(c.name)&&row.email===c.email.toLowerCase()&&!row.uncertain);
   if(matched&&c.staff_url&&new URL(url).hostname===new URL(c.staff_url).hostname){
    run("UPDATE coaches SET status='verified',verified_at=CURRENT_TIMESTAMP WHERE id=?",c.id);
    activity(c.id,'source_verified','Name and email matched within one football staff row: '+url);
    verified++;
   }else unmatched++;
  }catch(e){failed++}
 }
 return json(res,200,{checked:rows.length,verified,unmatched,failed,note:'Only exact name and email matches on the listed page are marked verified; unmatched contacts remain unchanged.'});
}
if(p==='/api/coaches/import'&&method==='POST'){
 const b=await body(req);
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>200)throw Error('Provide 1 to 200 coach rows');
 const prepared=[],errors=[];
 for(let i=0;i<b.rows.length;i++){
  const x=b.rows[i]||{},name=clean(x.name,150),schoolName=clean(x.school,200),division=clean(x.division,10).toUpperCase(),email=clean(x.email,254).toLowerCase(),phone=clean(x.phone,40);
  if(!name||!schoolName){errors.push('Row '+(i+1)+': school and coach name required');continue}
  const matches=division?query('SELECT id FROM schools WHERE lower(name)=lower(?) AND division=?',schoolName,division):query('SELECT id FROM schools WHERE lower(name)=lower(?)',schoolName);
  if(matches.length!==1){errors.push('Row '+(i+1)+': school not uniquely matched: '+schoolName);continue}
  if(email&&!emailValid(email)){errors.push('Row '+(i+1)+': invalid email');continue}
  if(!phoneValid(phone)){errors.push('Row '+(i+1)+': invalid phone');continue}
  try{prepared.push({school_id:matches[0].id,name,role:clean(x.role,200),email,phone,x_url:safeUrl(clean(x.x_url)),instagram_url:safeUrl(clean(x.instagram_url)),source_url:safeUrl(clean(x.source_url)),notes:clean(x.notes,2000)})}
  catch(e){errors.push('Row '+(i+1)+': '+e.message)}
 }
 if(errors.length)return json(res,400,{error:errors.slice(0,12).join('; ')+(errors.length>12?'; and more errors':'')});
 let imported=0,skipped=0;
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const x of prepared){
   const existing=query('SELECT id,name,email FROM coaches WHERE school_id=?',x.school_id).some(c=>c.name.toLowerCase()===x.name.toLowerCase()&&(c.email||'').toLowerCase()===x.email);
   if(existing){skipped++;continue}
   run('INSERT INTO coaches(school_id,name,role,email,phone,x_url,instagram_url,source_url,notes) VALUES(?,?,?,?,?,?,?,?,?)',x.school_id,x.name,x.role,x.email,x.phone,x.x_url,x.instagram_url,x.source_url,x.notes);
   imported++;
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return json(res,200,{imported,skipped});
}
if(/^\/api\/coaches\/\d+\/evidence$/.test(p)&&method==='GET')return json(res,200,query('SELECT source_url,observed_at,decision FROM collection_evidence WHERE coach_id=? ORDER BY id DESC LIMIT 20',Number(p.split('/')[3])));
if(p==='/api/coaches'&&method==='GET'){const limit=Math.min(50000,Math.max(1,Number(u.searchParams.get('limit'))||50000)),offset=Math.max(0,Number(u.searchParams.get('offset'))||0);return json(res,200,query('SELECT c.*,a.california_recruiter,s.name school,s.division,s.is_hbcu FROM coaches c JOIN california_active a ON a.coach_id=c.id JOIN schools s ON s.id=c.school_id ORDER BY c.id ASC LIMIT ? OFFSET ?',limit,offset));}
if(p==='/api/coaches'&&method==='POST'){const b=await body(req);if(!one('SELECT id FROM schools WHERE id=?',Number(b.school_id)))throw Error('School required');const email=clean(b.email,254).toLowerCase();if(email&&!emailValid(email))throw Error('Invalid email');const phone=clean(b.phone,40);if(!phoneValid(phone))throw Error('Invalid phone');const r=run('INSERT INTO coaches(school_id,name,role,email,phone,x_url,instagram_url,source_url,notes) VALUES(?,?,?,?,?,?,?,?,?)',Number(b.school_id),requireText(b.name,'Coach name',150),clean(b.role),email,phone,safeUrl(b.x_url),safeUrl(b.instagram_url),safeUrl(b.source_url),clean(b.notes,2000));return json(res,201,{id:Number(r.lastInsertRowid)})}
if(/^\/api\/coaches\/\d+$/.test(p)&&method==='PATCH'){const id=Number(p.split('/')[3]),b=await body(req);const c=one('SELECT * FROM coaches WHERE id=?',id);if(!c)throw Error('Coach not found');run('UPDATE coaches SET manual_lock=1 WHERE id=?',id);const fields=['name','role','email','phone','x_url','instagram_url','source_url','notes','status','opted_out'];const values={...c};for(const k of fields)if(Object.hasOwn(b,k))values[k]=b[k];if(!['unverified','verified','stale'].includes(values.status))throw Error('Invalid status');if(values.email&&!emailValid(values.email))throw Error('Invalid email');if(!phoneValid(clean(values.phone,40)))throw Error('Invalid phone');for(const k of ['x_url','instagram_url','source_url'])values[k]=safeUrl(values[k]);run('UPDATE coaches SET name=?,role=?,email=?,phone=?,x_url=?,instagram_url=?,source_url=?,notes=?,status=?,opted_out=?,verified_at=? WHERE id=?',clean(values.name),clean(values.role),clean(values.email).toLowerCase(),clean(values.phone,40),values.x_url,values.instagram_url,values.source_url,clean(values.notes,2000),values.status,Number(Boolean(values.opted_out)),values.status==='verified'?new Date().toISOString():'',id);return json(res,200,{ok:true})}
if(p==='/api/collect'&&method==='POST'){const b=await body(req),school=one('SELECT * FROM schools WHERE id=?',Number(b.school_id));if(!school)throw Error('School required');const url=safeUrl(b.url||school.staff_url);if(!url)throw Error('Staff directory URL required');const results=await collect(url);for(const email of results.emails)run('INSERT OR IGNORE INTO contact_candidates(school_id,email,source_url) VALUES(?,?,?)',school.id,email,url);for(const social of results.social){const k=social.includes('instagram.com')?'instagram_url':'x_url';run(`INSERT OR IGNORE INTO contact_candidates(school_id,${k},source_url) VALUES(?,?,?)`,school.id,social,url)}return json(res,200,{emails:results.emails.length,social:results.social.length,note:'Candidates require manual matching to a named coach and verification.'})}
if(p==='/api/candidates'&&method==='GET')return json(res,200,query('SELECT cc.*,s.name school FROM contact_candidates cc JOIN schools s ON s.id=cc.school_id ORDER BY cc.id DESC LIMIT 1000'));
if(p==='/api/candidates/resolve'&&method==='POST'){const b=await body(req),candidate=one('SELECT * FROM contact_candidates WHERE id=?',Number(b.id));if(!candidate)throw Error('Candidate not found');if(b.action==='reject'){run("UPDATE contact_candidates SET status='rejected' WHERE id=?",candidate.id);return json(res,200,{ok:true})}const name=requireText(b.name,'Coach name');const r=run('INSERT INTO coaches(school_id,name,role,email,x_url,instagram_url,source_url,status) VALUES(?,?,?,?,?,?,?,?)',candidate.school_id,name,clean(b.role),candidate.email,candidate.x_url,candidate.instagram_url,candidate.source_url,'unverified');run("UPDATE contact_candidates SET status='imported' WHERE id=?",candidate.id);return json(res,200,{coach_id:Number(r.lastInsertRowid)})}
if(p==='/api/campaigns'&&method==='GET')return json(res,200,query(`SELECT ca.*,(SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id=ca.id) recipient_count,(SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id=ca.id AND cr.state='sent') sent_count FROM campaigns ca ORDER BY id DESC`));
if(p==='/api/campaigns'&&method==='POST'){const b=await body(req);if(!Array.isArray(b.coach_ids)||!b.coach_ids.length||b.coach_ids.length>1000)throw Error('Choose 1 to 1000 coaches');if(b.coach_ids.some(id=>!focus.active(id)))throw Error('Choose only active California recruiting contacts');const r=run('INSERT INTO campaigns(title,subject,body) VALUES(?,?,?)',requireText(b.title,'Campaign title'),requireText(b.subject,'Subject'),requireText(b.body,'Message',12000));for(const id of new Set(b.coach_ids.map(Number)))if(one('SELECT id FROM coaches WHERE id=?',id))run('INSERT OR IGNORE INTO campaign_recipients(campaign_id,coach_id) VALUES(?,?)',Number(r.lastInsertRowid),id);return json(res,201,{id:Number(r.lastInsertRowid)})}
if(/^\/api\/campaigns\/\d+\/preview$/.test(p)){const id=Number(p.split('/')[3]),camp=one('SELECT * FROM campaigns WHERE id=?',id);if(!camp)throw Error('Campaign not found');return json(res,200,{campaign:camp,recipients:query('SELECT c.name,c.email,c.status,c.opted_out,s.name school,cr.state FROM campaign_recipients cr JOIN california_active a ON a.coach_id=cr.coach_id JOIN coaches c ON c.id=cr.coach_id JOIN schools s ON s.id=c.school_id WHERE cr.campaign_id=? LIMIT 1000',id).map(c=>({...c,subject:render(camp.subject,c,{name:c.school}),body:render(camp.body,c,{name:c.school})}))})}
if(/^\/api\/campaigns\/\d+\/approve$/.test(p)&&method==='POST'){const id=Number(p.split('/')[3]);if(!one("SELECT id FROM campaigns WHERE id=? AND status='draft'",id))throw Error('Only drafts can be approved');run("UPDATE campaigns SET status='approved',approved_at=CURRENT_TIMESTAMP WHERE id=?",id);return json(res,200,{ok:true})}
if(/^\/api\/campaigns\/\d+\/send$/.test(p)&&method==='POST'){const b=await body(req);return json(res,200,await dispatchCampaign(Number(p.split('/')[3]),Math.min(25,Math.max(1,Number(b.limit)||5))))}
if(p==='/api/prospects'&&method==='GET')return json(res,200,query('SELECT p.*,c.name coach,s.name school FROM prospects p JOIN california_active a ON a.coach_id=p.coach_id LEFT JOIN coaches c ON c.id=p.coach_id LEFT JOIN schools s ON s.id=p.school_id ORDER BY p.updated_at DESC'));
if(p==='/api/prospects'&&method==='POST'){const b=await body(req);if(!b.coach_id&&!b.school_id)throw Error('Choose coach or school');const r=run('INSERT INTO prospects(coach_id,school_id,stage,notes,next_followup) VALUES(?,?,?,?,?)',b.coach_id||null,b.school_id||null,clean(b.stage)||'not_contacted',clean(b.notes,3000),clean(b.next_followup,20));return json(res,201,{id:Number(r.lastInsertRowid)})}
if(/^\/api\/prospects\/\d+$/.test(p)&&method==='PATCH'){const b=await body(req);run('UPDATE prospects SET stage=?,notes=?,next_followup=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',clean(b.stage),clean(b.notes,3000),clean(b.next_followup,20),Number(p.split('/')[3]));return json(res,200,{ok:true})}
if(p==='/api/suppression'&&method==='POST'){const b=await body(req),email=clean(b.email).toLowerCase();if(!emailValid(email))throw Error('Valid email required');run('INSERT OR REPLACE INTO suppression(email,reason) VALUES(?,?)',email,clean(b.reason)||'opt out');run('UPDATE coaches SET opted_out=1 WHERE lower(email)=?',email);return json(res,200,{ok:true})}
return json(res,404,{error:'Not found'})}
if(method==='GET'&&(p==='/'||p==='/app.js'||p==='/styles.css'||p==='/contact-directory.js'||p==='/email-recipients.js'||p==='/coach-roles.js'||p==='/california.js')){const file=path.join('public',p==='/'?'index.html':p.slice(1));const content=fs.readFileSync(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});return res.end(content)}return json(res,404,{error:'Not found'})}catch(e){return json(res,400,{error:e.message||'Unexpected error'})}}
http.createServer(handler).listen(PORT,HOST,()=>console.log(`Hudson Command Center: http://${HOST}:${PORT}`));

// GitHub connection write-access verification (2026-10-11).

