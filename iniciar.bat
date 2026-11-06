@echo off
rem Atalho para abrir o Contador Tacta no Windows com dois cliques: instala as dependencias quando preciso
rem e sobe o servidor de desenvolvimento (npm run dev), abrindo o navegador. Nao faz build nem deploy.
title Contador Tacta
rem Vai para a pasta deste arquivo, mesmo se for aberto de outro lugar (ou de outro disco).
cd /d "%~dp0"

rem Confere se o Node.js (npm) esta instalado e no PATH.
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
  rem Guarda uma copia do lock instalado; o fc acima compara com ela na proxima vez.
  copy /y package-lock.json node_modules\.lock-instalado >nul
)

echo Iniciando o Contador Tacta... feche esta janela para parar.
rem --open abre o navegador; o servidor fica rodando ate esta janela ser fechada (ou Ctrl+C).
call npm run dev -- --open
pause
