# KARIER — Paket migrasi GitHub + Vercel + Neon

Paket ini mempertahankan **seluruh UI aplikasi Sites KARIER**: tema hijau/emas, logo,
ringkasan, iuran warga, buku kas, pengeluaran, pinjaman/pengembalian, dompet,
diagram pie, diagram batang bulanan, empat laporan CSV/cetak PDF, dan menu HP.
Frontend menggunakan React/Next.js. Backend telah dipindahkan dari Cloudflare D1
ke PostgreSQL; paket ini bukan aplikasi HTML statis atau penyimpanan localStorage.

## Tempat penyimpanan

| Bagian | Lokasi |
|---|---|
| Source code dan aset UI | Repository **private** GitHub |
| Website, API, login pengurus | Vercel, framework Next.js, Node.js 22.x |
| Warga, iuran, pengeluaran, pinjaman, pengembalian, pemindahan | **Neon PostgreSQL**, dihubungkan lewat `DATABASE_URL` |
| Salinan untuk migrasi | `database/snapshot.json` dan `database/restore-data.sql`, hanya untuk impor |
| Cadangan setelah aplikasi berjalan | Neon backup/restore dan `npm run db:backup` |

GitHub tidak menyimpan transaksi harian. Vercel tidak memakai file SQLite lokal
untuk database. Enam tabel PostgreSQL menyimpan data bersama antar perangkat.
Database tidak otomatis berubah ketika source code diperbarui atau deploy ulang.

## Data yang dibawa

Diambil dari database aplikasi Sites pada 2 Oktober 2026. Source asli:
`e05d086bffc93da05c9d83f87d0d543fe9780146` (versi Sites 14).

| Data | Jumlah |
|---|---:|
| Warga | 39 |
| Setoran iuran | 25 |
| Pemasukan / pengeluaran kas | 15 |
| Pinjaman | 0 |
| Pengembalian pinjaman | 0 |
| Pemindahan dompet | 2 |

| Dompet | Saldo |
|---|---:|
| Tunai | Rp284.500 |
| DANA | Rp60.000 |
| OVO | Rp0 |
| GoPay | Rp0 |
| Rekening bank | Rp0 |
| Dompet digital lain | Rp225.000 |
| **Total kas riil** | **Rp569.500** |

Angka dompet lainnya mengikuti data terbaru: Rp275.000 pernah dipindahkan ke
saldo lainnya, kemudian Rp50.000 dipindahkan kembali ke tunai pada 2 Oktober.
Pinjaman Sutisna dan Mak Wo tidak dimunculkan kembali. Tidak ada proses otomatis
seed/koreksi historis saat membuka aplikasi; impor hanya dijalankan sengaja.
Status iuran dan saldo di layar mengikuti akhir bulan yang dipilih.

## 1. Buat database Neon

1. Masuk https://neon.com dan buat project untuk KARIER, pilih lokasi terdekat
   yang tersedia. Bisa juga menggunakan integrasi Neon di Vercel Marketplace.
2. Buka tombol **Connect** pada Neon. Salin connection string **pooled** untuk
   aplikasi dan connection string **direct / unpooled** untuk impor/backup.
3. Pertahankan parameter TLS dari Neon (contoh `sslmode=require`). Simpan kedua
   string tersebut secara pribadi; jangan masukkan ke file source atau chat.
4. Buat database kosong khusus KARIER. Jangan memakai database berisi aplikasi lain.

## 2. Impor database dari komputer

Ekstrak ZIP seluruhnya. Install **Node.js 22 LTS** dari https://nodejs.org.
Tidak perlu menjalankan terminal VS Code. Di Windows gunakan launcher berikut:

1. Klik `ATUR_KONFIGURASI.cmd`; `.env.local` dibuat dari contoh dan dibuka di Notepad.
2. Isi `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KARIER_ADMIN_USER`, dan
   `KARIER_ADMIN_PASSWORD`. Kata sandi harus milik Anda sendiri, minimal 16 karakter.
   Jika nilainya mengandung `#` atau spasi, bungkus nilainya dengan tanda kutip ganda.
3. Simpan dan tutup Notepad. Klik `MIGRASI_DATABASE.cmd`.
4. Launcher menjalankan install, pembuatan skema, impor data, dan verifikasi.
   Pastikan hasil saldo sama dengan tabel di atas.

Alternatif Command Prompt/Terminal biasa dari folder paket:

