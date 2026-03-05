<# OC Servicios - Stop Development Mode (PowerShell)
   Script para detener completamente la aplicación en modo desarrollo
   
   INSTRUCCIONES DE EJECUCIÓN:
   ===========================
   
   PowerShell NO acepta && como separador de comandos.
   
   FORMAS CORRECTAS de ejecutar este script:
   
   1. Desde el directorio del proyecto:
      .\stop_dev.ps1
      
   2. Desde cualquier ubicación (ruta completa):
      powershell -ExecutionPolicy Bypass -File "ruta\completa\oc-servicios\stop_dev.ps1"
      
   3. Desde el directorio padre (usando punto y coma):
      cd "oc-servicios"; .\stop_dev.ps1
      
   FORMAS INCORRECTAS (NO funcionan en PowerShell):
   - cd "oc-servicios" && .\stop_dev.ps1  ❌
   - cd "oc-servicios" && powershell -File stop_dev.ps1  ❌
#>

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   OC SERVICIOS - STOP DEV MODE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ir al directorio del script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "[1/4] Deteniendo procesos en puertos 5000 (Backend) y 3000 (Frontend)..." -ForegroundColor Yellow

function Stop-Port {
    param([int]$Port, [string]$Name)
    
    $count = 0
    $maxAttempts = 5
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        
        if ($connections) {
            foreach ($conn in $connections) {
                $processId = $conn.OwningProcess
                if ($processId) {
                    try {
                        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                        if ($process) {
                            Write-Host "  Deteniendo proceso $processId ($($process.ProcessName)) en puerto $Port ($Name)..." -ForegroundColor Gray
                            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                            $count++
                        }
                    } catch {
                        # Ignorar errores si el proceso ya no existe
                    }
                }
            }
            Start-Sleep -Seconds 1
        } else {
            break
        }
        $attempt++
    }
    
    if ($count -gt 0) {
        Write-Host "  ✓ $count proceso(s) detenido(s) en puerto $Port" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Puerto $Port ya está libre" -ForegroundColor Gray
    }
}

# Detener procesos en los puertos de desarrollo
Stop-Port -Port 5000 -Name "Backend"
Stop-Port -Port 3000 -Name "Frontend"

Write-Host ""
Write-Host "[2/4] Deteniendo procesos Node.js relacionados con la aplicación..." -ForegroundColor Yellow

# Buscar y detener procesos Node.js que puedan estar relacionados
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
$killedNode = 0

foreach ($proc in $nodeProcesses) {
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        
        # Verificar si el proceso está relacionado con esta aplicación en modo dev
        if ($commandLine -match "oc-servicios|OC Services|start:dev|npm run dev|nodemon|vite") {
            Write-Host "  Deteniendo proceso Node.js PID $($proc.Id)..." -ForegroundColor Gray
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $killedNode++
        }
    } catch {
        # Si no podemos obtener la línea de comando, verificar el directorio de trabajo
        try {
            $workingDir = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").ExecutablePath
            if ($workingDir -match "oc-servicios|OC Services") {
                Write-Host "  Deteniendo proceso Node.js PID $($proc.Id)..." -ForegroundColor Gray
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $killedNode++
            }
        } catch {
            # Ignorar procesos que no podemos verificar
        }
    }
}

if ($killedNode -gt 0) {
    Write-Host "  ✓ $killedNode proceso(s) Node.js detenido(s)" -ForegroundColor Green
} else {
    Write-Host "  ✓ No se encontraron procesos Node.js relacionados" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/4] Deteniendo procesos npm, nodemon y vite..." -ForegroundColor Yellow

# Detener procesos npm, nodemon y vite
$npmProcesses = Get-Process -Name "npm","nodemon" -ErrorAction SilentlyContinue
$killedNpm = 0

foreach ($proc in $npmProcesses) {
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        
        if ($commandLine -match "oc-servicios|OC Services|start:dev|npm run dev") {
            Write-Host "  Deteniendo proceso $($proc.ProcessName) PID $($proc.Id)..." -ForegroundColor Gray
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $killedNpm++
        }
    } catch {
        # Ignorar errores
    }
}

if ($killedNpm -gt 0) {
    Write-Host "  ✓ $killedNpm proceso(s) detenido(s)" -ForegroundColor Green
} else {
    Write-Host "  ✓ No se encontraron procesos npm/nodemon relacionados" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[4/4] Verificando que los puertos estén libres..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Verificación final
$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }

$allStopped = $true

if ($port5000) {
    Write-Host "  ⚠️  Puerto 5000 aún está ocupado" -ForegroundColor Yellow
    $allStopped = $false
} else {
    Write-Host '  ✓ Puerto 5000 (Backend) está libre' -ForegroundColor Green
}

if ($port3000) {
    Write-Host "  ⚠️  Puerto 3000 aún está ocupado" -ForegroundColor Yellow
    $allStopped = $false
} else {
    Write-Host '  ✓ Puerto 3000 (Frontend) está libre' -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allStopped) {
    Write-Host "   ✅ APLICACIÓN DETENIDA COMPLETAMENTE" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  ALGUNOS PROCESOS AÚN ESTÁN EN EJECUCIÓN" -ForegroundColor Yellow
    Write-Host "      Puedes intentar ejecutar este script nuevamente" -ForegroundColor Yellow
    Write-Host "      o detener los procesos manualmente" -ForegroundColor Yellow
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($allStopped) {
    Write-Host "Todos los servicios de desarrollo han sido detenidos correctamente." -ForegroundColor Gray
} else {
    Write-Host "Algunos procesos pueden necesitar detenerse manualmente." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Presiona Enter para salir"


