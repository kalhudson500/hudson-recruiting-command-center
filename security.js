import {installMapGeocoder} from './map-geocoder.js';
export const stages=['Research','Contacted','Qualified','Walkthrough','Proposal sent','Decision scheduled','Won','Lost','Nurture'];
const fields=['organization','contact','sector','city','email','phone','source_url','verified_at','stage','next_followup','notes','signal','proposal_value','start_date','opted_out','address','latitude','longitude','location_method'];
export function installSecurity({db,query,one,run,body,json}){
 db.exec(`CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY,reason TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS security_leads(id INTEGER PRIMARY KEY,organization TEXT NOT NULL,contact TEXT DEFAULT '',sector TEXT DEFAULT 'HOA',city TEXT DEFAULT '',email TEXT DEFAULT '',phone TEXT DEFAULT '',source_url TEXT DEFAULT '',verified_at TEXT DEFAULT '',stage TEXT DEFAULT 'Research',next_followup TEXT DEFAULT '',notes TEXT DEFAULT '',signal TEXT DEFAULT '',proposal_value REAL DEFAULT 0,start_date TEXT DEFAULT '',opted_out INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS security_activity(id INTEGER PRIMARY KEY,lead_id INTEGER REFERENCES security_leads(id),kind TEXT NOT NULL,detail TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS security_settings(id INTEGER PRIMARY KEY CHECK(id=1),postal_address TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT ''); INSERT OR IGNORE INTO security_settings(id) VALUES(1);`);
 const columns=new Set(query('PRAGMA table_info(security_leads)').map(c=>c.name));
 for(const [name,type] of [['address',"TEXT DEFAULT ''"],['latitude','REAL'],['longitude','REAL'],['location_method',"TEXT DEFAULT ''"]])if(!columns.has(name))db.exec('ALTER TABLE security_leads ADD COLUMN '+name+' '+type);
 const geocode=installMapGeocoder({db,one,run});
 const seeds=[
 ['Sunny Hills Management','Filippo Fontana','Commercial','Riverside / Moreno Valley','Filippo@shmcRE.com','909-890-1226','https://www.shmcre.com/contact-us/'],
 ['Sunny Hills Management','Rosalind Tan','Commercial','San Bernardino / Rancho Cucamonga','Rosalind@shmcRE.com','909-890-1226','https://www.shmcre.com/contact-us/'],
 ['IPA Commercial','Kristen Soliz','Commercial','Fontana','ksoliz@ipacommercial.com','951-686-1462 ext. 316','https://ipacommercial.com/fontana-commercial-property-management/'],
 ['Weldon L. Brown','Maxwell','HOA','Riverside','Maxwell@weldonbrown.com','951-682-5454','https://weldonbrown.com/sanbernardinohoamanagement/'],
 ['Alterra HOA / Action','Valerie Raboin','HOA','Corona','vraboin@actionlife.com','800-400-2284','https://alterrahoa.org/management/contact-information/'],
 ['Keystone Pacific','Ontario regional office','HOA','Ontario','reconnect@keystonepacific.com','909-297-2550','https://www.kppm.com/contact-2/'],
 ['Victoria Gardens HOA','Estela Alday','HOA','Rancho Cucamonga','ealday@actionlife.com','800-400-2284','https://www.victoriagardenshoa.com/management/contact-information/'],
 ['Avalon Management','Temecula office','HOA','Temecula','','951-699-2918','https://www.avalonweb.com/avalon-locations.html']];
 // One-time seed marker: restarting never recreates or overwrites edited leads.
 db.exec('CREATE TABLE IF NOT EXISTS security_migrations(name TEXT PRIMARY KEY)');
 if(!one("SELECT name FROM security_migrations WHERE name='initial-prospects'")){
 db.exec('BEGIN');try{for(const x of seeds)run("INSERT INTO security_leads(organization,contact,sector,city,email,phone,source_url,verified_at,notes) VALUES(?,?,?,?,?,?,?,'2026-11-16',?)",...x,x[0]==='Victoria Gardens HOA'?'Existing patrol provider listed; ask renewal date. Published contact, delivery not tested.':'Published business contact; buying need not confirmed; delivery not tested.');run("INSERT INTO security_migrations(name) VALUES('initial-prospects')");db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
 function validate(b,previous={}){
 const v={...previous};for(const k of fields)if(Object.hasOwn(b,k))v[k]=['latitude','longitude'].includes(k)?(b[k]===null||b[k]===''?null:Number(b[k])):k==='proposal_value'?Number(b[k]):k==='opted_out'?Number(Boolean(b[k])):String(b[k]??'').trim().slice(0,k==='notes'?5000:1000);
 if(Object.hasOwn(b,'address')&&previous.address!==undefined&&v.address!==previous.address&&!Object.hasOwn(b,'latitude')&&!Object.hasOwn(b,'longitude')){v.latitude=null;v.longitude=null;v.location_method='';}
 if((v.latitude===null)!==(v.longitude===null))throw Error('Set both latitude and longitude, or clear both.');
 if(v.latitude!==null&&(!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180))throw Error('Invalid map coordinates');
 if(!['','manual','census'].includes(v.location_method))throw Error('Invalid location method');
 if(!v.organization)throw Error('Organization required');
 if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))throw Error('Invalid email');
 if(v.source_url){const u=new URL(v.source_url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS source URL')}
 if(!stages.includes(v.stage))throw Error('Invalid stage');
 if(!Number.isFinite(v.proposal_value)||v.proposal_value<0)throw Error('Invalid proposal value');
 for(const k of ['next_followup','start_date','verified_at'])if(v[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(v[k])||new Date(v[k]+'T00:00:00Z').toISOString().slice(0,10)!==v[k]))throw Error('Invalid date');
 return v;
 }
 return async(req,res,p,method)=>{
 if(!p.startsWith('/api/security/'))return false;
 if(p==='/api/security/leads'&&method==='GET'){json(res,200,{leads:query("SELECT l.*,CASE WHEN l.opted_out=1 OR EXISTS(SELECT 1 FROM suppression s WHERE lower(s.email)=lower(l.email)) THEN 1 ELSE 0 END opted_out FROM security_leads l ORDER BY organization,contact"),stages,settings:one('SELECT * FROM security_settings WHERE id=1'),activities:query('SELECT a.*,l.organization FROM security_activity a JOIN security_leads l ON l.id=a.lead_id ORDER BY a.id DESC LIMIT 100')});return true}
 if(p==='/api/security/geocode'&&method==='POST'){const b=await body(req);json(res,200,{matches:await geocode(b.address)});return true}
 if(p==='/api/security/settings'&&method==='POST'){const b=await body(req);run('UPDATE security_settings SET postal_address=?,phone=?,email=? WHERE id=1',String(b.postal_address||'').slice(0,500),String(b.phone||'').slice(0,100),String(b.email||'').slice(0,254));json(res,200,{ok:true});return true}
 if(p==='/api/security/leads'&&method==='POST'){
 const b=await body(req),defaults=Object.fromEntries(fields.map(k=>[k,['latitude','longitude'].includes(k)?null:k==='proposal_value'||k==='opted_out'?0:k==='stage'?'Research':k==='sector'?'HOA':''])),v=validate(b,defaults);
 const existing=one("SELECT id FROM security_leads WHERE lower(organization)=lower(?) AND lower(contact)=lower(?) AND lower(email)=lower(?)",v.organization,v.contact,v.email);if(existing)throw Error('This organization/contact already exists');
 const r=run('INSERT INTO security_leads('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')',...fields.map(k=>v[k]));json(res,201,{id:Number(r.lastInsertRowid)});return true}
 const m=p.match(/^\/api\/security\/leads\/(\d+)(\/activity)?$/);
 if(m){const id=Number(m[1]),old=one('SELECT * FROM security_leads WHERE id=?',id);if(!old)throw Error('Lead not found');
 if(m[2]&&method==='POST'){const b=await body(req);if(!['Call','Email sent','Meeting','Note'].includes(b.kind))throw Error('Invalid activity');run('INSERT INTO security_activity(lead_id,kind,detail) VALUES(?,?,?)',id,b.kind,String(b.detail||'').slice(0,3000));json(res,201,{ok:true});return true}
 if(!m[2]&&method==='PATCH'){const v=validate(await body(req),old);if(v.opted_out&&v.email)run("INSERT OR IGNORE INTO suppression(email,reason) VALUES(?,'Security sales opt out')",v.email.toLowerCase());run('UPDATE security_leads SET '+fields.map(k=>k+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?',...fields.map(k=>v[k]),id);run("INSERT INTO security_activity(lead_id,kind,detail) VALUES(?,'Updated',?)",id,old.stage===v.stage?'Lead details updated':old.stage+' → '+v.stage);json(res,200,{ok:true});return true}}
 json(res,404,{error:'Security endpoint not found'});return true;
 };
}
