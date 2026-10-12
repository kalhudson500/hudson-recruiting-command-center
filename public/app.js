let csrf='',page='dashboard',schools=[],coaches=[],selected=new Set();const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(url,method='GET',data)=>{const r=await fetch('/api/'+url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(v.error||'Request failed');return v};
function notice(t,bad=false){$('#notice').textContent=t;$('#notice').style.color=bad?'#ff9b9b':'#a4ddbc'}
async function action(f){try{await f()}catch(e){notice(e.message,true)}}
function formdata(f){return Object.fromEntries(new FormData(f).entries())}
function optSchool(){return schools.map(s=>`<option value="${s.id}">${esc(s.name)} (${s.division})</option>`).join('')}
function optCoach(){return coaches.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.school)}</option>`).join('')}
async function init(){const s=await api('session');csrf=s.csrf||'';$('#login').hidden=s.authenticated;$('#app').hidden=!s.authenticated;if(s.authenticated){schools=await api('schools');coaches=await api('coaches');await show(page)}}
$('#loginForm').onsubmit=e=>action(async()=>{e.preventDefault();const r=await api('login','POST',formdata(e.target));csrf=r.csrf;await init()});$('#logout').onclick=()=>action(async()=>{await api('logout','POST',{});await init()});$('#nav').onclick=e=>{const b=e.target.closest('[data-page]');if(b)action(()=>show(b.dataset.page))};
async function refresh(){schools=await api('schools');coaches=await api('coaches');await show(page)}
async function show(p){page=p;$('#heading').textContent=({dashboard:'Dashboard',schools:'College Programs',coaches:'Coach Directory',collect:'Public Contact Collection',campaigns:'Email Campaigns',tracker:'Recruiting Tracker'})[p];document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));notice('');const c=$('#content');
if(p==='dashboard'){const d=await api('dashboard');c.innerHTML=`<div class="metrics">${[['College Programs',d.schools],['Coach Contacts',d.coaches],['Verified Coaches',d.verified],['Emails Sent',d.emailsSent]].map(x=>`<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('')}</div><div class="grid2" style="margin-top:17px"><section class="panel"><h2>Athlete Profile</h2><h3>Kalel Hudson · Class of 2027</h3><p>DE / DT / LB · 6'2" · 260 lbs · 3.3 GPA</p><p>San Bernardino, California</p><a href="http://www.hudl.com/v/2UJypJ" target="_blank" rel="noopener">Mid-Season Hudl Highlights ↗</a></section><section class="panel"><h2>Upcoming Follow-Ups</h2>${d.followups.length?d.followups.map(x=>`<p>${esc(x.next_followup)} — ${esc(x.coach||x.school)} (${esc(x.stage)})</p>`).join(''):'<p>No follow-ups scheduled yet.</p>'}</section><section class="panel wide"><h2>Recent Activity</h2>${d.activities.length?d.activities.map(x=>`<p><small>${esc(x.created_at)}</small> — ${esc(x.kind)}: ${esc(x.detail)}</p>`).join(''):'<p>Activity will appear after you begin recruiting outreach.</p>'}</section></div>`}
if(p==='schools'){c.innerHTML=`<section class="panel"><h2>Add College Program</h2><form id="schoolForm" class="grid3"><label>School Name<input name="name" required></label><label>Division<select name="division"><option>FBS</option><option>FCS</option><option>D2</option><option>D3</option></select></label><label>Conference<input name="conference"></label><label>State<input name="state" placeholder="CA"></label><label>Official Staff Directory URL<input name="staff_url" type="url" placeholder="https://..."></label><label> <span>&nbsp;</span><button style="width:100%">Add Program</button></label></form><details><summary>Import schools from JSON</summary><p class="help">Paste an array of objects with name, division (FBS/FCS/D2/D3), conference, state, staff_url. Up to 1500 per import. Do not assume imported contacts are verified.</p><textarea id="schoolJson" placeholder='[{"name":"Example University","division":"D2","state":"CA"}]'></textarea><button id="importSchools">Import JSON</button></details></section><section class="panel"><div class="toolbar"><h2>Schools (${schools.length})</h2><input id="schoolFilter" placeholder="Search schools"></div><div class="tablewrap scroll"><table><thead><tr><th>School</th><th>Division</th><th>Conference</th><th>State</th><th>Directory</th></tr></thead><tbody id="schoolRows"></tbody></table></div></section>`;const draw=()=>{$('#schoolRows').innerHTML=schools.filter(s=>(s.name+' '+s.division+' '+s.state+' '+s.conference).toLowerCase().includes($('#schoolFilter').value.toLowerCase())).map(s=>`<tr><td>${esc(s.name)}</td><td>${s.division}</td><td>${esc(s.conference)}</td><td>${esc(s.state)}</td><td>${s.staff_url?`<a href="${esc(s.staff_url)}" target="_blank" rel="noopener">Official ↗</a>`:'—'}</td></tr>`).join('')};$('#schoolFilter').oninput=draw;draw();$('#schoolForm').onsubmit=e=>action(async()=>{e.preventDefault();await api('schools','POST',formdata(e.target));await refresh();notice('School added')});$('#importSchools').onclick=()=>action(async()=>{const rows=JSON.parse($('#schoolJson').value);const r=await api('schools/import','POST',{rows});await refresh();notice('Processed '+r.processed+' school records')})}
if(p==='coaches'){c.innerHTML=`<section class="panel"><h2>Add Coach</h2><form id="coachForm" class="grid3"><label>School<select name="school_id" required>${optSchool()}</select></label><label>Coach Name<input name="name" required></label><label>Role<input name="role" placeholder="Defensive Line Coach"></label><label>Public Email<input name="email" type="email"></label><label>X / Twitter URL<input name="x_url" type="url"></label><label>Instagram URL<input name="instagram_url" type="url"></label><label>Official Source URL<input name="source_url" type="url"></label><label>Notes<input name="notes"></label><label><span>&nbsp;</span><button style="width:100%">Add Unverified Contact</button></label></form></section><section class="panel"><div class="toolbar"><h2>Coaches (${coaches.length})</h2><input id="coachFilter" placeholder="Search coach / school / role"><select id="divisionFilter"><option value="">All divisions</option><option>FBS</option><option>FCS</option><option>D2</option><option>D3</option></select></div><div class="tablewrap scroll"><table><thead><tr><th>Coach</th><th>School</th><th>Role</th><th>Email</th><th>Social</th><th>Verification</th><th>Action</th></tr></thead><tbody id="coachRows"></tbody></table></div></section>`;const draw=()=>{$('#coachRows').innerHTML=coaches.filter(c=>(!$('#divisionFilter').value||c.division===$('#divisionFilter').value)&&(c.name+' '+c.school+' '+c.role+' '+c.email).toLowerCase().includes($('#coachFilter').value.toLowerCase())).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.school)} <small>${c.division}</small></td><td>${esc(c.role)}</td><td>${esc(c.email)}</td><td>${c.x_url?`<a href="${esc(c.x_url)}" target="_blank" rel="noopener">X</a> `:''}${c.instagram_url?`<a href="${esc(c.instagram_url)}" target="_blank" rel="noopener">IG</a>`:''}</td><td><span class="pill ${esc(c.status)}">${esc(c.status)}</span><br><small>${esc(c.verified_at)}</small>${c.source_url?` <a href="${esc(c.source_url)}" target="_blank" rel="noopener">Source</a>`:''}${c.opted_out?' · Opted out':''}</td><td>${c.status!=='verified'?`<button class="small" data-verify="${c.id}">Verify</button>`:`<button class="small secondary" data-stale="${c.id}">Mark Stale</button>`}</td></tr>`).join('')};$('#coachFilter').oninput=draw;$('#divisionFilter').onchange=draw;draw();$('#coachForm').onsubmit=e=>action(async()=>{e.preventDefault();await api('coaches','POST',formdata(e.target));await refresh();notice('Coach added as unverified')});$('#coachRows').onclick=e=>action(async()=>{const b=e.target.closest('button');if(!b)return;if(!b.dataset.verify&&!b.dataset.stale)return;const id=Number(b.dataset.verify||b.dataset.stale);const coach=coaches.find(x=>x.id===id);if(b.dataset.verify){if(!coach.source_url||!coach.email)return notice('Add a source URL and email before verifying',true);if(!confirm('Have you personally checked the official source and confirmed this coach, email and role?'))return}await api('coaches/'+id,'PATCH',{status:b.dataset.verify?'verified':'stale'});await refresh()})}
if(p==='collect'){const candidates=await api('candidates');c.innerHTML=`<section class="panel"><h2>Review Public Staff Directory</h2><p class="help">Enter an official school football staff page. This tool extracts publicly visible email addresses and social links into a REVIEW QUEUE; Use the automatic collector above for named coach matching and import. This legacy tool extracts unmatched contacts for review. Sites that block access or require JavaScript may not work.</p><form id="collectForm" class="grid2"><label>School<select name="school_id">${optSchool()}</select></label><label>Official HTTPS Staff URL<input name="url" type="url" placeholder="https://school.edu/sports/football/coaches"></label><button>Collect Public Contacts</button></form></section><section class="panel"><h2>Candidate Review Queue (${candidates.length})</h2><div class="tablewrap scroll"><table><thead><tr><th>School</th><th>Found Contact</th><th>Source</th><th>Review</th></tr></thead><tbody>${candidates.filter(x=>x.status==='pending').map(x=>`<tr><td>${esc(x.school)}</td><td>${esc(x.email||x.x_url||x.instagram_url)}</td><td><a href="${esc(x.source_url)}" target="_blank" rel="noopener">Source ↗</a></td><td><button class="small" data-import="${x.id}">Match Coach</button> <button class="small secondary" data-reject="${x.id}">Reject</button></td></tr>`).join('')}</tbody></table></div></section>`;$('#collectForm').onsubmit=e=>action(async()=>{e.preventDefault();notice('Checking public directory...');const r=await api('collect','POST',formdata(e.target));await show('collect');notice(`Collected ${r.emails} emails and ${r.social} social links for manual review`)});c.onclick=e=>action(async()=>{const b=e.target.closest('[data-import],[data-reject]');if(!b)return;const id=Number(b.dataset.import||b.dataset.reject);if(b.dataset.reject)await api('candidates/resolve','POST',{id,action:'reject'});else{const name=prompt('Verified coach name for this contact:');if(!name)return;const role=prompt('Coach role (optional):')||'';await api('candidates/resolve','POST',{id,action:'import',name,role})}await refresh()})}
if(p==='campaigns'){const campaigns=await api('campaigns');c.innerHTML=`<section class="panel"><h2>Compose Recruiting Campaign</h2><p class="help">Select individual coaches or use the division filter to select a group. Only verified, eligible contacts can be sent. Messages are sent separately after explicit approval. Personalization: {{coach_name}}, {{school}}, {{athlete_name}}, {{positions}}, {{class}}, {{gpa}}, {{hudl}}.</p><div class="toolbar"><input id="recipientFilter" placeholder="Find recipients"><select id="recipientDivision"><option value="">All divisions</option><option>FBS</option><option>FCS</option><option>D2</option><option>D3</option></select><button class="secondary small" id="selectVisible">Select Visible Eligible</button><button class="secondary small" id="clearSelected">Clear</button><span id="selectedCount"></span></div><div class="scroll tablewrap"><table><thead><tr><th>Select</th><th>Coach</th><th>School</th><th>Email</th><th>Status</th></tr></thead><tbody id="recipientRows"></tbody></table></div><form id="campaignForm"><label>Campaign Name<input name="title" placeholder="D2 Defensive Line Outreach" required></label><label>Email Subject<input name="subject" required value="2027 DE/DT/LB Kalel Hudson — {{school}} Football"></label><label>Email Body<textarea name="body" required>Coach {{coach_name}},\n\nMy name is Kalel Hudson, a 2027 DE/DT/LB from San Bernardino, California. I'm 6'2", 260 lbs with a 3.3 GPA. I'm interested in learning more about {{school}} and would appreciate the opportunity for you to review my film.\n\nMid-Season Highlights: {{hudl}}\n\nI'm ready to work, learn, and earn my place. Thank you for your time and consideration.\n\nKalel Hudson\nClass of 2027</textarea></label><button>Save Draft & Review</button></form></section><section class="panel"><h2>Saved Campaigns</h2>${campaigns.map(x=>`<div class="toolbar"><div><strong>${esc(x.title)}</strong> <span class="pill">${esc(x.status)}</span><p>${x.recipient_count} recipients · ${x.sent_count} sent</p></div><button class="small secondary" data-preview="${x.id}">Review / Send</button></div>`).join('')||'<p>No campaigns yet.</p>'}</section><section id="previewPanel"></section>`;const eligible=coaches.filter(x=>x.status==='verified'&&x.email&&!x.opted_out);const visible=()=>eligible.filter(x=>(!$('#recipientDivision').value||x.division===$('#recipientDivision').value)&&(x.name+' '+x.school+' '+x.role).toLowerCase().includes($('#recipientFilter').value.toLowerCase()));const draw=()=>{$('#recipientRows').innerHTML=visible().map(x=>`<tr><td><input class="check" type="checkbox" data-select="${x.id}" ${selected.has(x.id)?'checked':''}></td><td>${esc(x.name)}</td><td>${esc(x.school)}</td><td>${esc(x.email)}</td><td>${esc(x.status)}</td></tr>`).join('');$('#selectedCount').textContent=selected.size+' selected'};$('#recipientFilter').oninput=draw;$('#recipientDivision').onchange=draw;$('#recipientRows').onchange=e=>{if(e.target.dataset.select){const id=Number(e.target.dataset.select);e.target.checked?selected.add(id):selected.delete(id);draw()}};$('#selectVisible').onclick=()=>{visible().forEach(x=>selected.add(x.id));draw()};$('#clearSelected').onclick=()=>{selected.clear();draw()};draw();$('#campaignForm').onsubmit=e=>action(async()=>{e.preventDefault();const b=formdata(e.target);b.coach_ids=[...selected];const r=await api('campaigns','POST',b);selected.clear();await show('campaigns');await preview(r.id);notice('Draft saved. Review and approve before sending.')});c.onclick=e=>{const b=e.target.closest('[data-preview]');if(b)action(()=>preview(Number(b.dataset.preview)))}}
if(p==='tracker'){const rows=await api('prospects');c.innerHTML=`<section class="panel"><h2>Add Recruiting Lead</h2><form id="leadForm" class="grid3"><label>Coach<select name="coach_id"><option value="">No coach</option>${optCoach()}</select></label><label>School<select name="school_id"><option value="">No school</option>${optSchool()}</select></label><label>Stage<select name="stage">${['not_contacted','contacted','replied','interested','visit','offer','closed'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Follow-up Date<input type="date" name="next_followup"></label><label>Notes<input name="notes"></label><label><span>&nbsp;</span><button style="width:100%">Save Lead</button></label></form></section><section class="panel"><h2>Recruiting Pipeline</h2><div class="tablewrap"><table><thead><tr><th>Coach</th><th>School</th><th>Stage</th><th>Follow-up</th><th>Notes</th><th>Update</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.coach)}</td><td>${esc(x.school)}</td><td><select id="stage${x.id}">${['not_contacted','contacted','replied','interested','visit','offer','closed'].map(s=>`<option ${x.stage===s?'selected':''}>${s}</option>`).join('')}</select></td><td><input id="date${x.id}" type="date" value="${esc(x.next_followup)}"></td><td><input id="notes${x.id}" value="${esc(x.notes)}"></td><td><button class="small" data-savelead="${x.id}">Save</button></td></tr>`).join('')}</tbody></table></div></section>`;$('#leadForm').onsubmit=e=>action(async()=>{e.preventDefault();const b=formdata(e.target);if(!b.coach_id)delete b.coach_id;if(!b.school_id)delete b.school_id;await api('prospects','POST',b);await show('tracker');notice('Lead saved')});c.onclick=e=>{const b=e.target.closest('[data-savelead]');if(b)action(async()=>{const id=b.dataset.savelead;await api('prospects/'+id,'PATCH',{stage:$('#stage'+id).value,notes:$('#notes'+id).value,next_followup:$('#date'+id).value});notice('Lead updated')})}}
}
async function preview(id){const d=await api('campaigns/'+id+'/preview'),c=d.campaign;$('#previewPanel').innerHTML=`<div class="panel"><h2>Approval & Sending: ${esc(c.title)}</h2><p>${d.recipients.length} recipients · <strong>${esc(c.status)}</strong></p><p class="help">Check personalized content and recipients. Sending requires a verified domain and provider API key. Send at most 25 per click; failures remain recorded and are never silently retried.</p><div class="scroll">${d.recipients.map(r=>`<details><summary>${esc(r.name)} — ${esc(r.school)} · ${esc(r.email)} · ${esc(r.state)}</summary><p><strong>${esc(r.subject)}</strong></p><pre>${esc(r.body)}</pre></details>`).join('')}</div><div class="actions">${c.status==='draft'?`<button id="approve">Approve Campaign</button>`:''}${c.status==='approved'?`<button id="sendBatch">Send Next Batch</button><select id="batchSize" style="width:90px"><option>5</option><option>10</option><option>25</option></select>`:''}</div></div>`;$('#approve')?.addEventListener('click',()=>action(async()=>{if(!confirm('Approve this campaign and its selected recipients for sending?'))return;await api('campaigns/'+id+'/approve','POST',{});await show('campaigns');await preview(id)}));$('#sendBatch')?.addEventListener('click',()=>action(async()=>{if(!confirm('Send up to '+$('#batchSize').value+' verified individual recruiting emails now?'))return;notice('Sending approved batch...');const r=await api('campaigns/'+id+'/send','POST',{limit:Number($('#batchSize').value)});await show('campaigns');await preview(id);notice(`Batch finished: ${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped`)}))}

// HUDSON RECRUITING - COPY AND EXPORT TOOLS
function hudsonCopy(value) {
  const text = String(value || '');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => notice('Copied!'))
      .catch(() => hudsonCopyFallback(text));
  } else {
    hudsonCopyFallback(text);
  }
}

function hudsonCopyFallback(text) {
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  const ok = document.execCommand('copy');
  t.remove();
  notice(ok ? 'Copied!' : 'Copy failed', !ok);
}

function hudsonCsv(value) {
  return '"' + String(value ?? '')
    .replace(/"/g, '""') + '"';
}

function hudsonExport(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map(row => row.map(hudsonCsv).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


const hudsonStarterContacts=[
 {school:'Howard University',name:'Nicholas Gould',role:'Recruiting Coordinator / Linebackers',email:'nicholas.gould@howard.edu',source_url:'https://hubison.com/sports/football/coaches'},
 {school:'Howard University',name:'Del Cowsette',role:'Defensive Line Coach',email:'del.cowsette@howard.edu',source_url:'https://hubison.com/sports/football/coaches'},
 {school:'Howard University',name:'Maurice Paulk',role:'Assistant Defensive Line Coach',email:'maurice.paulk1@howard.edu',source_url:'https://hubison.com/sports/football/coaches'},
 {school:'Howard University',name:'Janice Pettyjohn',role:'Director of Player Personnel & On-Campus Recruiting',email:'janice.pettyjohn@howard.edu',source_url:'https://hubison.com/sports/football/coaches'},
 {school:'Azusa Pacific University',name:'Craig Robbins',role:'Recruiting Coordinator / Running Backs',email:'cprobbins@apu.edu',source_url:'https://athletics.apu.edu/sports/football/coaches'},
 {school:'Azusa Pacific University',name:'Jericho Silvernail',role:'Defensive Line Coach',email:'jsilvernail@apu.edu',source_url:'https://athletics.apu.edu/sports/football/coaches'},
 {school:'Azusa Pacific University',name:'A.J. Parnell',role:'Head Coach',email:'aparnell@apu.edu',phone:'(626) 815-4645',source_url:'https://athletics.apu.edu/sports/football/coaches'}
];
function hudsonLoadStarterContacts(){
 const target=document.querySelector('#hudsonImportCoaches');
 if(!target||document.querySelector('#hudsonStarterContacts'))return;
 const button=document.createElement('button');button.id='hudsonStarterContacts';button.type='button';button.className='secondary';
 button.textContent='Load 7 Official-Directory Contacts';
 button.onclick=()=>{
  const names=[...new Set(hudsonStarterContacts.map(c=>c.school))];
  const missing=names.filter(name=>!schools.some(s=>s.name.toLowerCase()===name.toLowerCase()));
  if(missing.length)return notice('School names not found: '+missing.join(', ')+'. No contacts loaded.',true);
  document.querySelector('#hudsonCoachJson').value=JSON.stringify(hudsonStarterContacts,null,2);
  target.open=true;notice('Loaded 7 official-directory contacts. Review and tap Import Coach Contacts.');
 };
 target.appendChild(button);
}

function hudsonDirectoryDiscovery(){
 const table=document.querySelector('#schoolRows'),toolbar=document.querySelector('#schoolFilter')?.parentElement;
 if(!table||!toolbar||document.querySelector('#hudsonDiscover'))return;
 const button=document.createElement('button');button.id='hudsonDiscover';button.type='button';button.textContent='Find Staff Directories';
 const review=document.createElement('button');review.type='button';review.textContent='Review Found Links';
 const status=document.createElement('span');
 async function update(){
  const d=await api('directory-discovery/status');
  status.textContent='Missing links: '+d.missing+' | Suggestions: '+d.review+(d.configured?'':' | Search key needed');
 }
 button.onclick=()=>action(async()=>{
  button.disabled=true;
  try{
   const result=await api('directory-discovery/batch','POST',{limit:3});
   await update();notice('Searched '+result.checked+' schools; found '+result.suggestions+' candidate directories; '+result.failed+' errors');
  }finally{button.disabled=false}
 });
 review.onclick=()=>action(async()=>{
  const items=await api('directory-discovery/suggestions');
  if(!items.length)return notice('No suggested directories to review');
  const item=items[0];
  const url=prompt('Check this is the official football staff directory for '+item.name+' ('+item.division+'). Edit URL if needed:',item.suggested_url);
  if(url===null)return;
  if(!confirm('Save this official staff directory for '+item.name+'?'))return;
  await api('directory-discovery/approve','POST',{school_id:item.school_id,url});
  await refresh();notice('Directory saved for '+item.name);
 });
 toolbar.append(button,review,status);
 update().catch(e=>notice(e.message,true));
}

function hudsonDirectoryScanner(){
 const table=document.querySelector('#schoolRows');
 if(!table||document.querySelector('#hudsonDirectoryScan'))return;
 const toolbar=document.querySelector('#schoolFilter')?.parentElement;
 if(!toolbar)return;
 const button=document.createElement('button');button.id='hudsonDirectoryScan';button.type='button';
 button.textContent='Scan Staff Directories';
 const status=document.createElement('span');status.id='hudsonScanStatus';
 const update=async()=>{
  const d=await api('directory-scan/status');
  status.textContent='Directories: '+d.with_url+'/'+d.total+' | Scanned: '+d.attempted+' | Review: '+d.pendingReview;
 };
 button.onclick=()=>action(async()=>{
  button.disabled=true;
  try{
   const r=await api('directory-scan/batch','POST',{limit:3});
   await update();
   notice('Scanned '+r.scanned+' directories; '+r.foundEmails+' emails and '+r.foundSocial+' social links found. '+r.failed+' failed.');
  }finally{button.disabled=false}
 });
 toolbar.append(button,status);
 update().catch(e=>notice(e.message,true));
}

function hudsonVerifyBatchButton(){
 const rows=document.querySelector('#coachRows');if(!rows)return;
 const toolbar=document.querySelector('#coachFilter')?.parentElement;
 if(!toolbar||document.querySelector('#hudsonVerifyBatch'))return;
 const button=document.createElement('button');button.id='hudsonVerifyBatch';button.type='button';
 button.textContent='Check 10 Contacts';
 button.onclick=()=>action(async()=>{
  button.disabled=true;
  try{
   notice('Checking official staff pages...');
   const result=await api('coaches/verify-batch','POST',{limit:10});
   await refresh();
   notice('Checked '+result.checked+': '+result.verified+' matched, '+result.unmatched+' unmatched, '+result.failed+' unavailable');
  }finally{button.disabled=false}
 });
 toolbar.appendChild(button);
}

function hudsonCoachImportUI(){
 const form=document.querySelector('#coachForm');
 if(!form)return;
 if(!form.querySelector('[name="phone"]')){
  const label=document.createElement('label');label.textContent='Public Phone';
  const input=document.createElement('input');input.name='phone';input.type='tel';
  label.appendChild(input);form.insertBefore(label,form.querySelector('button')?.closest('label')||null);
 }
 if(!document.querySelector('#hudsonImportCoaches')){
  const panel=document.createElement('details');panel.id='hudsonImportCoaches';
  const heading=document.createElement('summary');heading.textContent='Bulk Import Coach Contacts';
  const help=document.createElement('p');help.textContent='Paste a JSON array. Each contact requires school and name; optional division, role, email, phone, x_url, instagram_url, source_url, notes. Maximum 200 per batch. All imports are unverified.';
  const input=document.createElement('textarea');input.id='hudsonCoachJson';input.rows=6;
  const button=document.createElement('button');button.type='button';button.textContent='Import Coach Contacts';
  button.onclick=()=>action(async()=>{
   const rows=JSON.parse(input.value);
   if(!Array.isArray(rows)||!rows.length||rows.length>200)throw Error('Provide 1 to 200 contacts');
   if(!confirm('Import '+rows.length+' contacts as unverified?'))return;
   const result=await api('coaches/import','POST',{rows});
   await refresh();notice('Imported '+result.imported+'; duplicates skipped '+result.skipped);
  });
  panel.append(heading,help,input,button);form.closest('section').appendChild(panel);
  hudsonLoadStarterContacts();
 }
 const table=document.querySelector('#coachRows');
 if(!table||table.dataset.contactLinks)return;
 table.dataset.contactLinks='yes';
 const th=document.createElement('th');th.textContent='Contact';table.closest('table').querySelector('thead tr').appendChild(th);
 const decorate=()=>{
  table.querySelectorAll('tr').forEach(tr=>{
   if(tr.querySelector('.hudsonContactCell'))return;
   const coach=coaches.find(c=>c.name===tr.cells[0]?.textContent.trim()&&tr.cells[1]?.textContent.includes(c.school));
   const td=document.createElement('td');td.className='hudsonContactCell';
   if(coach){
    if(coach.phone){
     const link=document.createElement('a');link.href='tel:'+coach.phone.replace(/[^+0-9]/g,'');
     link.textContent=coach.phone;td.appendChild(link);
    }
    if(coach.email&&!coach.opted_out){
     const link=document.createElement('a');
     link.href='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(coach.email);
     link.target='_blank';link.rel='noopener';link.textContent=' Gmail';td.appendChild(link);
    }
    const copy=document.createElement('button');copy.type='button';copy.className='small secondary';copy.textContent='Copy';
    copy.onclick=()=>hudsonCopy([coach.name,coach.school,coach.role,coach.email,coach.phone,coach.x_url].filter(Boolean).join(' | '));
    td.appendChild(copy);
    const edit=document.createElement('button');edit.type='button';edit.className='small secondary';edit.textContent='Edit Contact';edit.onclick=()=>hudsonEditCoach(coach.id);td.appendChild(edit);
   }
   tr.appendChild(td);
  });
 };
 new MutationObserver(decorate).observe(table,{childList:true});decorate();
}

async function hudsonEditCoach(id){
 const coach=coaches.find(c=>c.id===id);if(!coach)return;
 const fields=[['name','Coach Name'],['role','Position'],['email','Email'],['phone','Phone'],['x_url','X / Twitter URL'],['instagram_url','Instagram URL'],['source_url','Official Source URL'],['notes','Notes']];
 const changes={};
 for(const [key,label] of fields){
  const value=prompt(label+' (blank clears the field)',coach[key]||'');
  if(value===null)return;
  changes[key]=value.trim();
 }
 if(!changes.name)return notice('Coach name required',true);
 if(!confirm('Save changes for '+changes.name+'?'))return;
 await action(async()=>{await api('coaches/'+id,'PATCH',changes);await refresh();notice('Coach contact updated')});
}

function hudsonEnhance() {
  const schoolRows = document.querySelector('#schoolRows');
  const coachRows = document.querySelector('#coachRows');

  if (schoolRows) {
    const toolbar = document.querySelector('#schoolFilter')
      ?.parentElement;

    if (toolbar && !document.querySelector('#hudsonExportSchools')) {
      const exportBtn = document.createElement('button');
      exportBtn.id = 'hudsonExportSchools';
      exportBtn.textContent = 'Export All Schools';
      exportBtn.onclick = () => hudsonExport(
        'hudson-651-schools.csv',
        ['Name', 'Division', 'Conference', 'State', 'Directory'],
        schools.map(s => [
          s.name, s.division, s.conference,
          s.state, s.staff_url
        ])
      );
      toolbar.appendChild(exportBtn);

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy All Schools';
      copyBtn.onclick = () => hudsonCopy(
        schools.map(s => [
          s.name, s.division, s.conference,
          s.state, s.staff_url
        ].filter(Boolean).join(' | ')).join('\n')
      );
      toolbar.appendChild(copyBtn);
    }

    if (!schoolRows.dataset.hudsonEnhanced) {
      schoolRows.dataset.hudsonEnhanced = 'yes';
      const addButtons = () => {
        schoolRows.querySelectorAll('tr').forEach(tr => {
          if (tr.querySelector('.hudsonCopyRow')) return;
          const td = document.createElement('td');
          const btn = document.createElement('button');
          btn.className = 'small secondary hudsonCopyRow';
          btn.textContent = 'Copy';
          btn.onclick = () => hudsonCopy(
            Array.from(tr.cells)
              .slice(0, 5)
              .map(c => c.innerText.trim())
              .join(' | ')
          );
          td.appendChild(btn);
          tr.appendChild(td);
        });
      };
      const head = schoolRows.closest('table')
        ?.querySelector('thead tr');
      if (head) {
        const th = document.createElement('th');
        th.textContent = 'Copy';
        head.appendChild(th);
      }
      new MutationObserver(addButtons)
        .observe(schoolRows, { childList: true });
      addButtons();
    }
  }

  if (coachRows) {
    const toolbar = document.querySelector('#coachFilter')
      ?.parentElement;

    if (toolbar && !document.querySelector('#hudsonExportCoaches')) {
      const btn = document.createElement('button');
      btn.id = 'hudsonExportCoaches';
      btn.textContent = 'Export Coaches';
      btn.onclick = () => hudsonExport(
        'hudson-coaches.csv',
        ['Name', 'School', 'Role', 'Email', 'X', 'Instagram'],
        coaches.map(c => [
          c.name, c.school, c.role, c.email,
          c.x_url, c.instagram_url
        ])
      );
      toolbar.appendChild(btn);
    }
  }
}

const hudsonOriginalShow = show;
show = async function(...args) {
  const result = await hudsonOriginalShow(...args);
  hudsonEnhance();
  hudsonCoachImportUI();
  hudsonVerifyBatchButton();
  hudsonDirectoryScanner();
  hudsonDirectoryDiscovery();
  return result;
};
// END HUDSON TOOLS



async function hudsonAutomationUI(){
 if(page!=='collect'||document.querySelector('#automationPanel'))return;
 const panel=document.createElement('section');panel.className='panel';panel.id='automationPanel';
 panel.innerHTML='<h2>Automatic NCAA Contact Collection</h2><p>Runs in the background, preserving existing records and manually edited contacts. Supported named staff rows import automatically. Uncertain sources and conflicts are flagged. NAIA is excluded.</p><div class="actions"><button id="automationStart">Start / Resume All Schools</button><button id="automationPause" class="secondary">Pause</button><button id="automationRetry" class="secondary">Retry Flagged Schools</button><button id="automationRefresh" class="secondary">Refresh Progress</button></div><p id="automationSummary"></p><div class="tablewrap scroll"><table><thead><tr><th>School</th><th>Status</th><th>Imported</th><th>Source / Checked</th><th>Flag</th></tr></thead><tbody id="automationRows"></tbody></table></div><details><summary>Conflicting contact evidence</summary><div id="automationEvidence"></div></details>';
 $('#content').prepend(panel);
 async function update(){const d=await api('automation/status');if(page!=='collect'||!$('#automationSummary'))return;
 $('#automationSummary').textContent=(d.enabled?'Running':'Paused')+' · '+d.schools.length+' / '+d.total+' schools attempted · '+d.counts.map(x=>x.status+': '+x.count).join(' · ')+(d.searchConfigured?'':' · Directory discovery needs BRAVE_SEARCH_API_KEY; saved directories can still run');
 $('#automationRows').innerHTML=d.schools.map(s=>`<tr><td>${esc(s.name)} (${esc(s.division)})</td><td>${esc(s.status)}</td><td>${s.imported}</td><td>${s.source_url?`<a target="_blank" rel="noopener" href="${esc(s.source_url)}">Source</a>`:''} ${esc(s.checked_at)}</td><td>${esc(s.error)}</td></tr>`).join('');
 $('#automationEvidence').innerHTML=d.review.map(e=>`<p>${esc(e.school)} · ${esc(e.observed_at)} · ${esc(e.payload)} · <a target="_blank" rel="noopener" href="${esc(e.source_url)}">Source</a></p>`).join('')||'No conflicting contact evidence.';
 }
 for(const [id,endpoint] of [['automationStart','start'],['automationPause','pause'],['automationRetry','retry']])$('#'+id).onclick=()=>action(async()=>{await api('automation/'+endpoint,'POST',{});await update()});
 $('#automationRefresh').onclick=()=>action(update);await update();
}
const showWithAutomation=show;show=async function(...args){await showWithAutomation(...args);await hudsonAutomationUI();};

init().catch(e=>notice(e.message,true));
