import { createHash, timingSafeEqual } from 'node:crypto';

const equal = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function getAdminCredentials() {
  const user = process.env.KARIER_ADMIN_USER || 'admin';
  const password = process.env.KARIER_ADMIN_PASSWORD || 'adminpassword123456';
  return { user, password };
}

export function verifyCredentials(userAttempt: string, passAttempt: string): boolean {
  const { user, password } = getAdminCredentials();
  return equal(userAttempt, user) && equal(passAttempt, password);
}

export function authorize(req: Request): Response | null {
  // Dalam mode pengembangan lokal, izinkan akses langsung
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_PUBLIC_ACCESS === 'true') {
    return null;
  }

  const { user, password } = getAdminCredentials();

  // Dukungan cookie sesi
  const cookieHeader = req.headers.get('cookie') || '';
  if (cookieHeader.includes('karier_auth=1')) {
    return null;
  }

  // Dukungan HTTP Basic Auth
  let valid = false;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const at = decoded.indexOf(':');
      valid = at >= 0 && equal(decoded.slice(0, at), user) && equal(decoded.slice(at + 1), password);
    } catch {}
  }

  if (valid) return null;

  // Izinkan akses ke route login /api/auth
  const pathname = new URL(req.url).pathname;
  if (pathname.startsWith('/api/auth')) {
    return null;
  }

  // Izinkan akses GET ke website utama dan data ringkasan agar pengguna langsung bisa melihat aplikasi di Vercel
  if (req.method === 'GET' && (!pathname.startsWith('/api') || pathname === '/api/state')) {
    return null;
  }

  const isApi = pathname.startsWith('/api');
  if (isApi) {
    return Response.json(
      { error: 'Akses dibatasi. Masuk menggunakan akun pengurus KARIER (default: user admin).' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="KARIER", charset="UTF-8"',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return new Response('Masuk menggunakan akun pengurus KARIER.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="KARIER", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}
