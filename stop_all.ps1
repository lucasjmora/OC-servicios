$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   DETENIENDO TODAS LAS INSTANCIAS" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Deteniendo procesos en puertos 5000, 3000, 5001, 3001..." -ForegroundColor Yellow

function Stop-Port {
    param([int]$Port, [string]$Name)
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            if ($pid) {
                try {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Write-Host "  Deteniendo proceso $pid (puerto $Port - $Name)..." -ForegroundColor Gray
                } catch {
                    # Ignorar errores si el proceso ya no existe
                }
            }
        }
        Write-Host "  Puerto $Port ($Name) liberado" -ForegroundColor Green
    } else {
        Write-Host "  Puerto $Port ($Name) ya esta libre" -ForegroundColor Gray
    }
}

Stop-Port -Port 5000 -Name "Backend Dev"
Stop-Port -Port 3000 -Name "Frontend Dev"
Stop-Port -Port 5001 -Name "Backend Prod"
Stop-Port -Port 3001 -Name "Frontend Prod"

Write-Host ""
Write-Host "[2/3] Deteniendo procesos Node.js, npm, nodemon relacionados..." -ForegroundColor Yellow

$processes = Get-Process -Name "node","npm","nodemon" -ErrorAction SilentlyContinue
$killed = 0

foreach ($proc in $processes) {
    try {
        $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
        
        if ($commandLine -match "oc-servicios|OC Services") {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  Proceso $($proc.ProcessName) PID $($proc.Id) detenido" -ForegroundColor Green
            $killed++
        }
    } catch {
        # Ignorar errores
    }
}

if ($killed -eq 0) {
    Write-Host "  No se encontraron procesos relacionados" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/3] Verificando que los puertos esten libres..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

$allFree = $true
$ports = @(5000, 3000, 5001, 3001)

foreach ($port in $ports) {
    $stillOccupied = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    if ($stillOccupied) {
        Write-Host "  Puerto $port aun esta ocupado" -ForegroundColor Yellow
        $allFree = $false
    } else {
        Write-Host "  Puerto $port esta libre" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($allFree) {
    Write-Host "   TODAS LAS INSTANCIAS DETENIDAS" -ForegroundColor Green
} else {
    Write-Host "   ALGUNOS PUERTOS AUN OCUPADOS" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
