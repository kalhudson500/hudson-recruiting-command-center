import {isFootballCoachRole} from './public/coach-roles.js';
import { load } from 'cheerio';
import { installXEnrichment } from './x-enrichment.js';
export const normalize = s => String(s||'').replace(/\s+['’]\d{2}\s*$/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseDirectory(html,url){
 const $=load(html); $('script,style,nav,footer,header').remove(); const contacts=[];
 const footballPage=/\/sports\/(football|fball)\//i.test(new URL(url).pathname);
 $('tr,.sidearm-coaches-list-item,.sidearm-staff-member,.sidearm-staff-directory-row,[data-test="staff-member"]').each((_,el)=>{
  const row=$(el), text=row.text().replace(/\s+/g,' ').trim();
  if(!footballPage){const section=row.closest('table,section').text(); if(!/football/i.test(section)||/basketball|volleyball|baseball|softball/i.test(section))return;}
  const named=row.find('[class*="name"],th a,a[href*="/roster/coaches/"],td:first-child a').filter((_,a)=>$(a).text().trim().length>0);
  const name=named.first().text().trim();
  const nameCell=row.find('th[scope="row"],td').filter((_,cell)=>normalize($(cell).text())===normalize(name)).first();
  const role=(row.find('[class*="position"],[class*="title"]').first().text()||nameCell.next('td').text()).trim();
  const plainName=name.replace(/\s+['’]\d{2}\s*$/, '');
  if(!/^[\p{L} .’'\-]{3,90}$/u.test(plainName)||plainName.split(/\s+/).length<2||(!isFootballCoachRole(role)&&!/coach|coordinator|football|recruit|personnel|operations|assistant/i.test(role)))return;
  const emails=[...new Set(row.find('a[href^="mailto:"]').map((_,a)=>$(a).attr('href').slice(7).split('?')[0].trim().toLowerCase()).get())].filter(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const phone=text.match(/(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?/i)?.[0]||'';
  const socials=row.find('a[href]').map((_,a)=>$(a).attr('href')).get().filter(h=>/^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]{1,15}\/?$/i.test(h));
  const instagram=[...new Set(row.find('a[href]').map((_,a)=>$(a).attr('href')).get().filter(h=>/^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{1,30}\/?$/i.test(h)&&! /\/(p|reel|reels|explore|accounts|stories)\/?$/i.test(h)))];
  const profileLink=row.find('a[href]').filter((_,a)=>normalize($(a).text())===normalize(name)).first().attr('href');
  const profile_url=profileLink?new URL(profileLink,url).href:'';
  contacts.push({name,role,profile_url,instagram_url:instagram.length===1?'https://www.instagram.com/'+instagram[0].split('/').filter(Boolean).at(-1):'',email:emails.length===1?emails[0]:'',phone,x_url:socials.length===1?'https://x.com/'+socials[0].split('/').filter(Boolean).at(-1):'',source_url:url,uncertain:emails.length>1||socials.length>1||instagram.length>1});
 });
 return contacts.filter((c,i,a)=>a.findIndex(x=>normalize(x.name)===normalize(c.name))===i);
}
export function robotsAllowed(text,url){
 const groups=[];let group={agents:[],rules:[]};
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0],colon=line.indexOf(':');if(colon<0)continue;
  const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
  if(key==='user-agent'){if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(value.toLowerCase());}
  else if((key==='allow'||key==='disallow')&&value&&group.agents.length)group.rules.push({key,value});
 }groups.push(group);
 const scored=groups.map(g=>({...g,score:Math.max(0,...g.agents.map(a=>a==='*'?1:'hudsonrecruitingdirectory'.startsWith(a)?a.length:0))})),best=Math.max(0,...scored.map(g=>g.score));
 const path=new URL(url).pathname+new URL(url).search,matches=[];
 for(const g of scored.filter(g=>best&&g.score===best))for(const r of g.rules){
  const ends=r.value.endsWith('$'),pattern=(ends?r.value.slice(0,-1):r.value).split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
  if(new RegExp('^'+pattern+(ends?'$':'')).test(path))matches.push(r);
 }
 matches.sort((a,b)=>b.value.replace(/\*/g,'').length-a.value.replace(/\*/g,'').length||(a.key==='allow'?-1:1));return !matches.length||matches[0].key==='allow';
}
export function parseCoachProfile(html,url,name){
 const $=load(html),block=$('.sidearm-coach-bio-header-details').first();
 const titleMatches=normalize($('title').text()).startsWith(normalize(name));
 const blockMatches=block.length&&normalize(block.find('[class*="name"]').first().text())===normalize(name);
 if(!blockMatches&&!titleMatches)return null;
 const fields={};if(blockMatches)block.find('dt').each((_,dt)=>{const label=$(dt).text().trim().toLowerCase(),value=$(dt).next('dd');if(label==='email')fields.email=value.find('a[href^="mailto:"]').attr('href')?.slice(7).split('?')[0].toLowerCase()||'';if(label==='phone')fields.phone=value.text().trim();if(label==='instagram')fields.instagram_url=value.find('a[href]').attr('href')||'';if(label==='twitter'||label==='x')fields.x_url=value.find('a[href]').attr('href')||'';});
 const namedLinks=$('a[href][aria-label]').filter((_,a)=>{const label=$(a).attr('aria-label')||'';const match=label.match(/^Visit (.+) (?:Twitter|X|Instagram) profile page$/i);return match&&normalize(match[1])===normalize(name);}).map((_,a)=>$(a).attr('href')).get();
 const profiles=[...new Set(namedLinks.filter(h=>/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i.test(h)))];const instagram=[...new Set(namedLinks.filter(h=>/^https?:\/\/(?:www\.)?instagram\.com\//i.test(h)))];if(instagram.length===1&&!fields.instagram_url)fields.instagram_url=instagram[0];if(profiles.length===1&&!fields.x_url)fields.x_url=profiles[0];
 if(fields.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))delete fields.email;
 if(fields.x_url){if(/^https?:\/\/(www\.)?(x|twitter)\.com\/[\w]{1,15}\/?$/i.test(fields.x_url))fields.x_url='https://x.com/'+fields.x_url.split('/').filter(Boolean).at(-1);else delete fields.x_url;}
 if(fields.instagram_url){if(/^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{1,30}\/?$/i.test(fields.instagram_url)&&! /\/(p|reel|reels|explore|accounts|stories)\/?$/i.test(fields.instagram_url))fields.instagram_url='https://www.instagram.com/'+fields.instagram_url.split('/').filter(Boolean).at(-1);else delete fields.instagram_url;}
 if(fields.phone&&!/^(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?$/i.test(fields.phone))delete fields.phone;
 return {...fields,profile_source_url:url};
}
export function directoryIdentity(s){
 const aliases={
  'Akron':['University of Akron','Akron'], 'Alabama':['University of Alabama','Alabama'],
  'Alabama A&M University':['Alabama A&M University','Alabama A&M'],
  'Alabama State University':['Alabama State University','Alabama State'],
  'Miami (FL)':['University of Miami','Miami'], 'Miami (OH)':['Miami University','Miami'],
  'LSU':['Louisiana State University','LSU'], 'Ole Miss':['University of Mississippi','Ole Miss'],
  'USC':['University of Southern California','USC'], 'UCLA':['University of California Los Angeles','UCLA'],
  'UCF':['University of Central Florida','UCF'], 'UConn':['University of Connecticut','UConn'],
  'UTSA':['University of Texas at San Antonio','UTSA'], 'UTEP':['University of Texas at El Paso','UTEP'],
  'UNLV':['University of Nevada Las Vegas','UNLV'], 'UAB':['University of Alabama at Birmingham','UAB'],
  'SMU':['Southern Methodist University','SMU'], 'TCU':['Texas Christian University','TCU'],
  'BYU':['Brigham Young University','BYU'], 'FIU':['Florida International University','FIU'],
  'FAU':['Florida Atlantic University','FAU'], 'UMass':['University of Massachusetts Amherst','UMass'],
  'Appalachian State':['Appalachian State University','App State'], 'Arizona State':['Arizona State University','Arizona State','ASU'],
  'NC State':['North Carolina State University','NC State'], 'Pitt':['University of Pittsburgh','Pitt'],
  'Army':['United States Military Academy','Army'], 'Navy':['United States Naval Academy','Navy']
 };
 const campusPages={'Akron':'https://www.uakron.edu/campus-life/','Alabama':'https://www.ua.edu/campus-life/','Alabama A&M University':'https://www.aamu.edu/athletics/index.html','Alabama State University':'https://alasu.edu/'};
 const pair=aliases[s.name];return {campusUrl:campusPages[s.name]||'',query:pair?pair[0]:s.name,candidateNames:pair?[...new Set(pair)]:[s.name],campusNames:pair?[pair[0]]:[s.name]};
}
export function installCollector({db,query,one,run,inspectUrl}){
 db.exec(`CREATE TABLE IF NOT EXISTS collection_state(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER DEFAULT 0); INSERT OR IGNORE INTO collection_state(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS collection_progress(school_id INTEGER PRIMARY KEY REFERENCES schools(id),status TEXT NOT NULL,source_url TEXT DEFAULT '',checked_at TEXT DEFAULT CURRENT_TIMESTAMP,imported INTEGER DEFAULT 0,error TEXT DEFAULT '');
 CREATE TABLE IF NOT EXISTS collection_evidence(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),coach_id INTEGER REFERENCES coaches(id),source_url TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL,decision TEXT NOT NULL);`);
 db.exec("CREATE TABLE IF NOT EXISTS collection_directories(school_id INTEGER PRIMARY KEY REFERENCES schools(id),directory_url TEXT NOT NULL,official_source_url TEXT NOT NULL,verified_at TEXT NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS collection_profiles(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),coach_id INTEGER NOT NULL REFERENCES coaches(id),profile_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',checked_at TEXT DEFAULT '',error TEXT DEFAULT '',UNIQUE(coach_id,profile_url))");
 if(!query('PRAGMA table_info(coaches)').some(c=>c.name==='instagram_url'))db.exec("ALTER TABLE coaches ADD COLUMN instagram_url TEXT DEFAULT ''");
 if(!query('PRAGMA table_info(coaches)').some(c=>c.name==='manual_lock'))db.exec('ALTER TABLE coaches ADD COLUMN manual_lock INTEGER DEFAULT 0');
 db.exec("CREATE TABLE IF NOT EXISTS collection_coaching_refresh(school_id INTEGER PRIMARY KEY REFERENCES schools(id),priority INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS collection_repairs(key TEXT PRIMARY KEY,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
 if(!one("SELECT key FROM collection_repairs WHERE key='coaching_names_positions_v1'")){db.exec('BEGIN IMMEDIATE');try{run('INSERT OR IGNORE INTO collection_coaching_refresh(school_id) SELECT id FROM schools');run("INSERT INTO collection_repairs(key) VALUES('coaching_names_positions_v1')");if(one('SELECT COUNT(*) n FROM collection_coaching_refresh').n)run('UPDATE collection_state SET enabled=1 WHERE id=1');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 let busy=false,schoolSteps=0;const robotsCache=new Map();
 async function fetchPage(url){
  for(let redirects=0;redirects<5;redirects++){
   await inspectUrl(url); const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'HudsonRecruitingDirectory/2.0 (public football staff contacts)'}});
   if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),url).href;continue;}
   if(!r.ok)throw Error('Source HTTP '+r.status);if(!r.headers.get('content-type')?.includes('text/html'))throw Error('HTML directory required');
   let html='';for await(const chunk of r.body){html+=Buffer.from(chunk).toString();if(html.length>8000000)throw Error('Directory too large');}return {html,url};
  }throw Error('Too many redirects');
 }
 async function checkRobots(url){
  const origin=new URL(url).origin;let rules=robotsCache.get(origin);
  if(!rules){let robotsUrl=new URL('/robots.txt',origin).href;
   for(let i=0;i<5;i++){await inspectUrl(robotsUrl);const response=await fetch(robotsUrl,{redirect:'manual',signal:AbortSignal.timeout(10000)});
    if([301,302,303,307,308].includes(response.status)){robotsUrl=new URL(response.headers.get('location'),robotsUrl).href;continue;}
    if(response.status===404)rules={text:''};else if(response.ok){const text=await response.text();if(text.length>200000)throw Error('robots.txt too large');rules={text};}else throw Error('Cannot confirm robots.txt permission; HTTP '+response.status);
    break;
   }if(!rules)throw Error('Cannot resolve robots.txt');robotsCache.set(origin,rules);
  }if(!robotsAllowed(rules.text,url))throw Error('Directory excluded by robots.txt; needs review');
 }
 async function search(q,count=8){
  const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',q);u.searchParams.set('count',String(count));
  const r=await fetch(u,{headers:{'X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY},signal:AbortSignal.timeout(15000)});
  if(!r.ok){if([401,402,403].includes(r.status))run('UPDATE collection_state SET enabled=0 WHERE id=1');throw Error('Search HTTP '+r.status);}return (await r.json()).web?.results||[];
 }
 async function discover(s){
  if(!process.env.BRAVE_SEARCH_API_KEY)throw Error('Missing BRAVE_SEARCH_API_KEY for directory discovery');
  const identity=directoryIdentity(s);
  const results=await search(identity.query+' '+s.division+' official football coaching staff');
  const candidates=results.filter(x=>{try{const u=new URL(x.url);return u.protocol==='https:'&&/\/sports\/(football|fball)\/(coaches|staff)|\/staff-directory|\/coaches\/?$/i.test(u.pathname)&&! /\/20\d{2}(?:[/-]|$)/.test(u.pathname.replace('/'+new Date().getUTCFullYear(),''))&&identity.candidateNames.some(name=>normalize(x.title).includes(normalize(name)));}catch{return false}}).sort((a,b)=>Number(/staff-directory/.test(a.url))-Number(/staff-directory/.test(b.url)));
  if(!candidates.length)throw Error('No current named football directory found; needs review');
  // Search university-owned pages separately: athletics results often crowd them out.
  const institutions=[...(identity.campusUrl?[{url:identity.campusUrl}]:[]),...results.filter(x=>{try{return new URL(x.url).hostname.endsWith('.edu')}catch{return false}}),...await search(identity.query+' official athletics site:edu',5)];
  const anchors=new Map(),seen=new Set();
  for(const institution of institutions){
   if(seen.has(institution.url))continue;seen.add(institution.url);
   try{
    const page=await fetchPage(institution.url),host=new URL(page.url).hostname,$=load(page.html);
    if(!host.endsWith('.edu')||!identity.campusNames.some(name=>normalize($('title,h1,h2').text()+' '+($('meta[property="og:site_name"]').attr('content')||'')).includes(normalize(name))))continue;
    anchors.set(host.replace(/^www\./,''),page.url);
    $('a[href]').each((_,a)=>{try{const target=new URL($(a).attr('href'),page.url);if(/^https?:$/.test(target.protocol)&&/athletic/i.test($(a).text()))anchors.set(target.hostname.replace(/^www\./,''),page.url);}catch{}});
    for(const candidate of candidates){const host=new URL(candidate.url).hostname.replace(/^www\./,'');if(anchors.has(host)){if(s.id)run('INSERT OR REPLACE INTO collection_directories(school_id,directory_url,official_source_url,verified_at) VALUES(?,?,?,?)',s.id,candidate.url,anchors.get(host),new Date().toISOString());return candidate.url;}}
   }catch{} // An unavailable campus page must not discard other ownership evidence.
  }
  for(const candidate of candidates){const host=new URL(candidate.url).hostname.replace(/^www\./,'');if(anchors.has(host)){if(s.id)run('INSERT OR REPLACE INTO collection_directories(school_id,directory_url,official_source_url,verified_at) VALUES(?,?,?,?)',s.id,candidate.url,anchors.get(host),new Date().toISOString());return candidate.url;}}
  throw Error('No institution-linked official directory confirmed; needs review');
 }
 async function processSchool(s){
  let source=s.staff_url;
  try{
   source=source||await discover(s);await checkRobots(source);
   const page=await fetchPage(source);
   // Existing school staff URLs are the authoritative domain anchors. Redirects across domains need review.
   if(new URL(source).hostname.replace(/^www\./,'')!==new URL(page.url).hostname.replace(/^www\./,''))throw Error('Cross-domain redirect needs review');
   const rows=parseDirectory(page.html,page.url);if(!rows.length)throw Error('No supported named football staff rows; needs review');
   let imported=0,review=0;const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
   try{for(const c of rows){
    const matches=query('SELECT * FROM coaches WHERE school_id=?',s.id).filter(x=>normalize(x.name)===normalize(c.name));
    let coach=matches[0],decision='imported';
    const sharedEmail=c.email&&query('SELECT name FROM coaches WHERE school_id=? AND lower(email)=?',s.id,c.email).some(x=>normalize(x.name)!==normalize(c.name));
    if(c.uncertain||matches.length>1||(coach&&((coach.email&&coach.email.toLowerCase()!==c.email)||(coach.phone&&coach.phone!==c.phone)||(coach.x_url&&coach.x_url!==c.x_url)||(coach.instagram_url&&coach.instagram_url!==c.instagram_url)||(coach.manual_lock)||(coach.role&&normalize(coach.role)!==normalize(c.role))))){decision='review';review++;}
    else if(!coach){const result=run("INSERT INTO coaches(school_id,name,role,email,phone,x_url,instagram_url,source_url,status,verified_at) VALUES(?,?,?,?,?,?,?,?,'verified',?)",s.id,c.name,c.role,c.email,c.phone,c.x_url,c.instagram_url,page.url,now);coach={id:Number(result.lastInsertRowid)};imported++;}
    else {run("UPDATE coaches SET role=CASE WHEN role='' THEN ? ELSE role END,email=CASE WHEN email='' THEN ? ELSE email END,phone=CASE WHEN phone='' THEN ? ELSE phone END,x_url=CASE WHEN x_url='' THEN ? ELSE x_url END,instagram_url=CASE WHEN instagram_url='' THEN ? ELSE instagram_url END,source_url=?,verified_at=?,status='verified' WHERE id=?",c.role,c.email,c.phone,c.x_url,c.instagram_url,page.url,now,coach.id);decision='matched';}
    if(coach&&decision!=='review'&&c.profile_url&&new URL(c.profile_url).hostname===new URL(page.url).hostname&&/\/roster\/coaches\/|\/staff-directory\//.test(new URL(c.profile_url).pathname)&&!(c.email&&c.phone&&c.x_url&&c.instagram_url))run('INSERT OR IGNORE INTO collection_profiles(school_id,coach_id,profile_url) VALUES(?,?,?)',s.id,coach.id,c.profile_url);
    run('INSERT INTO collection_evidence(school_id,coach_id,source_url,observed_at,payload,decision) VALUES(?,?,?,?,?,?)',s.id,coach?.id||null,page.url,now,JSON.stringify({...c,shared_email:!!sharedEmail}),decision);
   }
   run("UPDATE schools SET staff_url=? WHERE id=? AND staff_url=''",page.url,s.id);
   run("INSERT OR REPLACE INTO collection_progress(school_id,status,source_url,checked_at,imported,error) VALUES(?,?,?,?,?,?)",s.id,review?'review':'complete',page.url,now,one("SELECT COUNT(DISTINCT coach_id) n FROM collection_evidence WHERE school_id=? AND decision='imported'",s.id).n,review?review+' conflicting contacts need review':'');db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){run("INSERT OR REPLACE INTO collection_progress(school_id,status,source_url,error) VALUES(?,'review',?,?)",s.id,source,String(e.message).slice(0,400));}
  run('DELETE FROM collection_coaching_refresh WHERE school_id=?',s.id);
 }
 async function processProfile(job){
  const coach=one('SELECT * FROM coaches WHERE id=?',job.coach_id),school=one('SELECT * FROM schools WHERE id=?',job.school_id);
  try{
   if(!coach||coach.manual_lock)throw Error('Manually edited contact remains protected');
   if(!school.staff_url||new URL(job.profile_url).hostname!==new URL(school.staff_url).hostname)throw Error('Profile has no matching official school domain');
   await checkRobots(job.profile_url);const page=await fetchPage(job.profile_url);
   if(new URL(page.url).hostname!==new URL(job.profile_url).hostname)throw Error('Cross-domain profile needs review');
   const fields=parseCoachProfile(page.html,page.url,coach.name);if(!fields)throw Error('Unsupported or unmatched named profile');
   const now=new Date().toISOString();let conflict=false;db.exec('BEGIN IMMEDIATE');
   try{
    for(const key of ['email','phone','x_url','instagram_url'])if(fields[key]){if(coach[key]&&coach[key]!==fields[key])conflict=true;else if(!coach[key])run('UPDATE coaches SET '+key+'=? WHERE id=? AND manual_lock=0 AND '+key+"=''",fields[key],coach.id);}
    run('INSERT INTO collection_evidence(school_id,coach_id,source_url,observed_at,payload,decision) VALUES(?,?,?,?,?,?)',school.id,coach.id,page.url,now,JSON.stringify({...fields,name:coach.name,kind:'profile'}),conflict?'review':'profile_matched');
    run('UPDATE collection_profiles SET status=?,checked_at=?,error=? WHERE id=?',conflict?'review':'complete',now,conflict?'Conflicting profile values preserved':'',job.id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){run("UPDATE collection_profiles SET status='review',checked_at=CURRENT_TIMESTAMP,error=? WHERE id=?",String(e.message).slice(0,400),job.id);}
 }
 async function tick(){if(busy||!one('SELECT enabled FROM collection_state WHERE id=1').enabled)return;busy=true;try{
  const s=one("SELECT s.* FROM schools s LEFT JOIN collection_progress p ON p.school_id=s.id LEFT JOIN collection_coaching_refresh q ON q.school_id=s.id WHERE s.division IN ('FBS','FCS','D2','D3') AND (p.school_id IS NULL OR q.school_id IS NOT NULL) AND (s.staff_url!='' OR ?=1) ORDER BY COALESCE(q.priority,0) DESC, (SELECT COUNT(*) FROM coaches c WHERE c.school_id=s.id AND lower(c.role) LIKE '%head%coach%' AND lower(c.role) NOT LIKE '%strength%' AND lower(c.role) NOT LIKE '%assistant%'),s.id LIMIT 1",Number(Boolean(process.env.BRAVE_SEARCH_API_KEY)));
  const job=one("SELECT * FROM collection_profiles WHERE status='pending' ORDER BY id LIMIT 1");
  if(job&&(!s||schoolSteps>=3)){await processProfile(job);schoolSteps=0;}else if(s){await processSchool(s);schoolSteps++;}else run('UPDATE collection_state SET enabled=0 WHERE id=1');
 }finally{busy=false;}}
 const timer=setInterval(()=>tick().catch(e=>console.error('Collection worker:',e.message)),5000);timer.unref();
 const xEnrichment=installXEnrichment({db,query,one,run,fetchPage,checkRobots,search});
 return {refreshSchool:id=>{const s=one('SELECT * FROM schools WHERE id=?',Number(id));if(!s)throw Error('School not found');run('INSERT OR REPLACE INTO collection_coaching_refresh(school_id,priority) VALUES(?,1)',s.id);run('UPDATE collection_state SET enabled=1 WHERE id=1');void tick();},startX:xEnrichment.start,pauseX:xEnrichment.pause,status:()=>({coachingRefreshPending:one('SELECT COUNT(*) n FROM collection_coaching_refresh').n,xEnrichment:xEnrichment.status(),enabled:!!one('SELECT enabled FROM collection_state WHERE id=1').enabled,busy,searchConfigured:!!process.env.BRAVE_SEARCH_API_KEY,total:one('SELECT COUNT(*) n FROM schools').n,counts:query('SELECT status,COUNT(*) count FROM collection_progress GROUP BY status'),profiles:query('SELECT status,COUNT(*) count FROM collection_profiles GROUP BY status'),schools:query('SELECT s.name,s.division,p.* FROM collection_progress p JOIN schools s ON s.id=p.school_id ORDER BY p.checked_at DESC'),review:query("SELECT e.*,s.name school FROM collection_evidence e JOIN schools s ON s.id=e.school_id WHERE e.decision='review' ORDER BY e.id DESC LIMIT 200")}),start:()=>{run('UPDATE collection_state SET enabled=1 WHERE id=1');void tick();},pause:()=>run('UPDATE collection_state SET enabled=0 WHERE id=1'),retry:()=>run("DELETE FROM collection_progress WHERE status='review'"),parseDirectory,fetchPage,discover};
}

