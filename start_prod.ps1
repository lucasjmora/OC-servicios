<# OC Servicios - Start Production Mode (PowerShell)
   Script simple para verificar dependencias y arrancar backend + frontend en producción.
   Puertos: API 5001, Vite preview 3001 (convive con dev en 5000/3000 si start_dev corre en otra sesión).
   Ejecuta npm run build con VITE_BACKEND_PORT=5001 y luego npm run start:prod (backend + preview).

   INSTRUCCIONES DE EJECUCIÓN:
   ===========================
   
   PowerShell NO acepta && como separador de comandos.
   
   FORMAS CORRECTAS de ejecutar este script:
   
   1. Desde el directorio del proyecto:
      .\start_prod.ps1
      
   2. Desde cualquier ubicación (ruta completa):
      powershell -ExecutionPolicy Bypass -File "ruta\completa\oc-servicios\start_prod.ps1"
      
   3. Desde el directorio padre (usando punto y coma):
      cd "oc-servicios"; .\start_prod.ps1
      
   FORMAS INCORRECTAS (NO funcionan en PowerShell):
   - cd "oc-servicios" && .\start_prod.ps1  ❌
   - cd "oc-servicios" && powershell -File start_prod.ps1  ❌
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   OC SERVICIOS - START PROD MODE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ir al directorio del script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Comprobaciones básicas
if (-not (Test-Path "package.json")) {
    Write-Host "❌ No se encuentra package.json en este directorio." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
if (-not (Test-Path "backend")) {
    Write-Host "❌ No se encuentra la carpeta 'backend'." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
if (-not (Test-Path "frontend")) {
    Write-Host "❌ No se encuentra la carpeta 'frontend'." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host "[1/4] Deteniendo procesos previos (solo puertos 5001 y 3001)..." -ForegroundColor Yellow

function Stop-Port {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    foreach ($c in $conns) {
        $processId = $c.OwningProcess
        if ($processId) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Write-Host "  Cerrado PID $processId en puerto $Port" -ForegroundColor Gray
        }
    }
}

# Solo liberar los puertos específicos de esta app (no afectar 3000 y 5000 de la otra app)
Stop-Port -Port 5001
Stop-Port -Port 3001
Start-Sleep -Seconds 2
Write-Host 'Puertos 5001 y 3001 liberados (no se afectan puertos 3000 y 5000 de otra app)' -ForegroundColor Green

Write-Host ""
Write-Host "[2/4] Verificando dependencias..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias raíz..." -ForegroundColor Gray
    npm install
if ($LASTEXITCODE -ne 0) { Read-Host 'Error en npm install (root). Presiona Enter para salir'; exit 1 }
}
if (-not (Test-Path "node_modules\concurrently") -or -not (Test-Path "node_modules\cross-env")) {
    Write-Host "Instalando dependencias de scripts (concurrently, cross-env)..." -ForegroundColor Gray
    npm install concurrently cross-env --save-dev
if ($LASTEXITCODE -ne 0) { Read-Host 'Error en npm install (dev). Presiona Enter para salir'; exit 1 }
}
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "Instalando dependencias backend..." -ForegroundColor Gray
    Push-Location backend
    npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Read-Host 'Error en npm install (backend). Presiona Enter para salir'; exit 1 }
    Pop-Location
}
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Instalando dependencias frontend..." -ForegroundColor Gray
    Push-Location frontend
    npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Read-Host 'Error en npm install (frontend). Presiona Enter para salir'; exit 1 }
    Pop-Location
}

Write-Host ""
Write-Host '[3/4] Construyendo frontend (produccion)...' -ForegroundColor Yellow

# Obtener IP local para construir el frontend con la URL correcta
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $localIP) {
    $localIP = "localhost"
}

Write-Host "IP del servidor detectada: $localIP" -ForegroundColor Gray

# Limpiar build anterior para asegurar que se use la nueva configuración
Push-Location frontend
if (Test-Path "dist") {
    Write-Host "Limpiando build anterior..." -ForegroundColor Gray
    Remove-Item -Recurse -Force "dist"
}
Pop-Location

# NO usar VITE_API_URL: el frontend usará window.location.hostname en runtime,
# así la API siempre usa la misma IP/host con la que el usuario accede (evita
# problemas cuando el servidor tiene varias IPs como 172.30.1.245 y .187)
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_BACKEND_HOST -ErrorAction SilentlyContinue
$env:VITE_BACKEND_PORT = "5001"
Write-Host "Backend: puerto 5001 (API URL dinámica según host de acceso)" -ForegroundColor Gray

Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Read-Host 'Error en build del frontend. Presiona Enter para salir'; exit 1 }
Pop-Location
Write-Host 'Frontend construido' -ForegroundColor Green

Write-Host ""
Write-Host '[4/4] Iniciando backend y frontend en PRODUCCION...' -ForegroundColor Yellow
Write-Host 'Backend:  http://localhost:5001' -ForegroundColor White
Write-Host "Backend:  http://${localIP}:5001 (red)" -ForegroundColor White
Write-Host 'Frontend: http://localhost:3001' -ForegroundColor White
Write-Host "Frontend: http://${localIP}:3001 (red)" -ForegroundColor White
Write-Host '(puertos distintos de 3000 y 5000 para convivir con otra app)' -ForegroundColor Gray
Write-Host ""
Write-Host "Si no puedes acceder desde la red, ejecuta como Administrador: .\configurar-acceso-red.ps1" -ForegroundColor DarkYellow
Write-Host ""

# Configurar variables de entorno para produccion (runtime) - mismos criterios para backend y frontend
$env:PORT = "5001"
$env:HOST = "0.0.0.0"
$env:FRONTEND_PORT = "3001"
$env:FRONTEND_HOST = "0.0.0.0"
$env:SERVE_FRONTEND = "false"
# Backend: 0.0.0.0:5001 (PORT, HOST). Frontend: 0.0.0.0:3001 (FRONTEND_PORT, FRONTEND_HOST en vite.config).

Write-Host 'Para detener, usa Ctrl+C en esta ventana.' -ForegroundColor Yellow
Write-Host ""

npm run start:prod

