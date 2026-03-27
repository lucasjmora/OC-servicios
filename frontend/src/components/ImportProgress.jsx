import React, { useState, useEffect, useRef } from 'react';
import { getImportProgress } from '../services/api';
import { FaSync, FaClock, FaDatabase, FaExclamationTriangle } from 'react-icons/fa';

/**
 * Barra de progreso de la importación completa (executeImport).
 * No muestra resumen de última importación ni estadísticas (eso va en la página de actualización).
 */
const ImportProgress = ({ onComplete }) => {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const errorCountRef = useRef(0);
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);
  /** Evita llamar onComplete al montar si nunca hubo import en curso */
  const sawRunningRef = useRef(false);

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

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

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
      await loadProgress();
    } catch (error) {
      console.error('Error cargando datos:', error);
      if (isMountedRef.current) {
        setError(null);
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

      if (newProgress.isRunning) {
        sawRunningRef.current = true;
      } else if (sawRunningRef.current && onComplete) {
        sawRunningRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        onComplete();
      }
    } catch (error) {
      console.error('Error cargando progreso:', error);
      errorCountRef.current += 1;

      if (errorCountRef.current >= 3) {
        console.error('Demasiados errores consecutivos, deteniendo polling');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (isMountedRef.current) {
          setError(
            'No se pudo conectar con el servidor. La importación puede estar en progreso.'
          );
        }
      } else if (isMountedRef.current) {
        setError(`Error de conexión (${errorCountRef.current}/3). Reintentando...`);
      }
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

  const showBar = progress?.isRunning === true;

  if (!showBar && !error) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-status-danger/10 border border-status-danger rounded-lg p-4">
          <div className="flex items-center gap-2">
            <FaExclamationTriangle className="text-status-danger" />
            <span className="text-status-danger">{error}</span>
          </div>
        </div>
      )}

      {showBar && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="animate-spin">
              <FaSync className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-white">Importación en progreso</h3>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-300">
                {progress.currentStep || 'Procesando…'}
              </span>
              <span className="text-sm text-gray-400">{progress.percentage || 0}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.percentage || 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <FaClock className="text-gray-400" />
              <span className="text-gray-300">Tiempo transcurrido:</span>
              <span className="text-white font-medium">
                {formatTime(progress.elapsedTime)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FaDatabase className="text-gray-400" />
              <span className="text-gray-300">Estado:</span>
              <span className="text-white font-medium">
                {progress.details || '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportProgress;
