import {leadLocation,isClient,inlandBounds} from './map-data.js';
let mounted=null,camera=null,filters={q:'',status:'all'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e};
export function destroyProspectMap(){if(!mounted)return;const {map}=mounted;camera={center:map.getCenter(),zoom:map.getZoom()};map.remove();mounted=null;}
export function mountProspectMap({container,leads,api,reload,edit,onError}){
 container.innerHTML=`<section class="map-workspace" aria-label="Prospect and client map">
 <div class="map-intro"><div><h2>Your territory. Your next account.</h2><p>Red dots are prospects. Green dots are your clients. Tap a dot to see the account or change its status.</p></div><div class="map-legend"><span><i class="status-dot prospect"></i>Prospect</span><span><i class="status-dot client"></i>Client</span></div></div>
 <div class="map-tools"><input id="mapSearch" type="search" aria-label="Search map accounts" placeholder="Search company, contact or city"><select id="mapFilter" aria-label="Filter map status"><option value="all">All accounts</option><option value="prospects">Prospects — red</option><option value="clients">Clients — green</option></select><button id="mapHome" class="secondary">Inland Empire</button><button id="mapFit" class="secondary">Fit all dots</button><button id="mapExpand">Expand map</button></div>
 <div class="territory-layout"><div class="map-canvas-wrap"><div id="territoryMap" role="region" aria-label="Interactive Inland Empire prospect and client map"></div><div id="mapTileError" class="map-tile-error" hidden role="status">Map streets could not load. Your account list and saved pins are still available. Check your internet connection.</div><p class="map-footnote">City-area dots are approximate. Save a property address or place a pin for a specific location. Tap a numbered group to see nearby accounts.</p></div><aside class="map-rail"><div id="mapSummary" class="map-summary" role="status"></div><div id="mapSelected"></div><div id="mapAccounts" class="map-accounts"></div></aside></div><p class="map-source">Street map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Address matches: U.S. Census Bureau. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map issue</a></p></section>`;
 const $=s=>container.querySelector(s),workspace=$('.map-workspace');
 if(!globalThis.L){$('#territoryMap').textContent='Map could not start. Reload this page to try again.';onError('The map files could not load.');return;}
 const L=globalThis.L,map=L.map($('#territoryMap'),{minZoom:5,maxZoom:19,zoomControl:true});
 if(camera)map.setView(camera.center,camera.zoom);else map.fitBounds(inlandBounds,{padding:[10,10]});
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 tiles.on('tileerror',()=>{$('#mapTileError').hidden=false});
 const clusters=L.markerClusterGroup({maxClusterRadius:35,showCoverageOnHover:false,spiderfyOnMaxZoom:true,iconCreateFunction:cluster=>{
  const children=cluster.getAllChildMarkers(),clients=children.filter(m=>m.options.isClient).length,prospects=children.length-clients;
  return L.divIcon({className:'account-cluster '+(clients&&prospects?'mixed':clients?'client':'prospect'),html:'<span>'+children.length+'</span>',iconSize:[42,42],iconAnchor:[21,21]});
 }}).addTo(map);
 const markers=new Map();let selected=null,picking=null,preview=null,active=true;
 mounted={map};
 function visible(){const q=filters.q.toLowerCase().trim();return leads.filter(l=>(filters.status==='all'||(filters.status==='clients'?isClient(l):!isClient(l)))&&[l.organization,l.contact,l.city,l.address,l.email].join(' ').toLowerCase().includes(q))}
 function report(e){onError(e);const el=$('#pinFeedback');if(el)el.textContent=e.message||e}
 async function save(id,patch){await api('/api/security/leads/'+id,'PATCH',patch);await reload();}
 function button(text,action,secondary=true){const b=node('button',text,secondary?'secondary':'');b.type='button';b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){report(e)}finally{if(b.isConnected)b.disabled=false}};return b}
 function popup(lead){
  const root=node('div',undefined,'account-popup'),loc=leadLocation(lead);
  root.append(node('strong',lead.organization),node('p',(isClient(lead)?'Client':'Prospect')+' · '+lead.stage,'map-popup-status'),node('p',lead.contact||'No contact name'),node('p',loc?.label||'Location needed','muted'));
  const actions=node('div',undefined,'actions');actions.append(button(isClient(lead)?'Change to prospect':'Mark as client',()=>toggle(lead),false),button('Account & location',()=>select(lead,true)),button('Edit account',()=>edit(lead.id)));
  root.append(actions);return root;
 }
 async function toggle(lead){
  if(!confirm(isClient(lead)?'Change '+lead.organization+' back to a prospect? Its stage will become Qualified.':'Mark '+lead.organization+' as your client? Its stage will become Won and its dot will turn green.'))return;
  await save(lead.id,{stage:isClient(lead)?'Qualified':'Won'});
 }
 function draw(){
  clusters.clearLayers();markers.clear();if(preview){map.removeLayer(preview);preview=null}picking=null;
  const rows=visible();let mapped=0,approx=0;
  for(const lead of rows){const loc=leadLocation(lead);if(!loc)continue;mapped++;if(loc.approximate)approx++;
   const color=isClient(lead)?'client':'prospect';
   const marker=L.marker([loc.lat,loc.lng],{isClient:isClient(lead),title:lead.organization+' — '+(isClient(lead)?'Client':'Prospect')+(loc.approximate?' (city area)':''),alt:lead.organization,icon:L.divIcon({className:'account-marker',html:'<span class="map-pin '+color+(loc.approximate?' approximate':'')+'"></span>',iconSize:[26,26],iconAnchor:[13,13]})});
   marker.bindPopup(()=>popup(lead),{maxWidth:310});marker.on('click',()=>select(lead,false));markers.set(lead.id,marker);clusters.addLayer(marker);
  }
  const clients=rows.filter(isClient).length;
  $('#mapSummary').textContent=rows.length+' accounts · '+(rows.length-clients)+' prospects · '+clients+' clients';
  const list=$('#mapAccounts');list.replaceChildren();list.append(node('p',mapped+' mapped · '+approx+' city-area · '+(rows.length-mapped)+' need location','muted'));
  if(!rows.length)list.append(node('p',leads.length?'No accounts match this search.':'Add your first prospect to start building your map.','empty'));
  for(const lead of rows){const loc=leadLocation(lead),b=node('button',undefined,'map-account');b.type='button';b.dataset.leadId=lead.id;
   const top=node('span',undefined,'map-account-title');top.append(node('i',undefined,'status-dot '+(isClient(lead)?'client':'prospect')),node('strong',lead.organization));b.append(top,node('span',lead.contact||lead.sector,'muted'),node('span',(isClient(lead)?'Client':'Prospect')+' · '+(loc?(loc.approximate?'City area: '+lead.city:lead.address||'Saved property pin'):'Location needed'),'muted'));b.onclick=()=>select(lead,true);list.append(b);
  }
  if(selected&&rows.some(l=>l.id===selected.id))select(selected,false);else{$('#mapSelected').replaceChildren();selected=null}
 }
 function select(lead,focus){
  selected=lead;const panel=$('#mapSelected');panel.replaceChildren();
  panel.append(node('h3',lead.organization),node('p',lead.contact||'No contact name'),node('p',isClient(lead)?'Client — green dot':'Prospect — red dot','map-popup-status'));
  const actions=node('div',undefined,'actions');actions.append(button(isClient(lead)?'Change to prospect':'Mark as client',()=>toggle(lead),false),button('Edit account',()=>edit(lead.id)));panel.append(actions);
  const form=node('form',undefined,'map-location-form');form.append(node('h4','Property location'));
  const label=node('label','Street address, city and CA / ZIP'),input=node('input');input.name='address';input.type='text';input.autocomplete='street-address';input.value=lead.address||'';input.placeholder='123 Main St, Riverside, CA';label.append(input);form.append(label);
  const find=node('button','Find address');find.type='submit';form.append(find,node('p','Search sends this address to the U.S. Census Bureau. Review the match before saving.','muted'));
  const matches=node('div',undefined,'map-address-results');form.append(matches);
  form.onsubmit=async e=>{e.preventDefault();find.disabled=true;matches.replaceChildren(node('p','Finding address…','muted'));try{const result=await api('/api/security/geocode','POST',{address:input.value});if(!active||selected?.id!==lead.id)return;matches.replaceChildren();if(!result.matches.length)matches.append(node('p','No address match. Check the street number and ZIP, or place a pin below.','muted'));for(const match of result.matches){const row=node('div',undefined,'map-address-match');row.append(node('p',match.address),button('Save this location',()=>save(lead.id,{...match,location_method:'census'}),false));matches.append(row)}}catch(e){matches.replaceChildren(node('p',e.message))}finally{find.disabled=false}};
  panel.append(form,button('Place pin on map',()=>{
   picking={lead,address:input.value.trim()};$('#pinFeedback').textContent='Tap the property on the map, then tap Save pin here.';map.closePopup();$('#territoryMap').classList.add('placing-pin');$('#territoryMap').scrollIntoView({behavior:'smooth',block:'center'});
  }));
  const feedback=node('p',leadLocation(lead)?.label||'No map location yet. Find an address or place a pin.','muted');feedback.id='pinFeedback';panel.append(feedback);
  if(lead.latitude!==null&&lead.latitude!==undefined)panel.append(button('Use city area instead',async()=>{if(confirm('Remove this property pin and use the city area for '+lead.organization+'?'))await save(lead.id,{latitude:null,longitude:null,location_method:''})}));
  if(focus){const marker=markers.get(lead.id);if(marker)clusters.zoomToShowLayer(marker,()=>marker.openPopup());panel.scrollIntoView({behavior:'smooth',block:'nearest'});}
 }
 map.on('click',e=>{if(!picking)return;const choice={...picking},latlng=e.latlng;if(preview)map.removeLayer(preview);preview=L.circleMarker(latlng,{radius:12,color:'#155e51',fillColor:'#fff',fillOpacity:0.8}).addTo(map);
  const content=node('div');content.append(node('strong','Place '+choice.lead.organization+' here?'),node('p','Confirm this is the property or office you want to track.'),button('Save pin here',()=>save(choice.lead.id,{latitude:latlng.lat,longitude:latlng.lng,address:choice.address,location_method:'manual'}),false),button('Cancel',()=>{picking=null;if(preview)map.removeLayer(preview);preview=null;map.closePopup();$('#territoryMap').classList.remove('placing-pin');}));L.popup().setLatLng(latlng).setContent(content).openOn(map);
 });
 $('#mapSearch').value=filters.q;$('#mapFilter').value=filters.status;
 $('#mapSearch').oninput=e=>{filters.q=e.target.value;draw()};$('#mapFilter').onchange=e=>{filters.status=e.target.value;draw()};
 $('#mapHome').onclick=()=>map.fitBounds(inlandBounds,{padding:[18,18]});
 $('#mapFit').onclick=()=>{const bounds=clusters.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:14});else map.fitBounds(inlandBounds)};
 $('#mapExpand').onclick=()=>{const expanded=workspace.classList.toggle('map-expanded');$('#mapExpand').textContent=expanded?'Close expanded map':'Expand map';setTimeout(()=>map.invalidateSize(),20)};
 const onKey=e=>{if(e.key==='Escape'&&workspace.classList.contains('map-expanded')){$('#mapExpand').click()}};document.addEventListener('keydown',onKey);
 map.on('unload',()=>{active=false;document.removeEventListener('keydown',onKey)});
 draw();requestAnimationFrame(()=>map.invalidateSize());
}
