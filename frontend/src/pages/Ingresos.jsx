import { useEffect, useState } from 'react';
import { getIngresos, getMappings, getUniqueValues, exportIngresosStream } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import Badge from '../components/Badge';
import { safeFormatDate } from '../utils/dateUtils';
import { FaSearch, FaFileExport } from 'react-icons/fa';
import { useFieldMappings } from '../hooks/useFieldMappings';

const Ingresos = ({ onlyEstadC = false }) => {
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { mapColumns } = useFieldMappings();
  const [talleresMapping, setTalleresMapping] = useState({});
  const [talleresList, setTalleresList] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState({
    search: '',
    taller: '',
    estado: onlyEstadC ? 'C' : '',
    tipo: '',
    fechaDesde: '',
    fechaHasta: ''
  });

  const [tipoList, setTipoList] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadIngresos();
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    loadTalleres();
    loadTipos();
  }, []);

  const loadTalleres = async () => {
    try {
      const [mappingsRes, talleresRes] = await Promise.all([
        getMappings('talleres'),
        getUniqueValues('ingresos', 'Taller')
      ]);

      setTalleresMapping(mappingsRes.data || {});
      setTalleresList((talleresRes.data || []).sort());
    } catch (error) {
      console.error('Error cargando talleres:', error);
    }
  };

  const loadTipos = async () => {
    try {
      const tiposRes = await getUniqueValues('ingresos', 'Tipo O');
      setTipoList((tiposRes.data || []).filter(Boolean).sort());
    } catch (error) {
      console.error('Error cargando tipos de orden:', error);
    }
  };

  const loadIngresos = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters,
        ...(onlyEstadC && { excludeTalleres: MKT_EXCLUDED_TALLERES.join(',') }),
        ...(onlyEstadC && { tipoOPrefix: '1,2' }),
        ...(onlyEstadC && { sortBy: 'F cierr' })
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
      estado: onlyEstadC ? 'C' : '',
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

  // Talleres excluidos en vista Mkt (no se muestran en datos ni en el filtro)
  const MKT_EXCLUDED_TALLERES = ['4', '18', '48', '5', '71'];

  // Columnas que no se muestran en la vista Mkt (submenú dB)
  const MKT_HIDDEN_COLUMN_KEYS = [
    'Estad', 'Fecaper', 'Numero', 'Serie/num', 'Cta cargo', 'Recepcionista', 'Usuario Cita',
    'BASE', 'Tiemfact', 'Mano obra', 'Total material', 'BENEFICIO', 'BENEFICIOS REC', 'SUBARRENDADO', 'BENEFSUB',
    'Observaciones', 'OBSERVACIONES INTERNAS', 'FEC OBS ', 'HOR O', 'IDP NOMBRE',
    'Opera', 'Bastidor', 'CLIENTE'
  ];

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
      header: 'FMatric',
      key: 'FMatric',
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

  // En vista Mkt ocultar columnas indicadas; aplicar mapeo de campos
  const columnsToMap = onlyEstadC
    ? baseColumns.filter((col) => !MKT_HIDDEN_COLUMN_KEYS.includes(col.key))
    : baseColumns;
  const columns = mapColumns(columnsToMap);

  const handleExportCSV = async () => {
    if (!onlyEstadC) return;
    setExporting(true);
    try {
      const params = {
        ...filters,
        excludeTalleres: MKT_EXCLUDED_TALLERES.join(','),
        tipoOPrefix: '1,2',
        sortBy: 'F cierr'
      };
      await exportIngresosStream(params);
    } catch (err) {
      console.error('Error exportando CSV:', err);
      alert('Error al exportar. Intente nuevamente o aplique filtros para reducir los datos.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8">
      <PageHeader 
        title={onlyEstadC ? 'Pasos por taller' : 'Ingresos Taller'} 
        subtitle={onlyEstadC ? `${pagination.total} órdenes cerradas` : `${pagination.total} órdenes de reparación en total`}
        action={onlyEstadC && (
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            <FaFileExport className="text-lg" />
            {exporting ? 'Exportando...' : 'Exportar a CSV'}
          </button>
        )}
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
            <option value="">Todos</option>
            {onlyEstadC
              ? (() => {
                  const filtrados = talleresList.filter((t) => !MKT_EXCLUDED_TALLERES.includes(String(t)));
                  const porNombre = {};
                  filtrados.forEach((codigo) => {
                    const nombre = talleresMapping[codigo] || `Taller ${codigo}`;
                    if (!porNombre[nombre]) porNombre[nombre] = [];
                    porNombre[nombre].push(codigo);
                  });
                  return Object.entries(porNombre)
                    .map(([nombre, codigos]) => ({ nombre, value: codigos.join(',') }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map(({ nombre, value }) => (
                      <option key={value} value={value}>
                        {nombre}
                      </option>
                    ));
                })()
              : talleresList.map((codigo) => (
                  <option key={codigo} value={codigo}>
                    {talleresMapping[codigo] || `Taller ${codigo}`}
                  </option>
                ))}
          </select>
        </Filters.Item>

        <Filters.Item label="Tipo de orden">
          <select
            value={filters.tipo}
            onChange={(e) => handleFilterChange('tipo', e.target.value)}
            className="w-full"
          >
            <option value="">Todos</option>
            {(onlyEstadC ? tipoList.filter((t) => t && (String(t).startsWith('1') || String(t).startsWith('2'))) : tipoList).map((codigo) => (
              <option key={codigo} value={codigo}>
                {codigo}
              </option>
            ))}
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


