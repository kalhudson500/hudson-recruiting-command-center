import { load } from 'cheerio';
import { normalize, parseDirectory, parseCoachProfile } from './collector.js';

export function xProfileUrl(value) {
 try {
  const u = new URL(value);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || !/^(www\.)?(x|twitter)\.com$/i.test(u.hostname)) return '';
  const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!m || /^(home|intent|share|search|explore|settings|messages|notifications|login|signup|i)$/i.test(m[1])) return '';
  return 'https://x.com/' + m[1];
 } catch { return ''; }
}

// Only explicitly attributed fields on a named coach page qualify. Global team links do not.
export function namedProfileX(html, url, name) {
 const $ = load(html);
 if (!normalize($('title').text()).startsWith(normalize(name)) && ! $('h1').toArray().some(el => normalize($(el).text()) === normalize(name))) return '';
 const matches = new Set();
 const existing = parseCoachProfile(html, url, name)?.x_url;
 if (existing && xProfileUrl(existing)) matches.add(xProfileUrl(existing));
 $('script,style,nav,footer,header').remove();
 $('dt').each((_, el) => {
  if (!/^(twitter|x|x\s*\/\s*twitter|twitter\s*\/\s*x)\s*:?$/i.test($(el).text().trim())) return;
  const value = $(el).next('dd');
  value.find('a[href]').each((_, a) => { const candidate = xProfileUrl($(a).attr('href')); if (candidate) matches.add(candidate); });
  const handle = value.text().trim().match(/^@([A-Za-z0-9_]{1,15})$/);
  if (handle) matches.add('https://x.com/' + handle[1]);
 });
 $('a[href][aria-label]').each((_, el) => {
  const label = $(el).attr('aria-label') || '';
  if (!normalize(label).includes(normalize(name)) || !/twitter|\bX\b/i.test(label)) return;
  const candidate = xProfileUrl($(el).attr('href')); if (candidate) matches.add(candidate);
 });
 return matches.size === 1 ? [...matches][0] : '';
}

export function publicXCandidates(results, coach) {
 const candidates = new Map();
 for (const result of results) {
  const url = xProfileUrl(result.url);
  const title = normalize(result.title);
  const text = normalize((result.title || '') + ' ' + (result.description || ''));
  if (url && title.includes(normalize(coach.name)) && /coach|football|recruit|coordinator/i.test(result.description || '')) candidates.set(url.toLowerCase(), { url, source_url: result.url, title: result.title, description: result.description });
 }
 return [...candidates.values()];
}

