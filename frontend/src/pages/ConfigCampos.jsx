import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { FaTags, FaSave, FaWarehouse, FaUsers, FaRobot } from 'react-icons/fa';
import { getMappings, updateMappings, getORsPivot } from '../services/api';
import {
  LOCALIDADES_BOT_FORTECAR,
  LOCALIDADES_BOT_GRANVILLE,
  LOCALIDADES_BOT_PAMPAWAGEN
} from '../constants/botAnalyzerLocalidadCodigos';
import PresupCrmConfigTalleres from './presup-crm/PresupCrmConfigTalleres';
import ConfigTalleresPanel from '../components/ConfigTalleresPanel';
import ConfigUsuariosPanel from '../components/ConfigUsuariosPanel';

const VALID_TABS = [
  'citas',
  'ingresos',
  'gestion-talleres',
  'gestion-usuarios',
  'orsAbiertas',
  'talleres-presup',
  'bot-analyzer-localidad'
];

const BOT_ANALYZER_EMPRESAS = [
  { key: 'FC', label: 'Fortecar (FC)' },
  { key: 'GV', label: 'Granville (GV)' },
  { key: 'PW', label: 'Pampa-viajes (PW)' }
];

const defaultBotAnalyzerLocalidadState = () => ({
  FC: [],
  GV: [],
  PW: []
});

