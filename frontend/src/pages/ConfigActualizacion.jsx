import React, { useEffect, useState } from 'react';
import { 
  getConfig, 
  updateConfig, 
  executeManualImport, 
  testConnection,
  getImportStatus,
  getLastSuccessfulImport 
} from '../services/api';
import PageHeader from '../components/PageHeader';
import ImportProgress from '../components/ImportProgress';
import { 
  FaDatabase, 
  FaSync, 
  FaCheckCircle, 
  FaExclamationTriangle,
  FaClock
} from 'react-icons/fa';
import { safeFormatDateTime } from '../utils/dateUtils';

const ConfigActualizacion = () => {
  const [config, setConfig] = useState({
    mongodb: {
      uri: '',
      database: 'oc_servicios',
      collections: {
        citas: 'citas',
        ingresos: 'ingresos'
      }
    },
    filePaths: {
      citas: '',
      ingresos: ''
    },
    scheduler: {
      enabled: false,
      cronExpression: '0 */6 * * *'
    }
  });
  
  const [lastImport, setLastImport] = useState(null);
  const [lastSuccessfulImport, setLastSuccessfulImport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      const initializeData = async () => {
        console.log('Iniciando carga de configuración...');
        try {
          await loadConfig();
          console.log('Configuración cargada exitosamente');
          await loadImportStatus();
          console.log('Estado de importación cargado exitosamente');
          await loadLastSuccessfulImport();
          console.log('Última importación exitosa cargada exitosamente');
        } catch (error) {
          console.error('Error durante la inicialización:', error);
        }
      };
      
      // Retrasar la inicialización para asegurar que el componente esté montado
      const timer = setTimeout(() => {
        initializeData();
        setIsInitialized(true);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  const loadConfig = async () => {
    try {
      console.log('Iniciando llamada a getConfig()...');
      setLoading(true);
      const response = await getConfig();
      console.log('Respuesta recibida:', response);
      if (response.data) {
        setConfig(response.data);
        setMessage({ type: 'success', text: 'Configuración cargada correctamente' });
        console.log('Configuración actualizada:', response.data);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      console.error('Detalles del error:', {
        message: error.message,
        code: error.code,
        response: error.response?.data
      });
      if (error.code === 'ECONNABORTED') {
        setMessage({ type: 'error', text: 'Timeout: El servidor no responde. Verifica que esté ejecutándose.' });
      } else {
        setMessage({ type: 'error', text: `Error cargando configuración: ${error.message}` });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadImportStatus = async () => {
    try {
      const response = await getImportStatus();
      if (response.data) {
        setLastImport(response.data.lastImport);
      }
    } catch (error) {
      console.error('Error cargando estado de importación:', error);
      // No mostrar error para el estado de importación, es opcional
      setLastImport(null);
    }
  };

  const loadLastSuccessfulImport = async () => {
    try {
      const response = await getLastSuccessfulImport();
      if (response.data.success && response.data.data) {
        setLastSuccessfulImport(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando última importación exitosa:', error);
      setLastSuccessfulImport(null);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      await updateConfig(config);
      setMessage({ type: 'success', text: 'Configuración guardada correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error guardando configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const response = await testConnection(config.mongodb.uri);
      
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Conexión exitosa a MongoDB' });
      } else {
        setMessage({ type: 'error', text: 'Error en conexión a MongoDB' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleManualImport = async () => {
    try {
      setImporting(true);
      setShowProgress(true);
      setMessage({ type: 'info', text: 'Iniciando importación optimizada... Esto puede tomar hasta 10 minutos.' });
      
      console.log('Iniciando importación manual...');
      const response = await executeManualImport();
      console.log('Respuesta de importación:', response);
      
      if (response.data.status === 'success') {
        setMessage({ 
          type: 'success', 
          text: `Importación exitosa. Citas nuevas: ${response.data.citas?.nuevos || 0}, Ingresos nuevos: ${response.data.ingresos?.nuevos || 0}` 
        });
        loadImportStatus();
      } else {
        setMessage({ type: 'error', text: `Error en importación: ${response.data.error}` });
      }
    } catch (error) {
      console.error('Error en importación manual:', error);
      console.error('Detalles del error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      if (error.code === 'ECONNABORTED') {
        setMessage({ 
          type: 'error', 
          text: 'Timeout: La importación está tardando más de 10 minutos. Los archivos podrían ser muy grandes o hay problemas de conectividad. Intenta nuevamente.' 
        });
      } else if (error.response?.status === 500) {
        setMessage({ 
          type: 'error', 
          text: `Error del servidor: ${error.response?.data?.error || error.message}` 
        });
      } else {
        setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
      }
    } finally {
      setImporting(false);
      setTimeout(() => setMessage(null), 10000);
    }
  };

  const handleImportComplete = () => {
    setShowProgress(false);
    loadImportStatus();
    loadLastSuccessfulImport();
  };

  return (
    <div className="p-8">
      <PageHeader 
        title="Actualización de Datos" 
        subtitle="Configuración de conexión y archivos Excel"
      />

      {message && (
        <div className={`mb-6 p-4 rounded-lg border fade-in ${
          message.type === 'success' ? 'bg-status-success/10 border-status-success text-status-success' :
          message.type === 'error' ? 'bg-status-danger/10 border-status-danger text-status-danger' :
          'bg-status-info/10 border-status-info text-status-info'
        }`}>
          {message.text}
        </div>
      )}

      {/* Componente de progreso */}
      {showProgress && (
        <div className="mb-6">
          <ImportProgress onComplete={handleImportComplete} />
        </div>
      )}

      {/* Configuración MongoDB */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FaDatabase />
          Conexión MongoDB Atlas
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              URI de Conexión
            </label>
            <input
              type="text"
              value={config.mongodb?.uri || ''}
              onChange={(e) => setConfig({
                ...config,
                mongodb: { ...config.mongodb, uri: e.target.value }
              })}
              placeholder="mongodb+srv://usuario:password@cluster.mongodb.net/"
              className="w-full font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Base de Datos
              </label>
              <input
                type="text"
                value={config.mongodb?.database || ''}
                onChange={(e) => setConfig({
                  ...config,
                  mongodb: { ...config.mongodb, database: e.target.value }
                })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Colección Citas
              </label>
              <input
                type="text"
                value={config.mongodb?.collections?.citas || ''}
                onChange={(e) => setConfig({
                  ...config,
                  mongodb: { 
                    ...config.mongodb, 
                    collections: { ...config.mongodb.collections, citas: e.target.value }
                  }
                })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Colección Ingresos
              </label>
              <input
                type="text"
                value={config.mongodb?.collections?.ingresos || ''}
                onChange={(e) => setConfig({
                  ...config,
                  mongodb: { 
                    ...config.mongodb, 
                    collections: { ...config.mongodb.collections, ingresos: e.target.value }
                  }
                })}
                className="w-full"
              />
            </div>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testing || !config.mongodb?.uri}
            className="px-4 py-2 bg-status-info text-white rounded-lg hover:bg-status-info/80 disabled:opacity-50 transition-colors"
          >
            {testing ? 'Probando...' : 'Probar Conexión'}
          </button>
        </div>
      </div>

      {/* Rutas de archivos Excel */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Rutas de Archivos Excel
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Archivo de Citas
            </label>
            <input
              type="text"
              value={config.filePaths?.citas || ''}
              onChange={(e) => setConfig({
                ...config,
                filePaths: { ...config.filePaths, citas: e.target.value }
              })}
              placeholder="C:\ruta\al\archivo\Citas.xlsx"
              className="w-full font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Archivo de Ingresos
            </label>
            <input
              type="text"
              value={config.filePaths?.ingresos || ''}
              onChange={(e) => setConfig({
                ...config,
                filePaths: { ...config.filePaths, ingresos: e.target.value }
              })}
              placeholder="C:\ruta\al\archivo\Ingresos.xlsx"
              className="w-full font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Scheduler */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FaClock />
          Actualización Automática (Scheduler)
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.scheduler?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  scheduler: { ...config.scheduler, enabled: e.target.checked }
                })}
                className="w-4 h-4"
              />
              <span className="text-gray-300">Habilitar actualización automática</span>
            </label>
          </div>

          {config.scheduler?.enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Expresión Cron
              </label>
              <input
                type="text"
                value={config.scheduler?.cronExpression || ''}
                onChange={(e) => setConfig({
                  ...config,
                  scheduler: { ...config.scheduler, cronExpression: e.target.value }
                })}
                placeholder="0 */6 * * *"
                className="w-full font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ejemplo: "0 */6 * * *" = cada 6 horas
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleSaveConfig}
          disabled={loading}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors font-semibold"
        >
          {loading ? 'Guardando...' : 'Guardar Configuración'}
        </button>

        <button
          onClick={handleManualImport}
          disabled={importing}
          className="px-6 py-3 bg-status-success text-white rounded-lg hover:bg-status-success/80 disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
        >
          <FaSync className={importing ? 'animate-spin' : ''} />
          {importing ? 'Importando...' : 'Actualizar Ahora'}
        </button>
      </div>

      {/* Estado de última importación */}
      {lastImport && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FaClock />
            Última Importación
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Fecha y Hora</p>
              <p className="text-white mt-1">
                {safeFormatDateTime(lastImport.timestamp)}
              </p>
            </div>

            <div>
              <p className="text-gray-400 text-sm">Estado</p>
              <div className="flex items-center gap-2 mt-1">
                {lastImport.status === 'success' ? (
                  <>
                    <FaCheckCircle className="text-status-success" />
                    <span className="text-white">Exitosa</span>
                  </>
                ) : (
                  <>
                    <FaExclamationTriangle className="text-status-warning" />
                    <span className="text-white">Con errores</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-sm">Duración</p>
              <p className="text-white mt-1">
                {lastImport.duration ? `${(lastImport.duration / 1000).toFixed(2)}s` : '-'}
              </p>
            </div>

            <div>
              <p className="text-gray-400 text-sm">Total Registros</p>
              <p className="text-white mt-1">
                {lastImport.summary?.totalRegistros || 0}
              </p>
            </div>
          </div>

          {lastImport.summary && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Estadísticas Detalladas</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastImport.summary.citasNuevas || 0}</p>
                  <p className="text-gray-400">Citas nuevas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastImport.summary.citasActualizadas || 0}</p>
                  <p className="text-gray-400">Citas actualizadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastImport.summary.ingresosNuevos || 0}</p>
                  <p className="text-gray-400">Ingresos nuevos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastImport.summary.ingresosActualizados || 0}</p>
                  <p className="text-gray-400">Ingresos actualizados</p>
                </div>
              </div>

              {/* Estadísticas de asistencia */}
              {lastImport.summary.asistenciaCalculada && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Análisis de Asistencia</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{lastImport.summary.asistenciaCalculada.conAsistencia}</p>
                      <p className="text-gray-400">Asistieron</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{lastImport.summary.asistenciaCalculada.sinAsistencia}</p>
                      <p className="text-gray-400">No asistieron</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {lastImport.error && (
            <div className="mt-4 p-3 bg-status-danger/10 border border-status-danger rounded text-status-danger text-sm">
              <strong>Error:</strong> {lastImport.error}
            </div>
          )}
        </div>
      )}

      {/* Registro de Última Actualización Correcta */}
      {lastSuccessfulImport && (
        <div className="bg-background-card border border-green-500/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FaCheckCircle className="text-green-500" />
            Registro de Última Actualización Correcta
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <FaClock className="text-gray-400" />
              <div>
                <span className="text-gray-300 text-sm">Fecha:</span>
                <p className="text-white font-medium">{safeFormatDateTime(lastSuccessfulImport.timestamp)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FaSync className="text-gray-400" />
              <div>
                <span className="text-gray-300 text-sm">Duración:</span>
                <p className="text-white font-medium">{lastSuccessfulImport.duration ? `${(lastSuccessfulImport.duration / 1000).toFixed(2)}s` : '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FaCheckCircle className="text-green-400" />
              <div>
                <span className="text-gray-300 text-sm">Estado:</span>
                <p className="text-green-400 font-medium">✅ Completada</p>
              </div>
            </div>
          </div>

          {/* Estadísticas detalladas */}
          {lastSuccessfulImport.citas && lastSuccessfulImport.ingresos && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Estadísticas de la Importación</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessfulImport.citas.nuevos || 0}</p>
                  <p className="text-gray-400">Citas nuevas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessfulImport.citas.actualizados || 0}</p>
                  <p className="text-gray-400">Citas actualizadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessfulImport.ingresos.nuevos || 0}</p>
                  <p className="text-gray-400">Ingresos nuevos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessfulImport.ingresos.actualizados || 0}</p>
                  <p className="text-gray-400">Ingresos actualizados</p>
                </div>
              </div>

              {/* Estadísticas de asistencia */}
              {lastSuccessfulImport.asistencia && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Análisis de Asistencia</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{lastSuccessfulImport.asistencia.conAsistencia}</p>
                      <p className="text-gray-400">Asistieron</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{lastSuccessfulImport.asistencia.sinAsistencia}</p>
                      <p className="text-gray-400">No asistieron</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sin importaciones exitosas */}
      {!lastImport && !lastSuccessfulImport && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FaExclamationTriangle className="text-yellow-500" />
            Sin Importaciones
          </h3>
          <p className="text-gray-300">
            No se ha ejecutado ninguna importación exitosa aún. Configura las rutas de archivos y ejecuta la primera importación.
          </p>
        </div>
      )}
    </div>
  );
};

export default ConfigActualizacion;


