<# OC Servicios - Configurar y comprobar acceso desde la red
   Ejecutar en el SERVIDOR (donde corre la app) para: comprobar escucha de puertos, reglas de firewall y crearlas si faltan.
   Ejecutar con -ComprobarAcceso -Servidor <IP> desde una PC cliente para probar conectividad.
   
   Uso en el servidor (recomendado como Administrador):
     .\configurar-acceso-red.ps1
   
   Uso desde PC cliente para comprobar acceso:
     .\configurar-acceso-red.ps1 -ComprobarAcceso -Servidor 172.30.1.245
#>

param(
  [switch]$ComprobarAcceso,
  [string]$Servidor = "172.30.1.245"
)

$ErrorActionPreference = "Stop"
$puertos = @(
  @{ Port = 3001; Nombre = "Frontend (app web)" },
  @{ Port = 5001; Nombre = "Backend (API)" }
)

function Mostrar-Encabezado {
  param([string]$Titulo)
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "   $Titulo" -ForegroundColor White
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
}

# --- Modo cliente: comprobar acceso a un servidor ---
if ($ComprobarAcceso) {
  Mostrar-Encabezado "Comprobar acceso desde esta PC al servidor $Servidor"
  $todoOk = $true
  foreach ($p in $puertos) {
    $result = Test-NetConnection -ComputerName $Servidor -Port $p.Port -WarningAction SilentlyContinue
    if ($result.TcpTestSucceeded) {
      Write-Host "  [OK] Puerto $($p.Port) ($($p.Nombre)): accesible" -ForegroundColor Green
    } else {
      Write-Host "  [FALLO] Puerto $($p.Port) ($($p.Nombre)): no accesible" -ForegroundColor Red
      $todoOk = $false
    }
  }
  Write-Host ""
  Write-Host "URLs (usa la IP, no localhost):" -ForegroundColor Cyan
  Write-Host "  Frontend: http://${Servidor}:3001" -ForegroundColor White
  Write-Host "  API:      http://${Servidor}:5001/api/health" -ForegroundColor White
  Write-Host ""
  if (-not $todoOk) {
    Write-Host "En el SERVIDOR ejecuta como Administrador: .\configurar-acceso-red.ps1" -ForegroundColor Yellow
  }
  return
}

# --- Modo servidor: netstat, firewall, crear reglas ---
Mostrar-Encabezado "Configurar acceso en red (ejecutar en el servidor)"

# 1. Comprobar en que direccion escuchan los puertos
Write-Host "[1/3] Puertos en escucha en este equipo" -ForegroundColor Yellow
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in (3001, 5001) }
if (-not $listeners) {
  Write-Host "  No hay procesos escuchando en 3001 ni 5001." -ForegroundColor Gray
  Write-Host "  Inicia la app con .\start_prod.ps1 y vuelve a ejecutar este script." -ForegroundColor Gray
} else {
  foreach ($l in $listeners) {
    $addr = $l.LocalAddress
    $correcto = ($addr -eq '0.0.0.0' -or $addr -eq '::')
    $estado = if ($correcto) { "OK (accesible desde la red)" } else { "Solo local (127.0.0.1) - no accesible desde red" }
    $color = if ($correcto) { "Green" } else { "Red" }
    Write-Host "  Puerto $($l.LocalPort): $addr -> $estado" -ForegroundColor $color
  }
}
Write-Host ""

# 2. Comprobar reglas de firewall
Write-Host "[2/3] Reglas de firewall (entrada) para 3001 y 5001" -ForegroundColor Yellow
$reglas = @(
  @{ Name = "OC Servicios Backend (5001)"; Port = 5001 },
  @{ Name = "OC Servicios Frontend (3001)"; Port = 3001 }
)
$faltan = @()
foreach ($r in $reglas) {
  $existentes = @(Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue)
  if ($existentes.Count -eq 0) {
    Write-Host "  [Falta] $($r.Name)" -ForegroundColor Red
    $faltan += $r
  } elseif ($existentes.Count -eq 1) {
    Write-Host "  [OK] $($r.Name)" -ForegroundColor Green
  } else {
    Write-Host "  [Duplicado] $($r.Name): $($existentes.Count) reglas (se eliminaran las sobrantes)" -ForegroundColor Yellow
    for ($i = 1; $i -lt $existentes.Count; $i++) {
      try {
        Remove-NetFirewallRule -Name $existentes[$i].Name -ErrorAction Stop
        Write-Host "    Eliminada regla duplicada: $($existentes[$i].Name)" -ForegroundColor Gray
      } catch {
        Write-Host "    No se pudo eliminar duplicado (ejecuta como Admin): $($existentes[$i].Name)" -ForegroundColor Gray
      }
    }
  }
}
Write-Host ""

# 3. Crear reglas faltantes (requiere Administrador)
Write-Host "[3/3] Crear reglas de firewall faltantes" -ForegroundColor Yellow
if ($faltan.Count -eq 0) {
  Write-Host "  No falta ninguna regla." -ForegroundColor Green
} else {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host "  Ejecuta este script como Administrador para crear las reglas." -ForegroundColor Yellow
    Write-Host "  Comando manual (PowerShell como Admin):" -ForegroundColor Gray
    foreach ($r in $faltan) {
      Write-Host "  New-NetFirewallRule -DisplayName '$($r.Name)' -Direction Inbound -LocalPort $($r.Port) -Protocol TCP -Action Allow" -ForegroundColor Gray
    }
  } else {
    foreach ($r in $faltan) {
      try {
        New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -LocalPort $r.Port -Protocol TCP -Action Allow | Out-Null
        Write-Host "  [Creada] $($r.Name)" -ForegroundColor Green
      } catch {
        Write-Host "  [Error] $($r.Name): $_" -ForegroundColor Red
      }
    }
  }
}

Write-Host ""
Write-Host "Si aun no puedes acceder desde la red:" -ForegroundColor Yellow
Write-Host "  - Antivirus o cortafuegos de terceros en servidor o cliente" -ForegroundColor Gray
Write-Host "  - Usa la IP del servidor (ej. http://IP:3001 o http://IP:5001/api/health), no localhost" -ForegroundColor Gray
Write-Host "  - Desde otra PC: .\configurar-acceso-red.ps1 -ComprobarAcceso -Servidor <IP_SERVIDOR>" -ForegroundColor Gray
Write-Host ""
