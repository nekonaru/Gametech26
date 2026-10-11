@echo off
setlocal
cd /d "%~dp0"
title Asap yang Tak Padam

node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js tidak ditemukan di komputer ini.
  echo   Install dulu dari https://nodejs.org lalu jalankan file ini lagi.
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo.
  echo   Folder dist belum ada. Build dulu...
  echo.
  if not exist "node_modules" (
    echo   Menginstall dependensi, tunggu sebentar...
    call npm install
    if errorlevel 1 (
      echo   npm install gagal. Cek pesan di atas.
      pause
      exit /b 1
    )
  )
  call npm run build
  if errorlevel 1 (
    echo   Build gagal. Cek pesan di atas.
    pause
    exit /b 1
  )
)

echo.
echo   Menjalankan game di http://localhost:8000
echo   Browser akan terbuka sendiri. Tekan Ctrl+C di jendela ini untuk berhenti.
echo.
node serve.cjs
echo.
echo   Server berhenti.
pause
