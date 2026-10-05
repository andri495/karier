@echo off
setlocal
cd /d "%~dp0"
if not exist .env.local copy .env.example .env.local >nul
start "" notepad .env.local
echo Isi koneksi Neon, username dan password minimal 16 karakter, lalu simpan.
pause
