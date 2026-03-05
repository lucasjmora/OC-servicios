import { useState, useEffect, useRef } from 'react';
import { 
  getLegalDetalle, 
  updateEstadoLegal, 
  setAlarmaLegal,
  addComentarioLegal,
  uploadAdjuntoLegal,
  deleteAdjuntoLegal,
  getApiBaseUrl
} from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus, FaBell, FaCheck, FaExclamationTriangle, FaEye, FaCog, FaHistory, FaCar, FaBuilding, FaEnvelope, FaPhone, FaGavel, FaFile, FaDownload, FaTrash } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const LegalModal = ({ casoLegal, onClose, onUpdate }) => {
  const referencia = casoLegal?.ingresoReferencia;
  const [legalData, setLegalData] = useState(null);
  const [ingreso, setIngreso] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const fileInputRef = useRef(null);
  
  // Estados para formularios
  const [nuevoComentario, setNuevoComentario] = useState({
    usuario: '',
    texto: ''
  });
  const [cambioEstado, setCambioEstado] = useState({
    estado: '',
    subEstado: '',
    usuario: ''
  });
  const [alarma, setAlarma] = useState({
    fechaHora: '',
    usuario: ''
  });

  useEffect(() => {
    if (referencia) {
      loadLegal();
    }
  }, [referencia]);

  const loadLegal = async () => {
    try {
      setLoading(true);
      const response = await getLegalDetalle(referencia);
      setLegalData(response.data.casoLegal);
      setIngreso(response.data.ingreso);
      setComentarios(response.data.comentarios || []);
      setAdjuntos(response.data.casoLegal?.adjuntos || []);
    } catch (error) {
      console.error('Error cargando caso legal:', error);
      setError('Error cargando datos del caso legal');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComentario = async (e) => {
    e.preventDefault();
    
    if (!nuevoComentario.usuario.trim() || !nuevoComentario.texto.trim()) {
      setError('Usuario y comentario son requeridos');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await addComentarioLegal(referencia, {
        usuario: nuevoComentario.usuario.trim(),
        texto: nuevoComentario.texto.trim()
      });

      // Recargar datos
      await loadLegal();
      if (onUpdate) onUpdate();

      // Limpiar formulario
      setNuevoComentario({
        usuario: '',
        texto: ''
      });

    } catch (error) {
      console.error('Error agregando comentario:', error);
      setError('Error guardando comentario');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setError('');

      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('usuario', nuevoComentario.usuario.trim() || 'Usuario');

      await uploadAdjuntoLegal(referencia, formData);
      
      // Recargar datos
      await loadLegal();
      if (onUpdate) onUpdate();
      
      // Limpiar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error subiendo archivo:', error);
      setError('Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadAdjunto = (adjuntoId) => {
    const downloadUrl = `${getApiBaseUrl()}/legales/${referencia}/adjuntos/${adjuntoId}`;
    window.open(downloadUrl, '_blank');
  };

  const handleDeleteAdjunto = async (adjuntoId) => {
    if (!window.confirm('¿Está seguro que desea eliminar este archivo adjunto?')) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      await deleteAdjuntoLegal(referencia, adjuntoId);
      
      // Recargar datos
      await loadLegal();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error eliminando adjunto:', error);
      setError('Error al eliminar el archivo');
    } finally {
      setLoading(false);
    }
  };

  const handleCambioEstado = async (e) => {
    e.preventDefault();
    
    if (!cambioEstado.estado || !cambioEstado.usuario) {
      setError('Estado Caso Legal y usuario son requeridos');
      return;
    }

    if (cambioEstado.estado === 'abierto' && !cambioEstado.subEstado) {
      setError('SubEstado Caso Legal es requerido cuando el estado es "abierto"');
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

      await updateEstadoLegal(referencia, datosParaEnviar);

      // Recargar datos
      await loadLegal();
      if (onUpdate) onUpdate();

      // Limpiar formulario
      setCambioEstado({
        estado: '',
        subEstado: '',
        usuario: ''
      });

    } catch (error) {
      console.error('Error cambiando estado:', error);
      setError(error.response?.data?.error || 'Error cambiando estado caso legal');
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

      await setAlarmaLegal(referencia, {
        fechaHora: alarma.fechaHora,
        usuario: alarma.usuario
      });

      // Recargar datos
      await loadLegal();
      if (onUpdate) onUpdate();

      // Limpiar formulario
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

  if (!referencia) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando caso legal...</p>
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
              <FaGavel className="text-primary" />
              Gestión de Caso Legal
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
            { id: 'estado', label: 'Estado Caso Legal', icon: <FaCog /> },
            { id: 'alarma', label: 'Alarma', icon: <FaBell /> },
            { id: 'adjuntos', label: 'Adjuntos', icon: <FaFile /> },
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
              {/* Estado Caso Legal */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Estado Caso Legal Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(legalData?.estado || 'abierto', legalData?.subEstado)}
                </div>
                {legalData?.alarma?.activa && (
                  <p className="text-gray-400 text-sm mt-3">
                    Alarma: {formatTimestamp(legalData.alarma.fechaHora)}
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
                  {ingreso.CLIENTE && (
                    <div>
                      <span className="text-gray-400 text-sm">Cliente:</span>
                      <p className="text-white font-medium">{ingreso.CLIENTE}</p>
                    </div>
                  )}
                  {ingreso.Teléfono && (
                    <div>
                      <span className="text-gray-400 text-sm flex items-center gap-1">
                        <FaPhone className="text-xs" />
                        Teléfono:
                      </span>
                      <p className="text-white font-medium">{ingreso.Teléfono}</p>
                    </div>
                  )}
                  {ingreso['E-mail'] && (
                    <div>
                      <span className="text-gray-400 text-sm flex items-center gap-1">
                        <FaEnvelope className="text-xs" />
                        E-mail:
                      </span>
                      <p className="text-white font-medium">{ingreso['E-mail']}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información del Vehículo */}
              {(ingreso['Matrícula vehí'] || ingreso.Modelo) && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaCar className="text-primary" />
                    Información del Vehículo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ingreso['Matrícula vehí'] && (
                      <div>
                        <span className="text-gray-400 text-sm">Matrícula/Patente:</span>
                        <p className="text-white font-medium">{ingreso['Matrícula vehí']}</p>
                      </div>
                    )}
                    {ingreso.Modelo && (
                      <div>
                        <span className="text-gray-400 text-sm">Modelo:</span>
                        <p className="text-white font-medium">{ingreso.Modelo}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información del Taller */}
              {ingreso['Nombre taller'] && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaBuilding className="text-primary" />
                    Información del Taller
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ingreso['Nombre taller'] && (
                      <div>
                        <span className="text-gray-400 text-sm">Taller:</span>
                        <p className="text-white font-medium">{ingreso['Nombre taller']}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información Adicional */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Información Adicional</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ingreso['F cierr'] && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha Cierre:</span>
                      <p className="text-white font-medium">
                        {format(new Date(ingreso['F cierr']), 'dd/MM/yyyy', { locale: es })}
                      </p>
                    </div>
                  )}
                  {ingreso['Fecaper'] && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha Apertura:</span>
                      <p className="text-white font-medium">
                        {format(new Date(ingreso['Fecaper']), 'dd/MM/yyyy', { locale: es })}
                      </p>
                    </div>
                  )}
                  {ingreso.Desaveria && (
                    <div>
                      <span className="text-gray-400 text-sm">Desaveria:</span>
                      <p className="text-white font-medium text-sm">{ingreso.Desaveria}</p>
                    </div>
                  )}
                  {ingreso.Referencia && (
                    <div>
                      <span className="text-gray-400 text-sm">Referencia:</span>
                      <p className="text-white font-medium">{ingreso.Referencia}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Estado */}
          {activeTab === 'estado' && (
            <div className="space-y-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">Estado Caso Legal Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(legalData?.estado || 'abierto', legalData?.subEstado)}
                </div>
              </div>

              <form onSubmit={handleCambioEstado} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Cambiar Estado Caso Legal</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nuevo Estado Caso Legal *
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
                        SubEstado Caso Legal *
                      </label>
                      <select
                        value={cambioEstado.subEstado}
                        onChange={(e) => setCambioEstado(prev => ({ ...prev, subEstado: e.target.value }))}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        disabled={saving}
                      >
                        <option value="">Seleccionar subEstado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_espera">En espera</option>
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
                {legalData?.alarma?.activa ? (
                  <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-400 mb-2">
                      <FaBell />
                      <span className="font-medium">Alarma Activa</span>
                    </div>
                    <p className="text-orange-300">
                      Programada para: {formatTimestamp(legalData.alarma.fechaHora)}
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

          {/* Tab: Adjuntos */}
          {activeTab === 'adjuntos' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <FaFile />
                  Archivos Adjuntos ({adjuntos.length})
                </h3>

                <div className="space-y-2 mb-6">
                  {adjuntos.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <FaFile className="text-4xl mx-auto mb-2 opacity-50" />
                      <p>No hay archivos adjuntos</p>
                    </div>
                  ) : (
                    adjuntos.map((adjunto) => (
                      <div key={adjunto._id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <FaFile className="text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{adjunto.nombre}</p>
                            <p className="text-gray-400 text-xs">
                              Subido el {formatTimestamp(adjunto.fechaSubida)} por {adjunto.usuario}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadAdjunto(adjunto._id)}
                            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            title="Descargar"
                          >
                            <FaDownload />
                          </button>
                          <button
                            onClick={() => handleDeleteAdjunto(adjunto._id)}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <FaPlus />
                    Subir Archivo
                  </h4>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark"
                  />
                  {uploading && (
                    <div className="mt-2 flex items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Subiendo archivo...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Comentarios */}
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
                        const fechaA = new Date(a.fecha || a.timestamp || 0);
                        const fechaB = new Date(b.fecha || b.timestamp || 0);
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
                            <span>{formatTimestamp(comentario.fecha || comentario.timestamp)}</span>
                          </div>
                        </div>
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{comentario.texto || comentario.comentario}</p>
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
                    value={nuevoComentario.texto}
                    onChange={(e) => setNuevoComentario(prev => ({ ...prev, texto: e.target.value }))}
                    placeholder="Describe el seguimiento realizado..."
                    rows={4}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    disabled={saving}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || !nuevoComentario.usuario.trim() || !nuevoComentario.texto.trim()}
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

          {/* Tab: Historial */}
          {activeTab === 'historial' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-white mb-4">Historial Completo</h3>
              {legalData?.logs && legalData.logs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {[...legalData.logs]
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
                              <span className="text-gray-400 text-sm">Estado Caso Legal:</span>
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

export default LegalModal;
