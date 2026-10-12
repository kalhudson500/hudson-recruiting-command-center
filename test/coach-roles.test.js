import test from 'node:test';import assert from 'node:assert/strict';
import {coachCategory,compareCoaches,matchesContactType,isFootballCoachRole} from '../public/coach-roles.js';
import {filterRecipients,matchesPosition} from '../public/email-recipients.js';
test('actual football coaches are separated from support staff and head coaches appear first',()=>{
 for(const role of ['Head Football Coach','Named Family Head Coaching Chair'])assert.equal(coachCategory(role),'head');
 for(const role of ['Defensive Coordinator','Associate Head Coach, Defensive Coordinator','Defensive Run Game Coordinator'])assert.equal(coachCategory(role),'coordinator');
 for(const role of ['Inside Linebackers','Quarterbacks','Defensive Line','Wide Receivers','Tight Ends','Assistant Coach / Safeties'])assert.equal(coachCategory(role),'position',role);
 for(const role of ['Assistant Football Coach','Graduate Assistant','Defensive Quality Control Assistant'])assert.equal(coachCategory(role),'assistant',role);
 for(const role of ['Film Coordinator','Head Strength & Conditioning Coach','Football Operations Coordinator','Assistant Director of Athletic Communications']){assert.equal(coachCategory(role),'support');assert.equal(isFootballCoachRole(role),false);}
 assert.equal(coachCategory('Director of Player Personnel'),'recruiting');
 const rows=[{name:'A Support',role:'Film Coordinator'},{name:'Z Head',role:'Head Coach'},{name:'B Position',role:'Linebackers'}].sort(compareCoaches);assert.equal(rows[0].name,'Z Head');
});
test('default email results contain coaches; support is an explicit opt-in and head filter excludes conditioning',()=>{
 const rows=[{id:1,name:'Head',role:'Head Coach',school:'School'},{id:2,name:'Staff',role:'Film Coordinator',school:'School'},{id:3,name:'Strength',role:'Head Strength & Conditioning Coach',school:'School'}];
 assert.deepEqual(filterRecipients(rows).map(c=>c.id),[1]);assert.equal(matchesContactType(rows[1].role,'support'),true);assert.equal(matchesPosition(rows[2].role,'hc'),false);assert.equal(filterRecipients(rows,{contactType:'all'}).length,3);
});
