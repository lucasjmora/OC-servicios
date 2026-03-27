import { useEffect, useState } from 'react';
import { getConfig, updateConfigAsistencia } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaSave, FaInfoCircle } from 'react-icons/fa';

const ConfigAsistencia = ({ embedded = false }) => {
  const [config, setConfig] = useState({
    diasTolerancia: 3
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await getConfig();
      
      if (response.data.asistencia) {
        setConfig({
          diasTolerancia: response.data.asistencia.diasTolerancia || 3
        });
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      setMessage('Error cargando configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');

      await updateConfigAsistencia({
        diasTolerancia: parseInt(config.diasTolerancia)
      });

      setMessage('Configuración guardada exitosamente');
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error guardando configuración:', error);
      setMessage('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
    setMessage(''); // Limpiar mensaje al cambiar
  };

  if (loading) {
    return (
      <div className={embedded ? '' : 'p-8'}>
        {!embedded && <PageHeader title="Configuración de Asistencia" />}
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-400">Cargando configuración...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-8'}>
      {!embedded && (
        <PageHeader
          title="Configuración de Asistencia"
          subtitle="Parámetros para la detección de no asistencia"
        />
      )}

      <div className="bg-background-card border border-gray-700 rounded-lg p-6">
        <div className="max-w-2xl mx-auto">
          {/* Información general */}
          <div className="mb-8">
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <FaInfoCircle className="text-blue-400 mt-1 flex-shrink-0" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-2">¿Cómo funciona la detección de asistencia?</p>
                <ul className="space-y-1 text-blue-200">
                  <li>• Se comparan las citas con los ingresos por matrícula de vehículo</li>
                  <li>• Se busca el ingreso dentro del rango de días configurado</li>
                  <li>• Si no se encuentra ingreso en ese período, se marca como "sin asistencia"</li>
                  <li>• Este parámetro afecta la precisión de la detección</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Configuración principal */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Días de Tolerancia
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={config.diasTolerancia}
                  onChange={(e) => handleChange('diasTolerancia', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Número de días"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  días
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Número de días después de la fecha de cita para buscar el ingreso correspondiente.
                <br />
                <span className="text-yellow-400">
                  Recomendado: 3 días (permite flexibilidad en fechas de ingreso)
                </span>
              </p>
            </div>

            {/* Mensaje de estado */}
            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('Error') 
                  ? 'bg-red-900/20 border border-red-500/30 text-red-300' 
                  : 'bg-green-900/20 border border-green-500/30 text-green-300'
              }`}>
                {message}
              </div>
            )}

            {/* Botón guardar */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || config.diasTolerancia < 0 || config.diasTolerancia > 30}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <FaSave />
                    <span>Guardar Configuración</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Información adicional */}
          <div className="mt-8 p-4 bg-gray-800/50 border border-gray-600 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Configuración Actual</h4>
            <div className="text-sm text-gray-400 space-y-1">
              <p>• Días de tolerancia: <span className="text-white font-medium">{config.diasTolerancia}</span></p>
              <p>• Rango de búsqueda: desde fecha de cita hasta {config.diasTolerancia} días después</p>
              <p>• Campo de comparación: Matrícula del vehículo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigAsistencia;




