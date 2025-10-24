import { useState, useEffect } from 'react';
import { getConfigOportunidades, updateConfigOportunidades } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaLightbulb, FaSave, FaInfoCircle } from 'react-icons/fa';

const ConfigOportunidades = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [config, setConfig] = useState({
    palabrasClave: '',
    mesesDesdeCierre: 3
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await getConfigOportunidades();
      setConfig({
        palabrasClave: response.data.palabrasClave || '',
        mesesDesdeCierre: response.data.mesesDesdeCierre || 3
      });
    } catch (error) {
      console.error('Error cargando configuración:', error);
      setMessage({
        type: 'error',
        text: 'Error al cargar la configuración'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validaciones
    if (!config.palabrasClave.trim()) {
      setMessage({
        type: 'error',
        text: 'Debe ingresar al menos una palabra clave'
      });
      return;
    }

    if (config.mesesDesdeCierre < 0 || config.mesesDesdeCierre > 120) {
      setMessage({
        type: 'error',
        text: 'Los meses deben estar entre 0 y 120'
      });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      
      await updateConfigOportunidades({
        palabrasClave: config.palabrasClave.trim(),
        mesesDesdeCierre: parseInt(config.mesesDesdeCierre)
      });
      
      setMessage({
        type: 'success',
        text: 'Configuración guardada exitosamente'
      });
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 3000);
      
    } catch (error) {
      console.error('Error guardando configuración:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Error al guardar la configuración'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setMessage({ type: '', text: '' });
  };

  // Contar palabras clave
  const palabrasArray = config.palabrasClave.split(',').map(p => p.trim()).filter(p => p);
  const cantidadPalabras = palabrasArray.length;

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader 
          title="Parámetros de Oportunidades" 
          subtitle="Configurar criterios de búsqueda"
          icon={<FaLightbulb className="text-yellow-400" />}
        />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader 
        title="Parámetros de Oportunidades" 
        subtitle="Configurar criterios de búsqueda para oportunidades de seguimiento"
        icon={<FaLightbulb className="text-yellow-400" />}
      />

      {/* Mensaje de información */}
      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
        <div className="flex gap-3">
          <FaInfoCircle className="text-blue-400 text-xl flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-blue-400 mb-2">¿Qué son las Oportunidades?</p>
            <p className="mb-2">
              Las oportunidades son ingresos antiguos que coinciden con ciertos criterios y representan 
              clientes que podrían necesitar nuevamente el servicio del taller.
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Se filtran ingresos cuyo campo <strong className="text-gray-300">Desaveria</strong> contenga alguna de las palabras clave configuradas</li>
              <li>Se filtran ingresos cuya <strong className="text-gray-300">Fecha de cierre (F cierr)</strong> sea anterior al período configurado</li>
              <li><strong className="text-yellow-400">IMPORTANTE:</strong> Solo se muestran ingresos que sean el <strong className="text-gray-300">último ingreso</strong> del vehículo (sin ingresos posteriores)</li>
              <li>Útil para detectar oportunidades de contacto con clientes que no han vuelto al taller</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Palabras clave */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Palabras Clave en Desaveria
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Ingrese las palabras clave separadas por comas. Los ingresos que contengan CUALQUIERA de estas palabras 
              en el campo "Desaveria" serán considerados oportunidades.
            </p>
            <input
              type="text"
              value={config.palabrasClave}
              onChange={(e) => handleChange('palabrasClave', e.target.value)}
              placeholder="Ej: ruido,vibración,falla,problema,revisión"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white 
                       focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
            {cantidadPalabras > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-400">Palabras configuradas ({cantidadPalabras}):</span>
                {palabrasArray.map((palabra, idx) => (
                  <span 
                    key={idx} 
                    className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-700"
                  >
                    {palabra}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Meses desde cierre */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Antigüedad Mínima de Cierre (meses)
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Solo se mostrarán ingresos cerrados hace MÁS de este período. Un valor de 3 meses mostrará 
              ingresos cerrados hace 3 o más meses (clientes que no han vuelto recientemente).
            </p>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                max="120"
                value={config.mesesDesdeCierre}
                onChange={(e) => handleChange('mesesDesdeCierre', e.target.value)}
                className="w-32 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white 
                         focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
              <span className="text-gray-400">meses o más</span>
            </div>
            <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded">
              <p className="text-xs text-blue-300">
                <strong>Ejemplo:</strong> Con {config.mesesDesdeCierre || 0} meses configurados, se mostrarán 
                ingresos cerrados desde {new Date(new Date().setMonth(new Date().getMonth() - (config.mesesDesdeCierre || 0))).toLocaleDateString('es-AR')} hacia atrás.
              </p>
            </div>
          </div>

          {/* Mensaje de resultado */}
          {message.text && (
            <div 
              className={`p-4 rounded-lg border ${
                message.type === 'success' 
                  ? 'bg-green-900/20 border-green-700 text-green-400' 
                  : 'bg-red-900/20 border-red-700 text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark 
                       disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold 
                       rounded-lg transition-colors"
            >
              <FaSave />
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
            
            <button
              type="button"
              onClick={loadConfig}
              disabled={saving}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 
                       disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>

        {/* Información adicional */}
        <div className="mt-8 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">💡 Consejos de Uso</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Use palabras clave relevantes relacionadas con problemas o servicios recurrentes</li>
            <li>• Ajuste la antigüedad según la frecuencia esperada de visitas de sus clientes</li>
            <li>• Para servicios de mantenimiento preventivo, use períodos más cortos (3-6 meses)</li>
            <li>• Para reparaciones específicas, puede usar períodos más largos (12-24 meses)</li>
            <li>• Revise periódicamente los resultados y ajuste los parámetros según sea necesario</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ConfigOportunidades;

