import { load } from 'cheerio';
export const normalize = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseDirectory(html,url){
 const $=load(html); $('script,style,nav,footer,header').remove(); const contacts=[];
 const footballPage=/\/sports\/(football|fball)\//i.test(new URL(url).pathname);
 $('tr,.sidearm-coaches-list-item,.sidearm-staff-member,.sidearm-staff-directory-row,[data-test="staff-member"]').each((_,el)=>{
  const row=$(el), text=row.text().replace(/\s+/g,' ').trim();
  if(!footballPage){const section=row.closest('table,section').text(); if(!/football/i.test(section)||/basketball|volleyball|baseball|softball/i.test(section))return;}
  const name=row.find('[class*="name"],td:first-child a,th a').first().text().trim();
  const role=row.find('[class*="position"],[class*="title"],td:nth-child(2)').first().text().trim();
  if(!/^[\p{L} .’'\-]{3,90}$/u.test(name)||name.split(/\s+/).length<2||!/coach|coordinator|football|recruit|personnel|operations|assistant/i.test(role))return;
  const emails=[...new Set(row.find('a[href^="mailto:"]').map((_,a)=>$(a).attr('href').slice(7).split('?')[0].trim().toLowerCase()).get())].filter(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const phone=text.match(/(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?/i)?.[0]||'';
  const socials=row.find('a[href]').map((_,a)=>$(a).attr('href')).get().filter(h=>/^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]{1,15}\/?$/i.test(h));
  contacts.push({name,role,email:emails.length===1?emails[0]:'',phone,x_url:socials.length===1?'https://x.com/'+socials[0].split('/').filter(Boolean).at(-1):'',source_url:url,uncertain:emails.length>1||socials.length>1});
 });
 return contacts.filter((c,i,a)=>a.findIndex(x=>normalize(x.name)===normalize(c.name))===i);
}
export function installCollector({db,query,one,run,inspectUrl}){
 db.exec(`CREATE TABLE IF NOT EXISTS collection_state(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER DEFAULT 0); INSERT OR IGNORE INTO collection_state(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS collection_progress(school_id INTEGER PRIMARY KEY REFERENCES schools(id),status TEXT NOT NULL,source_url TEXT DEFAULT '',checked_at TEXT DEFAULT CURRENT_TIMESTAMP,imported INTEGER DEFAULT 0,error TEXT DEFAULT '');
 CREATE TABLE IF NOT EXISTS collection_evidence(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),coach_id INTEGER REFERENCES coaches(id),source_url TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL,decision TEXT NOT NULL);`);
 if(!query('PRAGMA table_info(coaches)').some(c=>c.name==='manual_lock'))db.exec('ALTER TABLE coaches ADD COLUMN manual_lock INTEGER DEFAULT 0');
 let busy=false;
 async function fetchPage(url){
  for(let redirects=0;redirects<5;redirects++){
   await inspectUrl(url); const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'HudsonRecruitingDirectory/2.0 (public football staff contacts)'}});
   if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),url).href;continue;}
   if(!r.ok)throw Error('Source HTTP '+r.status);if(!r.headers.get('content-type')?.includes('text/html'))throw Error('HTML directory required');
   let html='';for await(const chunk of r.body){html+=Buffer.from(chunk).toString();if(html.length>2000000)throw Error('Directory too large');}return {html,url};
  }throw Error('Too many redirects');
 }
 async function discover(s){
  if(!process.env.BRAVE_SEARCH_API_KEY)throw Error('Missing BRAVE_SEARCH_API_KEY for directory discovery');
  const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',s.name+' official university athletics football coaching staff');u.searchParams.set('count','8');
  const r=await fetch(u,{headers:{'X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Search HTTP '+r.status);
  const results=(await r.json()).web?.results||[];
  // A university-owned page must explicitly link to the candidate athletics host.
  for(const candidate of results.filter(x=>/\/sports\/(football|fball)\/(coaches|staff)|\/staff-directory/i.test(x.url||''))){
   const host=new URL(candidate.url).hostname;
   for(const institution of results.filter(x=>new URL(x.url).hostname.endsWith('.edu'))){
    const page=await fetchPage(institution.url),$=load(page.html);
    const title=$('title').text();if(!normalize(title).includes(normalize(s.name)))continue;
    const linked=$('a[href]').toArray().some(a=>{try{return new URL($(a).attr('href'),page.url).hostname===host}catch{return false}});
    if(linked&&normalize(candidate.title).includes(normalize(s.name)))return candidate.url;
   }
  }throw Error('No institution-linked official directory confirmed; needs review');
 }
 async function processSchool(s){
  let source=s.staff_url;
  try{
   source=source||await discover(s);const robotsUrl=new URL('/robots.txt',source).href;await inspectUrl(robotsUrl);
   const robots=await fetch(robotsUrl,{redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(robots.ok){let applies=false;for(const line of (await robots.text()).split(/\r?\n/)){const [key,...parts]=line.split(':');const value=parts.join(':').split('#')[0].trim();if(key.trim().toLowerCase()==='user-agent')applies=value==='*'||/hudson/i.test(value);if(applies&&key.trim().toLowerCase()==='disallow'&&value&&new URL(source).pathname.startsWith(value))throw Error('Directory excluded by robots.txt; needs review');}}else if(robots.status!==404)throw Error('Cannot confirm robots.txt permission; HTTP '+robots.status);
   const page=await fetchPage(source);
   // Existing school staff URLs are the authoritative domain anchors. Redirects across domains need review.
   if(new URL(source).hostname.replace(/^www\./,'')!==new URL(page.url).hostname.replace(/^www\./,''))throw Error('Cross-domain redirect needs review');
   const rows=parseDirectory(page.html,page.url);if(!rows.length)throw Error('No supported named football staff rows; needs review');
   let imported=0,review=0;const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
   try{for(const c of rows){
    const matches=query('SELECT * FROM coaches WHERE school_id=?',s.id).filter(x=>normalize(x.name)===normalize(c.name));
    let coach=matches[0],decision='imported';
    const emailCollision=c.email&&query('SELECT name FROM coaches WHERE school_id=? AND lower(email)=?',s.id,c.email).some(x=>normalize(x.name)!==normalize(c.name));
    if(emailCollision||c.uncertain||matches.length>1||(coach&&((coach.email&&c.email&&coach.email.toLowerCase()!==c.email)||(coach.manual_lock)||(coach.role&&normalize(coach.role)!==normalize(c.role))))){decision='review';review++;}
    else if(!coach){const result=run("INSERT INTO coaches(school_id,name,role,email,phone,x_url,source_url,status,verified_at) VALUES(?,?,?,?,?,?,?,'verified',?)",s.id,c.name,c.role,c.email,c.phone,c.x_url,page.url,now);coach={id:Number(result.lastInsertRowid)};imported++;}
    else {run("UPDATE coaches SET role=CASE WHEN role='' THEN ? ELSE role END,email=CASE WHEN email='' THEN ? ELSE email END,phone=CASE WHEN phone='' THEN ? ELSE phone END,x_url=CASE WHEN x_url='' THEN ? ELSE x_url END,source_url=?,verified_at=?,status='verified' WHERE id=?",c.role,c.email,c.phone,c.x_url,page.url,now,coach.id);decision='matched';}
    run('INSERT INTO collection_evidence(school_id,coach_id,source_url,observed_at,payload,decision) VALUES(?,?,?,?,?,?)',s.id,coach?.id||null,page.url,now,JSON.stringify(c),decision);
   }
   run("UPDATE schools SET staff_url=? WHERE id=? AND staff_url=''",page.url,s.id);
   run("INSERT OR REPLACE INTO collection_progress(school_id,status,source_url,checked_at,imported,error) VALUES(?,?,?,?,?,?)",s.id,review?'review':'complete',page.url,now,imported,review?review+' conflicting contacts need review':'');db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){run("INSERT OR REPLACE INTO collection_progress(school_id,status,source_url,error) VALUES(?,'review',?,?)",s.id,source,String(e.message).slice(0,400));}
 }
 async function tick(){if(busy||!one('SELECT enabled FROM collection_state WHERE id=1').enabled)return;busy=true;try{
  const s=one("SELECT s.* FROM schools s LEFT JOIN collection_progress p ON p.school_id=s.id WHERE s.division IN ('FBS','FCS','D2','D3') AND p.school_id IS NULL AND (s.staff_url!='' OR ?=1) ORDER BY s.id LIMIT 1",Number(Boolean(process.env.BRAVE_SEARCH_API_KEY)));
  if(s)await processSchool(s);else run('UPDATE collection_state SET enabled=0 WHERE id=1');
 }finally{busy=false;}}
 const timer=setInterval(()=>tick().catch(e=>console.error('Collection worker:',e.message)),5000);timer.unref();
 return {status:()=>({enabled:!!one('SELECT enabled FROM collection_state WHERE id=1').enabled,busy,searchConfigured:!!process.env.BRAVE_SEARCH_API_KEY,total:one('SELECT COUNT(*) n FROM schools').n,counts:query('SELECT status,COUNT(*) count FROM collection_progress GROUP BY status'),schools:query('SELECT s.name,s.division,p.* FROM collection_progress p JOIN schools s ON s.id=p.school_id ORDER BY p.checked_at DESC'),review:query("SELECT e.*,s.name school FROM collection_evidence e JOIN schools s ON s.id=e.school_id WHERE e.decision='review' ORDER BY e.id DESC LIMIT 200")}),start:()=>{run('UPDATE collection_state SET enabled=1 WHERE id=1');void tick();},pause:()=>run('UPDATE collection_state SET enabled=0 WHERE id=1'),retry:()=>run("DELETE FROM collection_progress WHERE status='review'"),parseDirectory,fetchPage};
}