```sh
npm ci
# Salin .env.example menjadi .env.local dan isi nilainya terlebih dahulu.
npm run db:init
npm run db:import
npm run db:verify -- --snapshot
npm run dev
```

Impor bersifat atomik. Jika database sudah persis sesuai snapshot, impor ulang
hanya memverifikasi. Jika database tidak kosong dan isinya berbeda, impor **ditolak**;
data lama tidak dihapus atau ditimpa. Setelah transaksi baru berjalan, gunakan
`npm run db:verify` tanpa `--snapshot`, karena isinya sudah berbeda dari snapshot awal.

Opsi tanpa Node untuk impor: buka **SQL Editor Neon**, jalankan isi `database/schema.sql`,
lalu isi `database/restore-data.sql`. Hanya lakukan ini pada database kosong.
Jangan menjalankan SQL data dan script impor sekaligus. Verifikasi melalui
`database/check-balances.sql`; total yang diharapkan Rp569.500.

## 3. Masukkan source ke GitHub

Buat repository **Private**, misalnya `karier`. Upload isi folder paket sehingga
`package.json`, `app/`, `public/`, dan `vercel.json` berada di root repository.
**Jangan upload** `node_modules`, `.next`, `.env.local`, `backups`, serta file
`database/snapshot.json` / `database/restore-data.sql` yang memuat data warga.
Script impor berjalan dari salinan ZIP lokal; kedua file data tidak dibutuhkan
oleh website setelah database berhasil diimpor.

Jika memakai Git, `.gitignore` sudah mengecualikan file tersebut:

```sh
git init
git add .
git commit -m "KARIER untuk Vercel dan PostgreSQL"
git branch -M main
git remote add origin https://github.com/NAMA_AKUN/karier.git
git push -u origin main
```

Ganti `NAMA_AKUN` dengan akun Anda. Jangan salin token GitHub ke command atau source.
Workflow GitHub Actions memeriksa pengujian dan build setiap push/PR tanpa mengakses
database produksi. Vercel melakukan deploy dari source GitHub.

## 4. Deploy di Vercel

1. Masuk https://vercel.com menggunakan GitHub, pilih **Add New → Project**,
   lalu import repository KARIER.
2. Framework **Next.js**; Root Directory **root** (tidak memilih `app`).
   Node.js **22.x**. Install `npm ci`, build `npm run build`. Output Directory
   biarkan default Next.js.
3. Isi Environment Variables:

| Nama | Isi | Lingkungan |
|---|---|---|
| `DATABASE_URL` | Connection string pooled Neon yang sudah diimpor | Production |
| `KARIER_ADMIN_USER` | Nama login pengurus | Production |
| `KARIER_ADMIN_PASSWORD` | Kata sandi sendiri, minimal 16 karakter | Production |

`DATABASE_URL_UNPOOLED` diperlukan untuk script lokal; tidak wajib di Vercel.
Tidak ada variabel database/password yang memakai awalan `NEXT_PUBLIC_`.
Jika menggunakan integrasi Neon, periksa `DATABASE_URL` menunjuk ke database
**yang sudah diimpor**, bukan database baru kosong.

4. Klik **Deploy**. Buka URL hasil Vercel. Browser menampilkan dialog login
   pengurus (HTTP Basic); masukkan username/password di atas. Seluruh UI dan API
   dilindungi; aset kode statis tidak memuat data warga atau password.
5. Pilih **Oktober 2026**, periksa 39 warga dan saldo kas riil Rp569.500.
6. Preview deployment sebaiknya memakai **branch/database Neon terpisah** beserta
   kredensial preview tersendiri. Jangan arahkan preview/PR ke database produksi.
   Jika env login tidak diisi, akses ditolak; tidak ada akun bawaan.

Akun saat ini adalah satu akun pengurus bersama, bukan sistem multiakun/role.
Untuk keluar dari Basic Auth, tutup seluruh jendela privat/incognito tempat login;
browser dapat menyimpan autentikasi selama sesi. Akses domain publik wajib HTTPS.

## 5. Domain baru dan perpindahan operasional

Vercel → Project → Settings → Domains → Add domain. Ikuti DNS yang ditampilkan
Vercel pada penyedia domain, tunggu validasi HTTPS. Domain baru memakai database
Neon yang sama; tidak perlu impor ulang atau mengubah source.

