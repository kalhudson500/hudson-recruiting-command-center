import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { xProfileUrl, namedProfileX, publicXCandidates, installXEnrichment } from './x-enrichment.js';

test('rejects sharing URLs and preserves only real account paths', () => {
 assert.equal(xProfileUrl('https://twitter.com/CoachOne?lang=en'), 'https://x.com/CoachOne');
 for (const url of ['https://x.com/intent','https://x.com/i','https://x.com/CoachOne/status/123','https://x.com.evil.test/CoachOne','https://user@x.com/CoachOne','https://x.com:444/CoachOne']) assert.equal(xProfileUrl(url), '');
});
test('coach profile attribution excludes team footer links and conflicting accounts', () => {
 const html = '<title>Jane Coach - Football Coach</title><h1>Jane Coach</h1><dl><dt>Twitter</dt><dd><a href="https://twitter.com/JaneCoach">@JaneCoach</a></dd></dl><footer><a href="https://x.com/TeamFootball">Team</a></footer>';
 assert.equal(namedProfileX(html,'https://athletics.test/coaches/jane','Jane Coach'),'https://x.com/JaneCoach');
 assert.equal(namedProfileX(html,'https://athletics.test/coaches/jane','Other Coach'),'');
 assert.equal(namedProfileX('<title>Jane Coach - Football Coach</title><footer><a href="https://x.com/TeamFootball">Twitter</a></footer>','https://athletics.test/coaches/jane','Jane Coach'),'');
 assert.equal(namedProfileX(html.replace('</dl>','<dt>X</dt><dd><a href="https://x.com/OtherCoach">Other</a></dd></dl>'),'https://athletics.test/coaches/jane','Jane Coach'),'');
});
test('public index results remain identity candidates and exclude mirrors/status posts', () => {
 const results=[{url:'https://x.com/JaneCoach',title:'Jane Coach (@JaneCoach) / X',description:'Football coach at Example University'}, {url:'https://mirror.test/JaneCoach',title:'Jane Coach',description:'football coach'}, {url:'https://x.com/JaneCoach/status/123',title:'Jane Coach',description:'football coach'}];
 assert.equal(publicXCandidates(results,{name:'Jane Coach'}).length,1);
});

function fixture({race=false,onlySearch=false}={}) {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,staff_url TEXT);
 CREATE TABLE coaches(id INTEGER PRIMARY KEY,school_id INTEGER,name TEXT,role TEXT,x_url TEXT DEFAULT '',manual_lock INTEGER DEFAULT 0);
 CREATE TABLE collection_evidence(id INTEGER PRIMARY KEY,school_id INTEGER,coach_id INTEGER,source_url TEXT,observed_at TEXT,payload TEXT,decision TEXT);
 INSERT INTO schools VALUES(1,'Example University','https://athletics.test/sports/football/coaches');
 INSERT INTO coaches(id,school_id,name,role) VALUES(1,1,'Jane Coach','Defensive Line Coach');
 INSERT INTO coaches(id,school_id,name,role,x_url) VALUES(2,1,'Existing Coach','Head Coach','https://x.com/KeepMe');
 INSERT INTO coaches(id,school_id,name,role,manual_lock) VALUES(3,1,'Locked Coach','Assistant Coach',1);`);
 const query=(sql,...p)=>db.prepare(sql).all(...p),one=(sql,...p)=>db.prepare(sql).get(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 const worker=installXEnrichment({db,query,one,run,checkRobots:async()=>{},search:async()=>[{url:'https://x.com/JaneCoach',title:'Jane Coach (@JaneCoach)',description:'Example University football coach'}],fetchPage:async url=>{
  if(race)run("UPDATE coaches SET x_url='https://x.com/UserEdit',manual_lock=1 WHERE id=1");
  return {url,html:'<table><tr><th scope="row"><a>Jane Coach</a></th><td>Defensive Line Coach</td><td>'+(onlySearch?'':'<a href="https://x.com/JaneCoach">Twitter</a>')+'</td></tr></table>'};
 }});
 return {db,query,one,worker};
}
async function settle(worker) { for(let i=0;i<20;i++){await new Promise(resolve=>setImmediate(resolve));if(!worker.status().busy)return;}throw Error('Worker did not settle'); }
test('fills existing coach without duplicates; respects manual links and resumes',async()=>{
 const f=fixture();f.worker.start();await settle(f.worker);
 assert.equal(f.one('SELECT x_url FROM coaches WHERE id=1').x_url,'https://x.com/JaneCoach');
 assert.equal(f.one('SELECT x_url FROM coaches WHERE id=2').x_url,'https://x.com/KeepMe');
 assert.equal(f.one('SELECT x_url FROM coaches WHERE id=3').x_url,'');
 assert.equal(f.query('SELECT * FROM coaches').length,3);
 assert.equal(f.worker.status().remaining,0);
 f.worker.start();await settle(f.worker);
 assert.equal(f.query('SELECT * FROM collection_evidence').length,1);f.worker.pause();
});
test('preserves edits made during an in-flight lookup',async()=>{
 const f=fixture({race:true});f.worker.start();await settle(f.worker);
 assert.equal(f.one('SELECT x_url FROM coaches WHERE id=1').x_url,'https://x.com/UserEdit');
 assert.equal(f.one('SELECT status FROM x_enrichment_progress WHERE coach_id=1').status,'preserved');f.worker.pause();
});
test('search snippet never becomes a verified profile link',async()=>{
 const old=process.env.BRAVE_SEARCH_API_KEY;process.env.BRAVE_SEARCH_API_KEY='test-key';
 try{const f=fixture({onlySearch:true});f.worker.start();await settle(f.worker);assert.equal(f.one('SELECT x_url FROM coaches WHERE id=1').x_url,'');assert.equal(f.one('SELECT status FROM x_enrichment_progress WHERE coach_id=1').status,'review');assert.equal(f.one('SELECT decision FROM collection_evidence').decision,'review');f.worker.pause();}finally{if(old===undefined)delete process.env.BRAVE_SEARCH_API_KEY;else process.env.BRAVE_SEARCH_API_KEY=old;}
});
