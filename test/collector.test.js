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

test('Sidearm photo column and row header still match role correctly',()=>{
 const html='<table><tr><td><img alt="Photo"></td><th scope="row"><a>Ted White</a></th><td>Head Coach</td><td><a href="mailto:football@example.edu">Email</a></td></tr></table>';
 const rows=parseDirectory(html,url);assert.equal(rows.length,1);assert.equal(rows[0].role,'Head Coach');assert.equal(rows[0].email,'football@example.edu');
});

test('discovery uses a separate campus search and requires an athletics link',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,division TEXT,staff_url TEXT);CREATE TABLE coaches(id INTEGER PRIMARY KEY,manual_lock INTEGER);');
 const query=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const originalFetch=global.fetch,oldKey=process.env.BRAVE_SEARCH_API_KEY;process.env.BRAVE_SEARCH_API_KEY='fixture-only';let searches=0;
 global.fetch=async u=>{
  if(new URL(u).hostname==='api.search.brave.com'){searches++;return Response.json({web:{results:searches===1?[{title:'Football Coaches - Example University',url:'https://exampleathletics.com/sports/football/coaches'}]:[{title:'Example University Athletics',url:'https://example.edu/athletics'}]}});}
  return new Response('<title>Example University Athletics</title><a href="https://exampleathletics.com">Athletics</a>',{headers:{'content-type':'text/html'}});
 };
 try{const collector=installCollector({db,query,one,run,inspectUrl:async u=>u});assert.equal(await collector.discover({name:'Example University',division:'D2'}),'https://exampleathletics.com/sports/football/coaches');assert.equal(searches,2);collector.pause();}
 finally{global.fetch=originalFetch;if(oldKey===undefined)delete process.env.BRAVE_SEARCH_API_KEY;else process.env.BRAVE_SEARCH_API_KEY=oldKey;}
});
test('two named coaches can share an explicitly listed public football-office email',()=>{
 const rows=parseDirectory('<table>'+row('First Coach','football@example.edu')+row('Second Coach','football@example.edu')+'</table>',url);
 assert.equal(rows.length,2);assert.equal(rows[0].email,rows[1].email);assert.equal(rows[0].uncertain,false);
});

test('photo-only links never hide the named coach in another cell',()=>{
 const html='<table><tr><td><a href="/sports/football/roster/coaches/first/1"><img></a></td><td><a href="/sports/football/roster/coaches/first/1">First Coach</a></td><td>Head Coach</td><td><a href="mailto:first@example.edu">Email</a></td></tr></table>';
 const rows=parseDirectory(html,url);assert.equal(rows.length,1);assert.equal(rows[0].role,'Head Coach');assert.equal(rows[0].profile_url,'https://example.edu/sports/football/roster/coaches/first/1');
});

import {robotsAllowed,parseCoachProfile} from '../collector.js';
test('robots wildcard, allow exception, and bot-specific rules',()=>{
 const rules='User-agent: *\nDisallow: /sports/*/roster/\nAllow: /sports/football/roster/coaches/';
 assert.equal(robotsAllowed(rules,'https://example.edu/sports/football/roster/'),false);
 assert.equal(robotsAllowed(rules,'https://example.edu/sports/football/roster/coaches/first/1'),true);
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /\nUser-agent: HudsonRecruitingDirectory\nAllow: /',url),true);
});
test('profile contacts require the exact named coach header and labeled fields',()=>{
 const html='<div class="sidearm-coach-bio-header-details"><h1 class="sidearm-coach-bio-name">First Coach</h1><dl><dt>Email</dt><dd><a href="mailto:first@example.edu">Email</a></dd><dt>Twitter</dt><dd><a href="https://twitter.com/FirstCoach">X</a></dd></dl></div><footer><a href="mailto:team@example.edu">Team</a></footer>';
 assert.equal(parseCoachProfile(html,url,'First Coach').email,'first@example.edu');assert.equal(parseCoachProfile(html,url,'First Coach').x_url,'https://x.com/FirstCoach');assert.equal(parseCoachProfile(html,url,'Wrong Coach'),null);
});

import {directoryIdentity} from '../collector.js';
test('Miami campuses require different institution ownership evidence',()=>{
 assert.deepEqual(directoryIdentity({name:'Miami (FL)'}).campusNames,['University of Miami']);
 assert.deepEqual(directoryIdentity({name:'Miami (OH)'}).campusNames,['Miami University']);
 assert.equal(directoryIdentity({name:'UConn'}).query,'University of Connecticut');
});
test('modern profile X links are matched by named accessible label, never team links',()=>{
 const html='<title>First Coach - Head Coach - Example University</title><a href="https://twitter.com/ExampleTeam" aria-label="Team Twitter">Team</a><a href="https://twitter.com/FirstCoach" aria-label="Visit First Coach Twitter profile page">X</a>';
 assert.equal(parseCoachProfile(html,url,'First Coach').x_url,'https://x.com/FirstCoach');assert.equal(parseCoachProfile(html,url,'Wrong Coach'),null);
});
