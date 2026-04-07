import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rutas absolutas: en Windows + carpetas sincronizadas (OneDrive), los cwd relativos
 * a veces fallan con UNKNOWN al leer durante el scan de Tailwind.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.js'),
    path.join(__dirname, 'src/**/*.jsx'),
  ],
  theme: {
    extend: {
      colors: {
        // Colores personalizados basados en la captura
        primary: {
          DEFAULT: '#6366f1', // Índigo
          dark: '#4f46e5',
          light: '#818cf8'
        },
        background: {
          main: '#1a1d2e',
          sidebar: '#0f1116',
          card: '#1e2139'
        },
        status: {
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6'
        }
      }
    },
  },
  plugins: [],
}




