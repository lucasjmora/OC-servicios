import { useEffect, useState } from 'react';
import { getBoletos, sincronizarBoletos, testBoletosConnection, getCiudadesBoletos, getMarcasBoletos, getEstadosBoleto, getConfigAccesorios } from '../services/api';
import PageHeader from '../components/PageHeader';
import Filters from '../components/Filters';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import BoletoModal from '../components/BoletoModal';
import { safeFormatDate } from '../utils/dateUtils';
import { FaSearch, FaEye, FaSync, FaCheckCircle, FaExclamationTriangle, FaClock, FaCheck, FaChevronDown, FaChevronUp, FaComment, FaBell } from 'react-icons/fa';

const Accesorios = () => {
  const [boletos, setBoletos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  const [filters, setFilters] = useState({
    search: '',
    estado: '',
    subEstado: '',
    tipoVenta: ['VN', 'ADJ'],
    ciudad: [],
    suc: [],
    marca: [],
    estadoBoleto: ['Facturado', 'Aprobado'],
    fechaDesde: '',
    fechaHasta: ''
  });
  
  const [selectedBoleto, setSelectedBoleto] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [tipoVentaDropdownOpen, setTipoVentaDropdownOpen] = useState(false);
  const [ciudadDropdownOpen, setCiudadDropdownOpen] = useState(false);
  const [sucDropdownOpen, setSucDropdownOpen] = useState(false);
  const [marcaDropdownOpen, setMarcaDropdownOpen] = useState(false);
  const [estadoBoletoDropdownOpen, setEstadoBoletoDropdownOpen] = useState(false);
  const [ciudadesDisponibles, setCiudadesDisponibles] = useState([]);
  const [marcasDisponibles, setMarcasDisponibles] = useState([]);
  const [estadosBoletoDisponibles, setEstadosBoletoDisponibles] = useState([]);
  const [ciudadMarcaEmpresa, setCiudadMarcaEmpresa] = useState({});

  const sucsDisponibles = Object.values(ciudadMarcaEmpresa || {})
    .filter(v => v && String(v).trim())
    .map(v => String(v).trim());
  const sucsUnicos = [...new Set(sucsDisponibles)].sort();

  useEffect(() => {
    loadBoletos();
  }, [pagination.page, filters]);

  useEffect(() => {
    loadCiudades();
    loadMarcas();
    loadEstadosBoleto();
    loadConfigAccesorios();
  }, []);

  const loadConfigAccesorios = async () => {
    try {
      const response = await getConfigAccesorios();
      const data = response.data?.data || response.data || {};
      setCiudadMarcaEmpresa(data.ciudadMarcaEmpresa || {});
    } catch (error) {
      console.error('Error cargando configuración accesorios:', error);
    }
  };

  useEffect(() => {
    if (boletos.length > 0 && ciudadesDisponibles.length === 0) {
      const ciudadesDeBoletos = new Set();
      boletos.forEach(boleto => {
        const ciudad = boleto.origen?.city || boleto.origen?.ciudad;
        if (ciudad && ciudad.trim() !== '') {
          ciudadesDeBoletos.add(ciudad.trim());
        }
      });
      if (ciudadesDeBoletos.size > 0) {
        setCiudadesDisponibles(Array.from(ciudadesDeBoletos).sort());
      }
    }
  }, [boletos]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tipoVentaDropdownOpen && !event.target.closest('.tipo-venta-dropdown')) {
        setTipoVentaDropdownOpen(false);
      }
      if (ciudadDropdownOpen && !event.target.closest('.ciudad-dropdown')) {
        setCiudadDropdownOpen(false);
      }
      if (sucDropdownOpen && !event.target.closest('.suc-dropdown')) {
        setSucDropdownOpen(false);
      }
      if (marcaDropdownOpen && !event.target.closest('.marca-dropdown')) {
        setMarcaDropdownOpen(false);
      }
      if (estadoBoletoDropdownOpen && !event.target.closest('.estado-boleto-dropdown')) {
        setEstadoBoletoDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tipoVentaDropdownOpen, ciudadDropdownOpen, sucDropdownOpen, marcaDropdownOpen, estadoBoletoDropdownOpen]);

  const loadCiudades = async () => {
    try {
      const response = await getCiudadesBoletos();
      if (response.data && response.data.ciudades) {
        const ciudadesFiltradas = response.data.ciudades
          .filter(c => c && c.trim() !== '')
          .sort();
        setCiudadesDisponibles(ciudadesFiltradas);
      }
    } catch (error) {
      console.error('Error cargando ciudades:', error);
    }
  };

  const loadMarcas = async () => {
    try {
      const response = await getMarcasBoletos();
      if (response.data && response.data.marcas) {
        const marcasFiltradas = response.data.marcas
          .filter(m => m && String(m).trim() !== '')
          .sort();
        setMarcasDisponibles(marcasFiltradas);
      }
    } catch (error) {
      console.error('Error cargando marcas:', error);
    }
  };

  const loadEstadosBoleto = async () => {
    try {
      const response = await getEstadosBoleto();
      if (response.data && response.data.estados) {
        const estadosFiltrados = response.data.estados
          .filter(e => e && e.trim() !== '')
          .sort();
        setEstadosBoletoDisponibles(estadosFiltrados);
      }
    } catch (error) {
      console.error('Error cargando estados de boleto:', error);
    }
  };

  const loadBoletos = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search,
        estado: filters.estado,
        subEstado: filters.subEstado,
        ciudad: Array.isArray(filters.ciudad) && filters.ciudad.length > 0 
          ? filters.ciudad.join(',') 
          : '',
        suc: Array.isArray(filters.suc) && filters.suc.length > 0 
          ? filters.suc.join(',') 
          : '',
        marca: Array.isArray(filters.marca) && filters.marca.length > 0 
          ? filters.marca.join(',') 
          : '',
        estadoBoleto: Array.isArray(filters.estadoBoleto) && filters.estadoBoleto.length > 0 
          ? filters.estadoBoleto.join(',') 
          : '',
        fechaDesde: filters.fechaDesde,
        fechaHasta: filters.fechaHasta,
        tipoVenta: Array.isArray(filters.tipoVenta) && filters.tipoVenta.length > 0 
          ? filters.tipoVenta.join(',') 
          : ''
      };
      
      const response = await getBoletos(params);
      
      // Axios envuelve la respuesta en response.data
      // El backend devuelve { data: [...], pagination: {...} }
      const responseData = response.data;
      
      // Verificar si recibimos HTML en lugar de JSON (el backend no está disponible)
      if (typeof responseData === 'string' && responseData.includes('<!doctype html>')) {
        throw new Error('El backend no está disponible o devolvió una respuesta HTML');
      }
      
      if (responseData && responseData.data && Array.isArray(responseData.data)) {
        setBoletos(responseData.data);
        setPagination(prev => ({
          ...prev,
          ...(responseData.pagination || {})
        }));
      } else if (Array.isArray(responseData)) {
        // Si la respuesta es directamente un array
        setBoletos(responseData);
      } else {
        // Si la estructura es diferente, usar array vacío
        console.warn('Estructura de respuesta inesperada:', responseData);
        setBoletos([]);
      }
    } catch (error) {
      console.error('Error cargando boletos:', error);
      setBoletos([]);
      // Solo loguear el error, no hay estado de mensaje en este componente
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleTipoVentaChange = (tipo, checked) => {
    setFilters(prev => {
      const currentTipos = prev.tipoVenta || [];
      if (checked) {
        if (!currentTipos.includes(tipo)) {
          return { ...prev, tipoVenta: [...currentTipos, tipo] };
        }
      } else {
        return { ...prev, tipoVenta: currentTipos.filter(t => t !== tipo) };
      }
      return prev;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleCiudadChange = (ciudad, checked) => {
    setFilters(prev => {
      const currentCiudades = prev.ciudad || [];
      if (checked) {
        if (!currentCiudades.includes(ciudad)) {
          return { ...prev, ciudad: [...currentCiudades, ciudad] };
        }
      } else {
        return { ...prev, ciudad: currentCiudades.filter(c => c !== ciudad) };
      }
      return prev;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleEstadoBoletoChange = (estado, checked) => {
    setFilters(prev => {
      const currentEstados = prev.estadoBoleto || [];
      if (checked) {
        if (!currentEstados.includes(estado)) {
          return { ...prev, estadoBoleto: [...currentEstados, estado] };
        }
      } else {
        return { ...prev, estadoBoleto: currentEstados.filter(e => e !== estado) };
      }
      return prev;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSucChange = (sucVal, checked) => {
    setFilters(prev => {
      const currentSucs = prev.suc || [];
      if (checked) {
        if (!currentSucs.includes(sucVal)) {
          return { ...prev, suc: [...currentSucs, sucVal] };
        }
      } else {
        return { ...prev, suc: currentSucs.filter(s => s !== sucVal) };
      }
      return prev;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleMarcaChange = (marcaVal, checked) => {
    setFilters(prev => {
      const currentMarcas = prev.marca || [];
      if (checked) {
        if (!currentMarcas.includes(marcaVal)) {
          return { ...prev, marca: [...currentMarcas, marcaVal] };
        }
      } else {
        return { ...prev, marca: currentMarcas.filter(m => m !== marcaVal) };
      }
      return prev;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      estado: '',
      subEstado: '',
      tipoVenta: ['VN', 'ADJ'],
      ciudad: [],
      suc: [],
      marca: [],
      estadoBoleto: ['Facturado', 'Aprobado'],
      fechaDesde: '',
      fechaHasta: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSincronizar = async () => {
    try {
      setSyncing(true);
      setSyncMessage('');
      await sincronizarBoletos();
      setSyncMessage('Sincronización completada exitosamente');
      await loadBoletos();
      await loadCiudades();
      await loadMarcas();
      await loadEstadosBoleto();
    } catch (error) {
      console.error('Error sincronizando:', error);
      setSyncMessage('Error durante la sincronización');
    } finally {
      setSyncing(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      setConnectionStatus(null);
      const response = await testBoletosConnection();
      setConnectionStatus({
        success: response.data.success,
        mensaje: response.data.mensaje,
        detalles: response.data.detalles
      });
    } catch (error) {
      setConnectionStatus({
        success: false,
        mensaje: 'Error de conexión',
        detalles: error.response?.data || { error: error.message }
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleViewBoleto = (boleto) => {
    setSelectedBoleto(boleto);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedBoleto(null);
    loadBoletos();
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

  const getSucFromRow = (row) => {
    const ciudad = (row.origen?.city || row.origen?.ciudad || '').trim();
    const marca = (row.vehicleId?.Brand || '').trim();
    if (!ciudad || !marca) return null;
    const key = `${ciudad}|${marca}`;
    return ciudadMarcaEmpresa[key] || null;
  };

  const generateColumns = () => {
    const sucColumn = {
      header: 'Suc',
      key: 'suc',
      width: '120px',
      render: (_, row) => {
        const suc = getSucFromRow(row);
        return suc ? (
          <span className="text-base truncate block" title={suc}>{suc}</span>
        ) : (
          <span className="text-gray-500">-</span>
        );
      }
    };

    const specificColumns = [
      {
        header: 'NOMBRE',
        key: 'nombre',
        width: '150px',
        render: (_, row) => {
          const owner = row.ownerIds && Array.isArray(row.ownerIds) && row.ownerIds.length > 0 
            ? row.ownerIds[0] 
            : null;
          const nombre = owner?.Name || '';
          return nombre ? (
            <span className="text-base truncate block" title={nombre}>{nombre}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'APELLIDO',
        key: 'apellido',
        width: '150px',
        render: (_, row) => {
          const owner = row.ownerIds && Array.isArray(row.ownerIds) && row.ownerIds.length > 0 
            ? row.ownerIds[0] 
            : null;
          const apellido = owner?.LastName || '';
          return apellido ? (
            <span className="text-base truncate block" title={apellido}>{apellido}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'EMAIL',
        key: 'email',
        width: '200px',
        render: (_, row) => {
          const owner = row.ownerIds && Array.isArray(row.ownerIds) && row.ownerIds.length > 0 
            ? row.ownerIds[0] 
            : null;
          const email = owner?.Email || '';
          return email ? (
            <span className="text-base truncate block" title={email}>{email}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'TELÉFONO',
        key: 'telefono',
        width: '120px',
        render: (_, row) => {
          const owner = row.ownerIds && Array.isArray(row.ownerIds) && row.ownerIds.length > 0 
            ? row.ownerIds[0] 
            : null;
          const telefono = owner?.Tel || '';
          return telefono ? (
            <span className="text-base truncate block" title={telefono}>{telefono}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'MARCA',
        key: 'marca',
        width: '120px',
        render: (_, row) => {
          const marca = row.vehicleId?.Brand || '';
          return marca ? (
            <span className="text-base truncate block" title={marca}>{marca}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'MODELO',
        key: 'modelo',
        width: '120px',
        render: (_, row) => {
          const modelo = row.vehicleId?.Model || '';
          return modelo ? (
            <span className="text-base truncate block" title={modelo}>{modelo}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'ESTADO BOLETO',
        key: 'status',
        width: '120px',
        render: (_, row) => {
          const status = row.status || '';
          return status ? (
            <span className="text-base truncate block" title={status}>{status}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'TIPO VENTA',
        key: 'tipoVenta',
        width: '120px',
        render: (_, row) => {
          const tipoVenta = row.typeOfSale || '';
          return tipoVenta ? (
            <span className="text-base truncate block" title={tipoVenta}>{tipoVenta}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'CIUDAD',
        key: 'ciudad',
        width: '150px',
        render: (_, row) => {
          const ciudad = row.origen?.city || row.origen?.ciudad || '';
          const ciudadValida = ciudad && typeof ciudad === 'string' && ciudad.trim() !== '';
          return ciudadValida ? (
            <span className="text-base truncate block" title={ciudad.trim()}>{ciudad.trim()}</span>
          ) : (
            <span className="text-gray-500">-</span>
          );
        }
      },
      {
        header: 'FECHA CREACIÓN',
        key: 'fechaCreacion',
        width: '150px',
        render: (_, row) => {
          const fechaCreacion = row.createdAt || '';
          if (!fechaCreacion) return <span className="text-gray-500">-</span>;
          return (
            <span className="text-base">{safeFormatDate(fechaCreacion)}</span>
          );
        }
      }
    ];

    const estadoColumn = {
      header: 'ESTADO OPORTUNIDAD',
      key: 'estado',
      width: '180px',
      render: (estado, row) => {
        return getEstadoBadge(estado, row.subEstado);
      }
    };

    const accionesColumn = {
      header: 'ACCIONES',
      key: 'acciones',
      width: '140px',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleViewBoleto(row)}
            className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            title="Ver detalles"
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
    };

    return [sucColumn, ...specificColumns, estadoColumn, accionesColumn];
  };

  const columns = generateColumns();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Gestión de Accesorios" 
          subtitle={`${pagination.total} boletos de unidades vendidas (VN)`}
        />
        <div className="flex gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <FaCheckCircle />
            Verificar Conexión
          </button>
          <button
            onClick={handleSincronizar}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <FaSync className={syncing ? 'animate-spin' : ''} />
            Sincronizar
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className={`mb-4 p-4 rounded-lg ${
          syncMessage.includes('Error')
            ? 'bg-red-900/20 border border-red-500/30 text-red-300' 
            : 'bg-green-900/20 border border-green-500/30 text-green-300'
        }`}>
          {syncMessage}
        </div>
      )}

      {connectionStatus && (
        <div className={`mb-4 p-4 rounded-lg ${
          connectionStatus.success
            ? 'bg-green-900/20 border border-green-500/30'
            : 'bg-red-900/20 border border-red-500/30'
        }`}>
          <div className="flex items-start justify-between mb-2">
            <h3 className={`font-semibold ${
              connectionStatus.success ? 'text-green-300' : 'text-red-300'
            }`}>
              {connectionStatus.success ? '✅ Conexión Exitosa' : '❌ Error de Conexión'}
            </h3>
            <button
              onClick={() => setConnectionStatus(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          {connectionStatus.success ? (
            <div className="space-y-2 text-sm text-gray-300">
              <p className="text-green-300">{connectionStatus.mensaje}</p>
              {connectionStatus.detalles && (
                <>
                  <p><strong>Estado HTTP:</strong> {connectionStatus.detalles.status} {connectionStatus.detalles.statusText}</p>
                  <p><strong>Tiempo de respuesta:</strong> {connectionStatus.detalles.tiempoRespuesta}</p>
                  <p><strong>Boletos encontrados:</strong> {connectionStatus.detalles.boletosEncontrados}</p>
                  <p><strong>Estructura:</strong> {connectionStatus.detalles.estructuraRespuesta}</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-red-300">
              <p>{connectionStatus.mensaje}</p>
              {connectionStatus.detalles && (
                <p><strong>Estado HTTP:</strong> {connectionStatus.detalles.status} {connectionStatus.detalles.statusText}</p>
              )}
              {connectionStatus.detalles?.mensaje && (
                <p><strong>Detalle:</strong> {connectionStatus.detalles.mensaje}</p>
              )}
            </div>
          )}
        </div>
      )}

      <Filters onClear={handleClearFilters} columns={5}>
        <Filters.Item label="Búsqueda">
          <div className="relative">
            <input
              type="text"
              placeholder="ID, búsqueda general..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-10"
            />
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </Filters.Item>

        <Filters.Item label="Estado Oportunidad">
          <select
            value={filters.estado}
            onChange={(e) => {
              handleFilterChange('estado', e.target.value);
              if (e.target.value !== 'abierto') {
                handleFilterChange('subEstado', '');
              }
            }}
            className="w-full"
          >
            <option value="">Todos los estados</option>
            <option value="cerrado">Cerrado</option>
            <option value="aceptado">Aceptado</option>
            <option value="abierto">Abierto</option>
          </select>
        </Filters.Item>

        {filters.estado === 'abierto' && (
          <Filters.Item label="SubEstado Oportunidad">
            <select
              value={filters.subEstado}
              onChange={(e) => handleFilterChange('subEstado', e.target.value)}
              className="w-full"
            >
              <option value="">Todos los subEstados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_espera">En Espera</option>
            </select>
          </Filters.Item>
        )}

        <Filters.Item label="Tipo de Venta">
          <div className="relative tipo-venta-dropdown">
            <button
              type="button"
              onClick={() => setTipoVentaDropdownOpen(!tipoVentaDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className="truncate">
                {filters.tipoVenta && filters.tipoVenta.length > 0
                  ? `${filters.tipoVenta.length} tipo${filters.tipoVenta.length > 1 ? 's' : ''} seleccionado${filters.tipoVenta.length > 1 ? 's' : ''}`
                  : 'Seleccionar tipos'}
              </span>
              {tipoVentaDropdownOpen ? (
                <FaChevronUp className="ml-2 text-gray-400" />
              ) : (
                <FaChevronDown className="ml-2 text-gray-400" />
              )}
            </button>
            
            {tipoVentaDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                <div className="p-2">
                  {[
                    { value: 'VN', label: 'VN - Venta Nueva' },
                    { value: 'VO', label: 'VO - Venta Usado' },
                    { value: 'VE', label: 'VE - Venta Especial' },
                    { value: 'PL', label: 'PL - Plan' },
                    { value: 'PEDIDO', label: 'PEDIDO' },
                    { value: 'ADJ', label: 'ADJ - Adjudicación' },
                    { value: 'SDA', label: 'SDA' },
                    { value: 'COMPRA', label: 'COMPRA' },
                    { value: 'COMPRAUSADO', label: 'COMPRAUSADO' }
                  ].map(tipo => (
                    <label
                      key={tipo.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.tipoVenta?.includes(tipo.value) || false}
                        onChange={(e) => handleTipoVentaChange(tipo.value, e.target.checked)}
                        className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-white">{tipo.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Filters.Item>

        <Filters.Item label="Estado Boleto">
          <div className="relative estado-boleto-dropdown">
            <button
              type="button"
              onClick={() => setEstadoBoletoDropdownOpen(!estadoBoletoDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className="truncate">
                {filters.estadoBoleto && filters.estadoBoleto.length > 0
                  ? `${filters.estadoBoleto.length} estado${filters.estadoBoleto.length > 1 ? 's' : ''} seleccionado${filters.estadoBoleto.length > 1 ? 's' : ''}`
                  : 'Seleccionar estados'}
              </span>
              {estadoBoletoDropdownOpen ? (
                <FaChevronUp className="ml-2 text-gray-400" />
              ) : (
                <FaChevronDown className="ml-2 text-gray-400" />
              )}
            </button>
            
            {estadoBoletoDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                <div className="p-2">
                  {estadosBoletoDisponibles.length > 0 ? (
                    estadosBoletoDisponibles.map(estado => (
                      <label
                        key={estado}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={filters.estadoBoleto?.includes(estado) || false}
                          onChange={(e) => handleEstadoBoletoChange(estado, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-white">{estado}</span>
                      </label>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-gray-400">Cargando estados...</div>
                  )}
                </div>
              </div>
            )}
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

        <Filters.Item label="Ciudad">
          <div className="relative ciudad-dropdown">
            <button
              type="button"
              onClick={() => setCiudadDropdownOpen(!ciudadDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className="truncate">
                {filters.ciudad && filters.ciudad.length > 0
                  ? `${filters.ciudad.length} ciudad${filters.ciudad.length > 1 ? 'es' : ''} seleccionada${filters.ciudad.length > 1 ? 's' : ''}`
                  : 'Seleccionar ciudades'}
              </span>
              {ciudadDropdownOpen ? (
                <FaChevronUp className="ml-2 text-gray-400" />
              ) : (
                <FaChevronDown className="ml-2 text-gray-400" />
              )}
            </button>
            
            {ciudadDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                <div className="p-2">
                  {ciudadesDisponibles.length > 0 ? (
                    ciudadesDisponibles.map(ciudad => (
                      <label
                        key={ciudad}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={filters.ciudad?.includes(ciudad) || false}
                          onChange={(e) => handleCiudadChange(ciudad, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-white">{ciudad}</span>
                      </label>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-gray-400">Cargando ciudades...</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Filters.Item>

        <Filters.Item label="SUC">
          <div className="relative suc-dropdown">
            <button
              type="button"
              onClick={() => setSucDropdownOpen(!sucDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className="truncate">
                {filters.suc && filters.suc.length > 0
                  ? `${filters.suc.length} sucursal${filters.suc.length > 1 ? 'es' : ''} seleccionada${filters.suc.length > 1 ? 's' : ''}`
                  : 'Seleccionar sucursales'}
              </span>
              {sucDropdownOpen ? (
                <FaChevronUp className="ml-2 text-gray-400" />
              ) : (
                <FaChevronDown className="ml-2 text-gray-400" />
              )}
            </button>
            
            {sucDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                <div className="p-2">
                  {sucsUnicos.length > 0 ? (
                    sucsUnicos.map(sucVal => (
                      <label
                        key={sucVal}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={filters.suc?.includes(sucVal) || false}
                          onChange={(e) => handleSucChange(sucVal, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-white">{sucVal}</span>
                      </label>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-gray-400">
                      Configure ciudadMarcaEmpresa en Parámetros de Accesorios
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Filters.Item>

        <Filters.Item label="Marca">
          <div className="relative marca-dropdown">
            <button
              type="button"
              onClick={() => setMarcaDropdownOpen(!marcaDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className="truncate">
                {filters.marca && filters.marca.length > 0
                  ? `${filters.marca.length} marca${filters.marca.length > 1 ? 's' : ''} seleccionada${filters.marca.length > 1 ? 's' : ''}`
                  : 'Seleccionar marcas'}
              </span>
              {marcaDropdownOpen ? (
                <FaChevronUp className="ml-2 text-gray-400" />
              ) : (
                <FaChevronDown className="ml-2 text-gray-400" />
              )}
            </button>
            
            {marcaDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                <div className="p-2">
                  {marcasDisponibles.length > 0 ? (
                    marcasDisponibles.map(marcaVal => (
                      <label
                        key={marcaVal}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={filters.marca?.includes(marcaVal) || false}
                          onChange={(e) => handleMarcaChange(marcaVal, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-white">{marcaVal}</span>
                      </label>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-gray-400">Cargando marcas...</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Filters.Item>
      </Filters>

      <div className="mb-2 text-sm text-gray-400 flex items-center gap-2">
        <span>📱</span>
        <span>Desliza horizontalmente para ver todos los campos</span>
      </div>

      {loading ? (
        <p className="text-center py-8 text-gray-400">Cargando datos...</p>
      ) : (
        <>
          <Table 
            data={boletos} 
            columns={columns}
            emptyMessage="No se encontraron boletos con los filtros seleccionados"
          />
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
          />
        </>
      )}

      {showModal && selectedBoleto && (
        <BoletoModal
          boletoId={selectedBoleto.id}
          onClose={handleCloseModal}
          onUpdate={loadBoletos}
        />
      )}
    </div>
  );
};

export default Accesorios;
