import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { FaTags, FaSave, FaWarehouse } from 'react-icons/fa';
import { getMappings, updateMappings, getORsPivot } from '../services/api';

// Campos predefinidos de las colecciones
const CAMPOS_CITAS = [
  'Referencia', 'Taller', 'Fecha cr', 'Usuario', 'Matricula', 'Marca/modelo',
  'Fecha ci', 'Hora ', 'Asesor', 'Averia', 'Secci', 'Tiempo', 'Nombre', 'Telefono', 'Observaciones'
];

const CAMPOS_INGRESOS = [
  'Referencia', 'Taller', 'Nombre taller', 'Tipo O', 'Estad', 'Numero',
  'Matrícula vehí', 'FMatric', 'Cta cargo', 'CLIENTE', 'Recepcionista', 'Fecaper',
  'F cierr', 'Serie/num', 'Desaveria', 'Usuario Cita', 'Bastidor', 'Modelo',
  'BASE', 'Tiemfact', 'Mano obra', 'BENEFICIO', 'Total material',
  'BENEFICIOS REC', 'SUBARRENDADO', 'BENEFSUB', 'Observaciones', 'Km',
  'E-mail', 'Teléfono', 'Telefono', 'Opera', 'Nombre titular', 'CON',
  'OBSERVACIONES INTERNAS', 'FEC OBS ', 'HOR O', 'IDP NOMBRE'
];

const ConfigCampos = () => {
  const [mappingsCitas, setMappingsCitas] = useState({});
  const [mappingsIngresos, setMappingsIngresos] = useState({});
  const [mappingsOrsTalleres, setMappingsOrsTalleres] = useState({});
  const [talleresOrs, setTalleresOrs] = useState([]);
  const [loadingOrs, setLoadingOrs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('citas');

  useEffect(() => {
    loadMappings();
  }, []);

  useEffect(() => {
    if (activeTab === 'orsAbiertas') {
      loadOrsData();
    }
  }, [activeTab]);

  const loadMappings = async () => {
    try {
      setLoading(true);
      const [citasResponse, ingresosResponse, orsResponse] = await Promise.all([
        getMappings('campos'),
        getMappings('campos'),
        getMappings('orsAbiertasTalleres')
      ]);
      
      setMappingsCitas(citasResponse.data || {});
      setMappingsIngresos(ingresosResponse.data || {});
      setMappingsOrsTalleres(orsResponse.data || {});
    } catch (error) {
      console.error('Error cargando mapeos:', error);
      setMessage({ type: 'error', text: 'Error cargando mapeos de campos' });
    } finally {
      setLoading(false);
    }
  };

  const loadOrsData = async () => {
    try {
      setLoadingOrs(true);
      const res = await getORsPivot();
      const pivot = res.data?.data || {};
      // Nombres originales del Excel: desde orders (cada orden tiene nombreTaller) o desde pivot
      const desdeOrders = [...new Set((pivot.orders || [])
        .map(o => o.nombreTaller)
        .filter(n => n && n !== '-')
      )].sort((a, b) => a.localeCompare(b));
      const talleres = desdeOrders.length > 0
        ? desdeOrders
        : (pivot.talleresOriginales || []).length > 0
          ? pivot.talleresOriginales
          : (pivot.talleres || []).filter(t => t !== 'Total');
      setTalleresOrs(talleres);
    } catch (error) {
      console.error('Error cargando talleres ORs:', error);
      setTalleresOrs([]);
    } finally {
      setLoadingOrs(false);
    }
  };

  const handleMappingChange = (campo, nuevoNombre, tipo) => {
    if (tipo === 'citas') {
      setMappingsCitas(prev => ({
        ...prev,
        [campo]: nuevoNombre
      }));
    } else if (tipo === 'ingresos') {
      setMappingsIngresos(prev => ({
        ...prev,
        [campo]: nuevoNombre
      }));
    } else {
      setMappingsOrsTalleres(prev => ({
        ...prev,
        [campo]: nuevoNombre
      }));
    }
  };

  const handleSaveMappings = async () => {
    try {
      setSaving(true);
      
      const allMappings = {
        ...mappingsCitas,
        ...mappingsIngresos
      };
      
      await updateMappings('campos', allMappings);
      await updateMappings('orsAbiertasTalleres', mappingsOrsTalleres);
      
      setMessage({ type: 'success', text: 'Mapeos de campos guardados correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error guardando mapeos:', error);
      setMessage({ type: 'error', text: 'Error guardando mapeos de campos' });
    } finally {
      setSaving(false);
    }
  };

  const renderCamposTable = (campos, mappings, tipo) => (
    <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/3">
                Campo Original
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Nombre Personalizado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {campos.map((campo) => (
              <tr key={campo} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-gray-300">
                    {campo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={mappings[campo] || ''}
                    onChange={(e) => handleMappingChange(campo, e.target.value, tipo)}
                    placeholder={`Nombre alternativo para "${campo}"`}
                    className="w-full"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <PageHeader 
        title="Mapeo de Campos" 
        subtitle="Personaliza los nombres de los campos mostrados en la interfaz"
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('citas')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'citas'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaTags />
            Campos de Citas ({CAMPOS_CITAS.length})
          </div>
        </button>

        <button
          onClick={() => setActiveTab('ingresos')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'ingresos'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaTags />
            Campos de Ingresos ({CAMPOS_INGRESOS.length})
          </div>
        </button>

        <button
          onClick={() => setActiveTab('orsAbiertas')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'orsAbiertas'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaWarehouse />
            Nombres de taller ORs Abiertas ({loadingOrs ? '...' : talleresOrs.length})
          </div>
        </button>
      </div>

      {/* Contenido de tabs */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-400">Cargando mapeos de campos...</div>
        </div>
      ) : (
        <>
          {activeTab === 'citas' && renderCamposTable(CAMPOS_CITAS, mappingsCitas, 'citas')}
          {activeTab === 'ingresos' && renderCamposTable(CAMPOS_INGRESOS, mappingsIngresos, 'ingresos')}
          {activeTab === 'orsAbiertas' && (
            loadingOrs ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-gray-400">Cargando talleres desde ORs Abiertas...</div>
              </div>
            ) : talleresOrs.length === 0 ? (
              <div className="bg-background-card border border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">
                  No hay talleres disponibles. Configure la ruta del archivo Excel en Configuración → Actualización de datos, 
                  ejecute &quot;Actualizar Ahora&quot; y vuelva a esta solapa para cargar los talleres.
                </p>
              </div>
            ) : (
              renderCamposTable(talleresOrs, mappingsOrsTalleres, 'orsAbiertas')
            )
          )}
        </>
      )}

      {/* Info adicional */}
      <div className="mt-6 bg-background-card border border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          <strong className="text-white">Nota:</strong> Los nombres personalizados se utilizarán en toda la aplicación 
          para mostrar los campos de forma más amigable. Si dejas un campo vacío, se utilizará el nombre original.
        </p>
      </div>
    </div>
  );
};

export default ConfigCampos;



