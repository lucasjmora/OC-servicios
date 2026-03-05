@echo off
setlocal enabledelayedexpansion
title OC Servicios - Start Development Mode
color 0A

echo.
echo ========================================
echo    OC SERVICIOS - START DEV MODE
echo ========================================
echo.

REM Verificar que estamos en el directorio correcto
cd /d "%~dp0"
if not exist "package.json" (
    echo ❌ ERROR: No se encuentra package.json
    echo    Asegúrate de ejecutar este script desde el directorio raíz del proyecto
    pause
    exit /b 1
)

echo [1/7] Verificando estructura del proyecto...
if not exist "backend" (
    echo ❌ ERROR: No se encuentra la carpeta 'backend'
    pause
    exit /b 1
)
if not exist "frontend" (
    echo ❌ ERROR: No se encuentra la carpeta 'frontend'
    pause
    exit /b 1
)
echo ✓ Estructura del proyecto verificada

echo.
echo [2/7] Deteniendo instancias previas...
echo.

REM Función mejorada para liberar puertos
echo Liberando puerto 5000 (Backend)...
:kill_port_5000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo   ✓ Proceso %%a terminado
    )
)

echo Liberando puerto 3000 (Frontend/Vite)...
:kill_port_3000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo   ✓ Proceso %%a terminado
    )
)

REM Detener procesos Node.js relacionados
echo Deteniendo procesos Node.js, npm y nodemon...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1
taskkill /f /im nodemon.exe >nul 2>&1

echo Esperando 5 segundos para que los procesos se terminen completamente...
timeout /t 5 /nobreak >nul

REM Verificar nuevamente y liberar si es necesario
netstat -ano 2>nul | findstr ":5000" | findstr "LISTENING" >nul
if !errorlevel! equ 0 (
    echo ⚠️  Puerto 5000 aún ocupado, liberando nuevamente...
    goto kill_port_5000
    timeout /t 2 /nobreak >nul
)

netstat -ano 2>nul | findstr ":3000" | findstr "LISTENING" >nul
if !errorlevel! equ 0 (
    echo ⚠️  Puerto 3000 aún ocupado, liberando nuevamente...
    goto kill_port_3000
    timeout /t 2 /nobreak >nul
)

echo ✓ Limpieza completa finalizada

echo.
echo [3/7] Creando directorios necesarios...
if not exist "backend\data" (
    mkdir "backend\data" >nul 2>&1
    echo ✓ Directorio backend\data creado
) else (
    echo ✓ Directorio backend\data ya existe
)

if not exist "logs" (
    mkdir "logs" >nul 2>&1
    echo ✓ Directorio logs creado
) else (
    echo ✓ Directorio logs ya existe
)

REM Crear archivos de log vacíos si no existen para evitar errores de redirección
if not exist "logs\backend-dev.log" (
    type nul > "logs\backend-dev.log"
)
if not exist "logs\frontend-dev.out.log" (
    type nul > "logs\frontend-dev.out.log"
)
if not exist "logs\frontend-dev.err.log" (
    type nul > "logs\frontend-dev.err.log"
)

echo.
echo [4/7] Verificando dependencias del proyecto raíz...
if not exist "node_modules" (
    echo Instalando dependencias del proyecto raíz...
    call npm install
    if errorlevel 1 (
        echo ❌ ERROR: Falló la instalación de dependencias del proyecto raíz
        pause
        exit /b 1
    )
    echo ✓ Dependencias del proyecto raíz instaladas
) else (
    echo ✓ Dependencias del proyecto raíz ya instaladas
)

REM Verificar que concurrently esté instalado
if not exist "node_modules\concurrently" (
    echo Instalando concurrently...
    call npm install concurrently --save-dev
    if errorlevel 1 (
        echo ❌ ERROR: Falló la instalación de concurrently
        pause
        exit /b 1
    )
    echo ✓ concurrently instalado
) else (
    echo ✓ concurrently ya instalado
)

echo.
echo [5/7] Verificando dependencias del backend...
if not exist "backend\node_modules" (
    echo Instalando dependencias del backend...
    cd backend
    call npm install
    if errorlevel 1 (
        echo ❌ ERROR: Falló la instalación de dependencias del backend
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo ✓ Dependencias del backend instaladas
) else (
    echo ✓ Dependencias del backend ya instaladas
)

echo.
echo [6/7] Verificando dependencias del frontend...
if not exist "frontend\node_modules" (
    echo Instalando dependencias del frontend...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo ❌ ERROR: Falló la instalación de dependencias del frontend
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo ✓ Dependencias del frontend instaladas
) else (
    echo ✓ Dependencias del frontend ya instaladas
)

echo.
echo [7/7] Configuración MongoDB...
if exist "backend\.env" (
    echo ⚠️  Detectado backend\.env existente. La app leerá primero esos valores.
    echo    Ajusta el archivo manualmente si prefieres administrar la conexión desde la UI.
) else (
    echo ℹ️  La configuración de MongoDB se gestiona desde la aplicación.
    echo    Menú -^> Configuración -^> Actualización de datos.
)

echo.
echo ========================================
echo    INICIANDO SERVIDORES
echo ========================================
echo.
echo 🚀 Iniciando OC Servicios...
echo    Backend: http://localhost:5000
echo    Frontend: http://localhost:3000 (Vite)
echo.
echo ✅ Configuración automática habilitada:
echo    - Conexión MongoDB automática
echo    - Almacenamiento local de configuración
echo    - Sincronización con base de datos
echo    - Datos persistentes al reiniciar
echo.
echo 📝 Los logs se guardarán en la carpeta 'logs/':
echo    - logs/backend-dev.log (Backend)
echo    - logs/frontend-dev.out.log (Frontend stdout)
echo    - logs/frontend-dev.err.log (Frontend stderr)
echo.
echo ⚠️  IMPORTANTE: Los servidores se ejecutarán en esta ventana
echo    Para detener los servidores, presiona Ctrl+C
echo.
echo Esperando 2 segundos antes de iniciar...
timeout /t 2 /nobreak >nul
echo.

REM Ejecutar npm run dev (esto bloqueará hasta Ctrl+C)
call npm run dev

REM Si llegamos aquí, significa que el usuario presionó Ctrl+C
echo.
echo.
echo ========================================
echo    SERVIDORES DETENIDOS
echo ========================================
echo.
echo Los servidores han sido detenidos.
echo.
pause
