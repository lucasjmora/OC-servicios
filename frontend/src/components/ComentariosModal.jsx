import { useState, useEffect } from 'react';
import { getComentariosCita, addComentarioCita } from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ComentariosModal = ({ cita, onClose }) => {
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState({
    usuario: '',
    comentario: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (cita) {
      loadComentarios();
    }
  }, [cita]);

  const loadComentarios = async () => {
    try {
      setLoading(true);
      const response = await getComentariosCita(cita.Referencia);
      
      // El servicio devuelve la respuesta completa de axios
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setComentarios(response.data.data);
      } else {
        console.warn('Formato de respuesta inesperado:', response);
        setComentarios([]);
      }
    } catch (error) {
      console.error('Error cargando comentarios:', error);
      setError('Error cargando comentarios');
      setComentarios([]);
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

      await addComentarioCita(cita.Referencia, {
        usuario: nuevoComentario.usuario.trim(),
        comentario: nuevoComentario.comentario.trim()
      });

      // Recargar comentarios
      await loadComentarios();

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

  const handleChange = (field, value) => {
    setNuevoComentario(prev => ({
      ...prev,
      [field]: value
    }));
    setError(''); // Limpiar error al cambiar
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'dd/MM/yyyy HH:mm', { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  if (!cita) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FaComment className="text-primary" />
              Comentarios de Seguimiento
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Referencia: <span className="font-medium text-primary">{cita.Referencia}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col h-[calc(90vh-120px)]">
          {/* Información de la cita */}
          <div className="p-6 bg-gray-800/50 border-b border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Cliente:</span>
                <p className="text-white font-medium">{cita.Nombre || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Matrícula:</span>
                <p className="text-white font-medium">{cita.Matricula || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Fecha Cita:</span>
                <p className="text-white font-medium">
                  {cita['Fecha ci'] ? format(new Date(cita['Fecha ci']), 'dd/MM/yyyy', { locale: es }) : '-'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Hora:</span>
                <p className="text-white font-medium">{cita['Hora '] || '-'}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Lista de comentarios */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-gray-400">Cargando comentarios...</p>
                </div>
              ) : comentarios.length === 0 ? (
                <div className="text-center py-8">
                  <FaComment className="text-gray-600 text-4xl mx-auto mb-4" />
                  <p className="text-gray-400">No hay comentarios registrados</p>
                  <p className="text-gray-500 text-sm">Sé el primero en agregar un comentario</p>
                </div>
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

            {/* Formulario de nuevo comentario */}
            <div className="border-t border-gray-700 p-6">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <FaPlus className="text-primary" />
                Agregar Comentario
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmitComentario} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Usuario *
                  </label>
                  <input
                    type="text"
                    value={nuevoComentario.usuario}
                    onChange={(e) => handleChange('usuario', e.target.value)}
                    placeholder="Nombre del usuario que realiza el seguimiento"
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
                    onChange={(e) => handleChange('comentario', e.target.value)}
                    placeholder="Describe el seguimiento realizado o las acciones tomadas..."
                    rows={4}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    disabled={saving}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
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
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComentariosModal;
