import {resolve} from 'node:path';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {tables,fields,validateSnapshot,balances,counts,compareSnapshot} from './finance.mjs';

const connectionString=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
let client;
if(connectionString){
  client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
} else {
  const pgliteDir=new URL('../database/pglite_db',import.meta.url).pathname;
  await mkdir(pgliteDir,{recursive:true});
  const db=new PGlite(pgliteDir);
  client={
    connect:async()=>{},
    query:async(sql,params)=>{
      if(!params||params.length===0){
        const res=await db.exec(sql);
        return res.at(-1)||{rows:[]};
      }
      return db.query(sql,params);
    },
    end:async()=>db.close()
  };
}

async function readSnapshot(){return validateSnapshot(JSON.parse(await readFile(process.argv.includes('--file')?resolve(process.argv[process.argv.indexOf('--file')+1]):new URL('../database/snapshot.json',import.meta.url),'utf8')))}
async function dump(){let d={};for(let t of tables)d[t]=(await client.query('SELECT * FROM '+t+' ORDER BY id')).rows;return d}
try{await client.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(20261002,5000)');let command=process.argv[2];
 if(command==='init'){await client.query(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));console.log('Skema PostgreSQL siap. Tidak ada data lama dihapus.')}
 else if(command==='import'){let expected=await readSnapshot(),current=await dump();let total=Object.values(counts(current)).reduce((a,b)=>a+b,0);if(total){compareSnapshot(expected,current);console.log('Database sudah sesuai snapshot. Tidak diimpor ulang.')}else{for(let t of tables)for(let r of expected[t]){let keys=fields[t];await client.query(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>r[k]))}compareSnapshot(expected,await dump());console.log('Impor selesai; seluruh baris dan kolom sama dengan snapshot.')}console.log(JSON.stringify({counts:counts(expected),balances:balances(expected)},null,2))}
 else if(command==='verify'){let actual=validateSnapshot(await dump());if(process.argv.includes('--snapshot'))compareSnapshot(await readSnapshot(),actual);console.log(JSON.stringify({counts:counts(actual),balances:balances(actual),total:Object.values(balances(actual)).reduce((a,b)=>a+b,0)},null,2))}
 else if(command==='backup'){let d=validateSnapshot(await dump()),dir=new URL('../backups/',import.meta.url);await mkdir(dir,{recursive:true});let filename='karier-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';await writeFile(new URL(filename,dir),JSON.stringify(d,null,2));console.log('Cadangan dibuat di backups/'+filename)}
 else throw Error('Gunakan init, import, verify atau backup.');await client.query('COMMIT');
}catch(e){try{await client.query('ROLLBACK')}catch{}console.error('Proses dibatalkan:',e.code||'',e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[alamat database disembunyikan]'));process.exitCode=1}finally{await client.end()}
