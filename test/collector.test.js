import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDirectory,normalize} from '../collector.js';
const url='https://example.edu/sports/football/coaches';
const row=(name,email,role='Defensive Line Coach')=>`<tr><td><a>${name}</a></td><td>${role}</td><td><a href="mailto:${email}">${email}</a></td><td>(555) 123-4567 <a href="https://twitter.com/CoachOne">X</a></td></tr>`;
test('matches contact fields within each coach row, not whole page',()=>{
 const contacts=parseDirectory('<table>'+row('First Coach','first@example.edu')+row('Second Coach','second@example.edu')+'</table>',url);
 assert.equal(contacts.length,2);assert.equal(contacts[0].email,'first@example.edu');assert.equal(contacts[1].email,'second@example.edu');assert.equal(contacts[0].x_url,'https://x.com/CoachOne');assert.equal(contacts[0].phone,'(555) 123-4567');
});
test('ambiguous row cannot auto verify email',()=>{const contacts=parseDirectory('<table>'+row('First Coach','first@example.edu').replace('</tr>','<td><a href="mailto:other@example.edu">other</a></td></tr>')+'</table>',url);assert.equal(contacts[0].uncertain,true);assert.equal(contacts[0].email,'');});
test('general athletics directory with multiple sports is excluded',()=>assert.deepEqual(parseDirectory('<table><caption>Football and Basketball</caption>'+row('First Coach','first@example.edu')+'</table>','https://example.edu/staff-directory'),[]));
test('navigation emails cannot become coaches',()=>assert.deepEqual(parseDirectory('<nav><a href="mailto:general@example.edu">General</a></nav>',url),[]));
test('name key handles punctuation consistently',()=>assert.equal(normalize('A.J. Coach'),normalize('AJ Coach')));

import {DatabaseSync} from 'node:sqlite';
import {installCollector} from '../collector.js';
test('durable worker preserves edited contacts and never duplicates matched coaches',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,division TEXT,staff_url TEXT);CREATE TABLE coaches(id INTEGER PRIMARY KEY,school_id INTEGER,name TEXT,role TEXT DEFAULT '',email TEXT DEFAULT '',phone TEXT DEFAULT '',x_url TEXT DEFAULT '',source_url TEXT DEFAULT '',status TEXT DEFAULT '',verified_at TEXT DEFAULT '');INSERT INTO schools VALUES(1,'Example University','D2','https://example.edu/sports/football/coaches');INSERT INTO coaches(id,school_id,name,email) VALUES(1,1,'First Coach','first@example.edu');`);
 const query=(sql,...p)=>db.prepare(sql).all(...p),one=(sql,...p)=>db.prepare(sql).get(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 const originalFetch=global.fetch;global.fetch=async u=>new Response(String(u).endsWith('robots.txt')?'User-agent: *\nDisallow:': '<table>'+row('First Coach','first@example.edu')+row('Second Coach','second@example.edu')+'</table>',{headers:{'content-type':'text/html'}});
 try{
 const collector=installCollector({db,query,one,run,inspectUrl:async u=>u});
 async function finish(){for(let i=0;i<100&&collector.status().busy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(collector.status().busy,false);}
 collector.start();await finish();assert.equal(one('SELECT COUNT(*) n FROM coaches').n,2);assert.equal(collector.status().counts[0].status,'complete');
 run('UPDATE coaches SET manual_lock=1,phone=? WHERE id=1','555-999-0000');run('DELETE FROM collection_progress');collector.start();await finish();assert.equal(one('SELECT COUNT(*) n FROM coaches').n,2);assert.equal(one('SELECT phone FROM coaches WHERE id=1').phone,'555-999-0000');assert.equal(collector.status().counts[0].status,'review');collector.pause();
 }finally{global.fetch=originalFetch;}
});
