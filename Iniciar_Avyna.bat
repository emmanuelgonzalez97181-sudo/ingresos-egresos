@echo off
title Iniciando Conciliador Avyna POS
echo ===================================================
echo   INICIANDO CONCILIADOR Y CONTROL DE UTILIDADES
echo ===================================================
echo.
echo 1. Abriendo la aplicacion en tu navegador...
start "" "http://localhost:3000"
echo.
echo 2. Iniciando servidor backend de Node.js...
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se pudo iniciar el servidor.
    echo Asegurate de tener Node.js instalado y haber ejecutado 'npm install'.
    pause
)
