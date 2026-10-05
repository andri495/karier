import { authorize } from "@/lib/auth";
import { getDB, withTransaction, type Database } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type DB = Database;
const channels=["cash","DANA","OVO","GoPay","bank","other"] as const;
const validChannel=(c:string)=>channels.includes(c as typeof channels[number]);
const serial=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7));
const validDate=(s:string)=>/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
type Pay={amount:number;paidDate:string;startMonth:string;channel:string};
type Cash={kind:string;amount:number;date:string;channel:string};
type Loan={id:string;amount:number;date:string;channel:string};
type Repayment={loanId:string;amount:number;date:string;channel:string};
type Transfer={amount:number;date:string;fromChannel:string;toChannel:string};
async function snapshot(db:DB,date:string) {
  const [p,e,l,r,t]=await Promise.all([
    db.prepare("SELECT amount,paid_date AS \"paidDate\",start_month AS \"startMonth\",channel FROM payments WHERE paid_date<=?").bind(date).all<Pay>(),
    db.prepare("SELECT kind,amount,date,channel FROM cash_entries WHERE date<=?").bind(date).all<Cash>(),
    db.prepare("SELECT id,amount,date,channel FROM loans WHERE date<=?").bind(date).all<Loan>(),
    db.prepare("SELECT loan_id AS \"loanId\",amount,date,channel FROM repayments WHERE date<=?").bind(date).all<Repayment>(),
    db.prepare("SELECT amount,date,from_channel AS \"fromChannel\",to_channel AS \"toChannel\" FROM transfers WHERE date<=?").bind(date).all<Transfer>(),
  ]);
  const balances:Record<string,number>=Object.fromEntries(channels.map(c=>[c,0]));
  for(const x of p.results)balances[x.channel]=(balances[x.channel]||0)+x.amount;
  for(const x of e.results)balances[x.channel]=(balances[x.channel]||0)+(x.kind==="income"?x.amount:-x.amount);
  for(const x of l.results)balances[x.channel]=(balances[x.channel]||0)-x.amount;
  for(const x of r.results)balances[x.channel]=(balances[x.channel]||0)+x.amount;
  for(const x of t.results){balances[x.fromChannel]=(balances[x.fromChannel]||0)-x.amount;balances[x.toChannel]=(balances[x.toChannel]||0)+x.amount;}
  const period=serial(date),blocked=p.results.reduce((sum,x)=>sum+x.amount-Math.min(x.amount,Math.max(0,period-serial(x.startMonth)+1)*5000),0);
  return {balances,available:Object.values(balances).reduce((a,b)=>a+b,0)-blocked,loans:l.results,repayments:r.results};
}

const channelLabel = (c: string) => ({ cash: "Tunai", DANA: "DANA", OVO: "OVO", GoPay: "GoPay", bank: "Rekening bank", other: "Dompet digital lain" }[c] || c);

function problem(message: string, status=400) { return Response.json({error:message},{status}); }
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const actual = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
    return actual.host === host;
  } catch {
    return true;
  }
}

async function get() {
  try {
    const db=getDB();
    const [residents,payments,entries,loans,repayments,transfers]=await Promise.all([
      db.prepare("SELECT id,name,block FROM residents ORDER BY block").all(),
      db.prepare("SELECT id,resident_id AS \"residentId\",amount,paid_date AS \"paidDate\",start_month AS \"startMonth\",note,channel FROM payments ORDER BY paid_date,id").all(),
      db.prepare("SELECT id,kind,amount,date,description,channel FROM cash_entries ORDER BY date,id").all(),
      db.prepare("SELECT id,borrower,amount,date,channel,note FROM loans ORDER BY date,id").all(),
      db.prepare("SELECT id,loan_id AS \"loanId\",amount,date,channel FROM repayments ORDER BY date,id").all(),
      db.prepare("SELECT id,amount,date,from_channel AS \"fromChannel\",to_channel AS \"toChannel\",note FROM transfers ORDER BY date,id").all(),
    ]);
    return Response.json({residents:residents.results,payments:payments.results,entries:entries.results,loans:loans.results,repayments:repayments.results,transfers:transfers.results,rate:5000});
  } catch(e) { console.error(e);return problem("Data belum dapat dimuat. Silakan coba lagi.",503); }
}

