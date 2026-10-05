# Hasil doublecheck KARIER

Diperiksa 2 Oktober 2026, source Sites versi 14 / commit
`e05d086bffc93da05c9d83f87d0d543fe9780146`.

## Pemeriksaan yang sudah lulus

- Build production Next.js 16.3.4 dan pemeriksaan TypeScript pada Node.js **22.23.3**.
- Install bersih `npm ci`, build Node 22 dan tujuh pengujian dari folder terpisah juga lulus; tidak bergantung pada cache build atau file paket lama.
- Tujuh pengujian: setoran beberapa bulan, status sudah/belum bayar, cadangan iuran,
  pinjaman dan pengembalian, transfer, saldo historis serta rekonsiliasi isi data.
- Impor **81 baris** dari database Sites; seluruh nilai kolom cocok setelah dibaca
  kembali melalui API PostgreSQL. Hitungan: 39 warga, 25 setoran, 15 transaksi kas,
  0 pinjaman, 0 pengembalian, 2 transfer.
- Jalur impor script dan file SQL memberikan hasil sama. Impor script ulang tidak
  menduplikasi data; transaksi database menjaga impor utuh atau dibatalkan seluruhnya.
- Login menjaga halaman dan API; tanpa kredensial HTTP 401. Domain asal yang berbeda
  ditolak HTTP 403. Password belum dikonfigurasi menyebabkan akses ditolak.
- Nominal/tanggal tidak valid dan periode setoran yang tumpang tindih ditolak.
- Pinjaman Rp200.000 dari dompet tunai dapat dicatat walaupun kas tersedia setelah
  dana diblokir lebih kecil; dana diblokir tetap sama. Pengembalian di atas sisa ditolak.
- Dua permintaan pinjaman Rp200.000 secara bersamaan: satu diterima, satu ditolak
  karena saldo dompet tidak mencukupi untuk keduanya. Saldo tidak menjadi negatif.
- Pemindahan dompet, pemasukan serta batas pengeluaran diuji melalui API.
- Tampilan desktop 1440px dan smartphone 390px dibuka pada Chromium. Lima menu
  dibuka, empat opsi laporan diperiksa; tidak ada error JavaScript.
- Menu hamburger HP dibuka dan ditutup lewat navigasi; tidak ada overflow halaman
  pada buku kas (tabel/diagram panjang memiliki area scroll sendiri).
- Laporan Diagram & saldo kas memuat pie, dompet dan diagram batang tanpa piutang.
  PDF A4 satu halaman berhasil dihasilkan dan diperiksa secara visual.
- Cadangan JSON seluruh database berhasil diekspor.
- Jumlah akhir: tunai **Rp284.500**, DANA **Rp60.000**, dompet lainnya **Rp225.000**;
  total kas riil **Rp569.500** (akhir Oktober 2026).

Bukti tampilan dan hasil pengujian ada dalam folder `verification/`.
Snapshot lengkap ada di `database/snapshot.json`.

## Batas verifikasi

Pengujian integrasi memakai **PGlite (engine PostgreSQL lokal) melalui driver pg
dan protokol PostgreSQL**, bersama server production Next.js. Database Neon pada
akun pengguna dan deployment Vercel pada akun pengguna belum dibuat atau diuji;
koneksi TLS, region, billing/kuota dan konfigurasi domain baru perlu diverifikasi
setelah akun tersebut disiapkan. Hasil ini tidak menjamin bebas semua bug.

Website Sites asli tidak diubah. Data QA memakai database lokal terpisah;
transaksi pengujian tidak masuk ke data Sites atau snapshot migrasi.

UI, CSS dan aset asli dipertahankan; perubahan frontend hanya pada pengamanan
sel CSV warga. Backend disesuaikan dari D1 ke PostgreSQL, proses seed lama dihapus,
dan ditambahkan login serta transaksi/penguncian dan validasi saldo historis.

## Pemeriksaan sesudah deploy

1. Buka alamat Vercel; pastikan dialog login muncul dan API tidak terbuka tanpa login.
2. Pilih **Oktober 2026**; periksa 39 warga dan total kas riil Rp569.500.
3. Uji pencatatan pada database preview/staging yang terpisah dari produksi.
4. Buka laporan Diagram & saldo kas dan simpan PDF; pastikan diagram ikut tercetak.
5. Pastikan preview/PR tidak memakai database produksi.
6. Ambil backup sebelum berpindah operasional dan hentikan input di aplikasi lama
   agar kedua database tidak berbeda karena pencatatan ganda.
