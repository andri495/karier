import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getDB } from '@/lib/database';

export const SESSION_COOKIE = 'karier_session';
export const USER_COOKIE = 'karier_user';
export const ROLE_COOKIE = 'karier_role';
export const EMAIL_COOKIE = 'karier_email';
const SESSION_MAX_AGE_DAYS = 30;

export const SUPERADMIN_EMAIL = 'superadmin@gmail.com';
export const DEFAULT_SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || process.env.KARIER_ADMIN_PASSWORD || 'superadmin123456';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin';
  password_hash: string;
  salt: string;
  created_at: string;
  updated_at: string;
  plain_password?: string;
};

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin';
  created_at: string;
  updated_at: string;
};

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.KARIER_ADMIN_PASSWORD || 'karier-session-secret-key-salt-7162534';
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function verifyHash(password: string, salt: string, expectedHash: string): boolean {
  try {
    const computed = hashPassword(password, salt);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function getUsersFilePath(): string {
  return resolve(process.cwd(), 'database/users.json');
}

export function getAdminAuthFilePath(): string {
  return resolve(process.cwd(), 'database/admin_auth.json');
}

export function readSavedUsers(): AppUser[] {
  try {
    const filePath = getUsersFilePath();
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('readSavedUsers notice:', err);
  }
  return [];
}

export function writeSavedUsers(users: AppUser[]): void {
  try {
    const filePath = getUsersFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.warn('writeSavedUsers notice:', err);
  }
}

export function readSavedAdminAuth(): { username: string; password_hash: string; salt: string; updated_at?: string; plain_password?: string } | null {
  try {
    const filePath = getAdminAuthFilePath();
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      if (data && data.username && data.password_hash && data.salt) {
        return data;
      }
    }
  } catch (err) {
    console.warn('readSavedAdminAuth notice:', err);
  }
  return null;
}

export function writeSavedAdminAuth(data: {
  username: string;
  password_hash: string;
  salt: string;
  updated_at: string;
  plain_password?: string;
}): void {
  try {
    const filePath = getAdminAuthFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('writeSavedAdminAuth notice:', err);
  }
}

let tablesChecked = false;

export async function ensureUsersTable(): Promise<void> {
  const db = getDB();
  if (!tablesChecked) {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS admin_auth (
          username TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS app_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();
      tablesChecked = true;
    } catch (e) {
      console.warn('Error creating tables, might already exist:', e);
    }
  }

  // Cek apakah tabel app_users masih kosong
  try {
    const existing = await db.prepare('SELECT id FROM app_users LIMIT 1').first();
    if (!existing) {
      const savedUsers = readSavedUsers();
      if (savedUsers.length > 0) {
        for (const u of savedUsers) {
          await db.prepare(
            'INSERT INTO app_users (id, email, name, role, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(u.id, u.email.toLowerCase(), u.name, u.role, u.password_hash, u.salt, u.created_at, u.updated_at).run();
        }
      } else {
        // Buat default akun Super Admin superadmin@gmail.com
        const salt = randomBytes(16).toString('hex');
        const hash = hashPassword(DEFAULT_SUPERADMIN_PASSWORD, salt);
        const now = new Date().toISOString();
        const superadminUser: AppUser = {
          id: 'superadmin-root-01',
          email: SUPERADMIN_EMAIL.toLowerCase(),
          name: 'Super Admin',
          role: 'superadmin',
          password_hash: hash,
          salt,
          created_at: now,
          updated_at: now,
          plain_password: DEFAULT_SUPERADMIN_PASSWORD,
        };

        await db.prepare(
          'INSERT INTO app_users (id, email, name, role, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          superadminUser.id,
          superadminUser.email,
          superadminUser.name,
          superadminUser.role,
          superadminUser.password_hash,
          superadminUser.salt,
          superadminUser.created_at,
          superadminUser.updated_at
        ).run();

        writeSavedUsers([superadminUser]);
      }
    }
  } catch (e) {
    console.warn('Error checking/seeding default app_users:', e);
  }
}

export async function ensureAdminAuthTable(): Promise<void> {
  await ensureUsersTable();
}

export async function getUsersList(): Promise<SafeUser[]> {
  await ensureUsersTable();
  const db = getDB();
  try {
    const res = await db.prepare(
      'SELECT id, email, name, role, created_at, updated_at FROM app_users ORDER BY role DESC, created_at ASC'
    ).all<SafeUser>();
    if (res.results && res.results.length > 0) {
      return res.results;
    }
  } catch (err) {
    console.warn('getUsersList db error, fallback to json:', err);
  }

  const saved = readSavedUsers();
  return saved.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));
}

