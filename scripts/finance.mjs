export const tables=['residents','payments','cash_entries','loans','repayments','transfers'];
export const fields={residents:['id','name','block'],payments:['id','resident_id','amount','paid_date','start_month','note','channel'],cash_entries:['id','kind','amount','date','description','channel'],loans:['id','borrower','amount','date','channel','note'],repayments:['id','loan_id','amount','date','channel'],transfers:['id','amount','date','from_channel','to_channel','note']};
export const channels=['cash','DANA','OVO','GoPay','bank','other'];
export function validDate(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}
export function financialRows(d){return [
 ...d.payments.map(x=>({date:x.paid_date,channel:x.channel,delta:x.amount})),
 ...d.cash_entries.map(x=>({date:x.date,channel:x.channel,delta:x.kind==='income'?x.amount:-x.amount})),
 ...d.loans.map(x=>({date:x.date,channel:x.channel,delta:-x.amount})),
 ...d.repayments.map(x=>({date:x.date,channel:x.channel,delta:x.amount})),
 ...d.transfers.flatMap(x=>[{date:x.date,channel:x.from_channel,delta:-x.amount},{date:x.date,channel:x.to_channel,delta:x.amount}])
 ].sort((a,b)=>a.date.localeCompare(b.date))}
export function balances(d){let b=Object.fromEntries(channels.map(c=>[c,0]));for(let x of financialRows(d))b[x.channel]+=x.delta;return b}
export function counts(d){return Object.fromEntries(tables.map(t=>[t,d[t].length]))}
export function validateSnapshot(d){
 for(let t of tables){if(!Array.isArray(d[t]))throw Error('Tabel hilang: '+t);let ids=new Set();for(let x of d[t]){for(let k of fields[t])if(!(k in x))throw Error('Kolom hilang: '+t+'.'+k);if(typeof x.id!=='string'||!x.id||ids.has(x.id))throw Error('ID tidak valid');ids.add(x.id);if(t!=='residents'){if(!Number.isSafeInteger(x.amount)||x.amount<=0||x.amount>100000000)throw Error('Nominal tidak valid');if(!validDate(t==='payments'?x.paid_date:x.date))throw Error('Tanggal tidak valid');if(t==='transfers'){if(!channels.includes(x.from_channel)||!channels.includes(x.to_channel)||x.from_channel===x.to_channel)throw Error('Transfer tidak valid')}else if(!channels.includes(x.channel))throw Error('Dompet tidak valid')}}}
 let residents=new Set(d.residents.map(x=>x.id));if(new Set(d.residents.map(x=>x.block)).size!==d.residents.length)throw Error('Blok ganda');
 for(let p of d.payments){if(!residents.has(p.resident_id)||p.amount%5000!==0||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.start_month))throw Error('Iuran tidak valid')}
 for(let e of d.cash_entries)if(!['income','expense'].includes(e.kind))throw Error('Jenis kas tidak valid');
 for(let r of d.repayments){let l=d.loans.find(l=>l.id===r.loan_id);if(!l||r.date<l.date)throw Error('Referensi pinjaman tidak valid')}
 for(let l of d.loans)if(d.repayments.filter(r=>r.loan_id===l.id).reduce((n,r)=>n+r.amount,0)>l.amount)throw Error('Pengembalian melebihi pinjaman');
 assertTimeline(d);return d;
}
export function assertTimeline(d){let b=Object.fromEntries(channels.map(c=>[c,0])),a=financialRows(d);for(let i=0;i<a.length;){let date=a[i].date;while(i<a.length&&a[i].date===date){let x=a[i++];b[x.channel]+=x.delta}for(let c of channels)if(b[c]<0)throw Error('Saldo '+c+' negatif pada '+date)}return b}
export function compareSnapshot(expected,actual){for(let t of tables){let sort=a=>[...a].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>fields[t].map(k=>r[k]));if(JSON.stringify(sort(expected[t]))!==JSON.stringify(sort(actual[t])))throw Error('Isi tabel berbeda: '+t)}return true}
