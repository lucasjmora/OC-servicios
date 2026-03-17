import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBotConversations, searchBotConversations, exportBotConversations } from '../services/api';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import BotConversacionModal from '../components/BotConversacionModal';
import { FaRobot, FaSearch, FaArrowLeft, FaCalendar, FaEnvelope, FaEye, FaCheck, FaExclamationTriangle, FaTimes, FaFileExport } from 'react-icons/fa';

// Lista fija de localidades por empresa (coincide con botAnalyzerService.js).
// Se usa para el filtro para que TODAS las localidades estén disponibles, independientemente de la paginación.
const LOCALIDADES_POR_EMPRESA = {
  FC: ['Junín', 'Pergamino', 'Trenque Lauquen', '9 de Julio', 'Chivilcoy', 'San Nicolás', 'Olavarría', 'Coronel Suárez'],
  GV: ['Junín', 'Pergamino', 'San Nicolás', 'Comodoro Rivadavia', 'Trelew', 'Puerto Madryn'],
  PW: ['General Pico', 'Santa Rosa']
};

const BotAnalyzer = () => {
  const { empresa } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchSessionId, setSearchSessionId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filtroHerramientas, setFiltroHerramientas] = useState(null); // null, 'sin', 'con', 'con_agendar'
  const [filtroLocalidad, setFiltroLocalidad] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [localidadesUnicas, setLocalidadesUnicas] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const empresaNames = {
    'fc': 'Fortecar',
    'gv': 'Granville',
    'pw': 'Pampawagen'
  };

  const empresaName = empresaNames[empresa?.toLowerCase()] || empresa?.toUpperCase();

  // Si no hay empresa, mostrar mensaje de error
  if (!empresa) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FaRobot className="text-6xl text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Error: Empresa no especificada</p>
          <p className="text-gray-500 text-sm mt-2">
            Por favor, selecciona una empresa desde el menú
          </p>
        </div>
      </div>
    );
  }

  // Actualizar límite y localidades cuando cambie la empresa
  useEffect(() => {
    if (empresa) {
      setPagination(prev => ({
        ...prev,
        limit: 50,
        page: 1
      }));
      // Inicializar localidades con la lista fija para que el filtro esté listo de inmediato
      const baseLocalidades = LOCALIDADES_POR_EMPRESA[empresa?.toUpperCase()] || [];
      setLocalidadesUnicas([...baseLocalidades].sort());
    }
  }, [empresa]);

  useEffect(() => {
    if (empresa) {
      loadConversations();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, pagination.page, pagination.limit, filtroHerramientas, filtroLocalidad, fechaDesde, fechaHasta]);

  const loadConversations = async () => {
    if (!empresa) {
      setLoading(false);
      return;
    }

    // Si hay búsquedas activas (sessionId o keyword), usar la lógica de búsqueda para mantener los filtros
    // Esto asegura que al cambiar de página, los filtros de búsqueda se mantengan
    if (searchSessionId.trim() || searchKeyword.trim()) {
      await handleSearchWithFilters();
      return;
    }

    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };

      if (filtroHerramientas) {
        params.filtroHerramientas = filtroHerramientas;
      }

      if (filtroLocalidad) {
        params.localidad = filtroLocalidad;
      }

      if (fechaDesde) {
        params.fechaDesde = fechaDesde;
      }
      if (fechaHasta) {
        params.fechaHasta = fechaHasta;
      }

      const response = await getBotConversations(empresa.toUpperCase(), params);
      
      if (response.data.success) {
        const conversationsData = response.data.data.conversations || [];
        setConversations(conversationsData);
        
        // Usar lista fija de localidades por empresa y fusionar con las que aparecen en los datos
        // (para que siempre estén todas, incluyendo Coronel Suárez, sin depender de la paginación)
        const baseLocalidades = LOCALIDADES_POR_EMPRESA[empresa?.toUpperCase()] || [];
        const localidadesEnDatos = [...new Set(conversationsData
          .map(conv => conv.localidad)
          .filter(loc => loc && loc.trim() !== '')
        )];
        const localidades = [...new Set([...baseLocalidades, ...localidadesEnDatos])].sort();
        setLocalidadesUnicas(localidades);
        
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
          totalPages: response.data.data.totalPages || 0
        }));
      }
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
      setConversations([]);
      setPagination(prev => ({
        ...prev,
        total: 0,
        totalPages: 0
      }));
    } finally {
      setLoading(false);
    }
  };

  // Función auxiliar para realizar búsqueda con filtros (usada tanto por handleSearch como por useEffect)
  const handleSearchWithFilters = async () => {
    if (!empresa) {
      console.error('Empresa no definida');
      return;
    }

    // Si no hay búsqueda por sessionId ni por palabra clave, cargar todas las conversaciones
    if (!searchSessionId.trim() && !searchKeyword.trim()) {
      loadConversations();
      return;
    }

    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (filtroHerramientas) {
        params.filtroHerramientas = filtroHerramientas;
      }
      if (filtroLocalidad) {
        params.localidad = filtroLocalidad;
      }
      if (fechaDesde) {
        params.fechaDesde = fechaDesde;
      }
      if (fechaHasta) {
        params.fechaHasta = fechaHasta;
      }
      
      // Si hay búsqueda por sessionId, usar el endpoint de búsqueda específico
      if (searchSessionId.trim()) {
        const response = await searchBotConversations(empresa.toUpperCase(), searchSessionId, params);
        
        if (response.data.success) {
          setConversations(response.data.data.conversations || []);
          setPagination(prev => ({
            ...prev,
            total: response.data.data.total || 0,
            totalPages: response.data.data.totalPages || 0
            // No resetear page aquí, mantener la página actual
          }));
        }
      } else if (searchKeyword.trim()) {
        // Si hay búsqueda por palabra clave, usar el endpoint de conversaciones con parámetro keyword
        params.keyword = searchKeyword.trim();
        const response = await getBotConversations(empresa.toUpperCase(), params);
        
        if (response.data.success) {
          setConversations(response.data.data.conversations || []);
          setPagination(prev => ({
            ...prev,
            total: response.data.data.total || 0,
            totalPages: response.data.data.totalPages || 0
            // No resetear page aquí, mantener la página actual
          }));
        }
      }
    } catch (error) {
      console.error('Error buscando conversaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    // Resetear a página 1 cuando el usuario hace una nueva búsqueda
    setPagination(prev => ({ ...prev, page: 1 }));
    // Ejecutar la búsqueda inmediatamente
    // El useEffect también se disparará cuando cambie pagination.page, pero como ya estamos en página 1,
    // necesitamos ejecutar la búsqueda ahora mismo
    await handleSearchWithFilters();
  };

  const handleClearFilters = () => {
    setSearchSessionId('');
    setSearchKeyword('');
    setFiltroHerramientas(null);
    setFiltroLocalidad('');
    setFechaDesde('');
    setFechaHasta('');
    setPagination(prev => ({ ...prev, page: 1 }));
    // El useEffect recargará al cambiar los filtros
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleKeywordKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
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

  const handleConversationClick = (sessionId) => {
    navigate(`/bot-analyzer/${empresa}/conversation/${sessionId}`);
  };

  const handleViewConversation = (e, conv) => {
    e.stopPropagation(); // Evitar que se active el onClick de la fila
    const esElegible = !conv.herramientasUtilizadas?.tieneAgendarTurno;
    if (esElegible) {
      setSelectedConversation(conv);
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedConversation(null);
    loadConversations(); // Recargar para actualizar estados
  };

  const handleExportCSV = async () => {
    if (!empresa || exportLoading) return;
    try {
      setExportLoading(true);
      const params = { includeMessages: '1' };
      if (filtroHerramientas) params.filtroHerramientas = filtroHerramientas;
      if (filtroLocalidad) params.localidad = filtroLocalidad;
      if (fechaDesde) params.fechaDesde = fechaDesde;
      if (fechaHasta) params.fechaHasta = fechaHasta;
      if (searchKeyword.trim()) params.keyword = searchKeyword.trim();
      if (searchSessionId.trim()) params.sessionId = searchSessionId.trim();

      const response = await exportBotConversations(empresa.toUpperCase(), params);
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers['content-disposition'];
      const filenameMatch = disposition && disposition.match(/filename="?([^";\n]+)"?/);
      link.download = filenameMatch ? filenameMatch[1] : `conversaciones_${empresa}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exportando a CSV:', error);
      alert('Error al exportar. Verifica que hay conversaciones y vuelve a intentar.');
    } finally {
      setExportLoading(false);
    }
  };

  const getEstadoBadge = (estado) => {
    if (estado === 'tratado') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#86efac', color: '#166534' }}>
          <FaCheck />
          Tratado
        </span>
      );
    }
    
    if (estado === 'no_tratado') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#fef08a', color: '#854d0e' }}>
          <FaExclamationTriangle />
          No tratado
        </span>
      );
    }
    
    return <span className="text-gray-500 text-xs">-</span>;
  };

  return (
    <div className="p-8">
      <PageHeader 
        title={`BOT Analyzer - ${empresaName}`}
        subtitle={`Conversaciones del bot Martina - ${empresaName}`}
        icon={FaRobot}
      />

      {/* Barra de búsqueda */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por sessionId..."
                value={searchSessionId}
                onChange={(e) => setSearchSessionId(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-4 py-2 bg-background border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por palabra clave (ej: Frenos)..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyPress={handleKeywordKeyPress}
                className="w-full pl-10 pr-4 py-2 bg-background border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="min-w-[250px]">
            <select
              value={filtroHerramientas || ''}
              onChange={(e) => {
                const value = e.target.value === '' ? null : e.target.value;
                setFiltroHerramientas(value);
                // Resetear a página 1 cuando cambia el filtro
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-4 py-2 bg-background border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas las conversaciones</option>
              <option value="sin">Sin agendar_turno_v2 ni enviarCorreo</option>
              <option value="con">Con agendar_turno_v2 o enviarCorreo</option>
              <option value="con_agendar">Con agendar_turno_v2</option>
            </select>
          </div>
          <div className="min-w-[200px]">
            <select
              value={filtroLocalidad}
              onChange={(e) => {
                setFiltroLocalidad(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-4 py-2 bg-background border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas las localidades</option>
              {localidadesUnicas.map(localidad => (
                <option key={localidad} value={localidad}>{localidad}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-1">Fecha desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-4 py-2 bg-background border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs text-gray-400 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-4 py-2 bg-background border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold"
          >
            Buscar
          </button>
          {(searchSessionId || searchKeyword || filtroHerramientas || filtroLocalidad || fechaDesde || fechaHasta) && (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Limpiar
            </button>
          )}
          <button
            onClick={handleExportCSV}
            disabled={exportLoading || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            title="Exportar conversaciones en formato CSV"
          >
            <FaFileExport />
            {exportLoading ? 'Exportando...' : 'Exportar a CSV'}
          </button>
        </div>
      </div>

      {/* Listado de conversaciones */}
      <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-400">Cargando conversaciones...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12">
            <FaRobot className="text-6xl text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No se encontraron conversaciones</p>
            {(searchSessionId || searchKeyword) && (
              <p className="text-gray-500 text-sm mt-2">
                {searchSessionId && `No hay resultados para sessionId: ${searchSessionId}`}
                {searchSessionId && searchKeyword && ' o '}
                {searchKeyword && `No hay resultados para palabra clave: ${searchKeyword}`}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Session ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Primer Mensaje
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Último Mensaje
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Mensajes
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Herramientas
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Venta
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Localidad
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {conversations.map((conv) => (
                    <tr
                      key={conv.sessionId}
                      onClick={() => handleConversationClick(conv.sessionId)}
                      className="hover:bg-gray-800 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-primary font-mono text-sm">{conv.sessionId}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatDate(conv.firstMessageDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatDate(conv.lastMessageDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                          {conv.messageCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          {conv.herramientasUtilizadas?.tieneAgendarTurno ? (
                            <FaCalendar 
                              className="text-blue-400 text-lg cursor-help" 
                              title="agendar_turno_v2"
                            />
                          ) : null}
                          {conv.herramientasUtilizadas?.tieneEnviarCorreo ? (
                            <FaEnvelope 
                              className="text-green-400 text-lg cursor-help" 
                              title="enviarCorreo"
                            />
                          ) : null}
                          {(!conv.herramientasUtilizadas?.tieneAgendarTurno && 
                            !conv.herramientasUtilizadas?.tieneEnviarCorreo) ? (
                            <span className="text-gray-500 text-xs">-</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          {conv.herramientasUtilizadas?.tieneAgendarTurno ? (
                            conv.herramientasUtilizadas?.tieneVenta ? (
                              <FaCheck className="text-green-400 text-lg cursor-help" title="Venta ejecutada" />
                            ) : (
                              <FaTimes className="text-red-400 text-lg cursor-help" title="Sin venta" />
                            )
                          ) : (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {conv.localidad || <span className="text-gray-500">-</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(() => {
                          const esElegible = !conv.herramientasUtilizadas?.tieneAgendarTurno;
                          if (esElegible) {
                            return getEstadoBadge(conv.estado);
                          }
                          return <span className="text-gray-500 text-xs">-</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {(() => {
                          const esElegible = !conv.herramientasUtilizadas?.tieneAgendarTurno;
                          if (esElegible) {
                            return (
                              <button
                                onClick={(e) => handleViewConversation(e, conv)}
                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                title="Ver detalles"
                              >
                                <FaEye className="text-primary text-lg" />
                              </button>
                            );
                          }
                          return <span className="text-gray-500 text-xs">-</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-700">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.total}
                  onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de gestión de conversación */}
      {showModal && selectedConversation && (
        <BotConversacionModal
          empresa={empresa}
          sessionId={selectedConversation.sessionId}
          herramientasUtilizadas={selectedConversation.herramientasUtilizadas}
          onClose={handleCloseModal}
          onUpdate={loadConversations}
        />
      )}
    </div>
  );
};

export default BotAnalyzer;






