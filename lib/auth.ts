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

export function authorize(_req: Request): Response | null {
  // Akses langsung tanpa batasan password untuk memudahkan pengelolaan data
  return null;
}
