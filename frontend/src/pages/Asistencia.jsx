import React from 'react';
import { useEffect, useState } from 'react';
import { getAsistencia, getMappings, getUniqueValues } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import { safeFormatDate, safeFormatTime } from '../utils/dateUtils';
import { FaSearch, FaEye, FaComment } from 'react-icons/fa';
import ComentariosModal from '../components/ComentariosModal';

const Asistencia = () => {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCita, setSelectedCita] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [talleresMapping, setTalleresMapping] = useState({});
  const [talleresList, setTalleresList] = useState([]);
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  // Calcular fechas por defecto: último mes
  const getDefaultDates = () => {
    const fechaActual = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    
    return {
      fechaDesde: haceUnMes.toISOString().split('T')[0], // Formato YYYY-MM-DD
      fechaHasta: fechaActual.toISOString().split('T')[0]
    };
  };
  
  const [filters, setFilters] = useState({
    search: '',
    ...getDefaultDates(), // Inicializar con fechas por defecto
    taller: '',
    nombre: '',
    matricula: '',
    estadoAsistencia: 'todos' // 'todos', 'asistio', 'noAsistio'
  });

  useEffect(() => {
    loadAsistencia();
  }, [pagination.page, pagination.limit, filters.fechaDesde, filters.fechaHasta, filters.taller, filters.nombre, filters.matricula, filters.estadoAsistencia, filters.search]);

  useEffect(() => {
    loadTalleresMapping();
  }, []);

  const loadTalleresMapping = async () => {
    try {
      const [mappingsRes, citasRes, ingresosRes] = await Promise.all([
        getMappings('talleres'),
        getUniqueValues('citas', 'Taller'),
        getUniqueValues('ingresos', 'Taller')
      ]);
      
      setTalleresMapping(mappingsRes.data || {});
      
      // Combinar códigos únicos de talleres
      const allCodigos = new Set([
        ...citasRes.data,
        ...ingresosRes.data
      ]);
      
      setTalleresList(Array.from(allCodigos).sort());
    } catch (error) {
      console.error('Error cargando mapeos de talleres:', error);
    }
  };

  const loadAsistencia = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      const response = await getAsistencia(params);
      
      setCitas(response.data.data);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
    } catch (error) {
      console.error('Error cargando asistencia:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset a página 1
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      ...getDefaultDates(), // Restablecer fechas por defecto
      taller: '',
      nombre: '',
      matricula: '',
      estadoAsistencia: 'todos'
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleViewComentarios = (cita) => {
    setSelectedCita(cita);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedCita(null);
    // Recargar la lista para actualizar conteos
    loadAsistencia();
  };

  const getTallerNombre = (codigo) => {
    return talleresMapping[codigo] || `Taller ${codigo}`;
  };

  // Definir columnas específicas para asistencia
  const columns = [
    {
      header: 'Referencia',
      key: 'Referencia',
      render: (value) => (
        <span className="font-semibold text-primary">{value}</span>
      )
    },
    {
      header: 'Fecha Creación',
      key: 'Fecha cr',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'Fecha Cita',
      key: 'Fecha ci',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'Hora Cita',
      key: 'Hora ',
      render: (value) => safeFormatTime(value)
    },
    {
      header: 'Nombre',
      key: 'Nombre',
    },
    {
      header: 'Teléfono',
      key: 'Telefono',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Matrícula',
      key: 'Matricula',
      render: (value) => (
        <span className="font-mono text-sm bg-gray-800 px-2 py-1 rounded">
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Marca/Modelo',
      key: 'Marca/modelo',
    },
    {
      header: 'Avería',
      key: 'Averia',
      render: (value) => (
        <span className="text-sm text-gray-400 max-w-[120px] truncate inline-block" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Taller',
      key: 'Taller',
      render: (value) => (
        <span className="text-sm font-medium">{getTallerNombre(value)}</span>
      )
    },
    {
      header: 'Estado',
      key: 'tieneAsistencia',
      render: (value, row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          row.tieneAsistencia 
            ? 'bg-green-900/30 text-green-300 border border-green-500/30' 
            : 'bg-red-900/30 text-red-300 border border-red-500/30'
        }`}>
          {row.tieneAsistencia ? '✅ Asistió' : '❌ No asistió'}
        </span>
      )
    },
    {
      header: 'Acciones',
      key: 'acciones',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {/* Botón de comentarios con conteo */}
          <button
            onClick={() => handleViewComentarios(row)}
            className="flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
            title="Ver comentarios"
          >
            <FaComment className="text-sm" />
            <span className="text-sm">
              {row.totalComentarios > 0 ? row.totalComentarios : '0'}
            </span>
          </button>
          
          {/* Botón de vista */}
          <button
            onClick={() => handleViewComentarios(row)}
            className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 text-gray-300 rounded hover:bg-gray-600/50 transition-colors"
            title="Ver detalles"
          >
            <FaEye className="text-xs" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8">
      <PageHeader 
        title="Asistencia" 
        subtitle={`${pagination.total} citas totales`}
      />

      <Filters onClear={handleClearFilters}>
        <Filters.Item label="Búsqueda">
          <div className="relative">
            <input
              type="text"
              placeholder="Referencia, cliente, matrícula..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-10"
            />
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </Filters.Item>

        <Filters.Item label="Fecha desde">
          <input
            type="date"
            value={filters.fechaDesde}
            onChange={(e) => handleFilterChange('fechaDesde', e.target.value)}
            className="w-full"
          />
        </Filters.Item>

        <Filters.Item label="Fecha hasta">
          <input
            type="date"
            value={filters.fechaHasta}
            onChange={(e) => handleFilterChange('fechaHasta', e.target.value)}
            className="w-full"
          />
        </Filters.Item>

        <Filters.Item label="Taller">
          <select
            value={filters.taller}
            onChange={(e) => handleFilterChange('taller', e.target.value)}
            className="w-full"
          >
            <option value="">Todos los talleres</option>
            {talleresList.map(codigo => (
              <option key={codigo} value={codigo}>
                {getTallerNombre(codigo)}
              </option>
            ))}
          </select>
        </Filters.Item>

        <Filters.Item label="Nombre">
          <input
            type="text"
            placeholder="Nombre del cliente..."
            value={filters.nombre}
            onChange={(e) => handleFilterChange('nombre', e.target.value)}
            className="w-full"
          />
        </Filters.Item>

        <Filters.Item label="Patente">
          <input
            type="text"
            placeholder="Matrícula del vehículo..."
            value={filters.matricula}
            onChange={(e) => handleFilterChange('matricula', e.target.value)}
            className="w-full"
          />
        </Filters.Item>

        <Filters.Item label="Estado">
          <select
            value={filters.estadoAsistencia}
            onChange={(e) => handleFilterChange('estadoAsistencia', e.target.value)}
            className="w-full"
          >
            <option value="todos">Todos</option>
            <option value="asistio">Asistió</option>
            <option value="noAsistio">No asistió</option>
          </select>
        </Filters.Item>

        <Filters.Item label="Por página">
          <select
            value={pagination.limit}
            onChange={(e) => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
            className="w-full"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </Filters.Item>
      </Filters>


      {/* Indicador de scroll horizontal */}
      <div className="mb-2 text-sm text-gray-400 flex items-center gap-2">
        <span>📱</span>
        <span>Desliza horizontalmente para ver todos los campos</span>
      </div>

      <Table columns={columns} data={citas} loading={loading} />

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
      />

      {/* Modal de comentarios */}
      {showModal && selectedCita && (
        <ComentariosModal
          cita={selectedCita}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default Asistencia;
