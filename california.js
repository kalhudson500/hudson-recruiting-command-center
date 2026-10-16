import {load} from 'cheerio';
import fs from 'node:fs';
import {normalize} from './collector.js';
import {coachCategory,isFootballCoachRole} from './public/coach-roles.js';
const seed=JSON.parse(fs.readFileSync(new URL('./california-seed.json',import.meta.url),'utf8'));

// Only an explicit, labelled recruiting territory counts. Biographical mentions,
// former jobs, hometowns and California players on a roster are not assignments.
export function californiaAssignment(html,name){
 const $=load(html);
 if(!normalize($('title').text()).startsWith(normalize(name)))return '';
 $('script,style,nav,footer').remove();
 const candidates=[];
 $('h1,h2,h3,h4,h5,strong,b,dt,th,p').each((_,el)=>{
  const node=$(el),text=node.text().replace(/\s+/g,' ').trim();
  const label=/^(?:(?:off[ -]campus|primary|other|national)\s+)?recruiting\s+(?:areas?|territor(?:y|ies)|regions?|responsibilit(?:y|ies))\s*[:\-–—]?\s*/i;
  if(!label.test(text))return;
  let area=text.replace(label,'');
  if(!area){
   if(node.is('th,dt'))area=node.next('td,dd').text();
   else if(node.is('strong,b')&&node.parent().is('p,li,div'))area=load((node.parent().html()||'').split(/<br\s*\/?\s*>/i)[0]).text().replace(label,'');
   else {const pieces=[];let next=node.next();for(let i=0;i<4&&next.length;i++,next=next.next()){
    if(next.is('h1,h2,h3,h4,h5')||next.find('h1,h2,h3,h4,h5').length)break;
    pieces.push(next.text());if(next.is('p,ul,ol,table'))break;
   }area=pieces.join(' ');}
  }
  area=area.replace(/\s+/g,' ').trim();
  if(area.length>0&&area.length<900&&!/\b(previously|formerly|prior to|served|recruited|during the|hired in)\b/i.test(area))candidates.push(area);
 });
 return candidates.find(s=>/\b(?:california|calif\.?|CA|socal|norcal|inland empire|san bernardino|riverside county|los angeles|orange county|san diego|sacramento|san francisco|long beach)\b/i.test(s))||'';
}
export const isDL=role=>isFootballCoachRole(role)&&/\b(?:defensive\s+(?:line(?:men)?|ends?|tackles?)|d[ -]line|dl|de|dt|edge)\b/i.test(role);

