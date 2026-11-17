import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountProspectMap,destroyProspectMap} from '../public/prospect-map.js';
function fakeLeaflet(){
 const state={markers:[],listeners:{}};
 const map={setView(){return this},fitBounds(){return this},addLayer(){return this},removeLayer(){return this},getCenter:()=>({lat:34,lng:-117.3}),getZoom:()=>10,on(event,fn){state.listeners[event]=fn;return this},remove(){state.listeners.unload?.()},invalidateSize(){},closePopup(){}};
 const cluster={addTo(){return this},addLayer(m){state.markers.push(m)},clearLayers(){state.markers=[]},getBounds:()=>({isValid:()=>true}),zoomToShowLayer(m,fn){fn()}};
 const L={map:()=>map,tileLayer:()=>({addTo(){return this},on(){}}),markerClusterGroup:()=>cluster,divIcon:x=>x,marker:(coords,options)=>({coords,options,bindPopup(f){this.popup=f;return this},on(){},openPopup(){}})};
 return {L,state};
}
test('map workflow lists accounts, filters by client, toggles persisted stage, expands, and escapes organization text',async()=>{
 const {document}=parseHTML('<html><body><div id="content"></div></body></html>');const fake=fakeLeaflet();const old={document:global.document,L:global.L,confirm:global.confirm,requestAnimationFrame:global.requestAnimationFrame};
 Object.defineProperty(document.defaultView.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._testValue??this.querySelector('option')?.getAttribute('value')??''},set(v){this._testValue=v}});
 global.document=document;global.L=fake.L;global.confirm=()=>true;global.requestAnimationFrame=f=>f();document.defaultView.HTMLElement.prototype.scrollIntoView=()=>{};
 let leads=[{id:1,organization:'<img src=x onerror=bad()>',city:'Riverside',stage:'Research',latitude:null,longitude:null},{id:2,organization:'Client Account',city:'Ontario',stage:'Won',latitude:34.06,longitude:-117.65}],saved=[];
 const api=async(path,method,patch)=>{saved.push({path,method,patch});leads=leads.map(l=>path.endsWith('/'+l.id)?{...l,...patch}:l)};
 const opts={container:document.querySelector('#content'),leads,api,reload:async()=>{},edit:()=>{},onError:e=>{throw e}};
 try{
  mountProspectMap(opts);assert.equal(document.querySelectorAll('.map-account').length,2);assert.equal(document.querySelectorAll('.map-account img').length,0);assert.equal(fake.state.markers.length,2);assert.equal(fake.state.markers[0].options.isClient,false);assert.equal(fake.state.markers[1].options.isClient,true);
  const search=document.querySelector('#mapSearch');search.value='Client Account';search.oninput({target:search});assert.equal(document.querySelectorAll('.map-account').length,1);
  search.value='';search.oninput({target:search});const filter=document.querySelector('#mapFilter');filter.value='clients';filter.onchange({target:filter});assert.equal(document.querySelectorAll('.map-account').length,1);assert.equal(fake.state.markers[0].options.isClient,true);
  filter.value='all';filter.onchange({target:filter});document.querySelector('.map-account').onclick();const mark=[...document.querySelectorAll('#mapSelected button')].find(b=>b.textContent==='Mark as client');await mark.onclick();assert.deepEqual(saved[0],{path:'/api/security/leads/1',method:'PATCH',patch:{stage:'Won'}});
  document.querySelector('#mapExpand').onclick();assert.ok(document.querySelector('.map-expanded'));document.querySelector('#mapExpand').onclick();assert.equal(document.querySelector('.map-expanded'),null);
 }finally{destroyProspectMap();for(const [k,v] of Object.entries(old))global[k]=v;}
});
