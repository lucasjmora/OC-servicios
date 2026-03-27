import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBotNoTratadosStats, getAsistenciaAbiertosPendientesStats, getOportunidades10kStats, getAccesoriosStats } from '../services/api';
import { getPresupCrmSlaPendienteEmpresas } from '../services/presupCrmApi';
import { FaExclamationTriangle, FaClipboardList, FaLightbulb, FaShoppingBag, FaFileAlt } from 'react-icons/fa';

const Dashboard = () => {
  const [stats, setStats] = useState({
    FC: { total: 0, porLocalidad: {} },
    GV: { total: 0, porLocalidad: {} },
    PW: { total: 0, porLocalidad: {} }
  });
  const [asistenciaStats, setAsistenciaStats] = useState({
    FC: { total: 0, porTaller: {} },
    GV: { total: 0, porTaller: {} },
    PW: { total: 0, porTaller: {} }
  });
  const [presupuestosStats, setPresupuestosStats] = useState({
    FC: { total: 0, porTaller: {} },
    GV: { total: 0, porTaller: {} },
    PW: { total: 0, porTaller: {} }
  });
  const [oportunidades10kStats, setOportunidades10kStats] = useState({
    FC: { total: 0, porTaller: {} },
    GV: { total: 0, porTaller: {} },
    PW: { total: 0, porTaller: {} }
  });
  const [fechaDesdeOportunidades, setFechaDesdeOportunidades] = useState(null);
  const [fechaLimiteOportunidades, setFechaLimiteOportunidades] = useState(null);
  const [accesoriosStats, setAccesoriosStats] = useState({
    FC: { total: 0, porSucursal: {} },
    GV: { total: 0, porSucursal: {} },
    PW: { total: 0, porSucursal: {} }
  });
  const [fechaDesdeAccesorios, setFechaDesdeAccesorios] = useState(null);
  const [fechaHastaAccesorios, setFechaHastaAccesorios] = useState(null);
  const [fechaDesdePresupuestos, setFechaDesdePresupuestos] = useState(null);
  const [fechaHastaPresupuestos, setFechaHastaPresupuestos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAsistencia, setLoadingAsistencia] = useState(true);
  const [loadingPresupuestos, setLoadingPresupuestos] = useState(true);
  const [loadingOportunidades10k, setLoadingOportunidades10k] = useState(true);
  const [loadingAccesorios, setLoadingAccesorios] = useState(true);

  useEffect(() => {
    // OPTIMIZACIÓN: Cargar estadísticas de asistencia primero (más importante para el usuario)
    // y luego las otras en paralelo
    loadAsistenciaStats();
    loadStats();
    loadPresupuestosCrmStats();
    loadOportunidades10kStats();
    loadAccesoriosStats();
  }, []);

  const emptyPresupEmpresaStats = () => ({
    FC: { total: 0, porTaller: {} },
    GV: { total: 0, porTaller: {} },
    PW: { total: 0, porTaller: {} }
  });

  const loadPresupuestosCrmStats = async () => {
    try {
      setLoadingPresupuestos(true);
      const response = await getPresupCrmSlaPendienteEmpresas();
      if (response.data?.success && response.data.data) {
        const d = response.data.data;
        setPresupuestosStats({
          FC: d.FC || { total: 0, porTaller: {} },
          GV: d.GV || { total: 0, porTaller: {} },
          PW: d.PW || { total: 0, porTaller: {} }
        });
        if (d.fechaDesde) {
          setFechaDesdePresupuestos(new Date(d.fechaDesde));
        } else {
          setFechaDesdePresupuestos(null);
        }
        if (d.fechaHasta) {
          setFechaHastaPresupuestos(new Date(d.fechaHasta));
        } else {
          setFechaHastaPresupuestos(null);
        }
      } else {
        setPresupuestosStats(emptyPresupEmpresaStats());
        setFechaDesdePresupuestos(null);
        setFechaHastaPresupuestos(null);
      }
    } catch (error) {
      console.error('Error cargando estadísticas Presup CRM (SLA pendiente):', error);
      setPresupuestosStats(emptyPresupEmpresaStats());
      setFechaDesdePresupuestos(null);
      setFechaHastaPresupuestos(null);
    } finally {
      setLoadingPresupuestos(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await getBotNoTratadosStats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAsistenciaStats = async () => {
    try {
      setLoadingAsistencia(true);
      const response = await getAsistenciaAbiertosPendientesStats();
      if (response.data.success) {
        setAsistenciaStats(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando estadísticas de asistencia:', error);
    } finally {
      setLoadingAsistencia(false);
    }
  };

  const loadOportunidades10kStats = async () => {
    try {
      setLoadingOportunidades10k(true);
      const response = await getOportunidades10kStats();
      if (response.data.success) {
        setOportunidades10kStats(response.data.data);
        if (response.data.fechaDesde) {
          setFechaDesdeOportunidades(new Date(response.data.fechaDesde));
        }
        if (response.data.fechaLimite) {
          setFechaLimiteOportunidades(new Date(response.data.fechaLimite));
        }
      }
    } catch (error) {
      console.error('Error cargando estadísticas de oportunidades 10k:', error);
    } finally {
      setLoadingOportunidades10k(false);
    }
  };

  const loadAccesoriosStats = async () => {
    try {
      setLoadingAccesorios(true);
      const response = await getAccesoriosStats();
      const data = response?.data;
      if (data?.data && (data.success !== false)) {
        const raw = data.data;
        setAccesoriosStats({
          FC: raw.FC || { total: 0, porSucursal: {} },
          GV: raw.GV || { total: 0, porSucursal: {} },
          PW: raw.PW || { total: 0, porSucursal: {} }
        });
        if (data.fechaDesde) {
          setFechaDesdeAccesorios(new Date(data.fechaDesde));
        }
        if (data.fechaHasta) {
          setFechaHastaAccesorios(new Date(data.fechaHasta));
        }
      }
    } catch (error) {
      console.error('Error cargando estadísticas de accesorios:', error?.response?.data || error?.message);
    } finally {
      setLoadingAccesorios(false);
    }
  };

  const empresaNames = {
    FC: 'Fortecar',
    GV: 'Granville',
    PW: 'Pampawagen'
  };

  const empresaRoutes = {
    FC: '/bot-analyzer/fc',
    GV: '/bot-analyzer/gv',
    PW: '/bot-analyzer/pw'
  };

  const cardColors = {
    FC: { text: 'text-blue-400', bg: 'bg-blue-500' },
    GV: { text: 'text-green-400', bg: 'bg-green-500' },
    PW: { text: 'text-amber-400', bg: 'bg-amber-500' }
  };

  const StatCard = ({ empresa, nombre, datos, link }) => {
    const total = datos?.total || 0;
    const porLocalidad = datos?.porLocalidad || {};
    const localidades = Object.entries(porLocalidad).sort((a, b) => b[1] - a[1]); // Ordenar por cantidad descendente

    // Calcular fecha inicial (hace 7 días)
    const fechaInicial = new Date();
    fechaInicial.setDate(fechaInicial.getDate() - 7);
    const fechaInicialStr = fechaInicial.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return (
      <Link
        to={link}
        className="bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem] hover:border-primary transition-all duration-200 block"
      >
        {/* Header con empresa y total en la misma línea */}
        <div className="flex items-center justify-between mb-[0.72rem]">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{nombre}</p>
            <p className="text-3xl font-bold text-yellow-400">
              {loading ? '...' : total.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-xs text-white">Últimos 7 días</p>
              <p className="text-xs text-gray-400">{fechaInicialStr}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-yellow-500 flex items-center justify-center flex-shrink-0">
              <FaExclamationTriangle className="text-white text-xl" />
            </div>
          </div>
        </div>
        
        {/* Desglose por localidad - una sola línea, número debajo de la abreviatura */}
        {!loading && localidades.length > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <div className="flex flex-nowrap gap-x-4 justify-center overflow-x-auto">
              {localidades.map(([localidad, cantidad]) => (
                <div key={localidad} className="flex flex-col items-center text-center shrink-0 min-w-[60px]">
                  <span className="text-gray-300 text-sm mb-0.5">{localidad}</span>
                  <span className="text-yellow-400 font-bold text-lg">{cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!loading && localidades.length === 0 && total > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin localidad asignada</p>
          </div>
        )}
      </Link>
    );
  };

  const AsistenciaStatCard = ({ empresa, nombre, datos }) => {
    const total = datos?.total || 0;
    const porTaller = datos?.porTaller || {};
    const talleres = Object.entries(porTaller).sort((a, b) => b[1] - a[1]); // Ordenar por cantidad descendente

    // Calcular fecha inicial (hace 7 días)
    const fechaInicial = new Date();
    fechaInicial.setDate(fechaInicial.getDate() - 7);
    const fechaInicialStr = fechaInicial.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return (
      <Link
        to="/asistencia"
        className="bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem] hover:border-primary transition-all duration-200 block"
      >
        {/* Header con empresa y total en la misma línea */}
        <div className="flex items-center justify-between mb-[0.72rem]">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{nombre}</p>
            <p className="text-3xl font-bold text-blue-400">
              {loadingAsistencia ? '...' : total.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-xs text-white">Últimos 7 días</p>
              <p className="text-xs text-gray-400">{fechaInicialStr}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
              <FaClipboardList className="text-white text-xl" />
            </div>
          </div>
        </div>
        
        {/* Desglose por taller - una sola línea, número debajo de la abreviatura */}
        {!loadingAsistencia && talleres.length > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <div className="flex flex-nowrap gap-x-4 justify-center overflow-x-auto">
              {talleres.map(([taller, cantidad]) => (
                <div key={taller} className="flex flex-col items-center text-center shrink-0 min-w-[60px]">
                  <span className="text-gray-300 text-sm mb-0.5">{taller}</span>
                  <span className="text-blue-400 font-bold text-lg">{cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!loadingAsistencia && talleres.length === 0 && total > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin taller asignado</p>
          </div>
        )}
      </Link>
    );
  };

  const PresupuestosStatCard = ({ nombre, datos, fechaDesde, fechaHasta }) => {
    const total = datos?.total || 0;
    const porTaller = datos?.porTaller || {};
    const talleres = Object.entries(porTaller).sort((a, b) => b[1] - a[1]);
    const colors = { text: 'text-teal-400', bg: 'bg-teal-500' };

    const fechaDesdeStr = fechaDesde
      ? fechaDesde.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';
    const fechaHastaStr = fechaHasta
      ? fechaHasta.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';

    return (
      <Link
        to="/presup-crm/presupuestos"
        className="bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem] hover:border-primary transition-all duration-200 block"
      >
        <div className="flex items-center justify-between mb-[0.72rem]">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{nombre}</p>
            <p className={`text-3xl font-bold ${colors.text}`}>
              {loadingPresupuestos ? '...' : total.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-xs text-white">{fechaDesdeStr}</p>
              <p className="text-xs text-white">{fechaHastaStr}</p>
            </div>
            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
              <FaFileAlt className="text-white text-xl" />
            </div>
          </div>
        </div>
        {!loadingPresupuestos && talleres.length > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <div className="flex flex-nowrap gap-x-4 justify-center overflow-x-auto">
              {talleres.map(([taller, cantidad]) => (
                <div key={taller} className="flex flex-col items-center text-center shrink-0 min-w-[56px]">
                  <span className="text-white text-sm mb-0.5">{taller}</span>
                  <span className={`${colors.text} font-bold text-lg`}>{cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loadingPresupuestos && talleres.length === 0 && total > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin taller asignado</p>
          </div>
        )}
      </Link>
    );
  };

  const Oportunidades10kStatCard = ({ empresa, nombre, datos, fechaDesde, fechaHasta }) => {
    const total = datos?.total || 0;
    const porTaller = datos?.porTaller || {};
    const talleres = Object.entries(porTaller).sort((a, b) => b[1] - a[1]);
    const colors = { text: 'text-green-400', bg: 'bg-green-500' };

    const fechaDesdeStr = fechaDesde 
      ? fechaDesde.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';
    const fechaHastaStr = fechaHasta 
      ? fechaHasta.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';

    return (
      <Link
        to="/oportunidades"
        className="bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem] hover:border-primary transition-all duration-200 block"
      >
        <div className="flex items-center justify-between mb-[0.72rem]">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{nombre}</p>
            <p className={`text-3xl font-bold ${colors.text}`}>
              {loadingOportunidades10k ? '...' : total.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-xs text-white">{fechaDesdeStr}</p>
              <p className="text-xs text-white">{fechaHastaStr}</p>
            </div>
            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
              <FaLightbulb className="text-white text-xl" />
            </div>
          </div>
        </div>
        {!loadingOportunidades10k && talleres.length > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <div className="flex flex-nowrap gap-x-4 justify-center overflow-x-auto">
              {talleres.map(([taller, cantidad]) => (
                <div key={taller} className="flex flex-col items-center text-center shrink-0 min-w-[56px]">
                  <span className="text-white text-sm mb-0.5">{taller}</span>
                  <span className={`${colors.text} font-bold text-lg`}>{cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!loadingOportunidades10k && talleres.length === 0 && total > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin taller asignado</p>
          </div>
        )}
      </Link>
    );
  };

  const AccesoriosStatCard = ({ empresa, nombre, datos, fechaDesde, fechaHasta }) => {
    const total = datos?.total || 0;
    const porSucursal = datos?.porSucursal || {};
    const sucursales = Object.entries(porSucursal).sort((a, b) => b[1] - a[1]);
    const colors = { text: 'text-violet-400', bg: 'bg-violet-500' };

    const fechaDesdeStr = fechaDesde
      ? fechaDesde.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';
    const fechaHastaStr = fechaHasta
      ? fechaHasta.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';

    return (
      <Link
        to="/accesorios"
        className="bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem] hover:border-primary transition-all duration-200 block"
      >
        <div className="flex items-center justify-between mb-[0.72rem]">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{nombre}</p>
            <p className={`text-3xl font-bold ${colors.text}`}>
              {loadingAccesorios ? '...' : total.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <p className="text-xs text-white">{fechaDesdeStr}</p>
              <p className="text-xs text-white">{fechaHastaStr}</p>
            </div>
            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
              <FaShoppingBag className="text-white text-xl" />
            </div>
          </div>
        </div>
        {!loadingAccesorios && sucursales.length > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <div className="flex flex-nowrap gap-x-4 justify-center overflow-x-auto">
              {sucursales.map(([sucursal, cantidad]) => (
                <div key={sucursal} className="flex flex-col items-center text-center shrink-0 min-w-[56px]">
                  <span className="text-white text-sm mb-0.5">{sucursal}</span>
                  <span className={`${colors.text} font-bold text-lg`}>{cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loadingAccesorios && sucursales.length === 0 && total > 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin sucursal asignada</p>
          </div>
        )}
        {!loadingAccesorios && total === 0 && (
          <div className="border-t border-gray-700 pt-[0.72rem]">
            <p className="text-xs text-gray-500">Sin datos en el período</p>
          </div>
        )}
      </Link>
    );
  };

  return (
    <div className="px-8 py-[1.44rem]">
      <div className="mb-[1.08rem]">
        <h1 className="text-3xl font-bold text-white mb-[0.18rem]">Dashboard</h1>
        <p className="text-gray-400 text-sm mb-[0.72rem]">Resumen de servicios</p>
      </div>

      {/* Sección Oportunidades BOT */}
      <div className="mt-[1.08rem] bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem]">
        <h2 className="text-xl font-bold text-white mb-[0.72rem]">Oportunidades BOT</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-[1.08rem]">
          <StatCard
            empresa="FC"
            nombre={empresaNames.FC}
            datos={stats.FC}
            link={empresaRoutes.FC}
          />
          <StatCard
            empresa="GV"
            nombre={empresaNames.GV}
            datos={stats.GV}
            link={empresaRoutes.GV}
          />
          <StatCard
            empresa="PW"
            nombre={empresaNames.PW}
            datos={stats.PW}
            link={empresaRoutes.PW}
          />
        </div>
      </div>

      {/* Sección Asistencia */}
      <div className="mt-[1.08rem] bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem]">
        <h2 className="text-xl font-bold text-white mb-[0.72rem]">Asistencia</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-[1.08rem]">
          <AsistenciaStatCard
            empresa="FC"
            nombre={empresaNames.FC}
            datos={asistenciaStats.FC}
          />
          <AsistenciaStatCard
            empresa="GV"
            nombre={empresaNames.GV}
            datos={asistenciaStats.GV}
          />
          <AsistenciaStatCard
            empresa="PW"
            nombre={empresaNames.PW}
            datos={asistenciaStats.PW}
          />
        </div>
      </div>

      {/* Presup CRM: abiertos con subestado SLA pendiente por empresa */}
      <div className="mt-[1.08rem] bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem]">
        <h2 className="text-xl font-bold text-white mb-[0.72rem]">Presupuestos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-[1.08rem]">
          <PresupuestosStatCard
            nombre={empresaNames.FC}
            datos={presupuestosStats.FC}
            fechaDesde={fechaDesdePresupuestos}
            fechaHasta={fechaHastaPresupuestos}
          />
          <PresupuestosStatCard
            nombre={empresaNames.GV}
            datos={presupuestosStats.GV}
            fechaDesde={fechaDesdePresupuestos}
            fechaHasta={fechaHastaPresupuestos}
          />
          <PresupuestosStatCard
            nombre={empresaNames.PW}
            datos={presupuestosStats.PW}
            fechaDesde={fechaDesdePresupuestos}
            fechaHasta={fechaHastaPresupuestos}
          />
        </div>
      </div>

      {/* Sección Accesorios: 3 subtarjetas por empresa (FC, GV, PW), desglose por sucursal (prefijo del campo Suc) */}
      <div className="mt-[1.08rem] bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem]">
        <h2 className="text-xl font-bold text-white mb-[0.72rem]">Accesorios</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-[1.08rem]">
          <AccesoriosStatCard
            empresa="FC"
            nombre={empresaNames.FC}
            datos={accesoriosStats.FC}
            fechaDesde={fechaDesdeAccesorios}
            fechaHasta={fechaHastaAccesorios}
          />
          <AccesoriosStatCard
            empresa="GV"
            nombre={empresaNames.GV}
            datos={accesoriosStats.GV}
            fechaDesde={fechaDesdeAccesorios}
            fechaHasta={fechaHastaAccesorios}
          />
          <AccesoriosStatCard
            empresa="PW"
            nombre={empresaNames.PW}
            datos={accesoriosStats.PW}
            fechaDesde={fechaDesdeAccesorios}
            fechaHasta={fechaHastaAccesorios}
          />
        </div>
      </div>

      {/* Sección Oportunidades 10k */}
      <div className="mt-[1.08rem] bg-background-card border border-gray-700 rounded-lg px-6 py-[1.08rem]">
        <h2 className="text-xl font-bold text-white mb-[0.72rem]">Oportunidades 10k</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-[1.08rem]">
          <Oportunidades10kStatCard
            empresa="FC"
            nombre={empresaNames.FC}
            datos={oportunidades10kStats.FC}
            fechaDesde={fechaDesdeOportunidades}
            fechaHasta={fechaLimiteOportunidades}
          />
          <Oportunidades10kStatCard
            empresa="GV"
            nombre={empresaNames.GV}
            datos={oportunidades10kStats.GV}
            fechaDesde={fechaDesdeOportunidades}
            fechaHasta={fechaLimiteOportunidades}
          />
          <Oportunidades10kStatCard
            empresa="PW"
            nombre={empresaNames.PW}
            datos={oportunidades10kStats.PW}
            fechaDesde={fechaDesdeOportunidades}
            fechaHasta={fechaLimiteOportunidades}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


