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
if not exist node_modules\next\package.json (
 call npm ci
 if errorlevel 1 goto failed
)
echo Buka http://localhost:3000 setelah server siap.
call npm run dev
if errorlevel 1 goto failed

exit /b
:no_node
echo Install Node.js 22 LTS lalu coba lagi.
pause
exit /b
:failed
echo Proses gagal. Catat pesan error di atas.
pause
