import crypto from 'node:crypto';
export function installAssistantAccess({db,one,run,body,json,passwordHash,env=process.env}){
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'))db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'");
 db.exec('CREATE TABLE IF NOT EXISTS assistant_invites_used(token_hash TEXT PRIMARY KEY,used_at TEXT DEFAULT CURRENT_TIMESTAMP)');
 const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
 return async(req,res,p,method)=>{
  if(p!=='/api/activate')return false;
  if(method!=='POST'){json(res,405,{error:'Use the activation form'});return true}
  const b=await body(req),token=String(b.token||''),expected=env.KPS_ASSISTANT_INVITE_HASH||'',email=env.KPS_ASSISTANT_EMAIL||'',expires=Number(env.KPS_ASSISTANT_INVITE_EXPIRES||0);
  const received=digest(token);
  if(!/^[a-f0-9]{64}$/.test(expected)||!email||Date.now()>expires||!crypto.timingSafeEqual(Buffer.from(received,'hex'),Buffer.from(expected,'hex'))||one('SELECT token_hash FROM assistant_invites_used WHERE token_hash=?',received)){
   json(res,400,{error:'This setup link is invalid, expired, or already used. Ask Mark for a new link.'});return true;
  }
  const password=String(b.password||'');
  if(password.length<12||password.length>128){json(res,400,{error:'Choose a password between 12 and 128 characters.'});return true}
  if(one('SELECT id FROM users WHERE lower(username)=lower(?)',email)){json(res,409,{error:'This login already exists. Sign in with your existing password.'});return true}
  const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(password,salt);
  db.exec('BEGIN');try{
   run("INSERT INTO users(username,salt,hash,role) VALUES(?,?,?,'security_assistant')",email.toLowerCase(),salt,hash);
   run('INSERT INTO assistant_invites_used(token_hash) VALUES(?)',received);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  json(res,201,{ok:true,username:email.toLowerCase()});return true;
 };
}
export function assistantAllowed(path,method){
 return (path==='/api/security/leads'&&['GET','POST'].includes(method))||(/^\/api\/security\/leads\/\d+$/.test(path)&&method==='PATCH')||(/^\/api\/security\/leads\/\d+\/activity$/.test(path)&&method==='POST')||(path==='/api/logout'&&method==='POST');
}
