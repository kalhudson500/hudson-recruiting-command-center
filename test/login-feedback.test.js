import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
test('failed login displays the error on the visible sign-in form',async()=>{
 const {document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
 const originals={document:global.document,fetch:global.fetch,FormData:global.FormData};global.document=document;
 global.fetch=async u=>String(u).endsWith('/session')?Response.json({authenticated:false}):Response.json({error:'Invalid credentials'},{status:401});
 global.FormData=class{entries(){return [['username','fixture'],['password','fixture-only']]}};
 try{await import('../public/app.js');await new Promise(r=>setImmediate(r));await document.querySelector('#loginForm').onsubmit({preventDefault(){},target:document.querySelector('#loginForm')});assert.equal(document.querySelector('#loginError').textContent,'Invalid credentials');assert.equal(document.querySelector('#login').hidden,false);}
 finally{for(const [key,value] of Object.entries(originals))global[key]=value;}
});
