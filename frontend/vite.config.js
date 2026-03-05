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

// Obtener IP local o usar variable de entorno
const backendHost = process.env.VITE_BACKEND_HOST || getLocalIP()
const backendPort = process.env.VITE_BACKEND_PORT || (process.env.NODE_ENV === 'development' ? '5000' : '5001')
const backendUrl = `http://${backendHost}:${backendPort}`

console.log(`🔧 Backend URL configurada: ${backendUrl}`)

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
  }
})

