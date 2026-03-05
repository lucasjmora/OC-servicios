import { useState, useEffect } from 'react';
import { 
  getCitaDetalle, 
  updateEstadoCita,
  setAlarmaCita,
  getComentariosCita,
  addComentarioCita 
} from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus, FaCheck, FaExclamationTriangle, FaEye, FaCog, FaBell, FaHistory, FaCar, FaBuilding, FaCalendarAlt, FaEnvelope, FaPhone } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const AsistenciaModal = ({ referencia, onClose, onUpdate }) => {
  const [cita, setCita] = useState(null);
  const [citaGestion, setCitaGestion] = useState(null);
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
    subEstado: '',
    usuario: '',
    comentario: ''
  });
  const [alarma, setAlarma] = useState({
    fechaHora: '',
    usuario: ''
  });

  useEffect(() => {
    if (referencia) {
      loadCita();
    }
  }, [referencia]);

  const loadCita = async () => {
    try {
      setLoading(true);
      const response = await getCitaDetalle(referencia);
      setCita(response.data.cita);
      setCitaGestion(response.data.citaGestion);
      setComentarios(response.data.comentarios || []);
    } catch (error) {
      console.error('Error cargando cita:', error);
      setError('Error cargando datos de la cita');
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

      await addComentarioCita(referencia, {
        usuario: nuevoComentario.usuario.trim(),
        comentario: nuevoComentario.comentario.trim()
      });

      await loadCita();
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

    if (cambioEstado.estado === 'abierto' && !cambioEstado.subEstado) {
      setError('SubEstado es requerido cuando el estado es "abierto"');
      return;
    }

    if (cambioEstado.estado === 'cerrado' && !cambioEstado.comentario?.trim()) {
      setError('Un comentario es obligatorio para cerrar la cita');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const datosParaEnviar = {
        estado: cambioEstado.estado,
        usuario: cambioEstado.usuario
      };
      
      if (cambioEstado.estado === 'abierto' && cambioEstado.subEstado) {
        datosParaEnviar.subEstado = cambioEstado.subEstado;
      }
      
      if (cambioEstado.estado === 'cerrado' && cambioEstado.comentario?.trim()) {
        datosParaEnviar.comentario = cambioEstado.comentario.trim();
      }
      
      await updateEstadoCita(referencia, datosParaEnviar);

      await loadCita();
      if (onUpdate) onUpdate();

      setCambioEstado({
        estado: '',
        subEstado: '',
        usuario: '',
        comentario: ''
      });

    } catch (error) {
      console.error('Error cambiando estado:', error);
      setError(error.response?.data?.error || 'Error cambiando estado');
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

      await setAlarmaCita(referencia, {
        fechaHora: alarma.fechaHora,
        usuario: alarma.usuario
      });

      await loadCita();
      if (onUpdate) onUpdate();

      setAlarma({
        fechaHora: '',
        usuario: ''
      });

    } catch (error) {
      console.error('Error configurando alarma:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error configurando alarma';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getEstadoBadge = (estado, subEstado = null) => {
    if (estado === 'cerrado') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fce7f3', color: '#991b1b' }}>
          Cerrado
        </span>
      );
    }
    
    if (estado === 'aceptado') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
          Aceptado
        </span>
      );
    }
    
    if (estado === 'abierto') {
      if (subEstado === 'en_espera') {
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fde047', color: '#713f12' }}>
            Abierto (En espera)
          </span>
        );
      }
      
      if (subEstado === 'pendiente') {
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fdba74', color: '#991b1b' }}>
            Abierto (Pendiente)
          </span>
        );
      }
      
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fdba74', color: '#991b1b' }}>
          Abierto (Pendiente)
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fdba74', color: '#991b1b' }}>
        Abierto (Pendiente)
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

  const safeFormatDate = (dateString) => {
    if (!dateString) return 'No disponible';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es });
    } catch {
      return dateString;
    }
  };

  const safeFormatTime = (timeString) => {
    if (!timeString) return 'No disponible';
    return timeString;
  };

  if (!referencia) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando cita...</p>
        </div>
      </div>
    );
  }

  if (!cita) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <p className="text-red-300">Error: Cita no encontrada</p>
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FaEye className="text-primary" />
              Gestión de Cita
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

        <div className="flex border-b border-gray-700 overflow-x-auto">
          {[
            { id: 'info', label: 'Información', icon: <FaEye /> },
            { id: 'estado', label: 'Estado Cita', icon: <FaCog /> },
            { id: 'alarma', label: 'Alarma', icon: <FaBell /> },
            { id: 'comentarios', label: 'Comentarios', icon: <FaComment /> },
            { id: 'historial', label: 'Historial', icon: <FaHistory /> }
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

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Estado Cita */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Estado Cita Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(citaGestion?.estado || 'abierto', citaGestion?.subEstado)}
                </div>
                {citaGestion?.alarma?.activa && (
                  <p className="text-gray-400 text-sm mt-3">
                    Alarma: {formatTimestamp(citaGestion.alarma.fechaHora)}
                  </p>
                )}
              </div>

              {/* Información del Cliente */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FaUser className="text-primary" />
                  Información del Cliente
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cita.Nombre && (
                    <div>
                      <span className="text-gray-400 text-sm">Nombre:</span>
                      <p className="text-white font-medium">{cita.Nombre}</p>
                    </div>
                  )}
                  {cita.Telefono && (
                    <div>
                      <span className="text-gray-400 text-sm flex items-center gap-1">
                        <FaPhone className="text-xs" />
                        Teléfono:
                      </span>
                      <p className="text-white font-medium">{cita.Telefono}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información del Vehículo */}
              {(cita.Matricula || cita['Marca/modelo']) && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaCar className="text-primary" />
                    Información del Vehículo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cita.Matricula && (
                      <div>
                        <span className="text-gray-400 text-sm">Matrícula:</span>
                        <p className="text-white font-medium">{cita.Matricula}</p>
                      </div>
                    )}
                    {cita['Marca/modelo'] && (
                      <div>
                        <span className="text-gray-400 text-sm">Marca/Modelo:</span>
                        <p className="text-white font-medium">{cita['Marca/modelo']}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información de la Cita */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FaCalendarAlt className="text-primary" />
                  Información de la Cita
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cita.Referencia && (
                    <div>
                      <span className="text-gray-400 text-sm">Referencia:</span>
                      <p className="text-white font-medium">{cita.Referencia}</p>
                    </div>
                  )}
                  {cita['Fecha cr'] && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha Creación:</span>
                      <p className="text-white font-medium">{safeFormatDate(cita['Fecha cr'])}</p>
                    </div>
                  )}
                  {cita['Fecha ci'] && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha Cita:</span>
                      <p className="text-white font-medium">{safeFormatDate(cita['Fecha ci'])}</p>
                    </div>
                  )}
                  {cita['Hora '] && (
                    <div>
                      <span className="text-gray-400 text-sm">Hora Cita:</span>
                      <p className="text-white font-medium">{safeFormatTime(cita['Hora '])}</p>
                    </div>
                  )}
                  {cita.Taller && (
                    <div>
                      <span className="text-gray-400 text-sm">Taller:</span>
                      <p className="text-white font-medium">{cita.Taller}</p>
                    </div>
                  )}
                  {cita.Asesor && (
                    <div>
                      <span className="text-gray-400 text-sm">Asesor:</span>
                      <p className="text-white font-medium">{cita.Asesor}</p>
                    </div>
                  )}
                  {cita.Averia && (
                    <div>
                      <span className="text-gray-400 text-sm">Avería:</span>
                      <p className="text-white font-medium">{cita.Averia}</p>
                    </div>
                  )}
                  {cita.Observaciones && (
                    <div className="md:col-span-2">
                      <span className="text-gray-400 text-sm">Observaciones:</span>
                      <p className="text-white font-medium">{cita.Observaciones}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'estado' && (
            <div className="space-y-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">Estado Cita Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(citaGestion?.estado || 'abierto', citaGestion?.subEstado)}
                </div>
              </div>

              <form onSubmit={handleCambioEstado} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Cambiar Estado Cita</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nuevo Estado *
                    </label>
                    <select
                      value={cambioEstado.estado}
                      onChange={(e) => {
                        const nuevoEstado = e.target.value;
                        setCambioEstado(prev => ({ 
                          ...prev, 
                          estado: nuevoEstado,
                          subEstado: nuevoEstado === 'abierto' ? prev.subEstado || 'pendiente' : ''
                        }));
                      }}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                      disabled={saving}
                    >
                      <option value="">Seleccionar estado</option>
                      <option value="cerrado">Cerrado</option>
                      <option value="aceptado">Aceptado</option>
                      <option value="abierto">Abierto</option>
                    </select>
                  </div>

                  {cambioEstado.estado === 'abierto' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        SubEstado *
                      </label>
                      <select
                        value={cambioEstado.subEstado}
                        onChange={(e) => setCambioEstado(prev => ({ ...prev, subEstado: e.target.value }))}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        disabled={saving}
                      >
                        <option value="">Seleccionar subEstado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_espera">En Espera</option>
                      </select>
                    </div>
                  )}

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
                      Comentario de Cierre *
                    </label>
                    <textarea
                      value={cambioEstado.comentario}
                      onChange={(e) => setCambioEstado(prev => ({ ...prev, comentario: e.target.value }))}
                      placeholder="Ingrese el motivo o comentario para cerrar la cita..."
                      rows={4}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                      disabled={saving}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !cambioEstado.estado || !cambioEstado.usuario || (cambioEstado.estado === 'abierto' && !cambioEstado.subEstado) || (cambioEstado.estado === 'cerrado' && !cambioEstado.comentario?.trim())}
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

          {activeTab === 'alarma' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Alarma Actual</h3>
                {citaGestion?.alarma?.activa ? (
                  <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-400 mb-2">
                      <FaBell />
                      <span className="font-medium">Alarma Activa</span>
                    </div>
                    <p className="text-orange-300">
                      Programada para: {formatTimestamp(citaGestion.alarma.fechaHora)}
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

          {activeTab === 'comentarios' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Comentarios</h3>
                
                {comentarios.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No hay comentarios aún</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {[...comentarios]
                      .sort((a, b) => {
                        const fechaA = new Date(a.timestamp || a.fecha || 0);
                        const fechaB = new Date(b.timestamp || b.fecha || 0);
                        return fechaB - fechaA;
                      })
                      .map((comentario, index) => (
                      <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FaUser className="text-primary text-sm" />
                            <span className="font-medium text-white">{comentario.usuario}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <FaClock />
                            <span>{formatTimestamp(comentario.timestamp || comentario.fecha)}</span>
                          </div>
                        </div>
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{comentario.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmitComentario} className="space-y-4 border-t border-gray-700 pt-6">
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

          {activeTab === 'historial' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-white mb-4">Historial Completo</h3>
              {citaGestion?.logs && citaGestion.logs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {[...citaGestion.logs]
                    .sort((a, b) => {
                      const fechaA = new Date(a.timestamp || a.createdAt || 0);
                      const fechaB = new Date(b.timestamp || b.createdAt || 0);
                      return fechaB - fechaA;
                    })
                    .map((log, index) => (
                    <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FaUser className="text-primary text-sm" />
                          <span className="font-medium text-white">{log.usuario}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <FaClock />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </div>
                      
                      <div className="mb-2">
                        <span className="text-gray-400 text-sm">Acción: </span>
                        <span className="text-white text-sm font-medium">{log.accion}</span>
                      </div>
                      
                      {(log.estadoAnterior || log.estadoNuevo) && (
                        <div className="flex items-center gap-2 mb-2">
                          {log.estadoAnterior && (
                            <>
                              <span className="text-gray-400 text-sm">Estado:</span>
                              {getEstadoBadge(log.estadoAnterior, log.subEstadoAnterior)}
                            </>
                          )}
                          {log.estadoAnterior && log.estadoNuevo && (
                            <span className="text-gray-400 mx-2">→</span>
                          )}
                          {log.estadoNuevo && (
                            <>
                              {getEstadoBadge(log.estadoNuevo, log.subEstadoNuevo)}
                            </>
                          )}
                        </div>
                      )}
                      
                      {log.comentario && (
                        <p className="text-gray-300 mt-2 text-sm whitespace-pre-wrap">{log.comentario}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">No hay historial disponible</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AsistenciaModal;