export function installXEnrichment({ db, query, one, run, fetchPage, checkRobots, search }) {
 db.exec(`CREATE TABLE IF NOT EXISTS x_enrichment_state(id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''); INSERT OR IGNORE INTO x_enrichment_state(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS x_enrichment_progress(coach_id INTEGER PRIMARY KEY REFERENCES coaches(id), status TEXT NOT NULL, x_url TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');`);
 const cache = new Map(); let busy = false;
 const sameHost = (a, b) => new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
 async function page(url) {
  if (!cache.has(url)) {
   if (cache.size > 30) cache.clear();
   cache.set(url, (async () => { await checkRobots(url); const result = await fetchPage(url); if (!sameHost(url, result.url)) throw Error('Cross-domain source needs review'); return result; })());
  }
  return cache.get(url);
 }
 function record(coach, status, value = '', source = '', detail = '') {
  run('INSERT OR REPLACE INTO x_enrichment_progress(coach_id,status,x_url,source_url,checked_at,detail) VALUES(?,?,?,?,?,?)', coach.id, status, value, source, new Date().toISOString(), detail);
 }
 function save(coach, value, source) {
  db.exec('BEGIN IMMEDIATE');
  try {
   const fresh = one('SELECT * FROM coaches WHERE id=?', coach.id);
   if (!fresh || fresh.manual_lock || fresh.x_url) { record(coach, 'preserved', '', source, 'Existing link or manual edit preserved'); }
   else {
    run("UPDATE coaches SET x_url=? WHERE id=? AND x_url='' AND manual_lock=0", value, coach.id);
    record(coach, 'added', value, source, 'Account explicitly attributed by the official athletics source');
    run('INSERT INTO collection_evidence(school_id,coach_id,source_url,observed_at,payload,decision) VALUES(?,?,?,?,?,?)', coach.school_id, coach.id, source, new Date().toISOString(), JSON.stringify({name:coach.name,x_url:value,kind:'x_enrichment'}), 'x_matched');
   }
   db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
 }
 async function processCoach(coach) {
  try {
   if (!coach.staff_url) { record(coach, 'review', '', '', 'Missing official school directory'); return; }
   const directory = await page(coach.staff_url);
   const rows = parseDirectory(directory.html, directory.url).filter(row => normalize(row.name) === normalize(coach.name));
   if (rows.length !== 1 || normalize(rows[0].role) !== normalize(coach.role)) { record(coach, 'review', '', directory.url, 'Current coach and role could not be matched in the official directory'); return; }
   const row = rows[0];
   if (!row.uncertain && xProfileUrl(row.x_url)) { save(coach, xProfileUrl(row.x_url), directory.url); return; }
   if (row.profile_url && sameHost(row.profile_url, directory.url)) {
    const profile = await page(row.profile_url), value = namedProfileX(profile.html, profile.url, coach.name);
    if (value) { save(coach, value, profile.url); return; }
   }
   if (!processEnvSearch()) { record(coach, 'no_public_match', '', directory.url, 'No named X link on official source; public search not configured'); return; }
   const results = await search('"' + coach.name + '" "' + coach.school + '" football Twitter X', 8);
   // Indexed public X accounts are evidence candidates. Never publish based on a search snippet alone.
   const candidates = publicXCandidates(results, coach);
   const officialResults = results.filter(r => { try { return sameHost(r.url, directory.url) && normalize(r.title).startsWith(normalize(coach.name)) && /\/sports\/(football|fball)\/|\/staff-directory\//i.test(new URL(r.url).pathname) && !/\/20\d{2}(?:[/-]|$)/.test(new URL(r.url).pathname); } catch { return false; } }).slice(0, 2);
   for (const result of officialResults) {
    const official = await page(result.url), value = namedProfileX(official.html, official.url, coach.name);
    if (value) { save(coach, value, official.url); return; }
   }
   record(coach, candidates.length ? 'review' : 'no_public_match', '', directory.url, candidates.length ? 'Public X candidate needs identity confirmation' : 'No explicitly attributed public account found');
   for (const candidate of candidates) run('INSERT INTO collection_evidence(school_id,coach_id,source_url,observed_at,payload,decision) VALUES(?,?,?,?,?,?)', coach.school_id, coach.id, candidate.source_url, new Date().toISOString(), JSON.stringify({name:coach.name,school:coach.school,candidate_x_url:candidate.url,title:candidate.title,description:candidate.description,kind:'x_candidate'}), 'review');
  } catch (e) {
   const detail = String(e.message).slice(0, 400);
   if (/Search HTTP (401|402|403|429|5\d\d)/.test(detail)) { run('UPDATE x_enrichment_state SET enabled=0,error=? WHERE id=1', detail); return; }
   record(coach, 'review', '', coach.staff_url, detail);
  }
 }
 const processEnvSearch = () => Boolean(process.env.BRAVE_SEARCH_API_KEY);
 async function tick() {
  if (busy || !one('SELECT enabled FROM x_enrichment_state WHERE id=1').enabled) return;
  busy = true;
  try {
   const coach = one("SELECT c.*,s.name school,s.staff_url FROM coaches c JOIN schools s ON s.id=c.school_id LEFT JOIN x_enrichment_progress p ON p.coach_id=c.id WHERE c.x_url='' AND c.manual_lock=0 AND p.coach_id IS NULL ORDER BY s.name,c.name,c.id LIMIT 1");
   if (coach) await processCoach(coach); else run('UPDATE x_enrichment_state SET enabled=0 WHERE id=1');
  } finally { busy = false; }
 }
 const timer = setInterval(() => tick().catch(e => { run('UPDATE x_enrichment_state SET enabled=0,error=? WHERE id=1', String(e.message).slice(0,400)); }), 10000); timer.unref();
 return {
  start: () => { run("UPDATE x_enrichment_state SET enabled=1,error='' WHERE id=1"); void tick(); },
  pause: () => run('UPDATE x_enrichment_state SET enabled=0 WHERE id=1'),
  status: () => ({...one('SELECT enabled,error FROM x_enrichment_state WHERE id=1'),busy, counts:query('SELECT status,COUNT(*) count FROM x_enrichment_progress GROUP BY status'), missing:one("SELECT COUNT(*) n FROM coaches WHERE x_url=''").n, linked:one("SELECT COUNT(*) n FROM coaches WHERE x_url!=''").n, remaining:one("SELECT COUNT(*) n FROM coaches c LEFT JOIN x_enrichment_progress p ON p.coach_id=c.id WHERE c.x_url='' AND c.manual_lock=0 AND p.coach_id IS NULL").n})
 };
}
