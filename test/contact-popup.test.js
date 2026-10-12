import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderContactDirectory,bindSchoolPicker} from '../public/contact-directory.js';
test('opening a school displays actual email, phone, X, and Instagram links before selecting a coach',async()=>{
 const {document}=parseHTML('<html><body><main id="root"></main></body></html>'),previous=global.document;global.document=document;
 const create=document.createElement.bind(document);document.createElement=tag=>{const e=create(tag);if(tag==='dialog'){e.open=false;e.showModal=()=>{e.open=true;};e.close=()=>{e.open=false;};}return e;};
 const schools=[{id:1,name:'Alpha University',division:'FBS',conference:'Fixture'},{id:2,name:'Alpha University West',division:'D2'}];
 const coaches=[{id:11,name:'Second Coach',school_id:1,school:'Alpha University',division:'FBS',role:'Assistant Coach',status:'unverified'},{id:10,name:'First Coach',school_id:1,school:'Alpha University',division:'FBS',role:'Head Coach',email:'coach@example.edu',phone:'(555) 123-4567',x_url:'https://twitter.com/FirstCoach',instagram_url:'https://www.instagram.com/FirstCoach',status:'verified',source_url:'https://example.edu/sports/football/coaches'}];
 try{
  const root=document.querySelector('#root');await renderContactDirectory({root,schools,coaches,api:async()=>[],esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),copy:()=>{},notice:()=>{},manage:()=>{},reload:async()=>({schools,coaches})});
  const input=root.querySelector('#directorySearch'),picker=root.querySelector('#schoolPicker');assert.equal(picker.hidden,true);input.onfocus();assert.equal(picker.hidden,false);assert.equal(input.getAttribute('aria-expanded'),'true');assert.match(picker.textContent,/Division I/);picker.querySelector('[data-pick-school="1"]').onclick();assert.equal(picker.hidden,true);const dialog=document.querySelector('#contactDialog');assert.equal(dialog.open,true);assert.equal(input.value,'Alpha University');assert.match(root.querySelector('#coachSearchResults').textContent,/First Coach/);assert.doesNotMatch(root.querySelector('#programSections').textContent,/Alpha University West/);dialog.close();assert.match(root.querySelector('#coachSearchResults').textContent,/Second Coach/);
  assert.match(dialog.textContent,/coach@example.edu/);assert.match(dialog.textContent,/\(555\) 123-4567/);assert.match(dialog.textContent,/Not collected yet/);
  assert.ok(dialog.querySelector('a[href="https://mail.google.com/mail/?view=cm&fs=1&to=coach%40example.edu"]'));
  assert.ok(dialog.querySelector('a[href="https://x.com/FirstCoach"]'));assert.ok(dialog.querySelector('a[href="https://www.instagram.com/FirstCoach"]'));assert.ok(dialog.querySelector('a[href="tel:5551234567"]'));
  await dialog.querySelector('[data-coach="10"]').onclick();assert.ok(dialog.querySelector('#editContact'));assert.ok(dialog.querySelector('a[href="https://x.com/FirstCoach"]'));
 }finally{global.document=previous;}
});

test('email school picker selects exact school and releases filter when edited',()=>{
 const {document}=parseHTML('<div><input><div id="popup" hidden></div></div>');const input=document.querySelector('input'),popup=document.querySelector('#popup');input.blur=()=>{};const changes=[];
 bindSchoolPicker({input,popup,schools:[{id:2,name:'Zulu',division:'D2'},{id:1,name:'Alpha',division:'FCS'}],esc:x=>x,onChange:id=>changes.push(id)});
 input.onfocus();assert.match(popup.textContent,/Division I/);input.value='alp';input.oninput();assert.equal(popup.querySelectorAll('button').length,1);popup.querySelector('button').onclick();assert.equal(input.value,'Alpha');assert.equal(popup.hidden,true);assert.equal(changes.at(-1),1);input.value='';input.oninput();assert.equal(changes.at(-1),null);
});
