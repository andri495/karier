import { NextResponse } from 'next/server';
import {
  authenticateUser,
  changePassword,
  createSessionToken,
  EMAIL_COOKIE,
  getSessionFromRequest,
  resetPasswordWithKey,
  ROLE_COOKIE,
  SESSION_COOKIE,
  SUPERADMIN_EMAIL,
  USER_COOKIE,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  return NextResponse.json({
    authenticated: session.authenticated,
    user: session.username || null,
    email: session.email || null,
    role: session.role || 'admin',
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      username?: string;
      email?: string;
      password?: string;
      currentPassword?: string;
      newPassword?: string;
      newUsername?: string;
      resetKey?: string;
    };

    if (body.action === 'reset-password') {
      return NextResponse.json(
        { error: 'Reset sandi langsung melalui web publik dinonaktifkan demi keamanan. Silakan gunakan perintah konsol RESET_SANDI.cmd di komputer server.' },
        { status: 403 }
      );
    }

    if (body.action === 'change-password') {
      const currentPassword = body.currentPassword || '';
      const newPassword = body.newPassword || '';
      const newUsername = body.newUsername;
      const res = await changePassword(currentPassword, newPassword, newUsername);
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Gagal mengubah kata sandi.' }, { status: 400 });
      }

      const isSuper = (res.username && res.username.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) || res.username === 'Super Admin';
      const role = isSuper ? 'superadmin' : 'admin';
      const email = res.username?.includes('@') ? res.username : SUPERADMIN_EMAIL;

      const response = NextResponse.json({
        success: true,
        message: 'Kata sandi berhasil diubah!',
        user: res.username,
        email,
        role,
      });

      if (res.username) {
        const token = createSessionToken(res.username, role, email);
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
        response.cookies.set(EMAIL_COOKIE, email, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
        response.cookies.set(ROLE_COOKIE, role, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }

    const identifier = (body.email || body.username || '').trim();
    const password = body.password || '';

    const user = await authenticateUser(identifier, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Email Gmail atau kata sandi pengurus salah.' },
        { status: 401 }
      );
    }

    const token = createSessionToken(user.name, user.role, user.email);
    const res = NextResponse.json({
      success: true,
      user: user.name,
      email: user.email,
      role: user.role,
    });

    res.cookies.set(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set(USER_COOKIE, user.name, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set(EMAIL_COOKIE, user.email, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set(ROLE_COOKIE, user.role, {
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

    const isSuper = (res.username && res.username.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) || res.username === 'Super Admin';
    const role = isSuper ? 'superadmin' : 'admin';
    const email = res.username?.includes('@') ? res.username : SUPERADMIN_EMAIL;

    const response = NextResponse.json({
      success: true,
      message: 'Kata sandi berhasil diubah!',
      user: res.username,
      email,
      role,
    });

    if (res.username) {
      const token = createSessionToken(res.username, role, email);
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
      response.cookies.set(EMAIL_COOKIE, email, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
      response.cookies.set(ROLE_COOKIE, role, {
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
  } catch (err) {
    console.error('Auth PUT error:', err);
    return NextResponse.json({ error: 'Gagal memproses pengubahan kata sandi.' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', expires: new Date(0) });
  res.cookies.set(USER_COOKIE, '', { path: '/', expires: new Date(0) });
  res.cookies.set(EMAIL_COOKIE, '', { path: '/', expires: new Date(0) });
  res.cookies.set(ROLE_COOKIE, '', { path: '/', expires: new Date(0) });
  res.cookies.set('karier_auth', '', { path: '/', expires: new Date(0) });
  return res;
}