export function installCalifornia({db,query,one,run,collector}){
 db.exec(`CREATE TABLE IF NOT EXISTS california_state(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER DEFAULT 0);INSERT OR IGNORE INTO california_state(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS california_scans(school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,status TEXT DEFAULT 'pending',source_url TEXT DEFAULT '',checked_at TEXT DEFAULT '',error TEXT DEFAULT '');
 CREATE TABLE IF NOT EXISTS california_contacts(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,name TEXT NOT NULL,role TEXT DEFAULT '',email TEXT DEFAULT '',phone TEXT DEFAULT '',x_url TEXT DEFAULT '',source_url TEXT NOT NULL,profile_url TEXT DEFAULT '',checked_at TEXT NOT NULL,areas TEXT DEFAULT '',area_source_url TEXT DEFAULT '',area_checked_at TEXT DEFAULT '',profile_status TEXT DEFAULT 'pending',error TEXT DEFAULT '',UNIQUE(school_id,name));`);
 db.exec('CREATE TABLE IF NOT EXISTS california_seeded(key TEXT PRIMARY KEY)');
 if(Date.parse(seed.verified_at)>Date.now()-90*86400000&&!one("SELECT key FROM california_seeded WHERE key='20261016'")){
  db.exec('BEGIN IMMEDIATE');try{
   for(const school of seed.schools){const s=one('SELECT id FROM schools WHERE name=? AND division=?',school.name,school.division);if(!s)continue;
    run("INSERT OR IGNORE INTO california_scans(school_id,status,source_url,checked_at) VALUES(?,'complete',?,?)",s.id,school.source_url,school.checked_at);
    for(const c of school.contacts)run("INSERT OR IGNORE INTO california_contacts(school_id,name,role,email,phone,x_url,source_url,profile_url,checked_at,areas,area_source_url,area_checked_at,profile_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'complete')",s.id,c.name,c.role,c.email,c.phone,c.x_url,school.source_url,c.profile_url,school.checked_at,c.areas,c.areas?c.profile_url:'',c.areas?school.checked_at:'');
   }
   run("INSERT INTO california_seeded(key) VALUES('20261016')");db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 let busy=false;
 const counts=()=>({total:one('SELECT COUNT(*) n FROM schools').n,...one("SELECT COUNT(*) queued,SUM(status='pending') pending,SUM(status='review') review,SUM(status='complete') complete FROM california_scans"),...one("SELECT COUNT(DISTINCT school_id) confirmed_schools,COUNT(*) california_recruiters FROM california_contacts WHERE areas!='' AND area_checked_at>=datetime('now','-90 days')"),...one("SELECT COUNT(*) profiles_pending FROM california_contacts WHERE profile_status='pending'"),enabled:!!one('SELECT enabled FROM california_state WHERE id=1').enabled,busy});
 async function tick(){
  if(busy||!one('SELECT enabled FROM california_state WHERE id=1').enabled)return;
  busy=true;try{
   // Finish each school's profiles before moving on, so useful school groups appear early.
   const job=one("SELECT c.* FROM california_contacts c JOIN california_scans s ON s.school_id=c.school_id WHERE c.profile_status='pending' AND s.status='profiles' ORDER BY c.school_id,c.id LIMIT 1");
   if(job){
    try{
     await collector.checkRobots(job.profile_url);const p=await collector.fetchPage(job.profile_url);
     if(new URL(p.url).hostname!==new URL(job.source_url).hostname)throw Error('Profile redirected off official directory domain');
     const areas=californiaAssignment(p.html,job.name);
     run("UPDATE california_contacts SET areas=?,area_source_url=?,area_checked_at=?,profile_status='complete',error='' WHERE id=?",areas,areas?p.url:'',new Date().toISOString(),job.id);
    }catch(e){run("UPDATE california_contacts SET profile_status='review',error=? WHERE id=?",String(e.message).slice(0,300),job.id);}
    if(!one("SELECT id FROM california_contacts WHERE school_id=? AND profile_status='pending'",job.school_id))run("UPDATE california_scans SET status='complete',checked_at=? WHERE school_id=?",new Date().toISOString(),job.school_id);
    return;
   }
   const s=one("SELECT s.* FROM schools s JOIN california_scans c ON c.school_id=s.id WHERE c.status='pending' ORDER BY CASE WHEN upper(s.state) IN ('CA','CALIFORNIA') THEN 0 ELSE 1 END,s.name LIMIT 1");
   if(!s){run('UPDATE california_state SET enabled=0 WHERE id=1');return;}
   try{
    const url=s.staff_url||await collector.discover(s);await collector.checkRobots(url);const p=await collector.fetchPage(url);
    if(new URL(p.url).hostname.replace(/^www\./,'')!==new URL(url).hostname.replace(/^www\./,''))throw Error('Cross-domain directory redirect requires review');
    const rows=collector.parseDirectory(p.html,p.url).filter(c=>!c.uncertain&&(isFootballCoachRole(c.role)||/recruit/i.test(c.role)));
    if(!rows.length)throw Error('Current named football staff could not be read');
    const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
    try{
     // Replace only this dedicated snapshot; the main contact directory and manual edits are preserved.
     run('DELETE FROM california_contacts WHERE school_id=?',s.id);
     for(const c of rows){let profile='';try{const u=new URL(c.profile_url);if(u.hostname===new URL(p.url).hostname&&/\/roster\/coaches\/|\/staff-directory\/|\/coaches\//.test(u.pathname))profile=u.href;}catch{}
      run('INSERT INTO california_contacts(school_id,name,role,email,phone,x_url,source_url,profile_url,checked_at,profile_status) VALUES(?,?,?,?,?,?,?,?,?,?)',s.id,c.name,c.role,c.email,c.phone,c.x_url,p.url,profile,now,profile?'pending':'unavailable');
     }
     run("UPDATE california_scans SET status=?,source_url=?,checked_at=?,error='' WHERE school_id=?",rows.some(c=>c.profile_url)?'profiles':'complete',p.url,now,s.id);db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
   }catch(e){run("UPDATE california_scans SET status='review',checked_at=?,error=? WHERE school_id=?",new Date().toISOString(),String(e.message).slice(0,300),s.id);}
   // Profiles without a supported URL need no further work.
   run("UPDATE california_scans SET status='complete' WHERE status='profiles' AND NOT EXISTS(SELECT 1 FROM california_contacts c WHERE c.school_id=california_scans.school_id AND c.profile_status='pending')");
  }finally{busy=false;}
 }
 const timer=setInterval(()=>tick().catch(e=>console.error('California scan:',e.message)),2000);timer.unref();
 const status=()=>{
  const contacts=query("SELECT * FROM california_contacts ORDER BY name"),scans=query('SELECT s.id,s.name,s.division,c.status,c.error,c.checked_at FROM schools s LEFT JOIN california_scans c ON c.school_id=s.id ORDER BY s.name');
  return {counts:counts(),schools:scans.map(s=>{const staff=contacts.filter(c=>c.school_id===s.id),recruiters=staff.filter(c=>c.areas&&Date.parse(c.area_checked_at)>Date.now()-90*86400000);return {...s,confirmed:recruiters.length>0,contacts:staff.filter(c=>coachCategory(c.role)==='head'||isDL(c.role)||recruiters.some(r=>r.id===c.id)).map(c=>({...c,category:coachCategory(c.role)==='head'?'Head coach':isDL(c.role)?'Defensive line coach':'California recruiter',california_recruiter:recruiters.some(r=>r.id===c.id)}))};})};
 };
 return {status,start:()=>{run('INSERT OR IGNORE INTO california_scans(school_id) SELECT id FROM schools');run('UPDATE california_state SET enabled=1 WHERE id=1');void tick();return counts();},pause:()=>run('UPDATE california_state SET enabled=0 WHERE id=1'),tick};
}
