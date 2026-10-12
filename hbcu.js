// Institutional HBCU classification only; NCAA football membership remains the existing school's division.
// EducationUSA's official list is dated February 2022. Do not represent it as current accreditation verification.
export const HBCU_SOURCE='https://educationusa.state.gov/sites/default/files/20220301_hbcu_information_sheet.pdf';
const names=[
'Alabama A&M University','Alabama State University','Miles College','Tuskegee University',
'University of Arkansas at Pine Bluff','Delaware State University','Howard University',
'Bethune-Cookman University','Edward Waters College','Florida Agricultural and Mechanical University',
'Albany State University','Clark Atlanta University','Fort Valley State University','Morehouse College','Savannah State University',
'Kentucky State University','Grambling State University','Southern University and A&M College',
'Bowie State University','Morgan State University','Alcorn State University','Jackson State University','Mississippi Valley State University',
'Prairie View A&M University','Texas Southern University','Hampton University','Norfolk State University','Virginia State University','Virginia Union University',
'Bluefield State College','West Virginia State University','Elizabeth City State University','Fayetteville State University','Johnson C Smith University','Livingstone College',
'North Carolina A&T State University','North Carolina Central University','Saint Augustine’s University','Shaw University','Winston-Salem State University',
'Central State University','Allen University','Benedict College','Lane College','Tennessee State University'
];
export const schoolKey=s=>String(s||'').toLowerCase().replace(/\b(university|college|the|of|at|and)\b/g,'').replace(/[^a-z0-9]/g,'');
const keys=new Set(names.map(schoolKey));
for(const alias of ['Florida A&M','FAMU','Southern','Southern University','Edward Waters University','Bluefield State University','Arkansas-Pine Bluff','North Carolina A&T','NC A&T','NC Central','South Carolina State University'])keys.add(schoolKey(alias));
export function isHbcu(s){
 if(!['FBS','FCS','D2','D3'].includes(s.division))return false;
 const key=schoolKey(s.name);if(keys.has(key))return true;
 if(/^lincoln(?:\s+university)?\s*\((?:pa|mo|pennsylvania|missouri)\)$/i.test(s.name)||/^lincoln/.test(key)&&['PA','MO'].includes(String(s.state).toUpperCase())||key==='lincoln'&&s.division==='D2'&&/CIAA|GLVC|central intercollegiate|great lakes valley/i.test(s.conference||''))return true;
 return false;
}
export function installHbcu(db){
 for(const [name,type] of [['is_hbcu','INTEGER NOT NULL DEFAULT 0'],['hbcu_source_url',"TEXT DEFAULT ''"],['hbcu_verified_at',"TEXT DEFAULT ''"]])if(!db.prepare('PRAGMA table_info(schools)').all().some(c=>c.name===name))db.exec('ALTER TABLE schools ADD COLUMN '+name+' '+type);
 const stamp=new Date().toISOString();for(const s of db.prepare('SELECT * FROM schools').all())if(isHbcu(s))db.prepare('UPDATE schools SET is_hbcu=1,hbcu_source_url=?,hbcu_verified_at=? WHERE id=? AND is_hbcu=0').run(HBCU_SOURCE,stamp,s.id);
}
