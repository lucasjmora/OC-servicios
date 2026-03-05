import { useState, useEffect } from 'react';
import { getConfigAccesorios, updateConfigAccesorios, getCiudadesBoletos, getMarcasBoletos } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaCheckCircle, FaSave, FaInfoCircle, FaMapMarkerAlt, FaCar, FaClock } from 'react-icons/fa';

const ConfigAccesorios = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('ciudadMarca');

  const [config, setConfig] = useState({
    diasEspera: 7,
    ciudadMarcaEmpresa: {}
  });
  const [ciudadesList, setCiudadesList] = useState([]);
  const [marcasList, setMarcasList] = useState([]);
  const [loadingCiudades, setLoadingCiudades] = useState(false);
  const [loadingMarcas, setLoadingMarcas] = useState(false);
  const [mapeoCiudadMarcaRows, setMapeoCiudadMarcaRows] = useState([]);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'ciudadMarca') {
      if (!ciudadesList.length) loadCiudades();
      if (!marcasList.length) loadMarcas();
    }
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await getConfigAccesorios();
      const data = response.data?.data || response.data || {};
      setConfig({
        diasEspera: data.diasEspera ?? 7,
        ciudadMarcaEmpresa: data.ciudadMarcaEmpresa || {}
      });
      const ciudadMarca = data.ciudadMarcaEmpresa || {};
      const rows = Object.entries(ciudadMarca).map(([key, texto]) => {
        const [ciudad, ...rest] = String(key).split('|');
        const marca = rest.join('|');
        return {
          ciudad: ciudad || '',
          marca: marca || '',
          texto: texto || ''
        };
      });
      setMapeoCiudadMarcaRows(rows.length ? rows : [{ ciudad: '', marca: '', texto: '' }]);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Error al cargar la configuración'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCiudades = async () => {
    try {
      setLoadingCiudades(true);
      const response = await getCiudadesBoletos();
      const list = response.data?.ciudades || [];
      setCiudadesList(Array.isArray(list) ? list.sort() : []);
    } catch (error) {
      console.error('Error cargando ciudades:', error);
      setCiudadesList([]);
    } finally {
      setLoadingCiudades(false);
    }
  };

  const loadMarcas = async () => {
    try {
      setLoadingMarcas(true);
      const response = await getMarcasBoletos();
      const list = response.data?.marcas || [];
      setMarcasList(Array.isArray(list) ? list.sort() : []);
    } catch (error) {
      console.error('Error cargando marcas:', error);
      setMarcasList([]);
    } finally {
      setLoadingMarcas(false);
    }
  };

  const handleSubmitDias = async (e) => {
    e.preventDefault();
    if (config.diasEspera < 1 || config.diasEspera > 365) {
      setMessage({ type: 'error', text: 'Los días de espera deben estar entre 1 y 365' });
      return;
    }
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await updateConfigAccesorios({ diasEspera: parseInt(config.diasEspera, 10) });
      setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
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
    setConfig(prev => ({ ...prev, [field]: value }));
    setMessage({ type: '', text: '' });
  };

  const handleCiudadMarcaRowChange = (index, field, value) => {
    setMapeoCiudadMarcaRows(prev =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
    setMessage({ type: '', text: '' });
  };

  const handleAddCiudadMarcaRow = () => {
    setMapeoCiudadMarcaRows(prev => [...prev, { ciudad: '', marca: '', texto: '' }]);
  };

  const handleRemoveCiudadMarcaRow = (index) => {
    setMapeoCiudadMarcaRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveCiudadMarcaEmpresa = async () => {
    const sanitized = {};
    mapeoCiudadMarcaRows.forEach(({ ciudad, marca, texto }) => {
      const ciudadTrim = (ciudad || '').trim();
      const marcaTrim = (marca || '').trim();
      const textoTrim = (texto || '').trim();
      if (ciudadTrim && marcaTrim && textoTrim) {
        const key = `${ciudadTrim}|${marcaTrim}`;
        sanitized[key] = textoTrim;
      }
    });
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await updateConfigAccesorios({ ciudadMarcaEmpresa: sanitized });
      setConfig(prev => ({ ...prev, ciudadMarcaEmpresa: sanitized }));
      setMapeoCiudadMarcaRows(prev => {
        const rows = Object.entries(sanitized).map(([key, texto]) => {
          const [ciudad, ...rest] = String(key).split('|');
          const marca = rest.join('|');
          return { ciudad: ciudad || '', marca: marca || '', texto: texto || '' };
        });
        return rows.length ? rows : prev;
      });
      setMessage({ type: 'success', text: 'Mapeo de ciudad + marca guardado correctamente' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error guardando mapeo ciudad+marca:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Error al guardar el mapeo ciudad+marca'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader
          title="Parámetros de Accesorios"
          subtitle="Configurar parámetros para la gestión de boletos de accesorios"
          icon={<FaCheckCircle className="text-green-400" />}
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
        title="Parámetros de Accesorios"
        subtitle="Configurar parámetros para la gestión de boletos de accesorios"
        icon={<FaCheckCircle className="text-green-400" />}
      />

      {message.text && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-900/20 border-green-700 text-green-400'
              : 'bg-red-900/20 border-red-700 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('ciudadMarca')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'ciudadMarca'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaMapMarkerAlt />
            <FaCar />
            Mapeo Ciudad + Marca
          </div>
        </button>
        <button
          onClick={() => setActiveTab('dias')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'dias'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaClock />
            Días de Espera
          </div>
        </button>
      </div>

      {/* Tab 1: Mapeo Ciudad + Marca */}
      {activeTab === 'ciudadMarca' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            Defina reglas de mapeo combinando ciudad y marca. El mapeo se aplica solo cuando el boleto
            coincide en <span className="font-semibold text-gray-200">ciudad</span> y{' '}
            <span className="font-semibold text-gray-200">marca</span>.
          </p>
          <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/3">
                      Ciudad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/3">
                      Marca
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/3">
                      Mapeo (empresa / etiqueta)
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {mapeoCiudadMarcaRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                        No hay reglas definidas. Agregue una fila para crear un mapeo ciudad + marca.
                      </td>
                    </tr>
                  ) : (
                    mapeoCiudadMarcaRows.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <select
                            value={row.ciudad}
                            onChange={(e) =>
                              handleCiudadMarcaRowChange(index, 'ciudad', e.target.value)
                            }
                            className="w-full max-w-xs px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Seleccione ciudad</option>
                            {ciudadesList.map((ciudad) => (
                              <option key={ciudad} value={ciudad}>
                                {ciudad}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={row.marca}
                            onChange={(e) =>
                              handleCiudadMarcaRowChange(index, 'marca', e.target.value)
                            }
                            className="w-full max-w-xs px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Seleccione marca</option>
                            {marcasList.map((marca) => (
                              <option key={marca} value={marca}>
                                {marca}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.texto}
                            onChange={(e) =>
                              handleCiudadMarcaRowChange(index, 'texto', e.target.value)
                            }
                            placeholder="Ej: Fortecar, Granville, Pampawagen..."
                            className="w-full max-w-xs px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveCiudadMarcaRow(index)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleAddCiudadMarcaRow}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Agregar fila
            </button>
            <button
              type="button"
              onClick={handleSaveCiudadMarcaEmpresa}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              <FaSave />
              {saving ? 'Guardando...' : 'Guardar mapeo ciudad+marca'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Días de Espera */}
      {activeTab === 'dias' && (
        <div className="max-w-3xl space-y-6">
          <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <div className="flex gap-3">
              <FaInfoCircle className="text-blue-400 text-xl flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-blue-400 mb-2">¿Qué son los Días de Espera?</p>
                <p className="mb-2">
                  Los días de espera determinan cuándo un boleto con estado "abierto - en espera"
                  debe cambiar automáticamente a "abierto - pendiente".
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>Si un boleto está en estado <strong className="text-gray-300">"abierto - en espera"</strong> y no recibe comentarios durante el período configurado, cambiará automáticamente a <strong className="text-gray-300">"abierto - pendiente"</strong></li>
                  <li>También cambiará automáticamente si se vence una alarma configurada previamente</li>
                  <li>Cuando un boleto en estado <strong className="text-gray-300">"abierto - pendiente"</strong> recibe un nuevo comentario, cambia automáticamente a <strong className="text-gray-300">"abierto - en espera"</strong></li>
                  <li>Este parámetro ayuda a gestionar el seguimiento de oportunidades de venta de accesorios</li>
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitDias} className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Días de Espera</label>
              <p className="text-xs text-gray-400 mb-3">
                Número de días sin comentarios antes de que un boleto "en espera" cambie automáticamente a "pendiente".
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={config.diasEspera}
                  onChange={(e) => handleChange('diasEspera', e.target.value)}
                  className="w-32 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                />
                <span className="text-gray-400">días</span>
              </div>
              <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded">
                <p className="text-xs text-blue-300">
                  <strong>Ejemplo:</strong> Con {config.diasEspera || 7} días configurados, un boleto "en espera"
                  sin comentarios desde {new Date(new Date().setDate(new Date().getDate() - (config.diasEspera || 7))).toLocaleDateString('es-AR')}
                  cambiará automáticamente a "pendiente".
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                <FaSave />
                {saving ? 'Guardando...' : 'Guardar Configuración'}
              </button>
              <button
                type="button"
                onClick={loadConfig}
                disabled={saving}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">💡 Consejos de Uso</h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• Use períodos cortos (3-7 días) para seguimiento activo de oportunidades</li>
              <li>• Use períodos más largos (14-30 días) si espera respuestas del cliente</li>
              <li>• El sistema también respeta las alarmas configuradas manualmente</li>
              <li>• Revise periódicamente los boletos "pendientes" para asegurar seguimiento oportuno</li>
              <li>• Los cambios automáticos se registran en el historial del boleto</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigAccesorios;
