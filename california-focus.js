import {normalize} from './collector.js';

// This membership table archives visibility, not data. Existing contact IDs,
// correspondence, opt-outs and manual edits remain intact.
export function installCaliforniaFocus({db,query,one,run,california}){
 db.exec('CREATE TABLE IF NOT EXISTS california_active(coach_id INTEGER PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,california_recruiter INTEGER NOT NULL DEFAULT 0)');
 function sync(){
  const targets=california.status().schools.filter(s=>s.confirmed).flatMap(s=>s.contacts.map(c=>({...c,school_id:s.id}))),existing=query('SELECT * FROM coaches'),ids=[],byIdentity=new Map();
  for(const c of existing){const key=c.school_id+':'+normalize(c.name);byIdentity.set(key,[...(byIdentity.get(key)||[]),c]);}
  db.exec('BEGIN IMMEDIATE');try{
   for(const c of targets){
    const key=c.school_id+':'+normalize(c.name),matches=byIdentity.get(key)||[];
    if(matches.length>1)continue;
    let saved=matches[0];
    if(!saved){const r=run("INSERT INTO coaches(school_id,name,role,email,phone,x_url,source_url,status,verified_at,notes) VALUES(?,?,?,?,?,?,?,'verified',?,?)",c.school_id,c.name,c.role,c.email,c.phone,c.x_url,c.source_url,c.checked_at,c.areas?'California recruiting assignment: '+c.areas+' | '+c.area_source_url:'California recruiting focus: current school staff');saved={id:Number(r.lastInsertRowid)};byIdentity.set(key,[{...c,id:saved.id}]);}
    else if(!saved.manual_lock)run("UPDATE coaches SET role=?,email=?,phone=?,x_url=?,source_url=?,status='verified',verified_at=? WHERE id=?",c.role,c.email,c.phone,c.x_url,c.source_url,c.checked_at,saved.id);
    ids.push({id:saved.id,recruiter:Number(Boolean(c.california_recruiter))});
   }
   run('DELETE FROM california_active');for(const item of ids)run('INSERT OR IGNORE INTO california_active(coach_id,california_recruiter) VALUES(?,?)',item.id,item.recruiter);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return ids;
 }
 const active=id=>Boolean(one('SELECT coach_id FROM california_active WHERE coach_id=?',Number(id)));
 return {sync,active};
}
