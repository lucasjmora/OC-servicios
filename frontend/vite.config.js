import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'os'

/**
 * Puertos (convención del repo):
 *   Desarrollo — `npm run dev` / Vite server: frontend 3000, proxy /api → backend 5000
 *   Producción — `vite preview` y build: frontend 3001, proxy → backend 5001
 *
 * Usar `mode` de Vite (no `NODE_ENV`): al cargar este archivo `NODE_ENV` suele estar
 * indefinido en Windows/PowerShell, y el proxy caía en 5001 mientras el API escucha en 5000.
 */

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
 * Proxy → API en la misma máquina: por defecto 127.0.0.1 (no "localhost").
 * En Windows, "localhost" suele resolver primero a ::1 (IPv6); Express en 0.0.0.0:5000/5001
 * escucha IPv4 y el proxy devuelve ECONNREFUSED al intentar ::1.
 * Para API en otro host: VITE_BACKEND_HOST=10.x.x.x
 */
export default defineConfig(({ mode }) => {
  const backendHost = process.env.VITE_BACKEND_HOST || '127.0.0.1'
  const backendPort =
    process.env.VITE_BACKEND_PORT ||
    (mode === 'development' ? '5000' : '5001')
  const backendUrl = `http://${backendHost}:${backendPort}`

  console.log(
    `🔧 Backend URL (proxy /api): ${backendUrl} (LAN: ${getLocalIP()}:${backendPort}, Vite mode=${mode})`
  )

  return {
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
  }
})
