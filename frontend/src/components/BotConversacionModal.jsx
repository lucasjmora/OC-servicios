import { useState, useEffect } from 'react';
import { 
  getBotConversationMessages,
  getBotConversacionEstado,
  updateBotConversacionEstado,
  getBotConversacionComentarios,
  addBotConversacionComentario
} from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus, FaCheck, FaExclamationTriangle, FaHistory, FaRobot, FaCalendar, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BotConversacionModal = ({ empresa, sessionId, herramientasUtilizadas, onClose, onUpdate }) => {
  const [conversation, setConversation] = useState(null);
  const [gestion, setGestion] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  
  const [nuevoComentario, setNuevoComentario] = useState({
    usuario: '',
    comentario: ''
  });
  const [cambioEstado, setCambioEstado] = useState({
    estado: '',
    usuario: '',
    comentario: ''
  });

  useEffect(() => {
    if (empresa && sessionId) {
      loadConversacion();
    }
  }, [empresa, sessionId]);

  const loadConversacion = async () => {
    try {
      setLoading(true);
      const [convResponse, estadoResponse, comentariosResponse] = await Promise.all([
        getBotConversationMessages(empresa.toUpperCase(), sessionId),
        getBotConversacionEstado(empresa.toUpperCase(), sessionId),
        getBotConversacionComentarios(empresa.toUpperCase(), sessionId)
      ]);
      
      setConversation(convResponse.data.data);
      setGestion(estadoResponse.data.data);
      setComentarios(comentariosResponse.data.data.comentarios || []);
    } catch (error) {
      console.error('Error cargando conversación:', error);
      setError('Error cargando datos de la conversación');
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

      await addBotConversacionComentario(empresa.toUpperCase(), sessionId, {
        usuario: nuevoComentario.usuario.trim(),
        comentario: nuevoComentario.comentario.trim()
      });

      await loadConversacion();
      if (onUpdate) onUpdate();

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

    if (!cambioEstado.comentario?.trim()) {
      setError('Un comentario es obligatorio para cambiar el estado');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await updateBotConversacionEstado(empresa.toUpperCase(), sessionId, {
        estado: cambioEstado.estado,
        usuario: cambioEstado.usuario.trim(),
        comentario: cambioEstado.comentario.trim()
      });

      await loadConversacion();
      if (onUpdate) onUpdate();

      setCambioEstado({
        estado: '',
        usuario: '',
        comentario: ''
      });

    } catch (error) {
      console.error('Error cambiando estado:', error);
      setError(error.response?.data?.error || 'Error guardando cambio de estado');
    } finally {
      setSaving(false);
    }
  };

  const getEstadoBadge = (estado) => {
    if (estado === 'tratado') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#86efac', color: '#166534' }}>
          <FaCheck />
          Tratado
        </span>
      );
    }
    
    if (estado === 'no_tratado') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fef08a', color: '#854d0e' }}>
          <FaExclamationTriangle />
          No tratado
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fef08a', color: '#854d0e' }}>
        <FaExclamationTriangle />
        No tratado
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Usar herramientas pasadas como prop o detectarlas desde la conversación
  const detectarHerramientas = () => {
    // Si vienen como prop, usarlas directamente
    if (herramientasUtilizadas) {
      return herramientasUtilizadas;
    }
    
    // Si no, intentar detectarlas desde los mensajes (fallback)
    if (!conversation?.messages) return { tieneAgendarTurno: false, tieneEnviarCorreo: false };
    
    let tieneAgendarTurno = false;
    let tieneEnviarCorreo = false;

    // Buscar en los mensajes del bot que contengan información de herramientas
    conversation.messages.forEach(msg => {
      if (msg.content && typeof msg.content === 'string') {
        // Buscar referencias a agendar_turno (cualquier versión)
        if (msg.content.includes('agendar_turno')) {
          tieneAgendarTurno = true;
        }
        if (msg.content.includes('enviarCorreo')) {
          tieneEnviarCorreo = true;
        }
      }
    });

    return { tieneAgendarTurno, tieneEnviarCorreo };
  };

  const herramientas = detectarHerramientas();
  // Elegible: todas las que NO ejecutaron agendar_turno (cualquier versión)
  const esElegible = !herramientas.tieneAgendarTurno;

  if (!empresa || !sessionId) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando conversación...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <p className="text-red-300">Error: Conversación no encontrada</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const estadoActual = gestion?.estado || 'no_tratado';
  const logs = gestion?.logs || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Conversación del Bot</h2>
            <p className="text-gray-400 text-sm mt-1 font-mono">{sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <FaTimes className="text-gray-400 text-xl" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-800/50">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-primary border-b-2 border-primary bg-gray-800'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Información
          </button>
          {esElegible && (
            <>
              <button
                onClick={() => setActiveTab('estado')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'estado'
                    ? 'text-primary border-b-2 border-primary bg-gray-800'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Estado
              </button>
              <button
                onClick={() => setActiveTab('comentarios')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'comentarios'
                    ? 'text-primary border-b-2 border-primary bg-gray-800'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Comentarios
              </button>
              <button
                onClick={() => setActiveTab('historial')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'historial'
                    ? 'text-primary border-b-2 border-primary bg-gray-800'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Historial
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Session ID</label>
                  <p className="text-white font-mono text-sm">{sessionId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Empresa</label>
                  <p className="text-white">{empresa.toUpperCase()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Primer Mensaje</label>
                  <p className="text-white">{formatDate(conversation.messages?.[0]?.createdDate)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Último Mensaje</label>
                  <p className="text-white">{formatDate(conversation.messages?.[conversation.messages.length - 1]?.createdDate)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Total Mensajes</label>
                  <p className="text-white">{conversation.totalMessages || conversation.messages?.length || 0}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Flow</label>
                  <p className="text-white">{conversation.flowName || 'N/A'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Herramientas Utilizadas</label>
                <div className="flex gap-4">
                  {herramientas.tieneAgendarTurno && (
                    <div className="flex items-center gap-2 text-blue-400">
                      <FaCalendar />
                      <span>agendar_turno</span>
                    </div>
                  )}
                  {herramientas.tieneEnviarCorreo && (
                    <div className="flex items-center gap-2 text-green-400">
                      <FaEnvelope />
                      <span>enviarCorreo</span>
                    </div>
                  )}
                  {!herramientas.tieneAgendarTurno && !herramientas.tieneEnviarCorreo && (
                    <span className="text-gray-500">Ninguna</span>
                  )}
                </div>
              </div>

              {esElegible && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Estado Actual</label>
                  {getEstadoBadge(estadoActual)}
                </div>
              )}
            </div>
          )}

          {activeTab === 'estado' && esElegible && (
            <div className="space-y-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">Estado Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(estadoActual)}
                </div>
              </div>

              <form onSubmit={handleCambioEstado} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Cambiar Estado</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Estado *
                  </label>
                  <select
                    value={cambioEstado.estado}
                    onChange={(e) => setCambioEstado(prev => ({ ...prev, estado: e.target.value }))}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                    disabled={saving}
                  >
                    <option value="">Seleccionar estado</option>
                    <option value="tratado">Tratado</option>
                    <option value="no_tratado">No tratado</option>
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

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Comentario * <span className="text-red-400">(Obligatorio)</span>
                  </label>
                  <textarea
                    value={cambioEstado.comentario}
                    onChange={(e) => setCambioEstado(prev => ({ ...prev, comentario: e.target.value }))}
                    placeholder="Ingrese un comentario para el cambio de estado..."
                    rows={4}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                    disabled={saving}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || !cambioEstado.estado || !cambioEstado.usuario || !cambioEstado.comentario?.trim()}
                  className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Cambiar Estado'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'comentarios' && esElegible && (
            <div className="space-y-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">Comentarios</h3>
                {comentarios.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No hay comentarios registrados</p>
                ) : (
                  <div className="space-y-4">
                    {comentarios.map((comentario, index) => (
                      <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FaUser className="text-primary text-sm" />
                            <span className="font-medium text-white">{comentario.usuario}</span>
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

              <form onSubmit={handleSubmitComentario} className="border-t border-gray-700 pt-6">
                <h3 className="text-lg font-medium text-white mb-4">Agregar Comentario</h3>
                <div className="space-y-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Comentario *
                    </label>
                    <textarea
                      value={nuevoComentario.comentario}
                      onChange={(e) => setNuevoComentario(prev => ({ ...prev, comentario: e.target.value }))}
                      placeholder="Escriba su comentario..."
                      rows={4}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !nuevoComentario.usuario.trim() || !nuevoComentario.comentario.trim()}
                    className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Guardando...' : 'Agregar Comentario'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'historial' && esElegible && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-white mb-4">Historial de Cambios</h3>
              {logs.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No hay historial disponible</p>
              ) : (
                <div className="space-y-4">
                  {logs.map((log, index) => (
                    <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FaHistory className="text-primary text-sm" />
                          <span className="font-medium text-white">{log.usuario}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <FaClock />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </div>
                      <div className="mb-2">
                        <span className="text-gray-400 text-sm">Acción: </span>
                        <span className="text-white font-medium">{log.accion}</span>
                      </div>
                      {log.estadoAnterior && log.estadoNuevo && (
                        <div className="mb-2">
                          <span className="text-gray-400 text-sm">Estado: </span>
                          <span className="text-gray-300">{log.estadoAnterior}</span>
                          <span className="text-gray-500 mx-2">→</span>
                          <span className="text-white font-medium">{log.estadoNuevo}</span>
                        </div>
                      )}
                      {log.comentario && (
                        <p className="text-gray-300 mt-2 text-sm whitespace-pre-wrap">{log.comentario}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BotConversacionModal;

