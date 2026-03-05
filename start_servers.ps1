# OC Servicios - Start Servers Only (PowerShell)
# Script simplificado para iniciar solo los servidores

Write-Host ""
Write-Host "🚀 Iniciando OC Servicios..." -ForegroundColor Green
Write-Host "   Backend: http://localhost:5000" -ForegroundColor White
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor White
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ ERROR: No se encuentra package.json" -ForegroundColor Red
    Write-Host "   Ejecuta este script desde el directorio raíz del proyecto" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Iniciar servidores
Write-Host "Iniciando servidores..." -ForegroundColor Yellow
npm run dev






















