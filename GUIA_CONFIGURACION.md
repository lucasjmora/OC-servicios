# 🔧 Guía de Configuración - OC Servicios

## 🚀 Inicio Rápido

### 1. Iniciar la Aplicación
- **Doble clic en `INICIAR_APLICACION.bat`**
- O ejecuta manualmente:
  ```bash
  # Terminal 1 - Backend
  cd backend
  npm run dev
  
  # Terminal 2 - Frontend  
  cd frontend
  npm run dev
  ```

### 2. Acceder a la Aplicación
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:5000

## 📊 Configuración de MongoDB Atlas

### Paso 1: Obtener URI de MongoDB Atlas
1. Ve a [MongoDB Atlas](https://cloud.mongodb.com)
2. Inicia sesión en tu cuenta
3. Selecciona tu cluster
4. Haz clic en "Connect"
5. Selecciona "Connect your application"
6. Copia la URI de conexión

### Paso 2: Configurar en la Aplicación
1. **Abre** http://localhost:3000
2. **Ve a "Configuración" → "Actualización de datos"**
3. **Pega tu URI de MongoDB Atlas** en el campo "MongoDB URI"
4. **Haz clic en "Probar conexión"** - debe aparecer ✅
5. **Haz clic en "Guardar configuración"**

### Ejemplo de URI:
```
mongodb+srv://usuario:password@cluster.mongodb.net/oc_servicios
```

## 📁 Configuración de Archivos Excel

### Paso 1: Configurar Rutas de Archivos
En la página de configuración, pega estas rutas exactas:

**Archivo de Citas:**
```
C:\Users\Lucas\OneDrive - Grupo Opencars\uipath\OC Services\Files_init_promt\Citas_FechaCreación_01062025_to_06102025.xlsx
```

**Archivo de Ingresos:**
```
C:\Users\Lucas\OneDrive - Grupo Opencars\uipath\OC Services\Files_init_promt\Ingresos_FechaCreación_01062025_to_06102025.xlsx
```

### Paso 2: Importar Datos
1. **Haz clic en "Importar datos ahora"**
2. **Espera** a que termine la importación
3. **Verifica** el mensaje de éxito

## 🔍 Verificación

### 1. Página de Diagnóstico
1. **Ve a "Diagnóstico"** en el menú lateral
2. **Verifica que:**
   - ✅ MongoDB esté conectado
   - ✅ Las colecciones tengan datos (no 0 documentos)
   - ✅ Los archivos Excel estén configurados

### 2. MongoDB Compass
1. **Abre MongoDB Compass**
2. **Conecta con tu URI de MongoDB Atlas**
3. **Verifica la base de datos `oc_servicios`:**
   - Colección `citas` con ~9243 documentos
   - Colección `ingresos` con datos
   - Colección `configuracion` con configuración

## 🐛 Solución de Problemas

### Error: "MongoDB no está conectado"
- Verifica que la URI de MongoDB Atlas sea correcta
- Asegúrate de que el usuario tenga permisos de lectura/escritura
- Verifica que la IP esté en la whitelist de MongoDB Atlas

### Error: "Archivo no encontrado"
- Verifica que las rutas de los archivos Excel sean correctas
- Asegúrate de que los archivos existan en esas ubicaciones

### Error: "Datos no se guardan"
- Verifica la conexión a MongoDB en el diagnóstico
- Revisa los logs del backend para errores específicos

### La aplicación se congela
- Presiona F5 para recargar la página
- Verifica que ambos servidores estén ejecutándose
- Revisa la consola del navegador para errores

## 📞 Soporte

Si tienes problemas:
1. **Revisa la página de Diagnóstico** primero
2. **Verifica los logs** en las ventanas de terminal
3. **Comprueba MongoDB Compass** para ver si los datos se guardaron
4. **Reinicia la aplicación** si es necesario

---

**¡Listo! Tu aplicación OC Servicios debería estar funcionando correctamente.**





