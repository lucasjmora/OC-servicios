import { useState, useEffect } from 'react';
import { 
  getBoletoDetalle, 
  updateEstadoBoleto,
  setAlarmaBoleto,
  getComentariosBoleto,
  addComentarioBoleto 
} from '../services/api';
import { FaTimes, FaComment, FaUser, FaClock, FaPlus, FaCheck, FaExclamationTriangle, FaEye, FaCog, FaBell, FaHistory, FaCar, FaBuilding, FaTicketAlt, FaEnvelope, FaPhone, FaIdCard } from 'react-icons/fa';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BoletoModal = ({ boletoId, onClose, onUpdate }) => {
  const [boleto, setBoleto] = useState(null);
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
    usuario: ''
  });
  const [alarma, setAlarma] = useState({
    fechaHora: '',
    usuario: ''
  });

  useEffect(() => {
    if (boletoId) {
      loadBoleto();
    }
  }, [boletoId]);

  const loadBoleto = async () => {
    try {
      setLoading(true);
      const response = await getBoletoDetalle(boletoId);
      setBoleto(response.data.boleto);
      setComentarios(response.data.boleto.comentarios || []);
    } catch (error) {
      console.error('Error cargando boleto:', error);
      setError('Error cargando datos del boleto');
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

      await addComentarioBoleto(boletoId, {
        usuario: nuevoComentario.usuario.trim(),
        comentario: nuevoComentario.comentario.trim()
      });

      await loadBoleto();
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
      setError('Estado Oportunidad y usuario son requeridos');
      return;
    }

    if (cambioEstado.estado === 'abierto' && !cambioEstado.subEstado) {
      setError('SubEstado Oportunidad es requerido cuando el estado es "abierto"');
      return;
    }

    try {
      setSaving(true);
      setError('');

      // Solo enviar subEstado si el estado es "abierto", sino enviar undefined
      const datosParaEnviar = {
        estado: cambioEstado.estado,
        usuario: cambioEstado.usuario
      };
      
      if (cambioEstado.estado === 'abierto' && cambioEstado.subEstado) {
        datosParaEnviar.subEstado = cambioEstado.subEstado;
      }
      
      await updateEstadoBoleto(boletoId, datosParaEnviar);

      await loadBoleto();
      if (onUpdate) onUpdate();

      setCambioEstado({
        estado: '',
        subEstado: '',
        usuario: ''
      });

    } catch (error) {
      console.error('Error cambiando estado oportunidad:', error);
      setError(error.response?.data?.error || 'Error cambiando estado oportunidad');
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

      await setAlarmaBoleto(boletoId, {
        fechaHora: alarma.fechaHora,
        usuario: alarma.usuario
      });

      await loadBoleto();
      if (onUpdate) onUpdate();

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

  const getEstadoBadge = (estado, subEstado = null) => {
    if (estado === 'cerrado') {
      // Rosa claro con texto rojo oscuro
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fce7f3', color: '#991b1b' }}>
          Cerrado
        </span>
      );
    }
    
    if (estado === 'aceptado') {
      // Verde claro con texto verde oscuro
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
          Aceptado
        </span>
      );
    }
    
    if (estado === 'abierto') {
      if (subEstado === 'en_espera') {
        // Amarillo dorado con texto marrón/negro oscuro
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fde047', color: '#713f12' }}>
            Abierto (En espera)
          </span>
        );
      }
      
      if (subEstado === 'pendiente') {
        // Rojo-naranja con texto rojo oscuro
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fdba74', color: '#991b1b' }}>
            Abierto (Pendiente)
          </span>
        );
      }
      
      // Si no tiene subEstado, mostrar como pendiente por defecto
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: '#fdba74', color: '#991b1b' }}>
          Abierto (Pendiente)
        </span>
      );
    }
    
    // Estado por defecto
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

  if (!boletoId) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando boleto...</p>
        </div>
      </div>
    );
  }

  if (!boleto) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <p className="text-red-300">Error: Boleto no encontrado</p>
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

  // Extraer información del boleto de forma estructurada
  const datosBoleto = boleto.datosBoleto || {};
  const ownerIds = Array.isArray(datosBoleto.ownerIds) ? datosBoleto.ownerIds : [];
  const vehicleId = datosBoleto.vehicleId || {};
  const origen = datosBoleto.origen || {};
  
  const formatDate = (dateString) => {
    if (!dateString) return 'No disponible';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: es });
    } catch {
      return dateString;
    }
  };

  const formatFieldName = (fieldName) => {
    // Convertir nombres de campos en español legible
    const fieldNames = {
      'Name': 'Nombre',
      'LastName': 'Apellido',
      'CuilCuit': 'CUIL/CUIT',
      'Email': 'Correo Electrónico',
      'Tel': 'Teléfono',
      'Brand': 'Marca',
      'Model': 'Modelo',
      'Domain': 'Dominio/Patente',
      'ChassisNumber': 'Número de Chasis',
      'city': 'Ciudad',
      'province': 'Provincia',
      'address': 'Dirección',
      'company': 'Empresa',
      'salesConsultant': 'Consultor de Ventas',
      'status': 'Estado Boleto',
      'typeOfSale': 'Tipo de Venta',
      'createdAt': 'Fecha de Creación',
      'updatedAt': 'Última Actualización'
    };
    return fieldNames[fieldName] || fieldName;
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FaEye className="text-primary" />
              Gestión de Boleto
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              ID: <span className="font-medium text-primary">{boletoId}</span>
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
            { id: 'estado', label: 'Estado Oportunidad', icon: <FaCog /> },
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
              {/* Estado Oportunidad */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Estado Oportunidad Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(boleto.estado || 'abierto', boleto.subEstado)}
                </div>
                {boleto.fechaUltimoComentario && (
                  <p className="text-gray-400 text-sm mt-3">
                    Último comentario: {formatTimestamp(boleto.fechaUltimoComentario)}
                  </p>
                )}
              </div>

              {/* Información del Cliente */}
              {ownerIds.length > 0 && ownerIds[0] && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaUser className="text-primary" />
                    Información del Cliente
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ownerIds[0].Name && (
                      <div>
                        <span className="text-gray-400 text-sm">Nombre:</span>
                        <p className="text-white font-medium">{ownerIds[0].Name}</p>
                      </div>
                    )}
                    {ownerIds[0].LastName && (
                      <div>
                        <span className="text-gray-400 text-sm">Apellido:</span>
                        <p className="text-white font-medium">{ownerIds[0].LastName}</p>
                      </div>
                    )}
                    {ownerIds[0].Email && (
                      <div>
                        <span className="text-gray-400 text-sm flex items-center gap-1">
                          <FaEnvelope className="text-xs" />
                          Correo Electrónico:
                        </span>
                        <p className="text-white font-medium">{ownerIds[0].Email}</p>
                      </div>
                    )}
                    {ownerIds[0].Tel && (
                      <div>
                        <span className="text-gray-400 text-sm flex items-center gap-1">
                          <FaPhone className="text-xs" />
                          Teléfono:
                        </span>
                        <p className="text-white font-medium">{ownerIds[0].Tel}</p>
                      </div>
                    )}
                    {ownerIds[0].CuilCuit && (
                      <div>
                        <span className="text-gray-400 text-sm flex items-center gap-1">
                          <FaIdCard className="text-xs" />
                          CUIL/CUIT:
                        </span>
                        <p className="text-white font-medium">{ownerIds[0].CuilCuit}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información del Vehículo */}
              {(vehicleId.Brand || vehicleId.Model) && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaCar className="text-primary" />
                    Información del Vehículo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vehicleId.Brand && (
                      <div>
                        <span className="text-gray-400 text-sm">Marca:</span>
                        <p className="text-white font-medium">{vehicleId.Brand}</p>
                      </div>
                    )}
                    {vehicleId.Model && (
                      <div>
                        <span className="text-gray-400 text-sm">Modelo:</span>
                        <p className="text-white font-medium">{vehicleId.Model}</p>
                      </div>
                    )}
                    {vehicleId.Domain && (
                      <div>
                        <span className="text-gray-400 text-sm">Dominio/Patente:</span>
                        <p className="text-white font-medium">{vehicleId.Domain}</p>
                      </div>
                    )}
                    {vehicleId.ChassisNumber && (
                      <div>
                        <span className="text-gray-400 text-sm">Número de Chasis:</span>
                        <p className="text-white font-medium text-xs">{vehicleId.ChassisNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información del Origen/Taller */}
              {(origen.city || origen.company) && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaBuilding className="text-primary" />
                    Información del Origen
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {origen.city && (
                      <div>
                        <span className="text-gray-400 text-sm">Ciudad:</span>
                        <p className="text-white font-medium">{origen.city}</p>
                      </div>
                    )}
                    {origen.province && (
                      <div>
                        <span className="text-gray-400 text-sm">Provincia:</span>
                        <p className="text-white font-medium">{origen.province}</p>
                      </div>
                    )}
                    {origen.company && (
                      <div>
                        <span className="text-gray-400 text-sm">Empresa:</span>
                        <p className="text-white font-medium">{origen.company}</p>
                      </div>
                    )}
                    {origen.address && (
                      <div>
                        <span className="text-gray-400 text-sm">Dirección:</span>
                        <p className="text-white font-medium">{origen.address}</p>
                      </div>
                    )}
                    {origen.createdAt && (
                      <div>
                        <span className="text-gray-400 text-sm">Fecha Creación Origen:</span>
                        <p className="text-white font-medium">{formatDate(origen.createdAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Información del Boleto */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FaTicketAlt className="text-primary" />
                  Información del Boleto
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {datosBoleto.status && (
                    <div>
                      <span className="text-gray-400 text-sm">Estado Boleto:</span>
                      <p className="text-white font-medium">{datosBoleto.status}</p>
                    </div>
                  )}
                  {datosBoleto.typeOfSale && (
                    <div>
                      <span className="text-gray-400 text-sm">Tipo de Venta:</span>
                      <p className="text-white font-medium">{datosBoleto.typeOfSale}</p>
                    </div>
                  )}
                  {datosBoleto.salesConsultant && (
                    <div>
                      <span className="text-gray-400 text-sm">Consultor de Ventas:</span>
                      <p className="text-white font-medium">{datosBoleto.salesConsultant}</p>
                    </div>
                  )}
                  {datosBoleto.createdAt && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha de Creación:</span>
                      <p className="text-white font-medium">{formatDate(datosBoleto.createdAt)}</p>
                    </div>
                  )}
                  {boleto.createdAt && (
                    <div>
                      <span className="text-gray-400 text-sm">Fecha Registro en Sistema:</span>
                      <p className="text-white font-medium">{formatTimestamp(boleto.createdAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información Adicional (campos que no están en las secciones principales) */}
              {(() => {
                const camposAdicionales = { ...datosBoleto };
                delete camposAdicionales.ownerIds;
                delete camposAdicionales.vehicleId;
                delete camposAdicionales.origen;
                delete camposAdicionales.status;
                delete camposAdicionales.typeOfSale;
                delete camposAdicionales.salesConsultant;
                delete camposAdicionales.createdAt;
                
                const camposConValor = Object.entries(camposAdicionales).filter(([_, value]) => 
                  value !== null && value !== undefined && value !== ''
                );
                
                if (camposConValor.length === 0) return null;
                
                return (
                  <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-white mb-4">Información Adicional</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {camposConValor.map(([key, value]) => (
                        <div key={key}>
                          <span className="text-gray-400 text-sm">{formatFieldName(key)}:</span>
                          <p className="text-white font-medium">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'estado' && (
            <div className="space-y-6">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4">Estado Oportunidad Actual</h3>
                <div className="flex items-center gap-2">
                  {getEstadoBadge(boleto.estado || 'abierto', boleto.subEstado)}
                </div>
              </div>

              <form onSubmit={handleCambioEstado} className="space-y-4">
                <h3 className="text-lg font-medium text-white">Cambiar Estado Oportunidad</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nuevo Estado Oportunidad *
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
                        SubEstado Oportunidad *
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

                <button
                  type="submit"
                  disabled={saving || !cambioEstado.estado || !cambioEstado.usuario || (cambioEstado.estado === 'abierto' && !cambioEstado.subEstado)}
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
                {boleto.alarma && boleto.alarma.activa ? (
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-yellow-300 font-medium">Alarma Activa</p>
                        <p className="text-gray-300 text-sm mt-1">
                          Fecha/Hora: {formatTimestamp(boleto.alarma.fechaHora)}
                        </p>
                        <p className="text-gray-300 text-sm">
                          Configurada por: {boleto.alarma.usuario}
                        </p>
                      </div>
                      <FaBell className="text-yellow-400 text-2xl" />
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400">No hay alarma configurada</p>
                )}
              </div>

              {boleto.estado === 'abierto' && (
                <form onSubmit={handleSetAlarma} className="space-y-4">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <FaBell />
                    Configurar Alarma
                  </h3>
                  
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
              )}

              {boleto.estado !== 'abierto' && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-yellow-300 text-sm">
                    Solo se pueden configurar alarmas en boletos con estado "abierto"
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'comentarios' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Comentarios</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {comentarios.length > 0 ? (
                    [...comentarios]
                      .sort((a, b) => {
                        // Ordenar del más nuevo al más antiguo
                        const fechaA = new Date(a.timestamp || a.createdAt || 0);
                        const fechaB = new Date(b.timestamp || b.createdAt || 0);
                        return fechaB - fechaA; // Orden descendente (más nuevo primero)
                      })
                      .map((comentario, index) => (
                      <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FaUser className="text-primary text-sm" />
                            <span className="font-medium text-white">{comentario.usuario}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <FaClock />
                            <span>{formatTimestamp(comentario.timestamp)}</span>
                          </div>
                        </div>
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{comentario.comentario}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400 text-center py-8">No hay comentarios aún</p>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmitComentario} className="space-y-4 border-t border-gray-700 pt-6">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <FaPlus />
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
                    placeholder="Escribe tu comentario..."
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
              {boleto.logs && boleto.logs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {[...boleto.logs]
                    .sort((a, b) => {
                      // Ordenar del más nuevo al más antiguo
                      const fechaA = new Date(a.timestamp || a.createdAt || 0);
                      const fechaB = new Date(b.timestamp || b.createdAt || 0);
                      return fechaB - fechaA; // Orden descendente (más nuevo primero)
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
                              <span className="text-gray-400 text-sm">Estado Oportunidad:</span>
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

export default BoletoModal;
