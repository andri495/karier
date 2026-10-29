@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto no_node
node -e "if(Number(process.versions.node.split('.')[0])!==22)process.exit(1)"
if errorlevel 1 goto no_node
if not exist .env.local (
 echo Klik ATUR_KONFIGURASI.cmd dan isi konfigurasi terlebih dahulu.
 pause
 exit /b
)
echo ========================================================
echo  KARIER - Ubah Kata Sandi Pengurus
echo ========================================================
echo.
echo Masukkan kata sandi baru yang diinginkan.
echo (Tekan Enter langsung jika ingin menggunakan kata sandi bawaan .env.local)
echo.
set "INPUT_PW="
set /p INPUT_PW="Kata Sandi Baru: "

if "!INPUT_PW!"=="" (
  echo.
  echo Mereset ke kata sandi bawaan .env.local...
  call node --env-file=.env.local scripts/reset-password.mjs
) else (
  echo.
  echo Menyimpan kata sandi baru ke database...
  call node --env-file=.env.local scripts/reset-password.mjs "!INPUT_PW!"
)
if errorlevel 1 goto failed
echo.
echo ========================================================
echo Kata sandi berhasil disimpan dan langsung aktif!
echo ========================================================
pause
exit /b

:no_node
echo Install Node.js 22 LTS lalu coba lagi.
pause
exit /b

:failed
echo.
echo Proses penyimpanan gagal. Periksa koneksi database di .env.local.
pause
