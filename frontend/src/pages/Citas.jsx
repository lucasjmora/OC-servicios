import { useEffect, useState } from 'react';
import { getCitas } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import { safeFormatDate, safeFormatTime } from '../utils/dateUtils';
import { FaSearch, FaPhone } from 'react-icons/fa';
import { useFieldMappings } from '../hooks/useFieldMappings';

const Citas = () => {
  const [citas, setCitas] = useState([]);
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
    asesor: '',
    usuario: '',
    fechaDesde: '',
    fechaHasta: '',
    telefono: ''
  });

  useEffect(() => {
    loadCitas();
  }, [pagination.page, filters]);

  const loadCitas = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      const response = await getCitas(params);
      
      setCitas(response.data.data);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
    } catch (error) {
      console.error('Error cargando citas:', error);
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
      taller: '',
      asesor: '',
      usuario: '',
      fechaDesde: '',
      fechaHasta: '',
      telefono: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
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
      header: 'Fecha cr',
      key: 'Fecha cr',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'Fecha ci',
      key: 'Fecha ci',
      render: (value) => safeFormatDate(value)
    },
    {
      header: 'Hora ',
      key: 'Hora ',
      render: (value) => safeFormatTime(value)
    },
    {
      header: 'Nombre',
      key: 'Nombre',
    },
    {
      header: 'Telefono',
      key: 'Telefono',
      render: (value) => (
        <span className="font-mono text-sm">{value || '-'}</span>
      )
    },
    {
      header: 'Matricula',
      key: 'Matricula',
      render: (value) => (
        <span className="font-mono text-sm bg-gray-800 px-2 py-1 rounded">
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Marca/modelo',
      key: 'Marca/modelo',
    },
    {
      header: 'Taller',
      key: 'Taller',
      render: (value, row) => row.TallerNombre || value || '-'
    },
    {
      header: 'Usuario',
      key: 'Usuario',
      render: (value, row) => row.UsuarioNombre || value || '-'
    },
    {
      header: 'Asesor',
      key: 'Asesor',
    },
    {
      header: 'Averia',
      key: 'Averia',
      render: (value) => (
        <span className="text-sm text-gray-400 max-w-xs truncate" title={value}>
          {value || '-'}
        </span>
      )
    },
    {
      header: 'Secci',
      key: 'Secci',
      render: (value) => (
        <span className="text-sm text-gray-400">{value || '-'}</span>
      )
    },
    {
      header: 'Tiempo',
      key: 'Tiempo',
      render: (value) => (
        <span className="text-sm text-gray-400">{value || '-'}</span>
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
    }
  ];

  // Aplicar mapeo de campos a las columnas
  const columns = mapColumns(baseColumns);

  return (
    <div className="p-8">
      <PageHeader 
        title="Citas" 
        subtitle={`${pagination.total} citas en total`}
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

        <Filters.Item label="Teléfono">
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="549… o parte del número"
              value={filters.telefono}
              onChange={(e) => handleFilterChange('telefono', e.target.value)}
              className="w-full pl-10 font-mono"
            />
            <FaPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          </div>
        </Filters.Item>
      </Filters>

      {/* Filtros adicionales en una segunda fila */}
      <div className="bg-background-card border border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FaSearch className="text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Filtros Adicionales</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Taller
            </label>
            <input
              type="text"
              placeholder="Código de taller..."
              value={filters.taller}
              onChange={(e) => handleFilterChange('taller', e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Asesor
            </label>
            <input
              type="text"
              placeholder="Nombre del asesor..."
              value={filters.asesor}
              onChange={(e) => handleFilterChange('asesor', e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Usuario
            </label>
            <input
              type="text"
              placeholder="Código de usuario..."
              value={filters.usuario}
              onChange={(e) => handleFilterChange('usuario', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default Citas;


