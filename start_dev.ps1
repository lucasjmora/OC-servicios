<# OC Servicios - Start Development Mode (PowerShell)
   Script mejorado con manejo robusto de errores y liberación de puertos
   
   INSTRUCCIONES DE EJECUCIÓN:
   ===========================
   
   PowerShell NO acepta && como separador de comandos.
   
   FORMAS CORRECTAS de ejecutar este script:
   
   1. Desde el directorio del proyecto:
      .\start_dev.ps1
      
   2. Desde cualquier ubicación (ruta completa):
      powershell -ExecutionPolicy Bypass -File "ruta\completa\oc-servicios\start_dev.ps1"
      
   3. Desde el directorio padre (usando punto y coma):
      cd "oc-servicios"; .\start_dev.ps1
      
   FORMAS INCORRECTAS (NO funcionan en PowerShell):
   - cd "oc-servicios" && .\start_dev.ps1  ❌
   - cd "oc-servicios" && powershell -File start_dev.ps1  ❌
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   OC SERVICIOS - START DEV MODE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio del script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "[ERROR] No se encuentra package.json" -ForegroundColor Red
    Write-Host '   Ejecuta desde el directorio raiz del proyecto' -ForegroundColor Red
    Read-Host 'Presiona Enter para salir'
    exit 1
}

Write-Host "[1/7] Verificando estructura del proyecto..." -ForegroundColor Yellow
if (-not (Test-Path "backend")) {
    Write-Host "[ERROR] No se encuentra la carpeta backend" -ForegroundColor Red
    Read-Host 'Presiona Enter para salir'
    exit 1
}
if (-not (Test-Path "frontend")) {
    Write-Host "[ERROR] No se encuentra la carpeta frontend" -ForegroundColor Red
    Read-Host 'Presiona Enter para salir'
    exit 1
}
Write-Host "OK Estructura del proyecto verificada" -ForegroundColor Green

Write-Host ""
Write-Host "[2/7] Deteniendo instancias previas..." -ForegroundColor Yellow

# Función para liberar un puerto específico
function Stop-Port {
    param([int]$Port)
    $maxAttempts = 3
    for ($i = 0; $i -lt $maxAttempts; $i++) {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        $toStop = $conns | Where-Object { $_.State -eq "Listen" }
        if (-not $toStop) { break }
        $toStop | ForEach-Object {
            if ($_.OwningProcess) {
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Seconds 2
    }
}

# Detener procesos Node.js
Write-Host "Deteniendo procesos Node.js, npm y nodemon..." -ForegroundColor Gray
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "npm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "nodemon" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Liberar puertos
Write-Host 'Liberando puerto 5000 (Backend)...' -ForegroundColor Gray
Stop-Port -Port 5000

Write-Host 'Liberando puerto 3000 (Frontend)...' -ForegroundColor Gray
Stop-Port -Port 3000

Write-Host "Esperando 5 segundos para que los procesos se terminen completamente..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Verificar nuevamente
$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }

if ($port5000) {
    Write-Host "[!] Puerto 5000 aun ocupado, liberando..." -ForegroundColor Yellow
    Stop-Port -Port 5000
    Start-Sleep -Seconds 2
}

if ($port3000) {
    Write-Host "[!] Puerto 3000 aun ocupado, liberando..." -ForegroundColor Yellow
    Stop-Port -Port 3000
    Start-Sleep -Seconds 2
}

Write-Host "OK Limpieza completa finalizada" -ForegroundColor Green

Write-Host ""
Write-Host "[3/7] Creando directorios necesarios..." -ForegroundColor Yellow

# Crear directorios
if (-not (Test-Path "backend\data")) {
    New-Item -ItemType Directory -Path "backend\data" -Force | Out-Null
    Write-Host "OK Directorio backend\data creado" -ForegroundColor Green
} else {
    Write-Host "OK Directorio backend\data ya existe" -ForegroundColor Gray
}

if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Host "OK Directorio logs creado" -ForegroundColor Green
} else {
    Write-Host "OK Directorio logs ya existe" -ForegroundColor Gray
}

