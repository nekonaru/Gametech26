@echo off
setlocal
cd /d "%~dp0"
title Asap yang Tak Padam - Mode Pengembangan

node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js tidak ditemukan di komputer ini.
  echo   Install dulu dari https://nodejs.org lalu jalankan file ini lagi.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   Menginstall dependensi, tunggu sebentar...
  call npm install
  if errorlevel 1 (
    echo   npm install gagal. Cek pesan di atas.
    pause
    exit /b 1
  )
)

echo.
echo   Menjalankan server pengembangan di http://localhost:3000
echo   Tekan Ctrl+C di jendela ini untuk berhenti.
echo.
call npm run dev
echo.
pause
