import React, { useEffect, useState, useRef } from 'react';
import { 
  getConfig, 
  updateConfig, 
  executeManualImport, 
  getImportStatus,
  getImportProgress,
  postImportModule
} from '../services/api';
import { safeFormatDateTime } from '../utils/dateUtils';
import PageHeader from '../components/PageHeader';
import ImportProgress from '../components/ImportProgress';
import {
  FaSync,
  FaExclamationTriangle,
  FaClock
} from 'react-icons/fa';

/** Presup CRM (misma config persistida que /api/presup-crm/config). */
const defaultPresupCrm = () => ({
  mongodb: {
    uri: '',
    database: 'Presupuestos',
    collection: 'presup_taller',
    collectionTalleres: 'talleres'
  },
  excel: { filePath: '' },
  scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
  talleres: [],
  aceites: [],
  general: {},
  lastImport: null
});

const ConfigActualizacion = () => {
  const [config, setConfig] = useState({
    mongodb: {
      uri: '',
      database: 'oc_servicios',
      collections: {
        citas: 'citas',
        ingresos: 'ingresos',
        unidadesParadas: 'unidades_paradas',
        legales: 'legales'
      }
    },
    filePaths: {
      citas: '',
      ingresos: '',
      orsAbiertas: '',
      presupuestos: ''
    },
    scheduler: {
      enabled: false,
      cronExpression: '0 */6 * * *'
    },
    presupCrm: defaultPresupCrm()
  });
  
  const [lastImport, setLastImport] = useState(null);
  /** Claves backend: ventas, citas, ingresos, orsAbiertas, presupuestos */
  const [lastImportByModule, setLastImportByModule] = useState({});
  const [moduleImporting, setModuleImporting] = useState(null);
  const [savingScheduler, setSavingScheduler] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const setConfigFromApiData = (d) => {
    if (!d || typeof d !== 'object') return;
    const { envSourceHints: _hints, ...rest } = d;
    setConfig({
      ...rest,
      presupCrm: {
        ...defaultPresupCrm(),
        ...rest.presupCrm,
        mongodb: { ...defaultPresupCrm().mongodb, ...rest.presupCrm?.mongodb },
        excel: { ...defaultPresupCrm().excel, ...rest.presupCrm?.excel },
        scheduler: { ...defaultPresupCrm().scheduler, ...rest.presupCrm?.scheduler },
        talleres: rest.presupCrm?.talleres ?? defaultPresupCrm().talleres,
        aceites: rest.presupCrm?.aceites ?? defaultPresupCrm().aceites,
        general: rest.presupCrm?.general ?? defaultPresupCrm().general,
        lastImport: rest.presupCrm?.lastImport ?? defaultPresupCrm().lastImport
      }
    });
  };

  useEffect(() => {
    if (!isInitialized) {
      const initializeData = async () => {
        console.log('Iniciando carga de configuración...');
        try {
          await loadConfig();
          console.log('Configuración cargada exitosamente');
          await loadImportStatus();
          console.log('Estado de importación cargado exitosamente');
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

  const configRef = useRef(config);
  configRef.current = config;
  const persistCronTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(persistCronTimerRef.current);
  }, []);

  const buildConfigPayload = (cfg) => ({
    ...cfg,
    presupCrm: {
      ...defaultPresupCrm(),
      ...cfg.presupCrm,
      mongodb: { ...defaultPresupCrm().mongodb, ...cfg.presupCrm?.mongodb },
      excel: { ...defaultPresupCrm().excel, ...cfg.presupCrm?.excel },
      scheduler: { ...defaultPresupCrm().scheduler, ...cfg.presupCrm?.scheduler },
      talleres: cfg.presupCrm?.talleres ?? defaultPresupCrm().talleres,
      aceites: cfg.presupCrm?.aceites ?? defaultPresupCrm().aceites,
      general: cfg.presupCrm?.general ?? defaultPresupCrm().general,
      lastImport: cfg.presupCrm?.lastImport ?? defaultPresupCrm().lastImport
    }
  });

  const persistConfig = async (cfg) => {
    try {
      setSavingScheduler(true);
      const saveRes = await updateConfig(buildConfigPayload(cfg));
      if (saveRes?.data) setConfigFromApiData(saveRes.data);
      setMessage({ type: 'success', text: 'Scheduler guardado' });
      setTimeout(() => setMessage(null), 2500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error guardando el scheduler' });
    } finally {
      setSavingScheduler(false);
    }
  };

  const loadConfig = async () => {
    try {
      console.log('Iniciando llamada a getConfig()...');
      const response = await getConfig();
      console.log('Respuesta recibida:', response);
      if (response.data) {
        setConfigFromApiData(response.data);
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
    }
  };

  const loadImportStatus = async () => {
    try {
      const response = await getImportStatus();
      if (response.data) {
        setLastImport(response.data.lastImport);
        setLastImportByModule(response.data.lastImportByModule || {});
      }
      
      // Verificar si hay una importación en curso
      try {
        const progressResponse = await getImportProgress();
        if (progressResponse.data?.data?.isRunning) {
          setShowProgress(true);
          console.log('Importación en curso detectada, mostrando componente de progreso');
        }
      } catch (progressError) {
        // Ignorar errores al verificar progreso, es opcional
        console.log('No se pudo verificar progreso:', progressError.message);
      }
    } catch (error) {
      console.error('Error cargando estado de importación:', error);
      // No mostrar error para el estado de importación, es opcional
      setLastImport(null);
      setLastImportByModule({});
    }
  };

  const importBusy =
    importing || showProgress || moduleImporting !== null;

  const MODULE_ROWS = [
    { label: 'Ventas', apiKey: 'ventas', tsKey: 'ventas' },
    { label: 'Citas', apiKey: 'citas', tsKey: 'citas' },
    { label: 'Ingresos', apiKey: 'ingresos', tsKey: 'ingresos' },
    {
      label: 'Accesorios (Boletos)',
      apiKey: 'boletos',
      tsKey: 'boletos',
      hint: 'Sincronización desde la API de reservas (BOLETOS_PAT en .env).'
    },
    { label: 'ORs abiertas', apiKey: 'ors', tsKey: 'orsAbiertas' },
    { label: 'Presupuestos', apiKey: 'presupuestos', tsKey: 'presupuestos' }
  ];

  const handleModuleImport = async (apiKey) => {
    if (importBusy) return;
    try {
      setModuleImporting(apiKey);
      setMessage(null);
      await postImportModule(apiKey);
      setMessage({
        type: 'success',
        text: `Actualización de «${MODULE_ROWS.find((r) => r.apiKey === apiKey)?.label || apiKey}» completada.`
      });
      await loadImportStatus();
    } catch (error) {
      const status = error.response?.status;
      const msg =
        status === 409
          ? 'Ya hay una importación de citas/ingresos en curso. Esperá a que termine.'
          : error.response?.data?.error ||
            error.response?.data?.details?.join?.('\n') ||
            error.message;
      setMessage({ type: 'error', text: String(msg) });
    } finally {
      setModuleImporting(null);
    }
  };

  const handleManualImport = async () => {
    try {
      setImporting(true);
      setShowProgress(true);
      setMessage({ type: 'info', text: 'Iniciando importación optimizada... Esto puede tomar hasta 10 minutos.' });
      
      console.log('Iniciando importación manual...');
      
      // Ejecutar importación con manejo de errores mejorado
      let response;
      try {
        response = await executeManualImport();
        console.log('Respuesta de importación:', response);
      } catch (importError) {
        // Si hay un error de conexión o timeout, la importación puede seguir en el backend
        // Solo mostrar el error pero no cerrar el componente de progreso
        console.error('Error en petición de importación:', importError);
        
        if (importError.code === 'ECONNABORTED' || importError.message?.includes('timeout')) {
          setMessage({ 
            type: 'info', 
            text: 'La importación se inició en el servidor. El progreso se mostrará a continuación. Esto puede tomar varios minutos.' 
          });
          // No cerrar el componente de progreso, dejar que muestre el estado
          return;
        }
        throw importError; // Re-lanzar para manejo general
      }
      
      if (response?.data?.status === 'success') {
        setMessage({ 
          type: 'success', 
          text: `Importación exitosa. Citas nuevas: ${response.data.citas?.nuevos || 0}, Ingresos nuevos: ${response.data.ingresos?.nuevos || 0}` 
        });
        await loadImportStatus();
        setShowProgress(false);
      } else if (response?.data?.status === 'in_progress') {
        // La importación está en progreso, el componente de progreso lo manejará
        setMessage({ 
          type: 'info', 
          text: 'Importación iniciada. El progreso se mostrará a continuación.' 
        });
      } else {
        setMessage({ type: 'error', text: `Error en importación: ${response?.data?.error || 'Error desconocido'}` });
        setShowProgress(false);
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
      
      // Manejar diferentes tipos de errores sin cerrar el frontend
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        setMessage({ 
          type: 'info', 
          text: 'La petición tardó demasiado. La importación puede estar ejecutándose en el servidor. Verifica el progreso más abajo.' 
        });
        // No cerrar el componente de progreso, puede que la importación siga
      } else if (error.response?.status === 500) {
        setMessage({ 
          type: 'error', 
          text: `Error del servidor: ${error.response?.data?.error || error.message}. Verifica los logs del servidor.` 
        });
        setShowProgress(false);
      } else if (error.response?.status === 400) {
        const d = error.response?.data;
        const detailTxt = Array.isArray(d?.details) ? `\n${d.details.join('\n')}` : '';
        setMessage({
          type: 'error',
          text: `Error de configuración: ${d?.error || error.message}${detailTxt}`
        });
        setShowProgress(false);
      } else if (!error.response) {
        // Error de red
        setMessage({ 
          type: 'error', 
          text: 'Error de conexión con el servidor. Verifica que el backend esté ejecutándose.' 
        });
        setShowProgress(false);
      } else {
        setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
        setShowProgress(false);
      }
    } finally {
      setImporting(false);
      // El mensaje se mantendrá visible para mostrar el progreso
    }
  };

  const handleImportComplete = () => {
    setShowProgress(false);
    loadImportStatus();
  };

  return (
    <div className="p-8">
      <PageHeader 
        title="Actualización de Datos" 
        subtitle="Importación Citas/Ingresos y programación automática (el scheduler se guarda al cambiarlo). Rutas Excel y MongoDB: .env del servidor."
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

      {/* Scheduler */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FaClock />
          Actualización Automática (Scheduler)
        </h3>
        
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.scheduler?.enabled || false}
                onChange={(e) => {
                  const next = {
                    ...config,
                    scheduler: { ...config.scheduler, enabled: e.target.checked }
                  };
                  setConfig(next);
                  void persistConfig(next);
                }}
                className="w-4 h-4"
              />
              <span className="text-gray-300">Habilitar actualización automática</span>
            </label>
            {savingScheduler && (
              <span className="text-xs text-gray-500">Guardando…</span>
            )}
          </div>

          {config.scheduler?.enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Expresión Cron
              </label>
              <input
                type="text"
                value={config.scheduler?.cronExpression || ''}
                onChange={(e) => {
                  const cronExpression = e.target.value;
                  setConfig((prev) => ({
                    ...prev,
                    scheduler: { ...prev.scheduler, cronExpression }
                  }));
                  clearTimeout(persistCronTimerRef.current);
                  persistCronTimerRef.current = setTimeout(() => {
                    void persistConfig(configRef.current);
                  }, 600);
                }}
                placeholder="0 */6 * * *"
                className="w-full font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ejemplo: "0 */6 * * *" = cada 6 horas (se guarda al dejar de escribir un momento)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Importación por módulo (rutas .env / config en servidor) */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Actualización por módulo
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Última actualización por origen de datos. Cada botón ejecuta solo ese tramo (sin la importación completa).
        </p>
        <ul className="space-y-3">
          {MODULE_ROWS.map((row) => {
            const ts = lastImportByModule[row.tsKey];
            const loading = moduleImporting === row.apiKey;
            return (
              <li
                key={row.apiKey}
                className="flex flex-wrap items-center justify-between gap-3 border border-gray-700/80 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-white font-medium">{row.label}</span>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Última actualización:{' '}
                    <span className="text-gray-300">
                      {ts ? safeFormatDateTime(ts) : '—'}
                    </span>
                  </p>
                  {row.hint && (
                    <p className="text-xs text-gray-500 mt-1">{row.hint}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleModuleImport(row.apiKey)}
                  disabled={importBusy}
                  className="shrink-0 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
                >
                  <FaSync className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Actualizando…' : 'Actualizar'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleManualImport}
          disabled={importBusy}
          className="px-6 py-3 bg-status-success text-white rounded-lg hover:bg-status-success/80 disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
        >
          <FaSync className={importing ? 'animate-spin' : ''} />
          {importing ? 'Actualizando todo…' : 'Actualizar todo'}
        </button>
      </div>

      {lastImport?.error && (
        <div className="mb-6 p-3 bg-status-danger/10 border border-status-danger rounded text-status-danger text-sm">
          <strong>Error (última importación):</strong> {lastImport.error}
        </div>
      )}

      {/* Sin importación completa aún (global lastImport); los módulos pueden tener fecha propia arriba */}
      {!lastImport &&
        !Object.values(lastImportByModule || {}).some(Boolean) && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FaExclamationTriangle className="text-yellow-500" />
            Sin importaciones
          </h3>
          <p className="text-gray-300">
            No se ha ejecutado ninguna importación exitosa aún. Definí las rutas Excel y MongoDB en el{' '}
            <code className="text-gray-400">.env</code> del servidor y usá «Actualizar todo» para la primera importación
            completa, o un módulo concreto arriba. La importación de presupuestos CRM puede hacerse desde Presup CRM o por API.
          </p>
        </div>
      )}
    </div>
  );
};

export default ConfigActualizacion;


