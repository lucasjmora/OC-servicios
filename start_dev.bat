@echo off
title OC Servicios - Start Development Mode
color 0A

echo.
echo ========================================
echo    OC SERVICIOS - START DEV MODE
echo ========================================
echo.

echo [1/6] Deteniendo instancias previas...
echo Deteniendo procesos Node.js...
taskkill /f /im node.exe > nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Procesos Node.js detenidos
) else (
    echo ℹ️  No hay procesos Node.js ejecutándose
)

echo Deteniendo ventanas de terminal...
taskkill /f /im cmd.exe /fi "WINDOWTITLE eq OC Servicios*" > nul 2>&1
echo ✓ Limpieza completada

echo.
echo [2/6] Configurando persistencia MongoDB...
echo Configurando archivo .env para conexión automática...
if not exist "backend\.env" (
    echo MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/oc_servicios?retryWrites=true^&w=majority > backend\.env
    echo ✓ Archivo .env creado con configuración persistente
) else (
    echo ✓ Archivo .env ya existe
)

echo Creando directorio de almacenamiento local...
if not exist "backend\data" (
    mkdir backend\data
    echo ✓ Directorio de datos creado
) else (
    echo ✓ Directorio de datos ya existe
)

echo.
echo [3/6] Verificando estructura del proyecto...
if not exist "backend" (
    echo ❌ ERROR: No se encuentra la carpeta 'backend'
    echo    Asegúrate de ejecutar este script desde el directorio raíz del proyecto
    pause
    exit /b 1
)
if not exist "frontend" (
    echo ❌ ERROR: No se encuentra la carpeta 'frontend'
    echo    Asegúrate de ejecutar este script desde el directorio raíz del proyecto
    pause
    exit /b 1
)
echo ✓ Estructura del proyecto verificada

echo.
echo [4/6] Verificando package.json...
if not exist "package.json" (
    echo ❌ ERROR: No se encuentra package.json
    echo    Este script debe ejecutarse desde el directorio raíz del proyecto
    pause
    exit /b 1
)
echo ✓ package.json encontrado

echo.
echo [5/6] Instalando dependencias si es necesario...
if not exist "node_modules" (
    echo Instalando dependencias del proyecto raíz...
    npm install > nul 2>&1
    echo ✓ Dependencias del proyecto raíz instaladas
) else (
    echo ✓ Dependencias del proyecto raíz ya instaladas
)

echo Verificando dependencias del backend...
if not exist "backend\node_modules" (
    echo Instalando dependencias del backend...
    cd backend
    npm install > nul 2>&1
    cd ..
    echo ✓ Dependencias del backend instaladas
) else (
    echo ✓ Dependencias del backend ya instaladas
)

echo Verificando dependencias del frontend...
if not exist "frontend\node_modules" (
    echo Instalando dependencias del frontend...
    cd frontend
    npm install > nul 2>&1
    cd ..
    echo ✓ Dependencias del frontend instaladas
) else (
    echo ✓ Dependencias del frontend ya instaladas
)

echo.
echo [6/6] Iniciando servidores en modo desarrollo...
echo.
echo 🚀 Iniciando OC Servicios con configuración persistente...
echo    Backend: http://localhost:5000
echo    Frontend: http://localhost:5173
echo.
echo ✅ Configuración automática habilitada:
echo    - Conexión MongoDB automática
echo    - Almacenamiento local de configuración
echo    - Sincronización con base de datos
echo    - Datos persistentes al reiniciar
echo.
echo ⚠️  IMPORTANTE: No cierres esta ventana ni la ventana que se abrirá
echo    Para detener los servidores, presiona Ctrl+C en la ventana de OC Servicios
echo.

start "OC Servicios - Development Mode" cmd /k "echo 🚀 OC Servicios - Modo Desarrollo && echo. && echo Backend: http://localhost:5000 && echo Frontend: http://localhost:5173 && echo. && echo Iniciando servidores... && npm run dev"

echo.
echo ⏳ Esperando 8 segundos para que los servidores se inicien...
timeout /t 8 /nobreak > nul

echo.
echo ✅ Servidores iniciados
echo 🌐 Abriendo aplicación en el navegador...
start http://localhost:5173

echo.
echo ========================================
echo    APLICACION INICIADA EXITOSAMENTE
echo ========================================
echo.
echo 📱 URLs de acceso:
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:5000
echo.
echo 🔧 Configuración:
echo    1. Ve a "Configuración" → "Actualización de datos"
echo    2. ✅ MongoDB Atlas ya configurado automáticamente
echo    3. ✅ Las rutas de archivos Excel se cargan automáticamente
echo    4. Importa los datos cuando sea necesario
echo.
echo 🔍 Verificación:
echo    - Ve a "Diagnóstico" para verificar el estado
echo    - Ve a "Citas" para ver los datos
echo    - Ve a "Ingresos Taller" para ver los datos
echo.
echo ⚠️  Para detener la aplicación:
echo    - Presiona Ctrl+C en la ventana "OC Servicios - Development Mode"
echo    - O ejecuta: taskkill /f /im node.exe
echo.
echo ✅ ¡Aplicación lista para usar!
echo Presiona cualquier tecla para cerrar esta ventana...
pause > nul

