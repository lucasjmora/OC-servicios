import React from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAsistencia, getMappings, getUniqueValues } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import { safeFormatDate, safeFormatTime } from '../utils/dateUtils';
import { FaSearch, FaEye, FaComment, FaBell } from 'react-icons/fa';
import AsistenciaModal from '../components/AsistenciaModal';

const Asistencia = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCita, setSelectedCita] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [talleresMapping, setTalleresMapping] = useState({});
  const [talleresList, setTalleresList] = useState([]);
  const [talleresAgrupados, setTalleresAgrupados] = useState([]); // Talleres agrupados por nombre
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25, // Fijo en 25 citas por página
    total: 0,
    totalPages: 0
  });
  
  // Calcular fechas por defecto: últimos 7 días hasta ayer
  const getDefaultDates = () => {
    const fechaActual = new Date();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1); // Día previo al actual
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7); // 7 días atrás
    
    return {
      fechaDesde: hace7Dias.toISOString().split('T')[0], // Formato YYYY-MM-DD
      fechaHasta: ayer.toISOString().split('T')[0] // Día previo al actual
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

  // Leer parámetros de la URL al montar el componente (después de cargar talleres)
  useEffect(() => {
    if (talleresAgrupados.length === 0) return; // Esperar a que se carguen los talleres
    
    const fechaDesde = searchParams.get('fechaDesde');
    const fechaHasta = searchParams.get('fechaHasta');
    const estadoAsistencia = searchParams.get('estadoAsistencia');
    const tallerParam = searchParams.get('taller');
    
    // Convertir nombre de taller a códigos numéricos si es necesario
    let tallerCodigos = '';
    if (tallerParam) {
      // Buscar en talleresAgrupados el que coincida con el nombre
      const tallerEncontrado = talleresAgrupados.find(t => t.nombre === tallerParam);
      if (tallerEncontrado) {
        tallerCodigos = tallerEncontrado.codigos.join(',');
      } else {
        // Si no se encuentra, asumir que ya es un código numérico
        tallerCodigos = tallerParam;
      }
    }
    
    if (fechaDesde || fechaHasta || estadoAsistencia || tallerCodigos) {
      setFilters(prev => ({
        ...prev,
        ...(fechaDesde && { fechaDesde }),
        ...(fechaHasta && { fechaHasta }),
        ...(estadoAsistencia && { estadoAsistencia }),
        ...(tallerCodigos && { taller: tallerCodigos })
      }));
    }
  }, [searchParams, talleresAgrupados]);

  useEffect(() => {
    loadAsistencia();
  }, [pagination.page, filters.fechaDesde, filters.fechaHasta, filters.taller, filters.nombre, filters.matricula, filters.estadoAsistencia, filters.search]);

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
      
      const mappings = mappingsRes.data || {};
      setTalleresMapping(mappings);
      
      // Combinar códigos únicos de talleres
      const allCodigos = new Set([
        ...citasRes.data,
        ...ingresosRes.data
      ]);
      
      setTalleresList(Array.from(allCodigos).sort());
      
      // Agrupar talleres por nombre mapeado
      const agrupadosPorNombre = {};
      Array.from(allCodigos).forEach(codigo => {
        const nombre = mappings[codigo] || `Taller ${codigo}`;
        if (!agrupadosPorNombre[nombre]) {
          agrupadosPorNombre[nombre] = [];
        }
        agrupadosPorNombre[nombre].push(codigo);
      });
      
      // Convertir a array y ordenar por nombre
      const talleresAgrupadosArray = Object.entries(agrupadosPorNombre)
        .map(([nombre, codigos]) => ({
          nombre,
          codigos: codigos.sort((a, b) => a - b) // Ordenar códigos numéricamente
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)); // Ordenar por nombre
      
      setTalleresAgrupados(talleresAgrupadosArray);
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
      
      // Log temporal para debugging
      const datosDebug = {
        total: response.data.pagination?.total,
        citasEnPagina: response.data.data?.length,
        primeraCita: response.data.data?.[0] ? {
          referencia: response.data.data[0].Referencia,
          tieneAsistencia: response.data.data[0].tieneAsistencia,
          tipoTieneAsistencia: typeof response.data.data[0].tieneAsistencia,
          estado: response.data.data[0].estado,
          subEstado: response.data.data[0].subEstado
        } : null,
        todasTienenCampo: response.data.data?.every(c => 'tieneAsistencia' in c),
        conAsistencia: response.data.data?.filter(c => c.tieneAsistencia === true).length,
        sinAsistencia: response.data.data?.filter(c => c.tieneAsistencia === false).length
      };
      console.log('📊 Datos recibidos de la API:', JSON.stringify(datosDebug, null, 2));
      console.log('📊 Primera cita completa:', response.data.data?.[0]);
      
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

  const handleViewCita = (cita) => {
    setSelectedCita(cita.Referencia);
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
      header: 'Estado Cita',
      key: 'estado',
      render: (estado, row) => {
        return getEstadoBadge(row.estado || 'abierto', row.subEstado);
      }
    },
    {
      header: 'Acciones',
      key: 'acciones',
      render: (value, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleViewCita(row)}
            className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            title="Gestionar cita"
          >
            <FaEye />
          </button>
          
          <div className="flex items-center gap-1">
            <FaComment className="text-gray-400" />
            <span className="text-gray-400 text-sm">{row.totalComentarios || 0}</span>
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
            {talleresAgrupados.map(({ nombre, codigos }) => (
              <option key={nombre} value={codigos.join(',')}>
                {nombre}{codigos.length > 1 ? ` (${codigos.join(', ')})` : ''}
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

      {/* Modal de gestión de cita */}
      {showModal && selectedCita && (
        <AsistenciaModal
          referencia={selectedCita}
          onClose={handleCloseModal}
          onUpdate={() => {
            loadAsistencia();
          }}
        />
      )}
    </div>
  );
};

export default Asistencia;
