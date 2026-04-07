# OC Servicios

Sistema de seguimiento de servicios de mantenimiento de talleres múltiples.

## 🚀 Inicio Rápido

### 1. Iniciar la Aplicación
```bash
# Doble clic en:
INICIAR_Y_CONFIGURAR_WEB.bat

# O manualmente:
npm run dev
```

### 2. Acceder a la Aplicación

| Entorno    | Frontend | Backend (API) |
|------------|----------|---------------|
| **Desarrollo** | **3000** (`http://localhost:3000`) | **5000** (`http://localhost:5000`) |
| **Producción** | **3001** | **5001** |

En el navegador, el cliente HTTP usa la ruta **`/api`** (mismo host que la web: Vite en 3000/3001 proxifica al backend 5000/5001). Así, si entrás por **`http://IP:3001`**, no hace falta abrir el **5001** en el firewall de cada cliente. Arranque recomendado: **`npm run start:prod`** o **`.\start_prod.ps1`**. Despliegues con front y API en orígenes distintos: definí **`VITE_API_BASE_URL`** al compilar (ver `.env.example`).

## ⚙️ Configuración

### MongoDB Atlas
1. Ve a **"Configuración" → "Actualización de datos"**
2. Pega tu URI de MongoDB Atlas
3. Haz clic en **"Probar conexión"** ✅
4. Guarda la configuración

### Archivos Excel
1. En la misma página, configura las rutas:
   - **Archivo de Citas:** Ruta a tu archivo Excel de citas
   - **Archivo de Ingresos:** Ruta a tu archivo Excel de ingresos
2. Haz clic en **"Importar datos ahora"**

## 📊 CRM Presupuestos (módulo integrado)

- **API:** prefijo `/api/presup-crm` (config, dashboard, listado, importación Excel, talleres, aceites).
- **Rutas UI:** `/presup-crm/presupuestos`, `/presup-crm/dashboard`, `/presup-crm/config/*` (general, talleres, aceites, carga).
- **Dashboard principal:** pestaña **“Presupuestos (CRM)”** junto al resumen OC Servicios.
- **Menú:** CRM → Presupuestos; Configuración → **Parámetros de presupuestos** (no confundir con “Actualización de datos” de citas/ingresos).
- La configuración del módulo se guarda en el documento `configuracion` (campo `presupCrm`) y en `data/config.json` bajo `presupCrm`.

## 📊 Funcionalidades

- **Dashboard:** Resumen del sistema
- **Citas:** Gestión de citas de mantenimiento
- **Ingresos Taller:** Seguimiento de ingresos a talleres
- **Diagnóstico:** Estado del sistema y conexiones
- **Configuración:** Gestión de MongoDB, archivos y mapeos

## 🛠️ Tecnologías

- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Node.js + Express
- **Base de Datos:** MongoDB Atlas
- **Importación:** Excel (xlsx)

## 📁 Estructura

```
oc-servicios/
├── backend/          # API Node.js + Express
├── frontend/         # Aplicación React
├── GUIA_CONFIGURACION.md
├── INICIAR_Y_CONFIGURAR_WEB.bat
└── README.md
```

## 🔧 Desarrollo

**Puertos:** desarrollo **3000 / 5000**; producción **3001 / 5001** (ver tabla arriba).

```bash
# Instalar dependencias
npm run install-all

# Desarrollo (ambos servidores)
npm run dev

# Solo backend
npm run dev:backend

# Solo frontend  
npm run dev:frontend
```

## 📋 Requisitos

- Node.js 18+
- MongoDB Atlas
- Archivos Excel con datos de citas e ingresos

---

**¡Listo para usar!** Ejecuta `INICIAR_Y_CONFIGURAR_WEB.bat` y sigue la guía de configuración.