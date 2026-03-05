import { useEffect, useState } from 'react';
import { getOportunidades, getConfigOportunidades, getMappings, getUniqueValues } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import Badge from '../components/Badge';
import OportunidadModal from '../components/OportunidadModal';
import { safeFormatDate } from '../utils/dateUtils';
import { FaSearch, FaLightbulb, FaCog, FaInfoCircle, FaComment, FaBell, FaEye, FaClock, FaExclamationTriangle, FaCheck } from 'react-icons/fa';
import { useFieldMappings } from '../hooks/useFieldMappings';
import { Link } from 'react-router-dom';

const Oportunidades = () => {
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [talleresMapping, setTalleresMapping] = useState({});
  const [talleresAgrupados, setTalleresAgrupados] = useState([]);
  const [parametros, setParametros] = useState({
    palabrasClave: '',
    mesesDesdeCierre: 3
  });
  const { mapColumns } = useFieldMappings();
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  // Calcular fechas por defecto: igual que en el dashboard
  // fechaLimite = hoy - mesesDesdeCierre
  // fechaDesde = fechaLimite - 7 días
  const getDefaultDates = (mesesDesdeCierre = 3) => {
    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() - mesesDesdeCierre);
    fechaLimite.setHours(23, 59, 59, 999);
    
    const fechaDesde = new Date(fechaLimite);
    fechaDesde.setDate(fechaDesde.getDate() - 7);
    fechaDesde.setHours(0, 0, 0, 0);
    
    // Función auxiliar para convertir fecha local a formato YYYY-MM-DD sin cambiar zona horaria
    const formatLocalDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    return {
      fechaDesde: formatLocalDate(fechaDesde), // Formato YYYY-MM-DD en hora local
      fechaHasta: formatLocalDate(fechaLimite) // Formato YYYY-MM-DD en hora local
    };
  };
  
  const [filters, setFilters] = useState({
    search: '',
    taller: '',
    fechaDesde: '',
    fechaHasta: '',
    estado: '',
    subEstado: ''
  });
  
  const [selectedOportunidad, setSelectedOportunidad] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadConfigOportunidades();
    loadTalleresMapping();
  }, []);

  const loadTalleresMapping = async () => {
    try {
      const [mappingsRes, ingresosRes] = await Promise.all([
        getMappings('talleres'),
        getUniqueValues('ingresos', 'Taller')
      ]);
      
      const mappings = mappingsRes.data || {};
      setTalleresMapping(mappings);
      
      // Combinar códigos únicos de talleres
      const allCodigos = new Set(ingresosRes.data);
      
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
          codigos: codigos.sort((a, b) => {
            const numA = Number(a);
            const numB = Number(b);
            if (!isNaN(numA) && !isNaN(numB)) {
              return numA - numB;
            }
            return String(a).localeCompare(String(b));
          })
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      
      setTalleresAgrupados(talleresAgrupadosArray);
    } catch (error) {
      console.error('Error cargando mapeos de talleres:', error);
    }
  };

  useEffect(() => {
    loadOportunidades();
  }, [pagination.page, filters]);

  const loadConfigOportunidades = async () => {
    try {
      const response = await getConfigOportunidades();
      const config = response.data;
      setParametros(config);
      
      // Establecer fechas por defecto basadas en la configuración
      const mesesDesdeCierre = config?.mesesDesdeCierre || 3;
      const fechasDefault = getDefaultDates(mesesDesdeCierre);
      
      // Solo establecer fechas por defecto si no hay fechas ya establecidas
      setFilters(prev => {
        if (!prev.fechaDesde && !prev.fechaHasta) {
          return {
            ...prev,
            ...fechasDefault
          };
        }
        return prev;
      });
    } catch (error) {
      console.error('Error cargando configuración de oportunidades:', error);
    }
  };

  const loadOportunidades = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      const response = await getOportunidades(params);
      
      setOportunidades(response.data.data);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
      
      // Actualizar parámetros si vienen en la respuesta
      if (response.data.parametros) {
        setParametros(response.data.parametros);
      }
    } catch (error) {
      console.error('Error cargando oportunidades:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    // Al limpiar filtros, restaurar las fechas por defecto
    const mesesDesdeCierre = parametros?.mesesDesdeCierre || 3;
    const fechasDefault = getDefaultDates(mesesDesdeCierre);
    
    setFilters({
      search: '',
      taller: '',
      ...fechasDefault,
      estado: '',
      subEstado: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value);
  };

  const calcularMesesDesdeCierre = (fechaCierre) => {
    if (!fechaCierre) return '-';
    const fecha = new Date(fechaCierre);
    const hoy = new Date();
    const meses = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24 * 30));
    return `${meses} meses`;
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

  // Definir columnas específicas para Oportunidades (usando nombres originales para mapeos)
  const baseColumns = [
    {
      header: 'Referencia',
      key: 'Referencia',
      width: '110px',
      render: (value) => (
        <span className="font-semibold text-primary ml-2 text-base">{value}</span>
      )
    },
    {
      header: 'F cierr',
      key: 'F cierr',
      width: '90px',
      render: (value) => (
        <div className="text-base">
          <div>{safeFormatDate(value)}</div>
          <div className="text-gray-400 text-sm">{calcularMesesDesdeCierre(value)}</div>
        </div>
      )
    },
    {
      header: 'CLIENTE',
      key: 'CLIENTE',
      width: '130px',
      render: (value) => (
        <span className="text-base truncate block" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Teléfono',
      key: 'Teléfono',
      width: '100px',
      render: (value, row) => (
        <span className="font-mono text-base">{value || row.Telefono || '-'}</span>
      )
    },
    {
      header: 'E-mail',
      key: 'E-mail',
      width: '160px',
      render: (value) => (
        <span className="text-base text-blue-400 truncate block" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Matrícula vehí',
      key: 'Matrícula vehí',
      width: '110px',
      render: (value) => (
        <span className="font-mono text-base bg-gray-800 px-1 py-0.5 rounded">
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Modelo',
      key: 'Modelo',
      width: '100px',
      render: (value) => (
        <span className="text-base truncate block" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Desaveria',
      key: 'Desaveria',
      width: '180px',
      render: (value) => (
        <span className="text-base text-yellow-400 truncate block" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Taller',
      key: 'Taller',
      width: '130px',
      render: (value) => {
        const nombreTaller = talleresMapping[value] || (value ? `Taller ${value}` : '-');
        return (
          <span className="text-base truncate block" title={nombreTaller}>
            {nombreTaller}
          </span>
        );
      }
    },
    {
      header: 'ESTADO',
      key: 'estado',
      width: '180px',
      render: (estado, row) => {
        return getEstadoBadge(estado, row.subEstado);
      }
    },
    {
      header: 'ACCIONES',
      key: 'acciones',
      width: '140px',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedOportunidad(row.Referencia);
              setShowModal(true);
            }}
            className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            title="Gestionar oportunidad"
          >
            <FaEye />
          </button>
          
          <div className="flex items-center gap-1">
            <FaComment className="text-gray-400" />
            <span className="text-gray-400 text-sm">{row.comentariosCount || 0}</span>
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

  // Aplicar mapeo de campos a las columnas
  const columns = mapColumns(baseColumns);

  return (
    <div className="p-4 max-w-full overflow-hidden">
      <PageHeader 
        title="Oportunidades de Seguimiento" 
        subtitle={`${pagination.total} oportunidades detectadas`}
        icon={<FaLightbulb className="text-yellow-400" />}
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

        <Filters.Item label="Fecha cierre desde">
          <input
            type="date"
            value={filters.fechaDesde}
            onChange={(e) => handleFilterChange('fechaDesde', e.target.value)}
            className="w-full"
          />
        </Filters.Item>

        <Filters.Item label="Fecha cierre hasta">
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

        <Filters.Item label="Estado">
          <select
            value={filters.estado}
            onChange={(e) => handleFilterChange('estado', e.target.value)}
            className="w-full"
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
              className="w-full"
            >
              <option value="">Todos los subEstados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_espera">En espera</option>
            </select>
          </Filters.Item>
        )}

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

      <div className="w-full overflow-x-auto">
        <Table columns={columns} data={oportunidades} loading={loading} />
      </div>

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
      />

      {/* Modal de gestión de oportunidad */}
      {showModal && (
        <OportunidadModal
          referencia={selectedOportunidad}
          onClose={() => {
            setShowModal(false);
            setSelectedOportunidad(null);
          }}
          onUpdate={() => {
            loadOportunidades();
          }}
        />
      )}
    </div>
  );
};

export default Oportunidades;