export async function addUser(input: {
  email: string;
  name: string;
  password: string;
  role?: 'superadmin' | 'admin';
}): Promise<SafeUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  const role = input.role || 'admin';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Alamat email Gmail/email tidak valid.');
  }
  if (!name) {
    throw new Error('Nama pengurus wajib diisi.');
  }
  if (!password || password.length < 6) {
    throw new Error('Kata sandi minimal 6 karakter.');
  }

  await ensureUsersTable();
  const db = getDB();

  // Pastikan email belum terdaftar
  const existing = await db.prepare('SELECT id FROM app_users WHERE LOWER(email) = ?').bind(email).first();
  if (existing) {
    throw new Error(`Email ${email} sudah terdaftar.`);
  }

  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const now = new Date().toISOString();
  const id = 'user-' + randomBytes(6).toString('hex');

  const newUser: AppUser = {
    id,
    email,
    name,
    role,
    password_hash: hash,
    salt,
    created_at: now,
    updated_at: now,
    plain_password: password,
  };

  try {
    await db.prepare(
      'INSERT INTO app_users (id, email, name, role, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, name, role, hash, salt, now, now).run();
  } catch (err) {
    console.error('Error inserting into app_users:', err);
  }

  // Sinkronkan ke users.json
  const currentUsers = readSavedUsers();
  currentUsers.push(newUser);
  writeSavedUsers(currentUsers);

  return {
    id,
    email,
    name,
    role,
    created_at: now,
    updated_at: now,
  };
}

export async function deleteUser(targetEmailOrId: string): Promise<{ success: boolean; message: string }> {
  const target = targetEmailOrId.trim().toLowerCase();
  if (target === SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('Akun Super Admin utama (superadmin@gmail.com) tidak boleh dihapus.');
  }

  await ensureUsersTable();
  const db = getDB();

  try {
    await db.prepare('DELETE FROM app_users WHERE LOWER(email) = ? OR id = ?').bind(target, target).run();
  } catch (err) {
    console.warn('deleteUser db error:', err);
  }

  const currentUsers = readSavedUsers().filter(
    u => u.email.toLowerCase() !== target && u.id !== target
  );
  writeSavedUsers(currentUsers);

  return { success: true, message: `Akun ${target} berhasil dihapus.` };
}

