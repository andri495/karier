@echo off
setlocal
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
echo  KARIER - Reset Kata Sandi Pengurus
echo ========================================================
echo.
echo Mereset kata sandi pengurus ke konfigurasi .env.local...
echo.
call npm run auth:reset
if errorlevel 1 goto failed
echo.
echo Kata sandi berhasil direset!
pause
exit /b

:no_node
echo Install Node.js 22 LTS lalu coba lagi.
pause
exit /b

:failed
echo Proses reset gagal. Periksa konfigurasi database di .env.local.
pause
