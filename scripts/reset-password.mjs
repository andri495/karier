import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
let client;

if (connectionString) {
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
} else {
  const pgliteDir = fileURLToPath(new URL('../database/pglite_db', import.meta.url));
  await mkdir(pgliteDir, { recursive: true });
  const db = new PGlite(pgliteDir);
  client = {
    connect: async () => {},
    query: async (sql, params) => {
      if (!params || params.length === 0) {
        const res = await db.exec(sql);
        return res.at(-1) || { rows: [] };
      }
      return db.query(sql, params);
    },
    end: async () => db.close(),
  };
}

const newPasswordArg = process.argv[2];
const newUsernameArg = process.argv[3];

const targetUsername = newUsernameArg || process.env.KARIER_ADMIN_USER || 'admin';
const targetPassword = newPasswordArg || process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456';

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_auth (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(targetPassword, salt);
  const now = new Date().toISOString();

  await client.query('DELETE FROM admin_auth');
  await client.query(
    'INSERT INTO admin_auth (username, password_hash, salt, updated_at) VALUES ($1, $2, $3, $4)',
    [targetUsername, hash, salt, now]
  );

  // Simpan permanen ke database/admin_auth.json
  const authFilePath = fileURLToPath(new URL('../database/admin_auth.json', import.meta.url));
  await writeFile(
    authFilePath,
    JSON.stringify({
      username: targetUsername,
      password_hash: hash,
      salt,
      updated_at: now,
      plain_password: targetPassword,
    }, null, 2),
    'utf8'
  );

  // Sinkronisasi ke .env.local jika ada
  const envFilePath = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (existsSync(envFilePath)) {
    try {
      let envContent = await readFile(envFilePath, 'utf8');
      envContent = envContent.replace(/^KARIER_ADMIN_USER=.*$/m, `KARIER_ADMIN_USER=${targetUsername}`);
      envContent = envContent.replace(/^KARIER_ADMIN_PASSWORD=.*$/m, `KARIER_ADMIN_PASSWORD=${targetPassword}`);
      await writeFile(envFilePath, envContent, 'utf8');
    } catch {}
  }

  console.log('\n========================================');
  console.log('✓ Kata sandi pengurus berhasil disimpan permanen!');
  console.log('========================================');
  console.log(`Nama Pengurus (Username) : ${targetUsername}`);
  console.log(`Kata Sandi Baru (Password) : ${targetPassword}`);
  console.log('Tersimpan di : Database, database/admin_auth.json & .env.local');
  console.log('========================================\n');
} catch (e) {
  console.error('Gagal mereset kata sandi:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
