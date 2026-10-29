import { NextResponse } from 'next/server';
import {
  addUser,
  deleteUser,
  getSessionFromRequest,
  getUsersList,
  SUPERADMIN_EMAIL,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkSuperadmin(req: Request): boolean {
  const session = getSessionFromRequest(req);
  if (!session.authenticated) return false;
  return session.role === 'superadmin' || session.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
}

export async function GET(req: Request) {
  try {
    if (!checkSuperadmin(req)) {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya Super Admin (superadmin@gmail.com) yang dapat melihat daftar akun.' },
        { status: 403 }
      );
    }

    const users = await getUsersList();
    return NextResponse.json({ users });
  } catch (err) {
    console.error('Users GET error:', err);
    return NextResponse.json({ error: 'Gagal memuat daftar akun pengurus.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!checkSuperadmin(req)) {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya Super Admin (superadmin@gmail.com) yang dapat menambahkan akun pengurus lain.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
      role?: 'superadmin' | 'admin';
    };

    const email = body.email?.trim() || '';
    const name = body.name?.trim() || '';
    const password = body.password || '';
    const role = body.role || 'admin';

    if (!email) {
      return NextResponse.json({ error: 'Alamat email Gmail/email pengurus wajib diisi.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Nama pengurus wajib diisi.' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Kata sandi minimal 6 karakter.' }, { status: 400 });
    }

    const created = await addUser({ email, name, password, role });
    return NextResponse.json({
      success: true,
      message: `Akun pengurus ${email} berhasil didaftarkan!`,
      user: created,
    });
  } catch (err) {
    console.error('Users POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal menambahkan akun pengurus.' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    if (!checkSuperadmin(req)) {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya Super Admin (superadmin@gmail.com) yang dapat menghapus akun.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as { email?: string; id?: string };
    const target = (body.email || body.id || '').trim();

    if (!target) {
      return NextResponse.json({ error: 'Target akun yang akan dihapus tidak ditemukan.' }, { status: 400 });
    }

    const res = await deleteUser(target);
    return NextResponse.json(res);
  } catch (err) {
    console.error('Users DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal menghapus akun pengurus.' },
      { status: 400 }
    );
  }
}
