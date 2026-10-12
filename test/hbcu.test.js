import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {isHbcu,installHbcu} from '../hbcu.js';
test('HBCU classification matches names and institutional aliases without changing division',()=>{
 for(const name of ['Howard University','Florida A&M','South Carolina State University','Bluefield State University','North Carolina A&T State University'])assert.equal(isHbcu({name,division:'FCS'}),true);
 assert.equal(isHbcu({name:'Florida State University',division:'FBS'}),false);
 assert.equal(isHbcu({name:'Southern Connecticut State University',division:'D2'}),false);
 assert.equal(isHbcu({name:'Howard University',division:'NAIA'}),false);
 assert.equal(isHbcu({name:'Lincoln University',state:'CA',division:'D2'}),false);
});
test('additive HBCU migration preserves original school IDs, divisions, and rows',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE schools(id INTEGER PRIMARY KEY,name TEXT,division TEXT,state TEXT,conference TEXT);INSERT INTO schools VALUES(4,'Howard University','FCS','DC','MEAC'),(5,'Example University','D2','CA','');");installHbcu(db);installHbcu(db);
 const rows=db.prepare('SELECT * FROM schools ORDER BY id').all();assert.equal(rows.length,2);assert.equal(rows[0].id,4);assert.equal(rows[0].division,'FCS');assert.equal(rows[0].is_hbcu,1);assert.equal(rows[1].is_hbcu,0);assert.ok(rows[0].hbcu_source_url);db.close();
});
