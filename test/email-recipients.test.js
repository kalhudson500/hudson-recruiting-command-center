import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {matchesPosition,filterRecipients,gmailDraftUrl,renderEmailRecipients} from '../public/email-recipients.js';
const schools=[{id:1,name:'Alpha University',division:'FBS'},{id:2,name:'Beta College',division:'D2'}];
const coaches=[{id:1,name:'Coach One',school_id:1,school:'Alpha University',division:'FBS',role:'Defensive Line / Run Game Coordinator',email:'one@example.edu',status:'verified'},{id:2,name:'Coach Two',school_id:2,school:'Beta College',division:'D2',role:'Assistant Coach - DL',email:'two@example.edu',status:'verified'},{id:3,name:'Coach Three',school_id:1,school:'Alpha University',division:'FBS',role:'Offensive Line',email:'three@example.edu',status:'verified'},{id:4,name:'Coach Four',school_id:2,school:'Beta College',division:'D2',role:'Defensive Line',email:'',status:'verified'}];
test('defensive line filter recognizes actual position labels without including other defensive coaches',()=>{
 for(const role of ['Defensive Line','Assistant Defensive Line Coach','DL','Defensive Ends / DT','D-Line','Edge Coach'])assert.equal(matchesPosition(role,'dl'),true,role);
 for(const role of ['Offensive Line','Defensive Coordinator','Linebackers','Director of Operations'])assert.equal(matchesPosition(role,'dl'),false,role);
 assert.deepEqual(filterRecipients(coaches,{position:'dl'}).map(c=>c.id),[1,4,2]);
 assert.deepEqual(filterRecipients(coaches,{schoolId:1,position:'dl'}).map(c=>c.id),[1]);
});
test('Gmail group draft uses unique eligible addresses in BCC',()=>{
 const url=new URL(gmailDraftUrl([...coaches,coaches[0],{...coaches[2],opted_out:1}], 'My film','Hello coaches'));
 assert.equal(url.searchParams.get('bcc'),'one@example.edu,two@example.edu,three@example.edu');assert.equal(url.searchParams.get('to'),null);assert.equal(url.searchParams.get('su'),'My film');assert.equal(url.searchParams.get('body'),'Hello coaches');
});
function fixture(rows=coaches){
 const {document}=parseHTML('<section><div id="root"></div></section>');const root=document.querySelector('#root'),selected=new Set();
 const view=renderEmailRecipients({root,schools,coaches:rows,selected,esc:x=>String(x??''),notice:()=>{}});
 root.querySelectorAll('select').forEach(s=>Object.defineProperty(s,'value',{value:'',writable:true}));return {root,selected,view};
}
test('school selection shows positions and clickable email; chosen coaches survive school changes',()=>{
 const {root,selected}=fixture();const input=root.querySelector('#recipientSchool'),popup=root.querySelector('#recipientSchoolPicker');
 input.onfocus();popup.querySelector('[data-school="1"]').onclick();assert.match(root.querySelector('#recipientRows').textContent,/Defensive Line \/ Run Game Coordinator/);assert.ok(root.querySelector('a[href="https://mail.google.com/mail/?view=cm&fs=1&to=one%40example.edu"]'));assert.doesNotMatch(root.querySelector('#recipientRows').textContent,/Coach Two/);
 let check=root.querySelector('[data-select="1"]');check.checked=true;root.querySelector('#recipientRows').onchange({target:check});input.onfocus();popup.querySelector('[data-school="2"]').onclick();check=root.querySelector('[data-select="2"]');check.checked=true;root.querySelector('#recipientRows').onchange({target:check});assert.deepEqual([...selected],[1,2]);assert.match(root.querySelector('#selectedRecipientCount').textContent,/2 selected across 2 schools/);assert.match(root.querySelector('#recipientRows').textContent,/Email not collected yet/);assert.equal(root.querySelector('[data-select="4"]').hasAttribute('disabled'),true);
});
test('mass defensive line selection spans schools and all result pages',()=>{
 const rows=Array.from({length:130},(_,i)=>({...coaches[i%2],id:i+10,name:'DL Coach '+i,email:'dl'+i+'@example.edu'}));const {root,selected}=fixture([...rows,coaches[2],coaches[3]]);
 root.querySelector('#findDefensiveLine').onclick();assert.equal(root.querySelectorAll('[data-select]').length,100);root.querySelector('#selectMatching').onclick();assert.equal(selected.size,130);assert.equal(selected.has(3),false);assert.equal(selected.has(4),false);assert.match(root.querySelector('#selectedRecipientCount').textContent,/130 selected across 2 schools/);assert.equal(root.querySelector('#gmailSelected').hidden,false);
});
