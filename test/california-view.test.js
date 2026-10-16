import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderCalifornia} from '../public/california.js';
test('California view groups the three requested roles and keeps unconfirmed schools out by default',async()=>{
 const {document}=parseHTML('<main></main>');const root=document.querySelector('main');
 const data={counts:{total:2,confirmed_schools:1,california_recruiters:1,complete:1},schools:[{name:'Out of State College',division:'D3',confirmed:true,status:'complete',contacts:[{name:'Head Example',category:'Head coach',role:'Head Coach',email:'coach@example.edu',source_url:'https://example.edu/staff',checked_at:'2026-10-16'},{name:'DL Example',category:'Defensive line coach',role:'Defensive Line',checked_at:'2026-10-16',source_url:'https://example.edu/staff'},{name:'Recruit Example',category:'California recruiter',role:'Quarterbacks',california_recruiter:true,areas:'California',source_url:'https://example.edu/staff',area_source_url:'https://example.edu/bio',area_checked_at:'2026-10-16',checked_at:'2026-10-16'}]},{name:'Unconfirmed College',division:'FBS',confirmed:false,contacts:[]}]};
 await renderCalifornia({root,api:async()=>data,esc:String,notice:()=>{}});
 // linkedom does not initialize native select values like a browser.
 Object.defineProperty(root.querySelector('#caCoverage'),'value',{value:'confirmed',writable:true});Object.defineProperty(root.querySelector('#caDivision'),'value',{value:'',writable:true});
 root.querySelector('#caCoverage').dispatchEvent(new document.defaultView.Event('change'));
 const results=root.querySelector('#caResults');assert.match(results.textContent,/Head Example/);assert.match(results.textContent,/DL Example/);assert.match(results.textContent,/Recruit Example/);assert.doesNotMatch(results.textContent,/Unconfirmed College/);assert.match(results.querySelector('a').href,/mail.google.com/);
 root.querySelector('#caCoverage').value='all';root.querySelector('#caCoverage').dispatchEvent(new document.defaultView.Event('change'));assert.match(results.textContent,/Unconfirmed College/);
});
