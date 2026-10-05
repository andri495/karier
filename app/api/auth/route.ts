import { NextResponse } from 'next/server';
import { verifyCredentials } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = body.username?.trim() || '';
    const password = body.password || '';

    if (!verifyCredentials(username, password)) {
      return NextResponse.json({ error: 'Nama pengguna atau kata sandi pengurus salah.' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, user: username });
    res.cookies.set('karier_auth', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Permintaan masuk tidak valid.' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') || '';
  const isAuth = cookieHeader.includes('karier_auth=1') || process.env.NODE_ENV !== 'production';
  return NextResponse.json({ authenticated: isAuth });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('karier_auth', '', {
    path: '/',
    expires: new Date(0),
  });
  return res;
}