Sebelum mulai mencatat transaksi di Vercel, hentikan pencatatan pada Sites lama.
Paket adalah **snapshot**, bukan sinkronisasi otomatis dua arah. Jika transaksi
baru masuk ke Sites sesudah snapshot, ambil ekspor terbaru dan lakukan rekonsiliasi
sebelum cutover. Jangan mencatat transaksi yang sama pada kedua aplikasi.
Untuk rollback awal, hentikan pencatatan Vercel dan kembali ke Sites; bila sudah
ada transaksi baru di Vercel, ekspor/rekonsiliasi dahulu agar data tidak hilang.

## 6. Backup dan pemulihan

```sh
npm run db:backup
```

Cadangan JSON lengkap dibuat di `backups/`. Simpan di tempat privat di luar folder
aplikasi. Jadwal backup/retensi Neon mengikuti paket akun Anda; periksa di dashboard.
Untuk memulihkan ke **database baru kosong**: arahkan `.env.local` ke database baru,
jalankan `npm run db:init`, lalu:

```sh
npm run db:import -- --file backups/NAMA_CADANGAN.json
npm run db:verify
```

Terakhir ubah `DATABASE_URL` Vercel ke database baru dan redeploy. Jangan menimpa
database produksi yang masih dipakai sebelum hasil pemulihan diverifikasi.

## Struktur utama

- `app/page.tsx`, `app/globals.css`: seluruh UI asli, responsif dan laporan.
- `components/`, `hooks/`, `lib/utils.ts`, `vendor/`: komponen dan stylesheet pendukung.
- `public/karier-logo.svg`: logo KARIER asli.
- `app/api/state/route.ts`: API iuran, kas, pinjaman, pengembalian dan transfer.
- `lib/database.ts`: PostgreSQL, parameter SQL, transaksi dan penguncian finansial.
- `lib/auth.ts`, `proxy.ts`: login pengurus dan perlindungan API.
- `database/schema.sql`: enam tabel beserta relasi, indeks dan validasi.
- `database/snapshot.json`, `restore-data.sql`: data migrasi terbaru.
- `scripts/database.mjs`: init, import, verify, backup.
- `tests/`: pemeriksaan perhitungan UI dan integritas finansial.
- `VERIFIKASI.md`: hasil dan batas pemeriksaan paket.

## Ketentuan yang dipertahankan

Iuran Rp5.000/bulan, setoran kelipatan Rp5.000, periode bayar tidak tumpang tindih.
Pinjaman dibatasi kas riil total dan saldo dompet pada tanggal transaksi; tidak
mengubah dana iuran diblokir. Pengeluaran memakai kas tersedia setelah cadangan
bulan mendatang serta saldo dompet. Pengembalian tidak melebihi sisa pinjaman.
Pemindahan antar dompet tidak dihitung pada diagram uang masuk/keluar.
Data baru/hapus ditolak bila membuat saldo dompet historis negatif. Seluruh
pemeriksaan dan penyimpanan memakai satu transaksi database dengan penguncian
agar permintaan yang bersamaan tidak memakai saldo yang sama dua kali.

Empat laporan: Diagram & saldo kas (tanpa piutang), Daftar sudah/belum bayar,
Laporan lengkap (termasuk pengeluaran), Semua transaksi kas (nomor/tanggal/saldo).
Diagram diunduh melalui **Cetak / simpan PDF**; CSV memuat angka, bukan gambar.

## Bila muncul kendala

- Login 503: isi variabel username/password; minimal 16 karakter lalu redeploy.
- Data gagal dimuat: periksa koneksi Neon dan sudah menjalankan schema+impor.
- Saldo beda: pilih periode Oktober 2026; bandingkan `db:verify`, jangan seed ulang.
- GitHub Action gagal: pakai Node 22.x, `npm ci`; sertakan package-lock.json.
- Terminal VS Code gagal: jalankan launcher `.cmd` atau Command Prompt biasa.

Panduan resmi:
https://vercel.com/docs/frameworks/full-stack/nextjs
https://vercel.com/docs/git/vercel-for-github
https://vercel.com/docs/marketplace-storage
https://vercel.com/docs/environment-variables
https://neon.com/docs/get-started-with-neon/connect-neon
https://node-postgres.com/features/transactions

Paket ini belum membuat repository GitHub, akun/database Neon, atau deployment
Vercel pada akun Anda. Source siap diunggah; pengaturan layanan tersebut tetap
harus dilakukan dengan akun milik Anda.