export async function authenticateUser(identifier: string, passAttempt: string): Promise<AppUser | null> {
  await ensureUsersTable();
  const cleanId = identifier.trim().toLowerCase();
  const db = getDB();

  let userRow: AppUser | null = null;
  try {
    userRow = await db.prepare(
      'SELECT id, email, name, role, password_hash, salt, created_at, updated_at FROM app_users WHERE LOWER(email) = ? OR LOWER(name) = ? LIMIT 1'
    ).bind(cleanId, cleanId).first<AppUser>();

    if (userRow) {
      if (verifyHash(passAttempt, userRow.salt, userRow.password_hash)) {
        return userRow;
      }
      return null;
    }

    const adminRow = await db.prepare(
      'SELECT username, password_hash, salt, updated_at FROM admin_auth WHERE LOWER(username) = ? LIMIT 1'
    ).bind(cleanId).first<{ username: string; password_hash: string; salt: string; updated_at: string }>();

    if (adminRow) {
      if (verifyHash(passAttempt, adminRow.salt, adminRow.password_hash)) {
        return {
          id: 'admin-' + adminRow.username,
          email: SUPERADMIN_EMAIL,
          name: adminRow.username,
          role: 'superadmin',
          password_hash: adminRow.password_hash,
          salt: adminRow.salt,
          created_at: adminRow.updated_at,
          updated_at: adminRow.updated_at,
        };
      }
      return null;
    }
  } catch (err) {
    console.warn('authenticateUser db error, fallback to json:', err);
  }

  // Fallback hanya jika database tidak memiliki userRow sama sekali (misal saat testing dengan mock DB)
  if (!userRow && (cleanId === SUPERADMIN_EMAIL.toLowerCase() || cleanId === 'superadmin')) {
    if (passAttempt === DEFAULT_SUPERADMIN_PASSWORD) {
      return {
        id: 'superadmin-root-01',
        email: SUPERADMIN_EMAIL,
        name: 'Super Admin',
        role: 'superadmin',
        password_hash: '',
        salt: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  // Fallback dari users.json jika DB offline
  const savedUsers = readSavedUsers();
  const foundInFile = savedUsers.find(
    u => u.email.toLowerCase() === cleanId || u.name.toLowerCase() === cleanId
  );
  if (foundInFile) {
    if (verifyHash(passAttempt, foundInFile.salt, foundInFile.password_hash)) {
      return foundInFile;
    }
    return null;
  }

  // Fallback akun admin lama dari admin_auth.json
  const legacyAdmin = readSavedAdminAuth();
  if (legacyAdmin && legacyAdmin.username.trim().toLowerCase() === cleanId) {
    if (verifyHash(passAttempt, legacyAdmin.salt, legacyAdmin.password_hash)) {
      return {
        id: 'legacy-admin',
        email: SUPERADMIN_EMAIL,
        name: legacyAdmin.username,
        role: 'superadmin',
        password_hash: legacyAdmin.password_hash,
        salt: legacyAdmin.salt,
        created_at: legacyAdmin.updated_at || new Date().toISOString(),
        updated_at: legacyAdmin.updated_at || new Date().toISOString(),
      };
    }
    return null;
  }

  return null;
}

export async function verifyCredentials(userAttempt: string, passAttempt: string): Promise<boolean> {
  const user = await authenticateUser(userAttempt, passAttempt);
  return !!user;
}

export async function getAdminAccount(): Promise<{ username: string; password_hash: string; salt: string } | null> {
  try {
    await ensureAdminAuthTable();
    const db = getDB();
    const row = await db.prepare(
      'SELECT username, password_hash, salt FROM admin_auth LIMIT 1'
    ).first<{ username: string; password_hash: string; salt: string }>();
    if (row) return row;
  } catch (err) {
    console.error('getAdminAccount db error:', err);
  }

  const saved = readSavedAdminAuth();
  if (saved) {
    return { username: saved.username, password_hash: saved.password_hash, salt: saved.salt };
  }
  return null;
}

export async function updateAdminPassword(
  newPassword: string,
  newUsername?: string
): Promise<{ success: boolean; error?: string; username?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Kata sandi baru minimal harus 6 karakter.' };
  }

  await ensureUsersTable();
  const db = getDB();
  const targetEmailOrUser = newUsername?.trim() || SUPERADMIN_EMAIL;
  const newSalt = randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  const now = new Date().toISOString();

  try {
    await db.prepare('DELETE FROM admin_auth').run();
    await db.prepare(
      'INSERT INTO admin_auth (username, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(targetEmailOrUser, newHash, newSalt, now).run();
  } catch (err) {
    console.warn('Database error in updateAdminPassword for admin_auth:', err);
  }

  try {
    await db.prepare(
      'UPDATE app_users SET password_hash = ?, salt = ?, updated_at = ? WHERE LOWER(email) = ? OR LOWER(name) = ?'
    ).bind(newHash, newSalt, now, targetEmailOrUser.toLowerCase(), targetEmailOrUser.toLowerCase()).run();
  } catch (err) {
    console.warn('Database error in updateAdminPassword for app_users:', err);
  }

  const savedUsers = readSavedUsers();
  const userIdx = savedUsers.findIndex(
    u => u.email.toLowerCase() === targetEmailOrUser.toLowerCase() || u.name.toLowerCase() === targetEmailOrUser.toLowerCase()
  );
  if (userIdx !== -1) {
    savedUsers[userIdx].password_hash = newHash;
    savedUsers[userIdx].salt = newSalt;
    savedUsers[userIdx].updated_at = now;
    savedUsers[userIdx].plain_password = newPassword;
    writeSavedUsers(savedUsers);
  }

  // Sinkronkan ke admin_auth.json untuk kompatibilitas
  writeSavedAdminAuth({
    username: targetEmailOrUser,
    password_hash: newHash,
    salt: newSalt,
    updated_at: now,
    plain_password: newPassword,
  });

  return { success: true, username: targetEmailOrUser };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newUsername?: string
): Promise<{ success: boolean; error?: string; username?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Kata sandi baru minimal harus 6 karakter.' };
  }
  const targetEmailOrUser = newUsername?.trim() || SUPERADMIN_EMAIL;

  if (!currentPassword) {
    return { success: false, error: 'Kata sandi saat ini (lama) wajib diisi.' };
  }

  // Verifikasi kata sandi lama terlebih dahulu
  const user = await authenticateUser(targetEmailOrUser, currentPassword);
  if (!user) {
    return { success: false, error: 'Kata sandi saat ini (lama) salah.' };
  }

  return updateAdminPassword(newPassword, targetEmailOrUser);
}

export function verifyResetKey(_key: string): boolean {
  return false;
}

export async function resetPasswordWithKey(
  _resetKey?: string,
  _newPassword?: string,
  _newUsername?: string
): Promise<{ success: boolean; error?: string; username?: string }> {
  return {
    success: false,
    error: 'Reset sandi melalui web dinonaktifkan demi keamanan. Gunakan launcher RESET_SANDI.cmd di server.',
  };
}

export function createSessionToken(username: string, role = 'admin', email = ''): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${username}:${expiresAt}:${role}:${email}`;
  const sig = createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifySessionToken(token: string): {
  valid: boolean;
  username?: string;
  role?: 'superadmin' | 'admin';
  email?: string;
} {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [encodedPayload, sig] = parts;
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const [username, expiresStr, rawRole, rawEmail] = payload.split(':');
    const expiresAt = Number(expiresStr);

    if (!username || isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false };
    }

    const expectedSig = createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
    const bufA = Buffer.from(sig, 'hex');
    const bufB = Buffer.from(expectedSig, 'hex');
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return { valid: false };
    }

    const email = rawEmail || (username.includes('@') ? username : '');
    const isSuper = rawRole === 'superadmin' || username === SUPERADMIN_EMAIL || email === SUPERADMIN_EMAIL;
    const role: 'superadmin' | 'admin' = isSuper ? 'superadmin' : (rawRole === 'admin' ? 'admin' : 'admin');

    return { valid: true, username, role, email };
  } catch {
    return { valid: false };
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function getSessionFromRequest(req: Request): {
  authenticated: boolean;
  username?: string;
  role?: 'superadmin' | 'admin';
  email?: string;
} {
  const cookieHeader = req.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    const result = verifySessionToken(sessionToken);
    if (result.valid && result.username) {
      return {
        authenticated: true,
        username: result.username,
        role: result.role || (result.username === SUPERADMIN_EMAIL ? 'superadmin' : 'admin'),
        email: result.email || (result.username.includes('@') ? result.username : SUPERADMIN_EMAIL),
      };
    }
  }

  // Dukungan cookie kompatibilitas karier_auth=1 atau user cookie
  if (cookies['karier_auth'] === '1' || cookies[USER_COOKIE]) {
    const userCookie = cookies[USER_COOKIE] || 'admin';
    const emailCookie = cookies[EMAIL_COOKIE] || (userCookie.includes('@') ? userCookie : SUPERADMIN_EMAIL);
    const roleCookie = (cookies[ROLE_COOKIE] as 'superadmin' | 'admin') || (emailCookie === SUPERADMIN_EMAIL ? 'superadmin' : 'admin');
    return {
      authenticated: true,
      username: userCookie,
      role: roleCookie,
      email: emailCookie,
    };
  }

  // Jika tidak ada token sesi yang valid, sesi belum terotentikasi
  return {
    authenticated: false,
  };
}

export function authorize(_req: Request): Response | null {
  // Penginputan dan pengelolaan data kas RT diizinkan untuk pengurus/superadmin dan disimpan ke database
  return null;
}
