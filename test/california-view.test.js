import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderCalifornia} from '../public/california.js';
test('California view school picker filters schools and opens only selected school roles',async()=>{
 const {document}=parseHTML('<main></main>');const root=document.querySelector('main');
 const data={counts:{total:2,confirmed_schools:1,california_recruiters:1,complete:1},schools:[{name:'Out of State College',division:'D3',confirmed:true,status:'complete',contacts:[{name:'Head Example',category:'Head coach',role:'Head Coach',email:'coach@example.edu',source_url:'https://example.edu/staff',checked_at:'2026-10-16'},{name:'DL Example',category:'Defensive line coach',role:'Defensive Line',checked_at:'2026-10-16',source_url:'https://example.edu/staff'},{name:'Recruit Example',category:'California recruiter',role:'Quarterbacks',california_recruiter:true,areas:'California',source_url:'https://example.edu/staff',area_source_url:'https://example.edu/bio',area_checked_at:'2026-10-16',checked_at:'2026-10-16'}]},{name:'Unconfirmed College',division:'FBS',confirmed:false,contacts:[]}]};
 await renderCalifornia({root,api:async()=>data,esc:String,notice:()=>{}});
 // linkedom does not initialize native select values like a browser.
 Object.defineProperty(root.querySelector('#caCoverage'),'value',{value:'confirmed',writable:true});Object.defineProperty(root.querySelector('#caDivision'),'value',{value:'',writable:true});
 root.querySelector('#caCoverage').dispatchEvent(new document.defaultView.Event('change'));
 root.querySelector('[data-school]').click();
 const results=root.querySelector('#caResults');assert.match(results.textContent,/Head Example/);assert.match(results.textContent,/DL Example/);assert.match(results.textContent,/Recruit Example/);assert.doesNotMatch(results.textContent,/Unconfirmed College/);assert.match(results.querySelector('a').href,/mail.google.com/);
 root.querySelector('#caCoverage').value='all';root.querySelector('#caCoverage').dispatchEvent(new document.defaultView.Event('change'));assert.match(root.querySelector('#caSchoolList').textContent,/Unconfirmed College/);assert.doesNotMatch(results.textContent,/Unconfirmed College/);
});

test('HBCU picker separates Division I and II including schools with no contacts',async()=>{
 const {document}=parseHTML('<main></main>'),root=document.querySelector('main');
 const data={counts:{},schools:[{id:1,name:'Howard',division:'FCS',is_hbcu:true,contacts:[]},{id:2,name:'Benedict',division:'D2',is_hbcu:true,contacts:[]},{id:3,name:'Other',division:'FCS',is_hbcu:false,contacts:[]}]};
 await renderCalifornia({root,api:async()=>data,esc:String,notice:()=>{},hbcuOnly:true});
 for(const [id,value] of [['caGroup','hbcu'],['caCoverage','all'],['caDivision','']])Object.defineProperty(root.querySelector('#'+id),'value',{value,writable:true});
 const change=()=>root.querySelector('#caGroup').dispatchEvent(new document.defaultView.Event('change'));
 change();assert.equal(root.querySelectorAll('[data-school]').length,2);
 root.querySelector('#caGroup').value='hbcu2';change();assert.match(root.querySelector('#caSchoolList').textContent,/Benedict/);assert.doesNotMatch(root.querySelector('#caSchoolList').textContent,/Howard/);
 root.querySelector('[data-school]').click();assert.match(root.querySelector('#caResults').textContent,/Current coach not available/);assert.equal(root.querySelector('#caSchoolList').hidden,true);
 root.querySelector('#caChoose').click();assert.equal(root.querySelector('#caSchoolList').hidden,false);
 root.querySelector('#caGroup').value='hbcu1';change();assert.match(root.querySelector('#caSchoolList').textContent,/Howard/);assert.doesNotMatch(root.querySelector('#caSchoolList').textContent,/Benedict|Other/);
});
