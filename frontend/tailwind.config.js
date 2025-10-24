/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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




