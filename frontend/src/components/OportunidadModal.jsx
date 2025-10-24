import { useState, useEffect } from 'react';
import { 
  getOportunidadDetalle, 
  updateEstadoOportunidad, 
  setAlarmaOportunidad,
  getComentariosOportunidad,
  addComentarioOportunidad 
} from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus, FaBell, FaCheck, FaExclamationTriangle, FaEye, FaCog } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const OportunidadModal = ({ referencia, onClose, onUpdate }) => {
  const [oportunidad, setOportunidad] = useState(null);
  const [ingreso, setIngreso] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  
  // Estados para formularios
  const [nuevoComentario, setNuevoComentario] = useState({
    usuario: '',
    comentario: ''
  });
  const [cambioEstado, setCambioEstado] = useState({
    estado: '',
    motivo: '',
    usuario: ''
  });
  const [alarma, setAlarma] = useState({
    fechaHora: '',
    usuario: ''
  });

  useEffect(() => {
    if (referencia) {
      loadOportunidad();
    }
  }, [referencia]);

  const loadOportunidad = async () => {
    try {
      setLoading(true);
      const response = await getOportunidadDetalle(referencia);
      setOportunidad(response.data.oportunidad);
      setIngreso(response.data.ingreso);
      setComentarios(response.data.comentarios || []);
    } catch (error) {
      console.error('Error cargando oportunidad:', error);
      setError('Error cargando datos de la oportunidad');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComentario = async (e) => {
    e.preventDefault();
    
    if (!nuevoComentario.usuario.trim() || !nuevoComentario.comentario.trim()) {
      setError('Usuario y comentario son requeridos');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await addComentarioOportunidad(referencia, {
        usuario: nuevoComentario.usuario.trim(),
        comentario: nuevoComentario.comentario.trim()
      });

      // Recargar datos
      await loadOportunidad();
      if (onUpdate) onUpdate();

      // Limpiar formulario
      setNuevoComentario({
        usuario: '',
        comentario: ''
      });

    } catch (error) {
      console.error('Error agregando comentario:', error);
      setError('Error guardando comentario');
    } finally {
      setSaving(false);
    }
  };

  const handleCambioEstado = async (e) => {
    e.preventDefault();
    
    if (!cambioEstado.estado || !cambioEstado.usuario) {
      setError('Estado y usuario son requeridos');
      return;
    }

    if (cambioEstado.estado === 'cerrado' && !cambioEstado.motivo.trim()) {
      setError('El motivo de cierre es obligatorio');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await updateEstadoOportunidad(referencia, {
        estado: cambioEstado.estado,
        motivo: cambioEstado.motivo,
        usuario: cambioEstado.usuario
      });

      // Recargar datos
      await loadOportunidad();
      if (onUpdate) onUpdate();

      // Limpiar formulario
      setCambioEstado({
        estado: '',
        motivo: '',
        usuario: ''
      });

    } catch (error) {
      console.error('Error cambiando estado:', error);
      setError('Error cambiando estado');
    } finally {
      setSaving(false);
    }
  };

  const handleSetAlarma = async (e) => {
    e.preventDefault();
    
    if (!alarma.fechaHora || !alarma.usuario) {
      setError('Fecha/hora y usuario son requeridos');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await setAlarmaOportunidad(referencia, {
        fechaHora: alarma.fechaHora,
        usuario: alarma.usuario
      });

      // Recargar datos
      await loadOportunidad();
      if (onUpdate) onUpdate();

      // Limpiar formulario
      setAlarma({
        fechaHora: '',
        usuario: ''
      });

    } catch (error) {
      console.error('Error configurando alarma:', error);
      setError('Error configurando alarma');
    } finally {
      setSaving(false);
    }
  };

  const getEstadoBadge = (estado) => {
    const badges = {
      pendiente: { color: 'bg-gray-500', text: 'Pendiente', icon: <FaClock /> },
      en_gestion: { color: 'bg-blue-500', text: 'En Gestión', icon: <FaCog /> },
      a_tratar: { color: 'bg-orange-500', text: 'A Tratar', icon: <FaExclamationTriangle /> },
      cerrado: { color: 'bg-green-500', text: 'Cerrado', icon: <FaCheck /> }
    };
    
    const badge = badges[estado] || badges.pendiente;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm font-medium ${badge.color}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'dd/MM/yyyy HH:mm', { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  if (!referencia) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando oportunidad...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FaComment className="text-primary" />
              Gestión de Oportunidad
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Referencia: <span className="font-medium text-primary">{referencia}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: 'info', label: 'Información', icon: <FaEye /> },
            { id: 'estado', label: 'Estado', icon: <FaCog /> },
            { id: 'alarma', label: 'Alarma', icon: <FaBell /> },
            { id: 'comentarios', label: 'Comentarios', icon: <FaComment /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary bg-gray-800/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Tab: Información */}
          {activeTab === 'info' && ingreso && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-gray-400 text-sm">Cliente:</span>
                  <p className="text-white font-medium">{ingreso.CLIENTE || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Matrícula:</span>
                  <p className="text-white font-medium">{ingreso['Matrícula vehí'] || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Modelo:</span>
                  <p className="text-white font-medium">{ingreso.Modelo || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Taller:</span>
                  <p className="text-white font-medium">{ingreso['Nombre taller'] || '-'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-gray-400 text-sm">Fecha Cierre:</span>
                  <p className="text-white font-medium">
                    {ingreso['F cierr'] ? format(new Date(ingreso['F cierr']), 'dd/MM/yyyy', { locale: es }) : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Teléfono:</span>
                  <p className="text-white font-medium">{ingreso.Teléfono || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">E-mail:</span>
                  <p className="text-white font-medium">{ingreso['E-mail'] || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Estado Actual:</span>
                  <div className="mt-1">
                    {getEstadoBadge(oportunidad?.estado || 'pendiente')}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-gray-400 text-sm">Desaveria:</span>
                <p className="text-white mt-1">{ingreso.Desaveria || '-'}</p>
              </div>
            </div>
          )}

          {/* Tab: Estado */}
          {activeTab === 'estado' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Estado Actual</h3>
                <div className="mb-4">
                  {getEstadoBadge(oportunidad?.estado || 'pendiente')}
                </div>
              </div>

              <form onSubmit={handleCambioEstado} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Cambiar Estado</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nuevo Estado *
                    </label>
                    <select
                      value={cambioEstado.estado}
                      onChange={(e) => setCambioEstado(prev => ({ ...prev, estado: e.target.value }))}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    >
                      <option value="">Seleccionar estado</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_gestion">En Gestión</option>
                      <option value="a_tratar">A Tratar</option>
                      <option value="cerrado">Cerrado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Usuario *
                    </label>
                    <input
                      type="text"
                      value={cambioEstado.usuario}
                      onChange={(e) => setCambioEstado(prev => ({ ...prev, usuario: e.target.value }))}
                      placeholder="Nombre del usuario"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    />
                  </div>
                </div>

                {cambioEstado.estado === 'cerrado' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Motivo de Cierre *
                    </label>
                    <textarea
                      value={cambioEstado.motivo}
                      onChange={(e) => setCambioEstado(prev => ({ ...prev, motivo: e.target.value }))}
                      placeholder="Describe el motivo del cierre..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                      disabled={saving}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !cambioEstado.estado || !cambioEstado.usuario}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <FaCog />
                      <span>Cambiar Estado</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab: Alarma */}
          {activeTab === 'alarma' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Alarma Actual</h3>
                {oportunidad?.alarma?.activa ? (
                  <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-400 mb-2">
                      <FaBell />
                      <span className="font-medium">Alarma Activa</span>
                    </div>
                    <p className="text-orange-300">
                      Programada para: {formatTimestamp(oportunidad.alarma.fechaHora)}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-gray-400">No hay alarma configurada</p>
                  </div>
                )}
              </div>

              <form onSubmit={handleSetAlarma} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Configurar Alarma</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Fecha y Hora *
                    </label>
                    <input
                      type="datetime-local"
                      value={alarma.fechaHora}
                      onChange={(e) => setAlarma(prev => ({ ...prev, fechaHora: e.target.value }))}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Usuario *
                    </label>
                    <input
                      type="text"
                      value={alarma.usuario}
                      onChange={(e) => setAlarma(prev => ({ ...prev, usuario: e.target.value }))}
                      placeholder="Nombre del usuario"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving || !alarma.fechaHora || !alarma.usuario}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <FaBell />
                      <span>Configurar Alarma</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab: Comentarios */}
          {activeTab === 'comentarios' && (
            <div className="space-y-6">
              {/* Lista de comentarios */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Comentarios ({comentarios.length})</h3>
                
                {comentarios.length === 0 ? (
                  <div className="text-center py-8">
                    <FaComment className="text-gray-600 text-4xl mx-auto mb-4" />
                    <p className="text-gray-400">No hay comentarios registrados</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {comentarios.map((comentario, index) => (
                      <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FaUser className="text-primary text-sm" />
                            <span className="font-medium text-white">{comentario.usuario}</span>
                            {comentario.esLog && (
                              <span className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-700">
                                LOG
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <FaClock />
                            <span>{formatTimestamp(comentario.timestamp)}</span>
                          </div>
                        </div>
                        <p className="text-gray-300 whitespace-pre-wrap">{comentario.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Formulario de nuevo comentario */}
              <form onSubmit={handleSubmitComentario} className="space-y-4">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <FaPlus className="text-primary" />
                  Agregar Comentario
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Usuario *
                    </label>
                    <input
                      type="text"
                      value={nuevoComentario.usuario}
                      onChange={(e) => setNuevoComentario(prev => ({ ...prev, usuario: e.target.value }))}
                      placeholder="Nombre del usuario"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Comentario *
                  </label>
                  <textarea
                    value={nuevoComentario.comentario}
                    onChange={(e) => setNuevoComentario(prev => ({ ...prev, comentario: e.target.value }))}
                    placeholder="Describe el seguimiento realizado..."
                    rows={4}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    disabled={saving}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || !nuevoComentario.usuario.trim() || !nuevoComentario.comentario.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <FaPlus />
                      <span>Agregar Comentario</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OportunidadModal;



