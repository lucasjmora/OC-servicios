import React, { useState, useEffect, useRef } from 'react';
import { getImportProgress, getLastSuccessfulImport } from '../services/api';
import { FaSync, FaCheckCircle, FaClock, FaDatabase, FaChartLine, FaSave, FaExclamationTriangle } from 'react-icons/fa';

const ImportProgress = ({ onComplete }) => {
  const [progress, setProgress] = useState(null);
  const [lastSuccessful, setLastSuccessful] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const errorCountRef = useRef(0);
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Actualizar intervalo cuando cambia el estado de ejecución
  useEffect(() => {
    // Limpiar intervalo anterior si existe
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Crear nuevo intervalo solo si está ejecutándose
    if (progress?.isRunning && isMountedRef.current) {
      intervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          loadProgress();
        }
      }, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [progress?.isRunning]);

  const loadData = async () => {
    try {
      setError(null);
      errorCountRef.current = 0;
      await Promise.all([
        loadProgress(),
        loadLastSuccessful()
      ]);
    } catch (error) {
      console.error('Error cargando datos:', error);
      if (isMountedRef.current) {
        // No mostrar error en la carga inicial, solo continuar
        // El componente mostrará el estado cuando se cargue
        setError(null);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadProgress = async () => {
    try {
      const response = await getImportProgress();
      const newProgress = response.data.data;

      if (!isMountedRef.current) return;

      setProgress(newProgress);
      setError(null);
      errorCountRef.current = 0;
      
      // Si terminó, recargar última exitosa
      if (!newProgress.isRunning && onComplete) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        await loadLastSuccessful();
        onComplete();
      }
    } catch (error) {
      console.error('Error cargando progreso:', error);
      errorCountRef.current += 1;

      // Si hay más de 3 errores consecutivos, detener el polling pero mantener el componente visible
      if (errorCountRef.current >= 3) {
        console.error('Demasiados errores consecutivos, deteniendo polling');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (isMountedRef.current) {
          setError('No se pudo conectar con el servidor. La importación puede estar en progreso, pero no se puede mostrar el estado.');
          // Mantener el progreso si existe, pero marcarlo como no ejecutándose
          // Esto permite que el componente se muestre con el mensaje de error
          if (!progress) {
            // Si no hay progreso previo, crear uno mínimo para que el componente se muestre
            setProgress({
              isRunning: false,
              currentStep: 'Error de conexión',
              percentage: 0,
              details: 'No se pudo obtener el estado de la importación'
            });
          } else {
            setProgress(prev => prev ? { ...prev, isRunning: false } : null);
          }
        }
      } else if (isMountedRef.current) {
        setError(`Error de conexión (${errorCountRef.current}/3). Reintentando...`);
      }
    }
  };

  const loadLastSuccessful = async () => {
    try {
      const response = await getLastSuccessfulImport();
      if (isMountedRef.current && response.data.data) {
        setLastSuccessful(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando última importación:', error);
      // No mostrar error para esto, es opcional
    }
  };

  const formatTime = (milliseconds) => {
    if (!milliseconds) return '0s';
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Mostrar loading si está cargando y no hay progreso */}
      {loading && !progress && !error && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="animate-spin">
              <FaSync className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-white">Cargando estado de importación...</h3>
          </div>
          <div className="animate-pulse">
            <div className="h-2 bg-gray-700 rounded w-full mb-2"></div>
            <div className="h-2 bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <div className="bg-status-danger/10 border border-status-danger rounded-lg p-4">
          <div className="flex items-center gap-2">
            <FaExclamationTriangle className="text-status-danger" />
            <span className="text-status-danger">{error}</span>
          </div>
        </div>
      )}

      {/* Progreso actual - mostrar si está ejecutándose O si hay progreso (incluso si no está ejecutándose) */}
      {(progress?.isRunning || progress) && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            {progress?.isRunning && (
              <div className="animate-spin">
                <FaSync className="text-primary" />
              </div>
            )}
            <h3 className="text-lg font-semibold text-white">
              {progress?.isRunning ? 'Importación en Progreso' : 'Estado de Importación'}
            </h3>
          </div>

          {/* Barra de progreso */}
          {progress && (
            <>
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">{progress.currentStep || 'Cargando...'}</span>
                  <span className="text-sm text-gray-400">{progress.percentage || 0}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage || 0}%` }}
                  ></div>
                </div>
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <FaClock className="text-gray-400" />
                  <span className="text-gray-300">Tiempo transcurrido:</span>
                  <span className="text-white font-medium">{formatTime(progress.elapsedTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FaDatabase className="text-gray-400" />
                  <span className="text-gray-300">Estado:</span>
                  <span className="text-white font-medium">{progress.details || 'Cargando...'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Última importación exitosa */}
      {lastSuccessful && (
        <div className="bg-background-card border border-green-500/30 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <FaCheckCircle className="text-green-500 text-xl" />
            <h3 className="text-lg font-semibold text-white">Última Importación Exitosa</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <FaClock className="text-gray-400" />
              <div>
                <span className="text-gray-300 text-sm">Fecha:</span>
                <p className="text-white font-medium">{formatDate(lastSuccessful.timestamp)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FaChartLine className="text-gray-400" />
              <div>
                <span className="text-gray-300 text-sm">Duración:</span>
                <p className="text-white font-medium">{formatTime(lastSuccessful.duration)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FaSave className="text-gray-400" />
              <div>
                <span className="text-gray-300 text-sm">Estado:</span>
                <p className="text-green-400 font-medium">✅ Completada</p>
              </div>
            </div>
          </div>

          {/* Estadísticas */}
          {lastSuccessful.citas && lastSuccessful.ingresos && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Estadísticas de la Importación</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.citas.nuevos || 0}</p>
                  <p className="text-gray-400">Citas nuevas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.citas.actualizados || 0}</p>
                  <p className="text-gray-400">Citas actualizadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.ingresos.nuevos || 0}</p>
                  <p className="text-gray-400">Ingresos nuevos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.ingresos.actualizados || 0}</p>
                  <p className="text-gray-400">Ingresos actualizados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.boletos?.nuevos || 0}</p>
                  <p className="text-gray-400">Boletos nuevos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{lastSuccessful.boletos?.actualizados || 0}</p>
                  <p className="text-gray-400">Boletos actualizados</p>
                </div>
              </div>

              {/* Estadísticas de asistencia */}
              {lastSuccessful.asistencia && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Análisis de Asistencia</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{lastSuccessful.asistencia.conAsistencia}</p>
                      <p className="text-gray-400">Asistieron</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{lastSuccessful.asistencia.sinAsistencia}</p>
                      <p className="text-gray-400">No asistieron</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sin importaciones - solo mostrar si no está cargando y no hay progreso */}
      {!loading && !progress?.isRunning && !progress && !lastSuccessful && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <FaExclamationTriangle className="text-yellow-500 text-xl" />
            <h3 className="text-lg font-semibold text-white">Sin Importaciones</h3>
          </div>
          <p className="text-gray-300">
            No se ha ejecutado ninguna importación exitosa aún.
          </p>
        </div>
      )}
    </div>
  );
};

export default ImportProgress;




