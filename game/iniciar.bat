@echo off
title Ponto de Ruptura
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  if not exist "..\node_modules\ws\package.json" (
    pushd ..
    call npm install --no-audit --no-fund
    if errorlevel 1 (
      popd
      echo Nao foi possivel instalar as dependencias.
      pause
      exit /b 1
    )
    popd
  )
  if not exist "vendor\three\build\three.module.js" node tools\vendor-three.cjs
  start "" http://localhost:8080
  node server.js
) else (
  echo Instale Node.js 22 ou superior para jogar a campanha e hospedar salas online.
  echo https://nodejs.org/
)
pause
