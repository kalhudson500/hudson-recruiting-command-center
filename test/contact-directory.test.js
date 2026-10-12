import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupPrograms,coachInGroup} from '../public/contact-directory.js';
test('school sections combine all Division I programs alphabetically before II, III, and HBCUs',()=>{
 const schools=[{id:1,name:'Zulu',division:'FBS'},{id:2,name:'Alpha',division:'FCS',is_hbcu:1},{id:3,name:'Beta',division:'D2',is_hbcu:1},{id:4,name:'Aardvark',division:'FBS'},{id:5,name:'College',division:'D3'}];
 const groups=groupPrograms(schools);assert.deepEqual(groups.map(g=>g.key),['d1','d2','d3','hbcu']);assert.deepEqual(groups[0].schools.map(s=>s.name),['Aardvark','Alpha','Zulu']);assert.deepEqual(groups[3].schools.map(s=>s.name),['Alpha','Beta']);assert.equal(schools[0].name,'Zulu');assert.equal(groups[3].schools[0].id,2);
});
test('direct coach search respects division and HBCU groups',()=>{
 assert.equal(coachInGroup({division:'FCS'},'d1'),true);assert.equal(coachInGroup({division:'FBS'},'d1'),true);assert.equal(coachInGroup({division:'D2'},'d1'),false);assert.equal(coachInGroup({division:'D2',is_hbcu:1},'hbcu'),true);assert.equal(coachInGroup({division:'D3',is_hbcu:0},'hbcu'),false);
});
