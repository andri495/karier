import { NextResponse } from 'next/server';
import {
  changePassword,
  createSessionToken,
  getSessionFromRequest,
  resetPasswordWithKey,
  SESSION_COOKIE,
  USER_COOKIE,
  verifyCredentials,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  return NextResponse.json({
    authenticated: session.authenticated,
    user: session.username || null,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      username?: string;
      password?: string;
      currentPassword?: string;
      newPassword?: string;
      newUsername?: string;
      resetKey?: string;
    };

    if (body.action === 'reset-password') {
      const resetKey = body.resetKey || '';
      const newPassword = body.newPassword || '';
      const newUsername = body.newUsername;
      const res = await resetPasswordWithKey(resetKey, newPassword, newUsername);
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Gagal mereset kata sandi.' }, { status: 400 });
      }

      const response = NextResponse.json({
        success: true,
        message: 'Kata sandi pengurus berhasil direset!',
        user: res.username,
      });

      if (res.username) {
        const token = createSessionToken(res.username);
        response.cookies.set(SESSION_COOKIE, token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
        response.cookies.set(USER_COOKIE, res.username, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
        response.cookies.set('karier_auth', '1', {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }

    if (body.action === 'change-password') {
      const currentPassword = body.currentPassword || '';
      const newPassword = body.newPassword || '';
      const newUsername = body.newUsername;
      const res = await changePassword(currentPassword, newPassword, newUsername);
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Gagal mengubah kata sandi.' }, { status: 400 });
      }

      const response = NextResponse.json({
        success: true,
        message: 'Kata sandi berhasil diubah!',
        user: res.username,
      });

      if (res.username) {
        const token = createSessionToken(res.username);
        response.cookies.set(SESSION_COOKIE, token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 hari
        });
        response.cookies.set(USER_COOKIE, res.username, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }

    const username = body.username?.trim() || '';
    const password = body.password || '';

    const isValid = await verifyCredentials(username, password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Nama pengguna atau kata sandi pengurus salah.' },
        { status: 401 }
      );
    }

    const token = createSessionToken(username);
    const res = NextResponse.json({ success: true, user: username });

    res.cookies.set(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 hari
    });

    res.cookies.set(USER_COOKIE, username, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set('karier_auth', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (err) {
    console.error('Auth POST error:', err);
    return NextResponse.json({ error: 'Permintaan masuk tidak valid.' }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
      newUsername?: string;
    };

    const currentPassword = body.currentPassword || '';
    const newPassword = body.newPassword || '';
    const newUsername = body.newUsername;

    const res = await changePassword(currentPassword, newPassword, newUsername);
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'Gagal mengubah kata sandi.' }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Kata sandi berhasil diubah!',
      user: res.username,
    });

    if (res.username) {
      const token = createSessionToken(res.username);
      response.cookies.set(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
      response.cookies.set(USER_COOKIE, res.username, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (err) {
    console.error('Auth PUT error:', err);
    return NextResponse.json({ error: 'Gagal memproses pengubahan kata sandi.' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', {
    path: '/',
    expires: new Date(0),
  });
  res.cookies.set(USER_COOKIE, '', {
    path: '/',
    expires: new Date(0),
  });
  res.cookies.set('karier_auth', '', {
    path: '/',
    expires: new Date(0),
  });
  return res;
}
