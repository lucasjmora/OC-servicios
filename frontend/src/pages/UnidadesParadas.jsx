import { useEffect, useState } from 'react';
import { getUnidadesParadas } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import UnidadParadaModal from '../components/UnidadParadaModal';
import NuevoUnidadParadaModal from '../components/NuevoUnidadParadaModal';
import { FaSearch, FaTruck, FaPlus, FaComment, FaExclamationTriangle, FaEye, FaBell } from 'react-icons/fa';

const UnidadesParadas = () => {
  const [unidadesParadas, setUnidadesParadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  const [filters, setFilters] = useState({
    search: '',
    taller: '',
    patente: '',
    cliente: '',
    referencia: '',
    estado: '',
    subEstado: ''
  });
  
  const [selectedUnidadParada, setSelectedUnidadParada] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadUnidadesParadas();
  }, [pagination.page, filters]);

  const loadUnidadesParadas = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      const response = await getUnidadesParadas(params);
      
      setUnidadesParadas(response.data.data);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
    } catch (error) {
      console.error('Error cargando unidades paradas:', error);
      setMessage({ type: 'error', text: 'Error al cargar las unidades paradas' });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      taller: '',
      patente: '',
      cliente: '',
      referencia: '',
      estado: '',
      subEstado: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleVerComentarios = (unidadParada) => {
    setSelectedUnidadParada(unidadParada);
    setShowModal(true);
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


  const handleNuevoCaso = () => {
    setShowNuevoModal(true);
  };

  const handleNuevoCasoSuccess = () => {
    setMessage({ type: 'success', text: 'Caso creado exitosamente' });
    loadUnidadesParadas();
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedUnidadParada(null);
  };

  const handleNuevoModalClose = () => {
    setShowNuevoModal(false);
  };

  const handleModalUpdate = () => {
    loadUnidadesParadas();
  };

  // Obtener talleres únicos para el filtro
  const talleresUnicos = [...new Set(unidadesParadas.map(up => up.ingreso?.['Nombre taller']).filter(Boolean))];

  const columns = [
    {
      key: 'ingresoReferencia',
      header: 'Referencia',
      render: (value) => (
        <span className="font-mono text-sm font-medium">{value}</span>
      )
    },
    {
      key: 'diasAbiertos',
      header: 'Días Abiertos',
      render: (value) => {
        const dias = Math.ceil(value || 0); // Asegurar que sea entero
        return (
          <span className="font-mono text-sm font-medium text-gray-300">
            {dias} días
          </span>
        );
      }
    },
    {
      key: 'cliente',
      header: 'Cliente',
      render: (_, row) => row.ingreso?.CLIENTE || '-'
    },
    {
      key: 'matricula',
      header: 'Matrícula',
      render: (_, row) => row.ingreso?.['Matrícula vehí'] || '-'
    },
    {
      key: 'modelo',
      header: 'Modelo',
      render: (_, row) => row.ingreso?.Modelo || '-'
    },
    {
      key: 'taller',
      header: 'Taller',
      render: (_, row) => row.ingreso?.['Nombre taller'] || '-'
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (estado, row) => {
        // Usar estadoReal si existe, sino usar estado
        const estadoFinal = row.estadoReal || estado || 'abierto';
        const subEstado = row.subEstado;
        return getEstadoBadge(estadoFinal, subEstado);
      }
    },
    {
      key: 'actions',
      header: 'ACCIONES',
      width: '140px',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleVerComentarios(row)}
            className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            title="Gestionar unidad parada"
          >
            <FaEye />
          </button>
          
          <div className="flex items-center gap-1">
            <FaComment className="text-gray-400" />
            <span className="text-gray-400 text-sm">{row.comentarios?.length || 0}</span>
          </div>
          
          {row.alarma?.activa && (
            <div className="p-2 bg-orange-600 text-white rounded-lg" title="Alarma activa">
              <FaBell />
            </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unidades Paradas"
        subtitle="Gestión de casos de vehículos en taller esperando reparación"
        icon={FaTruck}
      />

      {/* Mensajes */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <FaTruck className="text-green-600" />
          ) : (
            <FaExclamationTriangle className="text-red-600" />
          )}
          {message.text}
        </div>
      )}

      {/* Filtros */}
      <Filters onClear={handleClearFilters}>
        <Filters.Item label="Referencia OR">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por referencia..."
              value={filters.referencia}
              onChange={(e) => handleFilterChange('referencia', e.target.value)}
              className="w-full pl-10 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </Filters.Item>

        <Filters.Item label="Cliente">
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={filters.cliente}
            onChange={(e) => handleFilterChange('cliente', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </Filters.Item>

        <Filters.Item label="Patente">
          <input
            type="text"
            placeholder="Buscar por patente..."
            value={filters.patente}
            onChange={(e) => handleFilterChange('patente', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </Filters.Item>

        <Filters.Item label="Taller">
          <select
            value={filters.taller}
            onChange={(e) => handleFilterChange('taller', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">Todos los talleres</option>
            {talleresUnicos.map(taller => (
              <option key={taller} value={taller}>{taller}</option>
            ))}
          </select>
        </Filters.Item>

        <Filters.Item label="Estado">
          <select
            value={filters.estado}
            onChange={(e) => {
              handleFilterChange('estado', e.target.value);
              if (e.target.value !== 'abierto') {
                handleFilterChange('subEstado', '');
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">Todos los estados</option>
            <option value="cerrado">Cerrado</option>
            <option value="aceptado">Aceptado</option>
            <option value="abierto">Abierto</option>
          </select>
        </Filters.Item>
        
        {filters.estado === 'abierto' && (
          <Filters.Item label="SubEstado">
            <select
              value={filters.subEstado || ''}
              onChange={(e) => handleFilterChange('subEstado', e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Todos los subEstados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_espera">En espera</option>
            </select>
          </Filters.Item>
        )}

      </Filters>

      {/* Botón Nuevo Caso */}
      <div className="flex justify-end">
        <button
          onClick={handleNuevoCaso}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
        >
          <FaPlus />
          Nuevo Caso
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow">
        <Table
          data={unidadesParadas}
          columns={columns}
          loading={loading}
          emptyMessage="No hay unidades paradas registradas"
          emptyIcon={FaTruck}
        />
      </div>

      {/* Paginación */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={handlePageChange}
          totalItems={pagination.total}
          itemsPerPage={pagination.limit}
        />
      )}

      {/* Modales */}
      {showModal && selectedUnidadParada && (
        <UnidadParadaModal
          unidadParada={selectedUnidadParada}
          onClose={handleModalClose}
          onUpdate={handleModalUpdate}
        />
      )}

      {showNuevoModal && (
        <NuevoUnidadParadaModal
          onClose={handleNuevoModalClose}
          onSuccess={handleNuevoCasoSuccess}
        />
      )}
    </div>
  );
};

export default UnidadesParadas;
