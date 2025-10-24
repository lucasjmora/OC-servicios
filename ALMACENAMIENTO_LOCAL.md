# Almacenamiento Local de Configuración

## Descripción

El sistema de almacenamiento local de OC Servicios proporciona persistencia de la configuración de conexión a MongoDB mediante archivos JSON locales. Esto garantiza que la aplicación pueda funcionar incluso cuando no hay conexión a internet o cuando MongoDB Atlas no está disponible.

## Características

### ✅ **Persistencia Garantizada**
- La configuración se almacena localmente en archivos JSON
- Los datos persisten entre reinicios del servidor
- No se pierde la configuración al actualizar la aplicación

### ✅ **Sincronización Automática**
- Se sincroniza automáticamente con MongoDB cuando está disponible
- Mantiene la configuración actualizada en ambos lugares
- Funciona offline cuando no hay conexión a MongoDB

### ✅ **Respaldo Automático**
- Crea respaldos automáticos de la configuración
- Permite restaurar configuraciones anteriores
- Mantiene un historial de cambios

## Estructura de Archivos

```
backend/
├── data/                          # Directorio de almacenamiento local
│   ├── config.json               # Configuración principal
│   └── config_backup_*.json      # Respaldos automáticos
```

## Configuración Almacenada

El archivo `config.json` contiene:

```json
{
  "mongodb": {
    "uri": "mongodb+srv://...",
    "database": "oc_servicios",
    "collections": {
      "citas": "citas",
      "ingresos": "ingresos"
    }
  },
  "filePaths": {
    "citas": "ruta/al/archivo/citas.xlsx",
    "ingresos": "ruta/al/archivo/ingresos.xlsx"
  },
  "scheduler": {
    "enabled": false,
    "cronExpression": "0 0 */6 * *",
    "lastRun": null,
    "nextRun": null
  },
  "mappings": {
    "talleres": [],
    "usuarios": [],
    "campos": {}
  },
  "lastImport": null,
  "lastUpdated": "2025-01-06T...",
  "version": "1.0.0"
}
```

## Funcionamiento

### 1. **Inicio de la Aplicación**
- Se inicializa el servicio de almacenamiento local
- Se carga la configuración desde `config.json`
- Si hay conexión a MongoDB, se sincroniza la configuración

### 2. **Conexión a MongoDB**
- Prioridad 1: URI desde archivo `.env`
- Prioridad 2: URI desde configuración local
- Prioridad 3: Solicitar configuración desde interfaz web

### 3. **Sincronización**
- Cuando MongoDB está disponible, se sincroniza automáticamente
- Los cambios se guardan tanto en MongoDB como localmente
- Se mantiene consistencia entre ambos almacenamientos

### 4. **Respaldos**
- Se crean respaldos automáticos con timestamp
- Se pueden crear respaldos manuales desde la API
- Se pueden restaurar configuraciones anteriores

## API Endpoints

### Obtener Configuración
```
GET /api/config
```
Retorna la configuración actual (local o sincronizada con MongoDB).

### Obtener Información de Almacenamiento Local
```
GET /api/config/local-storage
```
Retorna información sobre el archivo de configuración local.

### Crear Respaldo
```
POST /api/config/backup
```
Crea un respaldo de la configuración actual.

## Ventajas

### 🚀 **Rendimiento**
- Carga instantánea de configuración desde archivo local
- No depende de la velocidad de conexión a MongoDB
- Funciona offline

### 🔒 **Confiabilidad**
- No se pierde configuración por problemas de red
- Respaldos automáticos para recuperación
- Funcionamiento independiente de MongoDB

### 🔄 **Flexibilidad**
- Sincronización bidireccional con MongoDB
- Funciona con o sin conexión a internet
- Fácil migración entre entornos

## Solución de Problemas

### Problema: Configuración no se carga
**Solución:**
1. Verificar que existe el archivo `backend/data/config.json`
2. Verificar permisos de escritura en el directorio `backend/data/`
3. Revisar logs del servidor para errores específicos

### Problema: No se sincroniza con MongoDB
**Solución:**
1. Verificar conexión a internet
2. Verificar que MongoDB Atlas esté disponible
3. Verificar que la URI de MongoDB sea correcta

### Problema: Respaldos no se crean
**Solución:**
1. Verificar permisos de escritura en `backend/data/`
2. Verificar espacio en disco disponible
3. Revisar logs del servidor

## Mantenimiento

### Limpieza de Respaldos Antiguos
Los respaldos se pueden limpiar manualmente:
```bash
# Eliminar respaldos de más de 30 días
find backend/data/ -name "config_backup_*.json" -mtime +30 -delete
```

### Migración de Configuración
Para migrar configuración entre entornos:
1. Copiar el archivo `config.json`
2. Actualizar las rutas de archivos Excel si es necesario
3. Verificar la URI de MongoDB

## Seguridad

### ⚠️ **Consideraciones Importantes**
- El archivo `config.json` contiene credenciales sensibles
- No incluir en repositorios de código
- Usar permisos de archivo restrictivos
- Considerar encriptación para entornos de producción

### Recomendaciones
- Agregar `backend/data/` al `.gitignore`
- Configurar permisos 600 en el archivo de configuración
- Implementar rotación de credenciales periódica
- Usar variables de entorno para credenciales en producción




