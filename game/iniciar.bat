@echo off
title Ponto de Ruptura
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  node server.js
) else (
  echo Node.js nao encontrado. Tentando Python...
  start "" http://localhost:8080
  python -m http.server 8080
)
pause
