@echo off
title Contador Tacta
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

rem Instala (de novo) quando nao ha node_modules ou quando o package-lock.json mudou desde a ultima instalacao.
fc /b package-lock.json node_modules\.lock-instalado >nul 2>nul
if errorlevel 1 (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
  copy /y package-lock.json node_modules\.lock-instalado >nul
)

echo Iniciando o Contador Tacta... feche esta janela para parar.
call npm run dev -- --open
pause
