import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installSecurity} from '../security.js';
import {installMapGeocoder} from '../map-geocoder.js';
import {leadLocation,isClient} from '../public/map-data.js';
const context=()=>{const db=new DatabaseSync(':memory:');return {db,query:(s,...p)=>db.prepare(s).all(...p),one:(s,...p)=>db.prepare(s).get(...p),run:(s,...p)=>db.prepare(s).run(...p),body:async r=>r.payload,json:(r,status,value)=>Object.assign(r,{status,value})}};
test('every initial prospect has an approximate city location until an individual pin is saved',async()=>{
 const c=context();const route=installSecurity(c),r={};await route({},r,'/api/security/leads','GET');assert.equal(r.value.leads.length,8);
 for(const lead of r.value.leads){assert.equal(leadLocation(lead).approximate,true);assert.equal(isClient(lead),false)}
 assert.equal(leadLocation({city:'Unknown city'}),null);assert.equal(leadLocation({latitude:0,longitude:0}).approximate,false);assert.equal(leadLocation({city:'Ontario, CA 91761',latitude:null,longitude:null}).approximate,true);
 c.db.close();
});
test('pin and client status survive migration/restart; changing address clears a stale pin',async()=>{
 const c=context();let route=installSecurity(c);await route({payload:{stage:'Won',address:'100 Main St, Riverside CA',latitude:33.98,longitude:-117.37,location_method:'manual'}},{},'/api/security/leads/1','PATCH');
 route=installSecurity(c);let lead=c.one('SELECT * FROM security_leads WHERE id=1');assert.equal(isClient(lead),true);assert.equal(leadLocation(lead).approximate,false);assert.equal(lead.latitude,33.98);
 await route({payload:{notes:'keep pin',stage:'Qualified'}},{},'/api/security/leads/1','PATCH');lead=c.one('SELECT * FROM security_leads WHERE id=1');assert.equal(isClient(lead),false);assert.equal(lead.latitude,33.98);
 for(const patch of [{latitude:99,longitude:0},{latitude:33,longitude:null},{latitude:'bad',longitude:10}])await assert.rejects(route({payload:patch},{},'/api/security/leads/1','PATCH'),/coordinates|both/);
 await route({payload:{address:'200 Main St, Riverside CA'}},{},'/api/security/leads/1','PATCH');lead=c.one('SELECT * FROM security_leads WHERE id=1');assert.equal(lead.latitude,null);assert.equal(lead.longitude,null);assert.equal(leadLocation(lead).approximate,true);
 await route({payload:{organization:'New client',city:'Fontana',stage:'Won'}},{},'/api/security/leads','POST');assert.equal(isClient(c.one("SELECT * FROM security_leads WHERE organization='New client'")),true);c.db.close();
});
test('address matches use Census, cache normalized searches, reject invalid requests, and handle downtime',async()=>{
 const c=context();let calls=0;
 const geocode=installMapGeocoder({...c,fetcher:async url=>{calls++;assert.equal(url.hostname,'geocoding.geo.census.gov');return Response.json({result:{addressMatches:[{addressComponents:{state:'CA'},matchedAddress:'100 MAIN ST, RIVERSIDE, CA',coordinates:{x:-117.37,y:33.98}},{addressComponents:{state:'NY'},matchedAddress:'elsewhere',coordinates:{x:-70,y:40}}]}})}});
 const matches=await geocode('100 Main St, Riverside CA');assert.equal(matches.length,1);assert.equal(matches[0].latitude,33.98);await geocode('100 MAIN ST, RIVERSIDE CA');assert.equal(calls,1);await assert.rejects(geocode('Riverside'),/street number/);
 const unavailable=installMapGeocoder({...c,fetcher:async()=>new Response('',{status:503})});await assert.rejects(unavailable('999 Other Rd, Fontana CA'),/unavailable/);c.db.close();
});
