const roleText=role=>String(role||'').toLowerCase().replace(/[–—-]/g,' ');
export function coachCategory(role){
 const r=roleText(role);
 if(/\b(strength|conditioning|sports? performance|athletic train|sports? medicine|physician|equipment|film|video|communications?|operations|nutrition|academic|business|administrative|executive assistant|assistant to)\b/.test(r))return 'support';
 if(/\b(head\s+(football\s+)?coach|head coaching)\b/.test(r)&&! /\b(assistant|associate)\s+head\b/.test(r))return 'head';
 if(/\b(offensive|defensive|special teams|offense|defense|run game|pass game|passing game|running game)(?:\s+(?:run|pass|passing|running)\s+game)?\s+(coordinator|coord\b)/.test(r)||/\bco\s+(offensive|defensive)\s+coordinator/.test(r))return 'coordinator';
 if(/\b(defensive\s+(line(?:men)?|ends?|tackles?|backs?)|offensive\s+line(?:men)?|linebackers?|quarterbacks?|running\s+backs?|wide\s+receivers?|tight\s+ends?|cornerbacks?|safet(?:y|ies)|edge|special\s+teams|dl|de|dt|lb|ilb|olb|db|cb|qb|rb|wr|te|ol|d\s+line)\b/.test(r))return 'position';
 if(/\bcoach(?:ing)?\b/.test(r)||/\b(offensive|defensive|football)\s+(graduate\s+)?assistant\b/.test(r)||/\b(quality control|graduate assistant)\b/.test(r))return 'assistant';
 if(/\brecruit(?:ing|ment|er)\b/.test(r)||/\bplayer personnel\b/.test(r))return 'recruiting';
 return r.trim()?'support':'unknown';
}
export const isFootballCoachRole=role=>['head','coordinator','position','assistant'].includes(coachCategory(role));
export function matchesContactType(role,type='coaching'){if(type==='all')return true;if(type==='coaching')return isFootballCoachRole(role);return coachCategory(role)===type;}
export const categoryLabels={head:'Head Coach',coordinator:'Coordinator',position:'Position Coach',assistant:'Assistant Coach',recruiting:'Recruiting Staff',support:'Support Staff',unknown:'Role Not Listed'};
const rank={head:0,coordinator:1,position:2,assistant:3,recruiting:4,support:5,unknown:6};
export function compareCoaches(a,b){return rank[coachCategory(a.role)]-rank[coachCategory(b.role)]||String(a.name).localeCompare(String(b.name),'en',{sensitivity:'base'});}