function tabFromSearchParams(sp) {
  const t = sp.get('tab');
  if (t && VALID_TABS.includes(t)) return t;
  return 'citas';
}

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
  const [botAnalyzerLocalidad, setBotAnalyzerLocalidad] = useState(defaultBotAnalyzerLocalidadState);
  const [talleresOrs, setTalleresOrs] = useState([]);
  const [loadingOrs, setLoadingOrs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => tabFromSearchParams(searchParams), [searchParams]);

  const selectTab = useCallback(
    (tab) => {
      if (tab === 'citas') setSearchParams({});
      else setSearchParams({ tab });
    },
    [setSearchParams]
  );

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
      const [citasResponse, ingresosResponse, orsResponse, botLocResponse] = await Promise.all([
        getMappings('campos'),
        getMappings('campos'),
        getMappings('orsAbiertasTalleres'),
        getMappings('botAnalyzerLocalidadSesion')
      ]);

      setMappingsCitas(citasResponse.data || {});
      setMappingsIngresos(ingresosResponse.data || {});
      setMappingsOrsTalleres(orsResponse.data || {});
      const locData = botLocResponse.data || {};
      setBotAnalyzerLocalidad({
        FC: Array.isArray(locData.FC) ? locData.FC : [],
        GV: Array.isArray(locData.GV) ? locData.GV : [],
        PW: Array.isArray(locData.PW) ? locData.PW : []
      });
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
      await updateMappings('botAnalyzerLocalidadSesion', botAnalyzerLocalidad);

      setMessage({ type: 'success', text: 'Mapeos de campos guardados correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error guardando mapeos:', error);
      setMessage({ type: 'error', text: 'Error guardando mapeos de campos' });
    } finally {
      setSaving(false);
    }
  };

  const handleBotLocChange = (empKey, index, field, value) => {
    setBotAnalyzerLocalidad((prev) => {
      const rows = [...(prev[empKey] || [])];
      const row = { ...rows[index], [field]: value };
      rows[index] = row;
      return { ...prev, [empKey]: rows };
    });
  };

  const addBotLocRow = (empKey) => {
    setBotAnalyzerLocalidad((prev) => ({
      ...prev,
      [empKey]: [...(prev[empKey] || []), { secuencia: '', localidad: '' }]
    }));
  };

  const removeBotLocRow = (empKey, index) => {
    setBotAnalyzerLocalidad((prev) => ({
      ...prev,
      [empKey]: (prev[empKey] || []).filter((_, i) => i !== index)
    }));
  };

  /** Copia filas secuencia/localidad entre empresas (ej. Fortecar → Granville). */
  const copyBotLocalidadFromTo = (fromKey, toKey) => {
    const src = botAnalyzerLocalidad[fromKey] || [];
    setBotAnalyzerLocalidad((prev) => ({
      ...prev,
      [toKey]: src.map((r) => ({
        secuencia: r.secuencia != null ? String(r.secuencia) : '',
        localidad: r.localidad != null ? String(r.localidad) : ''
      }))
    }));
    setMessage({
      type: 'success',
      text: `Mapeo ${fromKey} copiado en ${toKey}. Recordá guardar para persistir.`
    });
    setTimeout(() => setMessage(null), 4000);
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
        subtitle="Personaliza nombres de campos, talleres, usuarios citas/ingresos, ORs abiertas y catálogo Presup"
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
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700">
        <button
          type="button"
          onClick={() => selectTab('citas')}
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
          type="button"
          onClick={() => selectTab('ingresos')}
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
          type="button"
          onClick={() => selectTab('gestion-talleres')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'gestion-talleres'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaWarehouse />
            taller citas/ingresos
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectTab('gestion-usuarios')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'gestion-usuarios'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaUsers />
            usuarios citas/ingresos
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectTab('orsAbiertas')}
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

        <button
          type="button"
          onClick={() => selectTab('talleres-presup')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'talleres-presup'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaWarehouse />
            Talleres presup
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectTab('bot-analyzer-localidad')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'bot-analyzer-localidad'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <FaRobot />
            Localidad BOT (sessionId)
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
          {activeTab === 'gestion-talleres' && (
            <div className="bg-background-card border border-gray-700 rounded-lg p-6">
              <ConfigTalleresPanel embedded />
            </div>
          )}
          {activeTab === 'gestion-usuarios' && (
            <div className="bg-background-card border border-gray-700 rounded-lg p-6">
              <ConfigUsuariosPanel embedded />
            </div>
          )}
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
          {activeTab === 'talleres-presup' && (
            <div className="bg-background-card border border-gray-700 rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-4">
                Catálogo en la colección MongoDB <strong className="text-gray-300">talleres</strong> (base{' '}
                <strong className="text-gray-300">Presupuestos</strong>, mismo cluster que los presupuestos). Códigos del
                Excel y etiquetas para listado y dashboard (Presup CRM).
              </p>
              <PresupCrmConfigTalleres embedded />
            </div>
          )}
          {activeTab === 'bot-analyzer-localidad' && (
            <div className="space-y-8">
              <p className="text-sm text-gray-400">
                En <strong className="text-gray-300">BOT Analyzer</strong> la localidad se resuelve{' '}
                <strong className="text-gray-300">primero</strong> por el contenido del chat (herramientas y mensajes).{' '}
                <strong className="text-gray-300">Si no hay resultado,</strong> se usa este mapeo: prefijo de dígitos
                del <strong className="text-gray-300">sessionId</strong> desde el 4.º carácter (si varias filas
                coinciden, gana la más larga).
              </p>
              {BOT_ANALYZER_EMPRESAS.map(({ key, label }) => (
                <div
                  key={key}
                  className="bg-background-card border border-gray-700 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-800 border-b border-gray-700">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{label}</h3>
                      {key === 'FC' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Código de localidad (solo listado Fortecar).
                        </p>
                      )}
                      {key === 'GV' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Código de localidad (solo listado Granville).
                        </p>
                      )}
                      {key === 'PW' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Código de localidad (solo listado Pampa-viajes).
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {key === 'GV' && (
                        <button
                          type="button"
                          onClick={() => copyBotLocalidadFromTo('FC', 'GV')}
                          disabled={!(botAnalyzerLocalidad.FC || []).length}
                          title={
                            (botAnalyzerLocalidad.FC || []).length
                              ? 'Reemplaza el mapeo de Granville con el de Fortecar'
                              : 'No hay filas en Fortecar para copiar'
                          }
                          className="text-sm px-3 py-1.5 rounded-md border border-gray-600 text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Copiar desde Fortecar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => addBotLocRow(key)}
                        className="text-sm px-3 py-1.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                      >
                        Agregar fila
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-800/80 border-b border-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                            Secuencia (dígitos)
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">
                            {key === 'FC' || key === 'GV' || key === 'PW' ? 'Código loc.' : 'Localidad'}
                          </th>
                          <th className="px-4 py-2 w-24 text-right text-xs font-semibold text-gray-400 uppercase">
                            —
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {(botAnalyzerLocalidad[key] || []).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                              Sin reglas. Agregue una fila o guarde para persistir cambios.
                            </td>
                          </tr>
                        ) : (
                          (botAnalyzerLocalidad[key] || []).map((row, index) => {
                            const listaCodigos =
                              key === 'FC'
                                ? LOCALIDADES_BOT_FORTECAR
                                : key === 'GV'
                                  ? LOCALIDADES_BOT_GRANVILLE
                                  : key === 'PW'
                                    ? LOCALIDADES_BOT_PAMPAWAGEN
                                    : null;
                            return (
                              <tr key={`${key}-${index}`} className="hover:bg-gray-800/40">
                                <td className="px-4 py-2">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={row.secuencia || ''}
                                    onChange={(e) =>
                                      handleBotLocChange(key, index, 'secuencia', e.target.value)
                                    }
                                    placeholder="Ej: 2477"
                                    className="w-full font-mono text-sm"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  {listaCodigos ? (
                                    <select
                                      value={row.localidad ?? ''}
                                      onChange={(e) =>
                                        handleBotLocChange(key, index, 'localidad', e.target.value)
                                      }
                                      className="w-full text-sm bg-background border border-gray-600 rounded-md px-3 py-2 text-gray-200"
                                    >
                                      <option value="">Seleccionar código…</option>
                                      {listaCodigos.map((loc) => (
                                        <option key={loc} value={loc}>
                                          {loc}
                                        </option>
                                      ))}
                                      {row.localidad &&
                                        !listaCodigos.includes(row.localidad) && (
                                          <option value={row.localidad}>
                                            {row.localidad} (valor guardado no listado)
                                          </option>
                                        )}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={row.localidad || ''}
                                      onChange={(e) =>
                                        handleBotLocChange(key, index, 'localidad', e.target.value)
                                      }
                                      placeholder="Nombre de localidad"
                                      className="w-full text-sm"
                                    />
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeBotLocRow(key, index)}
                                    className="text-sm text-status-danger hover:underline"
                                  >
                                    Quitar
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
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



