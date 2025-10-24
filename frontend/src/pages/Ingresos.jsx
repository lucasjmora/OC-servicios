import { useEffect, useState } from 'react';
import { getIngresos } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import Badge from '../components/Badge';
import { safeFormatDate } from '../utils/dateUtils';
import { FaSearch } from 'react-icons/fa';
import { useFieldMappings } from '../hooks/useFieldMappings';

const Ingresos = () => {
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { mapColumns } = useFieldMappings();
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  const [filters, setFilters] = useState({
    search: '',
    taller: '',
    estado: '',
    tipo: '',
    fechaDesde: '',
    fechaHasta: ''
  });

  useEffect(() => {
    loadIngresos();
  }, [pagination.page, filters]);

  const loadIngresos = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      const response = await getIngresos(params);
      
      setIngresos(response.data.data);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
    } catch (error) {
      console.error('Error cargando ingresos:', error);
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
      estado: '',
      tipo: '',
      fechaDesde: '',
      fechaHasta: ''
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

  // Definir columnas con nombres originales de la base de datos
  const baseColumns = [
    {
      header: 'Referencia',
      key: 'Referencia',
      render: (value) => (
        <span className="font-semibold text-primary">{value}</span>
      )
    },
    {
      header: 'Fecaper',
      key: 'Fecaper',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'F cierr',
      key: 'F cierr',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'CLIENTE',
      key: 'CLIENTE',
    },
    {
      header: 'Teléfono',
      key: 'Teléfono',
      render: (value, row) => (
        <span className="font-mono text-sm">{value || row.Telefono || '-'}</span>
      )
    },
    {
      header: 'E-mail',
      key: 'E-mail',
      render: (value) => (
        <span className="text-sm text-blue-400">{value || '-'}</span>
      )
    },
    {
      header: 'Matrícula vehí',
      key: 'Matrícula vehí',
      render: (value) => (
        <span className="font-mono text-sm bg-gray-800 px-2 py-1 rounded">
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Bastidor',
      key: 'Bastidor',
      render: (value) => (
        <span className="font-mono text-xs text-gray-400">{value || '-'}</span>
      )
    },
    {
      header: 'Modelo',
      key: 'Modelo',
    },
    {
      header: 'Nombre taller',
      key: 'Nombre taller',
      render: (value, row) => value || row.Taller || '-'
    },
    {
      header: 'Estad',
      key: 'Estad',
      render: (value) => value ? <Badge status={value} /> : '-'
    },
    {
      header: 'Tipo O',
      key: 'Tipo O',
    },
    {
      header: 'Numero',
      key: 'Numero',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Serie/num',
      key: 'Serie/num',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Cta cargo',
      key: 'Cta cargo',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Recepcionista',
      key: 'Recepcionista',
    },
    {
      header: 'Usuario Cita',
      key: 'Usuario Cita',
    },
    {
      header: 'Desaveria',
      key: 'Desaveria',
      render: (value) => (
        <span className="text-sm text-gray-400 max-w-xs truncate" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'BASE',
      key: 'BASE',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Tiemfact',
      key: 'Tiemfact',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Mano obra',
      key: 'Mano obra',
      render: (value) => formatCurrency(value)
    },
    {
      header: 'Total material',
      key: 'Total material',
      render: (value) => formatCurrency(value)
    },
    {
      header: 'BENEFICIO',
      key: 'BENEFICIO',
      render: (value) => (
        <span className="font-semibold text-status-success">
          {formatCurrency(value)}
        </span>
      )
    },
    {
      header: 'BENEFICIOS REC',
      key: 'BENEFICIOS REC',
      render: (value) => formatCurrency(value)
    },
    {
      header: 'SUBARRENDADO',
      key: 'SUBARRENDADO',
      render: (value) => formatCurrency(value)
    },
    {
      header: 'BENEFSUB',
      key: 'BENEFSUB',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Km',
      key: 'Km',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Opera',
      key: 'Opera',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Nombre titular',
      key: 'Nombre titular',
    },
    {
      header: 'CON',
      key: 'CON',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Observaciones',
      key: 'Observaciones',
      render: (value) => (
        <span className="text-sm text-gray-400 max-w-xs truncate" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'OBSERVACIONES INTERNAS',
      key: 'OBSERVACIONES INTERNAS',
      render: (value) => (
        <span className="text-sm text-gray-400 max-w-xs truncate" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'FEC OBS ',
      key: 'FEC OBS ',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'HOR O',
      key: 'HOR O',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'IDP NOMBRE',
      key: 'IDP NOMBRE',
    }
  ];

  // Aplicar mapeo de campos a las columnas
  const columns = mapColumns(baseColumns);

  return (
    <div className="p-8">
      <PageHeader 
        title="Ingresos Taller" 
        subtitle={`${pagination.total} órdenes de reparación en total`}
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

      <Table columns={columns} data={ingresos} loading={loading} />

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
      />
    </div>
  );
};

export default Ingresos;


