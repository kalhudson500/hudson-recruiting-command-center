import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {californiaAssignment,isDL,isDC,installCalifornia} from '../california.js';
const profile=body=>'<title>First Coach - Football Coach</title>'+body;
test('every currently seeded active coach has an attributed direct X profile',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,division TEXT,state TEXT,staff_url TEXT);INSERT INTO schools VALUES(1,'College of William & Mary','FCS','VA','https://tribeathletics.com/sports/football/coaches'),(2,'Hamline University','D3','MN','https://hamlineathletics.com/sports/football/coaches'),(3,'Whittier College','D3','CA','https://wcpoets.com/sports/football/coaches');");
 const query=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const ca=installCalifornia({db,query,one,run,collector:{}}),rows=ca.status().schools.flatMap(s=>s.contacts);
 assert.equal(rows.length,12);assert.equal(new Set(rows.map(c=>c.x_url)).size,12);
 for(const c of rows){assert.match(c.x_url,/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/);assert.ok(c.x_source_url);assert.ok(c.x_checked_at);}
 assert.equal(rows.find(c=>c.name==='Bob Davies').x_url,'https://x.com/NewBobDaviesFB');ca.pause();
});
test('accepts labelled California territories and regional assignments',()=>{
 assert.equal(californiaAssignment(profile('<dl><dt>Other Recruiting Areas</dt><dd>California, Arizona</dd></dl>'),'First Coach'),'California, Arizona');
 assert.equal(californiaAssignment(profile('<p><strong>Recruiting Areas:</strong> Inland Empire, San Diego</p>'),'First Coach'),'Inland Empire, San Diego');
 assert.equal(californiaAssignment(profile('<h3>Recruiting Areas</h3><p>Northern California</p><h3>Career</h3>'),'First Coach'),'Northern California');
 assert.equal(californiaAssignment(profile('<header><dl><dt>Other Recruiting Areas</dt><dd>California</dd></dl></header>'),'First Coach'),'California');
 assert.equal(californiaAssignment(profile('<div><strong>Recruiting Area</strong>: California<br>Previously coached in Ohio for ten years.</div>'),'First Coach'),'California');
});
test('does not confuse historical biography, other identity, or unrelated state with assignments',()=>{
 for(const body of ['<p>First Coach grew up in California and recruited there previously.</p>','<p>Recruiting Areas: Ohio</p><p>Previously coached in California.</p>','<p>Recruiting Areas: Previously recruited California at his former school.</p>'])assert.equal(californiaAssignment(profile(body),'First Coach'),'');
 assert.equal(californiaAssignment(profile('<p>Recruiting Areas: California</p>'),'Another Coach'),'');
});
test('DC classification accepts combined roles without including other coordinators',()=>{assert.ok(isDC('Co-Defensive Coordinator / Secondary Coach'));assert.ok(isDC('Defensive Coordinator / Defensive Line'));assert.equal(isDC('Offensive Coordinator'),false);});
test('DL classification excludes support and other position coaches',()=>{
 assert.ok(isDL('Defensive Coordinator / Defensive Line'));assert.ok(isDL('Defensive Ends Coach'));assert.ok(isDL('DL Coach'));assert.equal(isDL('Linebackers Coach'),false);assert.equal(isDL('Defensive Backs Coach'),false);assert.equal(isDL('Defensive Line Equipment Manager'),false);
});
test('nationwide scan links confirmed recruiter with head and DL and preserves unrelated contacts',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,division TEXT,state TEXT,staff_url TEXT);INSERT INTO schools VALUES(1,'Out of State College','D3','MN','https://example.edu/sports/football/coaches');CREATE TABLE coaches(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO coaches VALUES(1,'Protected Contact');");
 const query=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const rows=[{name:'Head Coach',role:'Head Football Coach'},{name:'DL Coach',role:'Defensive Line Coach'},{name:'First Coach',role:'Quarterbacks Coach'},{name:'Other Coach',role:'Wide Receivers Coach'}].map((c,i)=>({...c,email:'',phone:'',x_url:'',profile_url:'https://example.edu/sports/football/roster/coaches/'+i}));
 const collector={checkRobots:async()=>{},discover:async()=>{throw Error('unused');},parseDirectory:()=>rows,fetchPage:async url=>({url,html:url.endsWith('/2')?profile('<p>Recruiting Areas: California, Nevada</p>'):'<title>No assignment</title>'})};
 const scan=installCalifornia({db,query,one,run,collector});scan.start();
 for(let i=0;i<30&&scan.status().counts.busy;i++)await new Promise(r=>setTimeout(r,1));
 for(let i=0;i<6;i++)await scan.tick();scan.pause();
 const result=scan.status();assert.equal(result.counts.confirmed_schools,1);assert.equal(result.schools[0].confirmed,true);assert.deepEqual(result.schools[0].contacts.map(c=>c.name).sort(),['DL Coach','First Coach','Head Coach']);assert.equal(one('SELECT name FROM coaches').name,'Protected Contact');
 db.close();
});