async function post(req: Request) {
  if(!sameOrigin(req))return problem("Asal permintaan tidak sesuai.",403);
  try {
    const db=getDB();
    const input=await req.json() as Record<string,unknown>;
    const kind=String(input.kind||"");
    if(kind==="resident") {
      const name=String(input.name||"").trim(), block=String(input.block||"").trim().toUpperCase();
      if(!name||name.length>100||!block||block.length>20)return problem("Nama dan blok wajib diisi (maksimal 100 dan 20 karakter).");
      const existing=await db.prepare("SELECT id FROM residents WHERE block=?").bind(block).first();
      if(existing)return problem("Blok tersebut sudah terdaftar.");
      await db.prepare("INSERT INTO residents (id,name,block) VALUES (?,?,?)").bind(block,name,block).run();
    } else if(kind==="payment") {
      const residentId=String(input.residentId||""),amount=Number(input.amount),paidDate=String(input.paidDate||""),startMonth=String(input.startMonth||""),channel=String(input.channel||"cash");
      if(!Number.isSafeInteger(amount)||amount<=0||amount%5000!==0||amount>100000000)return problem("Nominal harus kelipatan Rp5.000 dan lebih besar dari nol.");
      if(!validDate(paidDate)||!validChannel(channel)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth))return problem("Periksa tanggal bayar, tempat uang diterima, dan format bulan mulai.");
      if(!(await db.prepare("SELECT id FROM residents WHERE id=?").bind(residentId).first()))return problem("Warga tidak ditemukan.");
      const existing=await db.prepare("SELECT amount,start_month AS \"startMonth\" FROM payments WHERE resident_id=?").bind(residentId).all();
      const serial=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7));
      const start=serial(startMonth),end=start+amount/5000;
      if(existing.results.some(p=>start<serial(String(p.startMonth))+Number(p.amount)/5000 && serial(String(p.startMonth))<end))return problem("Periode ini sudah dibayar. Pilih bulan berikutnya agar tidak tercatat ganda.");
      await db.prepare("INSERT INTO payments (id,resident_id,amount,paid_date,start_month,note,channel) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),residentId,amount,paidDate,startMonth,String(input.note||"").trim().slice(0,180),channel).run();
    } else if(kind==="entry") {
      const type=String(input.type),amount=Number(input.amount),date=String(input.date||""),description=String(input.description||"").trim(),channel=String(input.channel||"cash");
      if(!["income","expense"].includes(type)||!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!validDate(date)||!validChannel(channel)||!description||description.length>180)return problem("Lengkapi jenis, tanggal, tempat uang, nominal, dan keterangan transaksi.");
      if(type==="expense") {
        const position=await snapshot(db,date);
        if(amount>position.available)return problem(`Kas tersedia pada tanggal tersebut hanya Rp${position.available.toLocaleString("id-ID")}. Uang muka bulan berikutnya masih diblokir.`);
        if(amount>position.balances[channel])return problem(`Saldo ${channelLabel(channel)} tidak mencukupi (tersedia: Rp${(position.balances[channel]||0).toLocaleString("id-ID")}). Pindahkan dana terlebih dahulu.`);
      }
      await db.prepare("INSERT INTO cash_entries (id,kind,amount,date,description,channel) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),type,amount,date,description,channel).run();
    } else if(kind==="loan") {
      const borrower=String(input.borrower||"").trim(),amount=Number(input.amount),date=String(input.date||""),channel=String(input.channel||""),note=String(input.note||"").trim();
      if(!borrower||borrower.length>100||!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!validDate(date)||!validChannel(channel))return problem("Isi nama peminjam, tanggal, nominal, dan sumber uang.");
      const position=await snapshot(db,date);
      const physical=Object.values(position.balances).reduce((a,b)=>a+b,0);
      if(amount>physical)return problem(`Saldo kas riil yang dapat dipinjam hanya Rp${physical.toLocaleString("id-ID")}.`);
      if(amount>position.balances[channel])return problem(`Saldo ${channelLabel(channel)} tidak mencukupi untuk pinjaman (tersedia: Rp${(position.balances[channel]||0).toLocaleString("id-ID")}).`);
      await db.prepare("INSERT INTO loans (id,borrower,amount,date,channel,note) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),borrower,amount,date,channel,note.slice(0,180)).run();
    } else if(kind==="repayment") {
      const loanId=String(input.loanId||""),amount=Number(input.amount),date=String(input.date||""),channel=String(input.channel||"");
      if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!validDate(date)||!validChannel(channel))return problem("Isi tanggal, nominal, dan tempat penerimaan pengembalian.");
      const loan=await db.prepare("SELECT amount,date FROM loans WHERE id=?").bind(loanId).first<{amount:number;date:string}>();
      if(!loan||date<loan.date)return problem("Pinjaman tidak ditemukan atau tanggal pengembalian sebelum tanggal pinjam.");
      const previous=await db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM repayments WHERE loan_id=?").bind(loanId).first<{total:number}>();
      if(amount>loan.amount-(previous?.total??0))return problem("Pengembalian melebihi sisa pinjaman.");
      await db.prepare("INSERT INTO repayments (id,loan_id,amount,date,channel) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),loanId,amount,date,channel).run();
    } else if(kind==="transfer") {
      const amount=Number(input.amount),date=String(input.date||""),from=String(input.fromChannel||""),to=String(input.toChannel||"");
      if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!validDate(date)||!validChannel(from)||!validChannel(to)||from===to)return problem("Isi nominal, tanggal, serta asal dan tujuan uang yang berbeda.");
      const position=await snapshot(db,date);
      if(amount>position.balances[from])return problem(`Saldo ${channelLabel(from)} tidak mencukupi untuk pemindahan. Saldo saat ini: Rp${(position.balances[from]||0).toLocaleString("id-ID")}.`);
      await db.prepare("INSERT INTO transfers (id,amount,date,from_channel,to_channel,note) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),amount,date,from,to,String(input.note||"").trim().slice(0,180)).run();
    } else return problem("Jenis data tidak dikenali.");
    const invalid=await timelineProblem();
    if(invalid)return problem(invalid);
    return Response.json({ok:true});
  } catch(e) { console.error(e);return problem("Data belum dapat disimpan. Silakan coba lagi.",503); }
}

