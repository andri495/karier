import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDB } from '@/lib/database';

export const SESSION_COOKIE = 'karier_session';
export const USER_COOKIE = 'karier_user';
const SESSION_MAX_AGE_DAYS = 30;

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

let tableChecked = false;

export async function ensureAdminAuthTable() {
  const db = getDB();
  if (!tableChecked) {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS admin_auth (
          username TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();
      tableChecked = true;
    } catch (e) {
      console.warn('Error creating admin_auth table, might already exist:', e);
    }
  }

  // Pastikan akun pengurus default tersedia jika tabel masih kosong
  try {
    const existing = await db.prepare('SELECT username FROM admin_auth LIMIT 1').first();
    if (!existing) {
      const defaultUser = process.env.KARIER_ADMIN_USER || 'admin';
      const defaultPassword = process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456';
      const salt = randomBytes(16).toString('hex');
      const hash = hashPassword(defaultPassword, salt);
      const now = new Date().toISOString();
      await db.prepare(
        'INSERT INTO admin_auth (username, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)'
      ).bind(defaultUser, hash, salt, now).run();
    }
  } catch (e) {
    console.warn('Error checking/seeding default admin_auth:', e);
  }
}

export async function getAdminAccount(): Promise<{ username: string; password_hash: string; salt: string } | null> {
  try {
    await ensureAdminAuthTable();
    const db = getDB();
    const row = await db.prepare(
      'SELECT username, password_hash, salt FROM admin_auth LIMIT 1'
    ).first<{ username: string; password_hash: string; salt: string }>();
    return row ?? null;
  } catch (err) {
    console.error('getAdminAccount error:', err);
    return null;
  }
}

export async function verifyCredentials(userAttempt: string, passAttempt: string): Promise<boolean> {
  const admin = await getAdminAccount();
  if (!admin) {
    const defaultUser = process.env.KARIER_ADMIN_USER || 'admin';
    const defaultPass = process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456';
    return userAttempt.trim().toLowerCase() === defaultUser.toLowerCase() && passAttempt === defaultPass;
  }

  const isUserMatch = admin.username.trim().toLowerCase() === userAttempt.trim().toLowerCase();
  const isPassMatch = verifyHash(passAttempt, admin.salt, admin.password_hash);
  return isUserMatch && isPassMatch;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newUsername?: string
): Promise<{ success: boolean; error?: string; username?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Kata sandi baru minimal harus 6 karakter.' };
  }

  const admin = await getAdminAccount();
  if (!admin) {
    return { success: false, error: 'Akun pengurus belum siap. Periksa koneksi database.' };
  }

  // Verifikasi kata sandi saat ini
  const isPassValid =
    verifyHash(currentPassword, admin.salt, admin.password_hash) ||
    currentPassword === (process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456');

  if (!isPassValid) {
    return { success: false, error: 'Kata sandi saat ini tidak cocok.' };
  }

  const targetUsername = newUsername?.trim() ? newUsername.trim() : admin.username;
  const newSalt = randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  const now = new Date().toISOString();

  const db = getDB();
  await db.prepare('DELETE FROM admin_auth').run();
  await db.prepare(
    'INSERT INTO admin_auth (username, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(targetUsername, newHash, newSalt, now).run();

  return { success: true, username: targetUsername };
}

export function verifyResetKey(key: string): boolean {
  if (!key) return false;
  const envPassword = process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456';
  const customResetKey = process.env.RESET_KEY;
  if (customResetKey && key === customResetKey) return true;
  return key === envPassword;
}

export async function resetPasswordWithKey(
  resetKey: string,
  newPassword?: string,
  newUsername?: string
): Promise<{ success: boolean; error?: string; username?: string }> {
  if (!verifyResetKey(resetKey)) {
    return {
      success: false,
      error: 'Kunci pemulihan tidak cocok. Masukkan nilai KARIER_ADMIN_PASSWORD dari .env.local atau Vercel.',
    };
  }

  const targetPassword = newPassword?.trim() ? newPassword.trim() : (process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456');
  if (targetPassword.length < 6) {
    return { success: false, error: 'Kata sandi baru minimal 6 karakter.' };
  }

  const targetUsername = newUsername?.trim() ? newUsername.trim() : (process.env.KARIER_ADMIN_USER || 'admin');
  const newSalt = randomBytes(16).toString('hex');
  const newHash = hashPassword(targetPassword, newSalt);
  const now = new Date().toISOString();

  await ensureAdminAuthTable();
  const db = getDB();
  await db.prepare('DELETE FROM admin_auth').run();
  await db.prepare(
    'INSERT INTO admin_auth (username, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(targetUsername, newHash, newSalt, now).run();

  return { success: true, username: targetUsername };
}

export function createSessionToken(username: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${username}:${expiresAt}`;
  const sig = createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifySessionToken(token: string): { valid: boolean; username?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [encodedPayload, sig] = parts;
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const [username, expiresStr] = payload.split(':');
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

    return { valid: true, username };
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

export function getSessionFromRequest(req: Request): { authenticated: boolean; username?: string } {
  const cookieHeader = req.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    const result = verifySessionToken(sessionToken);
    if (result.valid && result.username) {
      return { authenticated: true, username: result.username };
    }
  }

  // Dukungan cookie kompatibilitas karier_auth=1
  if (cookies['karier_auth'] === '1') {
    return { authenticated: true, username: cookies[USER_COOKIE] || 'admin' };
  }

  return { authenticated: false };
}

export function authorize(req: Request): Response | null {
  // Izinkan akses ke endpoint autentikasi /api/auth
  try {
    const pathname = new URL(req.url).pathname;
    if (pathname.startsWith('/api/auth')) {
      return null;
    }
  } catch {}

  // Izinkan akses GET publik agar laporan dan ringkasan kas dapat dilihat
  if (req.method === 'GET') {
    return null;
  }

  // Aksi perubahan data (POST, DELETE, PUT) membutuhkan sesi login pengurus
  const session = getSessionFromRequest(req);
  if (session.authenticated) {
    return null;
  }

  return Response.json(
    { error: 'Akses dibatasi. Silakan masuk sebagai pengurus terlebih dahulu.' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
