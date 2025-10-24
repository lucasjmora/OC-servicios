import { useEffect, useState } from 'react';
import { getMappings, updateMappings, getUniqueValues } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaWarehouse, FaCheckCircle, FaExclamationTriangle, FaSave, FaSearch } from 'react-icons/fa';

const ConfigTalleres = () => {
  const [talleresCodigos, setTalleresCodigos] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (dataLoaded) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Obtener códigos únicos de talleres desde ambas colecciones
      const [citasRes, ingresosRes, mappingsRes] = await Promise.all([
        getUniqueValues('citas', 'Taller'),
        getUniqueValues('ingresos', 'Taller'),
        getMappings('talleres')
      ]);
      
      // Combinar códigos únicos
      const allCodigos = new Set([
        ...citasRes.data,
        ...ingresosRes.data
      ]);
      
      const codigosArray = Array.from(allCodigos).sort();
      
      setTalleresCodigos(codigosArray);
      setMappings(mappingsRes.data || {});
      setDataLoaded(true);
    } catch (error) {
      console.error('Error cargando talleres:', error);
      setMessage({ type: 'error', text: 'Error cargando datos de talleres' });
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (codigo, nombre) => {
    setMappings(prev => ({
      ...prev,
      [codigo]: nombre
    }));
  };

  const handleSaveMappings = async () => {
    try {
      setSaving(true);
      await updateMappings('talleres', mappings);
      setMessage({ type: 'success', text: 'Mapeos de talleres guardados correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error guardando mapeos' });
    } finally {
      setSaving(false);
    }
  };

  const configurados = talleresCodigos.filter(codigo => mappings[codigo]);
  const sinConfigurar = talleresCodigos.filter(codigo => !mappings[codigo]);

  const filteredCodigos = talleresCodigos.filter(codigo => {
    if (!searchTerm) return true;
    const codigoStr = String(codigo).toLowerCase();
    const nombre = mappings[codigo]?.toLowerCase() || '';
    return codigoStr.includes(searchTerm.toLowerCase()) || nombre.includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-400">Cargando talleres...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader 
        title="Gestión de Talleres" 
        subtitle="Configura los códigos y nombres de los talleres"
        action={
          <button
            onClick={handleSaveMappings}
            disabled={saving}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
          >
            <FaSave />
            {saving ? 'Guardando...' : 'Guardar Todos'}
          </button>
        }
      />

      {message && (
        <div className={`mb-6 p-4 rounded-lg border fade-in ${
          message.type === 'success' 
            ? 'bg-status-success/10 border-status-success text-status-success' 
            : 'bg-status-danger/10 border-status-danger text-status-danger'
        }`}>
          {message.text}
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Códigos</p>
              <p className="text-3xl font-bold text-white mt-2">{talleresCodigos.length}</p>
            </div>
            <FaWarehouse className="text-4xl text-primary" />
          </div>
        </div>

        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Configurados</p>
              <p className="text-3xl font-bold text-status-success mt-2">{configurados.length}</p>
            </div>
            <FaCheckCircle className="text-4xl text-status-success" />
          </div>
        </div>

        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Sin Configurar</p>
              <p className="text-3xl font-bold text-status-warning mt-2">{sinConfigurar.length}</p>
            </div>
            <FaExclamationTriangle className="text-4xl text-status-warning" />
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Lista de talleres */}
      <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/4">
                  Código de Taller
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Nombre del Taller
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-32">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCodigos.map((codigo, index) => (
                <tr key={`taller-${codigo}`} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-primary font-semibold">
                        {codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={mappings[codigo] || ''}
                        onChange={(e) => handleMappingChange(codigo, e.target.value)}
                        placeholder="Ingrese el nombre del taller..."
                        className="w-full"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {mappings[codigo] ? (
                        <span className="inline-flex items-center gap-1 text-status-success text-sm">
                          <FaCheckCircle />
                          Configurado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-status-warning text-sm">
                          <FaExclamationTriangle />
                          Sin configurar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCodigos.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No se encontraron talleres con los criterios de búsqueda
        </div>
      )}
    </div>
  );
};

export default ConfigTalleres;




