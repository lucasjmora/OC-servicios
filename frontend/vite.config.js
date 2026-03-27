import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'os'

// Función para obtener la IP local
function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Ignora direcciones internas y no IPv4
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

/**
 * Destino del proxy /api en desarrollo: localhost evita fallos cuando la IP LAN (VPN, varias NIC)
 * no enruta bien hacia el mismo equipo. Para otro host: VITE_BACKEND_HOST=10.x.x.x npm run dev
 */
const backendHost = process.env.VITE_BACKEND_HOST || 'localhost'
const backendPort = process.env.VITE_BACKEND_PORT || (process.env.NODE_ENV === 'development' ? '5000' : '5001')
const backendUrl = `http://${backendHost}:${backendPort}`

console.log(`🔧 Backend URL (proxy /api): ${backendUrl} (LAN: ${getLocalIP()}:${backendPort})`)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Permite acceso desde la red
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    port: process.env.FRONTEND_PORT || 3001,
    host: process.env.FRONTEND_HOST || '0.0.0.0', // Misma logica que backend: escuchar en todas las interfaces (red)
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false
      }
    }
  }
})

