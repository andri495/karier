import { createHash, timingSafeEqual } from 'node:crypto';

const equal = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function authorize(req: Request): Response | null {
  // Dalam mode pengembangan lokal, izinkan akses langsung agar tidak terblokir modal login browser
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const user = process.env.KARIER_ADMIN_USER;
  const password = process.env.KARIER_ADMIN_PASSWORD;

  if (!user || !password || password.length < 16) {
    return Response.json(
      { error: 'Login pengurus belum dikonfigurasi. Isi KARIER_ADMIN_USER dan KARIER_ADMIN_PASSWORD minimal 16 karakter.' },
      { status: 503 }
    );
  }

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

  const isApi = new URL(req.url).pathname.startsWith('/api');
  if (isApi) {
    return Response.json(
      { error: 'Masuk menggunakan akun pengurus KARIER.' },
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
