// Approximate city centers, used only when a property pin has not been saved.
export const cityCenters={
 'san bernardino':[34.1083,-117.2898],riverside:[33.9806,-117.3755],'moreno valley':[33.9425,-117.2297],fontana:[34.0922,-117.4350],ontario:[34.0633,-117.6509],'rancho cucamonga':[34.1064,-117.5931],corona:[33.8753,-117.5664],temecula:[33.4936,-117.1484],murrieta:[33.5539,-117.2139],menifee:[33.6971,-117.1850],hemet:[33.7475,-116.9719],'san jacinto':[33.7839,-116.9586],perris:[33.7825,-117.2286],redlands:[34.0556,-117.1825],rialto:[34.1064,-117.3703],colton:[34.0739,-117.3137],highland:[34.1283,-117.2086],yucaipa:[34.0336,-117.0431],beaumont:[33.9295,-116.9770],banning:[33.9256,-116.8764],upland:[34.0975,-117.6484],chino:[34.0122,-117.6889],'chino hills':[33.9898,-117.7326],montclair:[34.0775,-117.6898],eastvale:[33.9525,-117.5848],norco:[33.9311,-117.5487],'jurupa valley':[33.9972,-117.4855],'grand terrace':[34.0339,-117.3137],'loma linda':[34.0483,-117.2612],'lake elsinore':[33.6681,-117.3273],wildomar:[33.5989,-117.2800],victorville:[34.5362,-117.2928],hesperia:[34.4264,-117.3009],'apple valley':[34.5008,-117.1859],adelanto:[34.5828,-117.4092],barstow:[34.8958,-117.0173],'palm springs':[33.8303,-116.5453],'palm desert':[33.7222,-116.3745],indio:[33.7206,-116.2156],coachella:[33.6803,-116.1739],'cathedral city':[33.7806,-116.4668],bloomington:[34.0703,-117.3959]
};
export const inlandBounds=[[33.40,-117.83],[34.35,-116.78]];
export const isClient=lead=>lead.stage==='Won';
export function leadLocation(lead){
 const lat=lead.latitude,lng=lead.longitude;
 if(lat!==null&&lat!==undefined&&lat!==''&&lng!==null&&lng!==undefined&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180)return {lat:Number(lat),lng:Number(lng),approximate:false,label:lead.address||'Saved property pin'};
 const city=String(lead.city||'').split(/\s*[/;|]\s*/)[0].trim().replace(/,?\s+(?:CA|California)(?:\s+\d{5})?$/i,'').trim();
 const center=cityCenters[city.toLowerCase()];
 return center?{lat:center[0],lng:center[1],approximate:true,label:city+' city area — property pin needed'}:null;
}
