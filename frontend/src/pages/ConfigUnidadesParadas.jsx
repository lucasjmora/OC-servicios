import { useEffect, useState } from 'react';
import { getConfigUnidadesParadas, updateConfigUnidadesParadas } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaSave, FaInfoCircle } from 'react-icons/fa';

const ConfigUnidadesParadas = () => {
  const [config, setConfig] = useState({
    diasSinComentarios: 7
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
      const response = await getConfigUnidadesParadas();
      
      if (response.data) {
        setConfig({
          diasSinComentarios: response.data.diasSinComentarios || 7
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

      await updateConfigUnidadesParadas({
        diasSinComentarios: parseInt(config.diasSinComentarios)
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

  const handleInputChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Parámetros de Unidades Paradas"
        subtitle="Configuración de parámetros para el sistema de unidades paradas"
        icon={<FaInfoCircle className="text-blue-400" />}
      />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Mensaje de estado */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
            message.includes('Error') 
              ? 'bg-red-900/20 border border-red-500/30 text-red-300' 
              : 'bg-green-900/20 border border-green-500/30 text-green-300'
          }`}>
            <FaInfoCircle />
            {message}
          </div>
        )}

        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Configuración de Estados</h2>
          
          <div className="space-y-6">
            {/* Días sin comentarios para estado pendiente */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Días sin comentarios para estado "Pendiente"
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={config.diasSinComentarios}
                  onChange={(e) => handleInputChange('diasSinComentarios', e.target.value)}
                  className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <span className="text-gray-400">días</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Un caso se marcará como "Pendiente" si no tiene comentarios en el período especificado.
              </p>
            </div>

            {/* Información adicional */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-300 mb-2">Información sobre estados:</h3>
              <ul className="text-sm text-blue-200 space-y-1">
                <li>• <strong>Abierto:</strong> Caso activo con comentarios recientes</li>
                <li>• <strong>Pendiente:</strong> Caso sin comentarios en el período configurado</li>
                <li>• <strong>Cerrado:</strong> Caso finalizado (cuando el ingreso tiene fecha de cierre)</li>
              </ul>
            </div>
          </div>

          {/* Botón guardar */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <FaSave />
                  Guardar Configuración
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigUnidadesParadas;
