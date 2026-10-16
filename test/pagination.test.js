import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
test('California-only directory paginates active contacts and archives unrelated contacts without deleting them',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'hudson-pagination-'));
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 const app=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:String(port),HOST:'127.0.0.1',ADMIN_USER:'fixture',ADMIN_PASSWORD:'fixture-only-passphrase',BRAVE_SEARCH_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server did not start')),10000);app.stdout.on('data',data=>{if(data.toString().includes('Hudson Command Center')){clearTimeout(timeout);resolve();}});app.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});});
  const db=new DatabaseSync(path.join(dir,'hudson.sqlite'));db.exec("INSERT INTO schools(id,name,division) VALUES(1,'Fixture University','D2');BEGIN IMMEDIATE");const insert=db.prepare('INSERT INTO coaches(school_id,name) VALUES(1,?)');for(let i=1;i<=10005;i++)insert.run('Fixture Coach '+i);db.exec('COMMIT');
  db.prepare('INSERT INTO coaches(school_id,name) VALUES(1,?)').run('Archived Unrelated Coach');
  const addSnapshot=db.prepare("INSERT INTO california_contacts(school_id,name,role,email,phone,x_url,source_url,profile_url,checked_at,areas,area_source_url,area_checked_at,profile_status) VALUES(1,?,'Defensive Line Coach','','','','https://example.edu/staff','',?,?,?,?,'complete')");
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');for(let i=1;i<=10005;i++)addSnapshot.run('Fixture Coach '+i,now,i===1?'California':'',i===1?'https://example.edu/bio':'',i===1?now:'');db.exec('COMMIT');db.close();
  const login=await fetch('http://127.0.0.1:'+port+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'fixture',password:'fixture-only-passphrase'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],session=await login.json();
  const base='http://127.0.0.1:'+port+'/api/coaches';const first=await (await fetch(base+'?limit=1000&offset=0',{headers:{Cookie:cookie}})).json();assert.equal(first.length,1000);assert.equal(first[0].id,1);
  const last=await (await fetch(base+'?limit=1000&offset=10000',{headers:{Cookie:cookie}})).json();assert.equal(last.length,5);assert.equal(last.at(-1).id,10005);
  const all=await (await fetch(base,{headers:{Cookie:cookie}})).json();assert.equal(all.length,10005);assert.equal(all.some(c=>c.name==='Archived Unrelated Coach'),false);
  const audit=new DatabaseSync(path.join(dir,'hudson.sqlite'));assert.equal(audit.prepare('SELECT COUNT(*) n FROM coaches').get().n,10006);audit.close();
  const dashboard=await (await fetch('http://127.0.0.1:'+port+'/api/dashboard',{headers:{Cookie:cookie}})).json();assert.equal(dashboard.coaches,10005);assert.equal(dashboard.schools,1);
  const badCampaign=await fetch('http://127.0.0.1:'+port+'/api/campaigns',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({title:'Fixture',subject:'Fixture',body:'Fixture',coach_ids:[10006]})});assert.equal(badCampaign.status,400);

  const module=await fetch('http://127.0.0.1:'+port+'/contact-directory.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);
  const evidence=await fetch('http://127.0.0.1:'+port+'/api/coaches/1/evidence',{headers:{Cookie:cookie}});assert.equal(evidence.status,200);assert.deepEqual(await evidence.json(),[]);
 }finally{app.kill();await once(app,'exit');rmSync(dir,{recursive:true,force:true});}
});