# Crear archivos de log vacíos si no existen
$logFiles = @("logs\backend-dev.log", "logs\frontend-dev.out.log", "logs\frontend-dev.err.log")
foreach ($logFile in $logFiles) {
    if (-not (Test-Path $logFile)) {
        New-Item -ItemType File -Path $logFile -Force | Out-Null
    }
}

Write-Host ""
Write-Host "[4/7] Verificando dependencias del proyecto raíz..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias del proyecto raíz..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la instalacion de dependencias" -ForegroundColor Red
        Read-Host 'Presiona Enter para salir'
        exit 1
    }
    Write-Host "OK Dependencias raiz instaladas" -ForegroundColor Green
} else {
    Write-Host "OK Dependencias raiz ya instaladas" -ForegroundColor Gray
}

# Verificar que concurrently esté instalado
if (-not (Test-Path "node_modules\concurrently")) {
    Write-Host "Instalando concurrently..." -ForegroundColor Gray
    npm install concurrently --save-dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo instalacion de concurrently" -ForegroundColor Red
        Read-Host 'Presiona Enter para salir'
        exit 1
    }
    Write-Host "OK concurrently instalado" -ForegroundColor Green
} else {
    Write-Host "OK concurrently ya instalado" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[5/7] Verificando dependencias del backend..." -ForegroundColor Yellow

if (-not (Test-Path "backend\node_modules")) {
    Write-Host "Instalando dependencias del backend..." -ForegroundColor Gray
    Set-Location backend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo instalacion dependencias backend" -ForegroundColor Red
        Set-Location ..
        Read-Host 'Presiona Enter para salir'
        exit 1
    }
    Set-Location ..
    Write-Host "OK Dependencias backend instaladas" -ForegroundColor Green
} else {
    Write-Host "OK Dependencias backend ya instaladas" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[6/7] Verificando dependencias del frontend..." -ForegroundColor Yellow

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Instalando dependencias del frontend..." -ForegroundColor Gray
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo instalacion dependencias frontend" -ForegroundColor Red
        Set-Location ..
        Read-Host 'Presiona Enter para salir'
        exit 1
    }
    Set-Location ..
    Write-Host "OK Dependencias frontend instaladas" -ForegroundColor Green
} else {
    Write-Host "OK Dependencias frontend ya instaladas" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[7/7] Configuración MongoDB..." -ForegroundColor Yellow

$envPath = "backend\.env"
if (Test-Path $envPath) {
    Write-Host "[!] Detectado backend\.env existente." -ForegroundColor Yellow
} else {
    Write-Host "[i] MongoDB se gestiona desde Menu Configuracion." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "[8/8] Construyendo frontend (como prod, puerto 5000)..." -ForegroundColor Yellow
$env:VITE_BACKEND_PORT = '5000'
Push-Location frontend
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
npm run build
$buildOk = $LASTEXITCODE -eq 0
Pop-Location
if (-not $buildOk) {
    Write-Host '[ERROR] Fallo build del frontend' -ForegroundColor Red
    Read-Host 'Presiona Enter para salir'
    exit 1
}
Write-Host 'OK Frontend construido' -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   DEV = IMAGEN DE PROD (puertos 5000/3000)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando como produccion (backend + preview)..." -ForegroundColor Green
Write-Host "   Backend:  http://localhost:5000" -ForegroundColor White
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "[!] Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

$env:PORT = '5000'
$env:HOST = '0.0.0.0'
$env:FRONTEND_PORT = '3000'
$env:FRONTEND_HOST = '0.0.0.0'
$env:SERVE_FRONTEND = 'false'

try {
    npm run start:prod
} catch {
    Write-Host ""
    Write-Host "[ERROR] al iniciar servidores:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Presiona Enter para salir'
    exit 1
}

# Si llegamos aquí, significa que el usuario presionó Ctrl+C
Write-Host ""
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SERVIDORES DETENIDOS" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host 'Servidores detenidos.' -ForegroundColor Gray
Write-Host ""
Read-Host 'Presiona Enter para salir'
