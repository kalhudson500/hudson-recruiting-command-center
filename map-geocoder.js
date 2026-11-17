export function installMapGeocoder({db,one,run,fetcher=fetch}){
 db.exec('CREATE TABLE IF NOT EXISTS security_geocode_cache(address TEXT PRIMARY KEY,matches TEXT NOT NULL,created_at INTEGER NOT NULL)');
 let busy=false;
 return async address=>{
  address=String(address||'').trim();if(address.length<8||address.length>300||!/^\d+\s+/.test(address))throw Error('Enter a street number, street name, city and CA or ZIP code.');
  const key=address.toLowerCase().replace(/\s+/g,' '),cached=one('SELECT * FROM security_geocode_cache WHERE address=?',key);
  if(cached&&cached.created_at>Date.now()-30*864e5)return JSON.parse(cached.matches);
  if(busy)throw Error('An address search is running. Please try again in a moment.');busy=true;
  try{
   const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');u.search=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'json'});
   const r=await fetcher(u,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'KPSAccountCommandCenter/1.0 (+https://hudson-recruiting-command-center.onrender.com/)'}});
   if(!r.ok)throw Error('Address search is unavailable. You can place a pin on the map instead.');
   const x=await r.json();
   const matches=(x.result?.addressMatches||[]).filter(m=>m.addressComponents?.state==='CA'&&Number.isFinite(m.coordinates?.y)&&Number.isFinite(m.coordinates?.x)).slice(0,5).map(m=>({address:m.matchedAddress,latitude:m.coordinates.y,longitude:m.coordinates.x}));
   run('INSERT OR REPLACE INTO security_geocode_cache(address,matches,created_at) VALUES(?,?,?)',key,JSON.stringify(matches),Date.now());return matches;
  }catch(e){if(e.name==='TimeoutError')throw Error('Address search timed out. Try again or place a pin on the map.');throw e}finally{busy=false}
 };
}