async function remove(req:Request) {
  if(!sameOrigin(req))return problem("Asal permintaan tidak sesuai.",403);
  try {
    const {kind,id}=await req.json() as {kind:string,id:string};
    if(!id)return problem("ID data tidak ditemukan.");
    const db=getDB();
    if(kind==="resident") {
      const existing=await db.prepare("SELECT id FROM residents WHERE id=?").bind(id).first();
      if(!existing)return problem("Warga tidak ditemukan.");
      await db.prepare("DELETE FROM payments WHERE resident_id=?").bind(id).run();
      await db.prepare("DELETE FROM residents WHERE id=?").bind(id).run();
    } else if(kind==="payment"||kind==="entry") {
      const table=kind==="payment"?"payments":"cash_entries";
      await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
    } else if(kind==="transfer") {
      await db.prepare("DELETE FROM transfers WHERE id=?").bind(id).run();
    } else if(kind==="loan") {
      await db.prepare("DELETE FROM repayments WHERE loan_id=?").bind(id).run();
      await db.prepare("DELETE FROM loans WHERE id=?").bind(id).run();
    } else return problem("Jenis data tidak dikenali.");
    const invalid=await timelineProblem();
    if(invalid)return problem(invalid);
    return Response.json({ok:true});
  } catch(e) { console.error(e);return problem("Data belum dapat dihapus.",503); }
}

export async function POST(req:Request) {
 const denied=authorize(req);if(denied)return denied;
 if(!sameOrigin(req))return problem("Asal permintaan tidak sesuai.",403);
 try { return await withTransaction(() => post(req)); }
 catch { return problem("Penyimpanan database gagal. Coba lagi.",503); }
}
export async function DELETE(req:Request) {
 const denied=authorize(req);if(denied)return denied;
 if(!sameOrigin(req))return problem("Asal permintaan tidak sesuai.",403);
 try { return await withTransaction(() => remove(req)); }
 catch { return problem("Penyimpanan database gagal. Coba lagi.",503); }
}

async function timelineProblem() {
 const db=getDB();
 const rows=await db.prepare(`SELECT paid_date AS date,channel,amount AS delta FROM payments
 UNION ALL SELECT date,channel,CASE WHEN kind='income' THEN amount ELSE -amount END FROM cash_entries
 UNION ALL SELECT date,channel,-amount FROM loans
 UNION ALL SELECT date,channel,amount FROM repayments
 UNION ALL SELECT date,from_channel,-amount FROM transfers
 UNION ALL SELECT date,to_channel,amount FROM transfers ORDER BY date`).all<{date:string;channel:string;delta:number}>();
 const b:Record<string,number>=Object.fromEntries(channels.map(c=>[c,0]));
 let i=0;while(i<rows.results.length){const date=rows.results[i].date;while(i<rows.results.length&&rows.results[i].date===date){const x=rows.results[i++];b[x.channel]+=x.delta;}for(const c of channels)if(b[c]<0)return `Transaksi membuat saldo ${c} negatif pada ${date}. Periksa tanggal dan saldo dompet.`;}
 return null;
}
export async function GET(req:Request) {
 const denied=authorize(req);if(denied)return denied;
 try {return await get()}catch(e){console.error(e);return problem("Database belum siap. Periksa koneksi dan jalankan impor data.",503)}
}
