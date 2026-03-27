import React, { useEffect, useState } from 'react';
import { getVentasResumen, getVentasMeses } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaDollarSign, FaChartLine, FaInfoCircle } from 'react-icons/fa';

const Ventas = () => {
  const [resumen, setResumen] = useState({
    ventas: 0,
    descuentos: 0,
    costos: 0,
    ventasNetas: 0,
    ventasFC: 0,
    descuentosFC: 0,
    ventasNetasFC: 0,
    ventasGV: 0,
    descuentosGV: 0,
    ventasNetasGV: 0,
    ventasPW: 0,
    descuentosPW: 0,
    ventasNetasPW: 0,
    factTaller: [],
    ventaPV: [],
    factRepuestos: []
  });
  const [meses, setMeses] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState('');
  const [loading, setLoading] = useState(true);
  const [fechaActualizacion, setFechaActualizacion] = useState(null);

  useEffect(() => {
    loadMeses();
  }, []);

  useEffect(() => {
    if (mesSeleccionado) {
      loadResumen();
    }
  }, [mesSeleccionado]);

  const loadMeses = async () => {
    try {
      setLoading(true);
      const response = await getVentasMeses();
      if (response.data.success) {
        const mesesDisponibles = response.data.data || [];
        setMeses(mesesDisponibles);
        
        // Si hay meses disponibles, seleccionar el mes actual o el más reciente
        if (mesesDisponibles.length > 0) {
          const ahora = new Date();
          const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
          
          // Buscar mes actual, si no existe usar el más reciente
          const mesEncontrado = mesesDisponibles.find(m => m.mesKey === mesActual);
          setMesSeleccionado(mesEncontrado ? mesActual : mesesDisponibles[0].mesKey);
        } else {
          // Si no hay meses disponibles, usar el mes actual por defecto
          const ahora = new Date();
          const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
          setMesSeleccionado(mesActual);
        }
      } else {
        // Si falla la respuesta, usar mes actual por defecto
        const ahora = new Date();
        const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
        setMesSeleccionado(mesActual);
      }
    } catch (error) {
      console.error('Error cargando meses:', error);
      // En caso de error, usar mes actual por defecto
      const ahora = new Date();
      const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
      setMesSeleccionado(mesActual);
    } finally {
      setLoading(false);
    }
  };

  const loadResumen = async () => {
    try {
      setLoading(true);
      const response = await getVentasResumen(mesSeleccionado);
      if (response.data.success) {
        setResumen({
          ventas: response.data.data.ventas || 0,
          descuentos: response.data.data.descuentos || 0,
          costos: response.data.data.costos || 0,
          ventasNetas: response.data.data.ventasNetas || 0,
          ventasFC: response.data.data.ventasFC || 0,
          descuentosFC: response.data.data.descuentosFC || 0,
          ventasNetasFC: response.data.data.ventasNetasFC || 0,
          ventasGV: response.data.data.ventasGV || 0,
          descuentosGV: response.data.data.descuentosGV || 0,
          ventasNetasGV: response.data.data.ventasNetasGV || 0,
          ventasPW: response.data.data.ventasPW || 0,
          descuentosPW: response.data.data.descuentosPW || 0,
          ventasNetasPW: response.data.data.ventasNetasPW || 0,
          factTaller: response.data.data.factTaller || [],
          ventaPV: response.data.data.ventaPV || [],
          factRepuestos: response.data.data.factRepuestos || []
        });
        setFechaActualizacion(response.data.data.fechaActualizacion);
      }
    } catch (error) {
      console.error('Error cargando resumen:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(valor);
  };

  const formatearMillones = (valor) => {
    if (valor === 0) return '0.0';
    const millones = Math.abs(valor) / 1000000;
    const signo = valor < 0 ? '-' : '';
    return `${signo}${millones.toFixed(1)}M`;
  };

  const formatearMes = (mesKey) => {
    if (!mesKey) return '';
    const [año, mes] = mesKey.split('-');
    const fecha = new Date(parseInt(año), parseInt(mes) - 1, 1);
    return fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

  const formatearNumero = (valor) => {
    if (valor === 0) return '0.0';
    const millones = Math.abs(valor) / 1000000;
    const signo = valor < 0 ? '-' : '';
    return `${signo}${millones.toFixed(1)}M`;
  };

  const formatearPorcentaje = (valor) => {
    return `${valor.toFixed(0)}%`;
  };

  // Componente de tabla para Fact. Taller
  const TablaFactTaller = ({ datos }) => {
    if (!datos || datos.length === 0) return null;

    // Agrupar por empresa
    const porEmpresa = {};
    datos.forEach(item => {
      if (!porEmpresa[item.empresa]) {
        porEmpresa[item.empresa] = [];
      }
      porEmpresa[item.empresa].push(item);
    });

    // Calcular totales
    const totales = {};
    Object.keys(porEmpresa).forEach(empresa => {
      const items = porEmpresa[empresa];
      totales[empresa] = {
        facturacion: items.reduce((sum, item) => sum + item.facturacion, 0),
        costos: items.reduce((sum, item) => sum + item.costos, 0)
      };
      totales[empresa].mb = totales[empresa].facturacion > 0 
        ? ((totales[empresa].facturacion - totales[empresa].costos) / totales[empresa].facturacion) * 100 
        : 0;
    });

    const totalGeneral = {
      facturacion: datos.reduce((sum, item) => sum + item.facturacion, 0),
      costos: datos.reduce((sum, item) => sum + item.costos, 0)
    };
    totalGeneral.mb = totalGeneral.facturacion > 0 
      ? ((totalGeneral.facturacion - totalGeneral.costos) / totalGeneral.facturacion) * 100 
      : 0;

    const empresas = ['FC', 'GV', 'PW'];

    return (
      <div className="w-full">
        <div className="bg-blue-900 text-white px-3 py-2 font-semibold text-sm rounded-t text-center">
          Ventas talleres
        </div>
        <div className="overflow-x-auto border border-gray-700 rounded-b">
          <table className="w-full border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-600">
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Empresa</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Location</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Facturación</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">MB</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(empresa => {
                const items = (porEmpresa[empresa] || []).sort((a, b) => b.facturacion - a.facturacion);
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={empresa}>
                    {items.map((item, idx) => (
                      <tr key={`${empresa}-${item.location}-${idx}`} className="border-b border-gray-700 hover:bg-gray-800/30">
                        <td className="px-2 py-1.5 text-center text-white">{item.empresa}</td>
                        <td className="px-2 py-1.5 text-center text-white">{item.location}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearNumero(item.facturacion)}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(item.mb)}</td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-gray-500 font-semibold bg-gray-700/70">
                      <td className="px-2 py-1.5 text-center text-white">Total {empresa}</td>
                      <td className="px-2 py-1.5 text-center"></td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totales[empresa]?.facturacion || 0)}</td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totales[empresa]?.mb || 0)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr className="border-t-2 border-gray-400 font-bold bg-blue-900/80">
                <td className="px-2 py-1.5 text-center text-white">Total</td>
                <td className="px-2 py-1.5 text-center"></td>
                <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totalGeneral.facturacion)}</td>
                <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totalGeneral.mb)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Componente de tabla para Venta PV
  const TablaVentaPV = ({ datos }) => {
    if (!datos || datos.length === 0) return null;

    // Agrupar por empresa
    const porEmpresa = {};
    datos.forEach(item => {
      if (!porEmpresa[item.empresa]) {
        porEmpresa[item.empresa] = [];
      }
      porEmpresa[item.empresa].push(item);
    });

    // Calcular totales
    const totales = {};
    Object.keys(porEmpresa).forEach(empresa => {
      const items = porEmpresa[empresa];
      totales[empresa] = {
        facturacion: items.reduce((sum, item) => sum + item.facturacion, 0),
        costos: items.reduce((sum, item) => sum + item.costos, 0)
      };
      totales[empresa].mb = totales[empresa].facturacion > 0 
        ? ((totales[empresa].facturacion - totales[empresa].costos) / totales[empresa].facturacion) * 100 
        : 0;
    });

    const totalGeneral = {
      facturacion: datos.reduce((sum, item) => sum + item.facturacion, 0),
      costos: datos.reduce((sum, item) => sum + item.costos, 0)
    };
    totalGeneral.mb = totalGeneral.facturacion > 0 
      ? ((totalGeneral.facturacion - totalGeneral.costos) / totalGeneral.facturacion) * 100 
      : 0;

    const empresas = ['FC', 'GV', 'PW'];

    return (
      <div className="w-full">
        <div className="bg-blue-900 text-white px-3 py-2 font-semibold text-sm rounded-t text-center">
          Venta PV
        </div>
        <div className="overflow-x-auto border border-gray-700 rounded-b">
          <table className="w-full border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-600">
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Empresa</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Location</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Facturación</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">MB</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(empresa => {
                const items = porEmpresa[empresa] || [];
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={empresa}>
                    {items.map((item, idx) => (
                      <tr key={`${empresa}-${item.location}-${idx}`} className="border-b border-gray-700 hover:bg-gray-800/30">
                        <td className="px-2 py-1.5 text-center text-white">{item.empresa}</td>
                        <td className="px-2 py-1.5 text-center text-white">{item.location}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearNumero(item.facturacion)}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(item.mb)}</td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-gray-500 font-semibold bg-gray-700/70">
                      <td className="px-2 py-1.5 text-center text-white">Total {empresa}</td>
                      <td className="px-2 py-1.5 text-center"></td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totales[empresa]?.facturacion || 0)}</td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totales[empresa]?.mb || 0)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr className="border-t-2 border-gray-400 font-bold bg-blue-900/80">
                <td className="px-2 py-1.5 text-center text-white">Total</td>
                <td className="px-2 py-1.5 text-center"></td>
                <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totalGeneral.facturacion)}</td>
                <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totalGeneral.mb)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Componente de tabla para Fact. Repuestos
  const TablaFactRepuestos = ({ datos }) => {
    if (!datos || datos.length === 0) return null;

    // Agrupar por channel
    const porChannel = {};
    datos.forEach(item => {
      if (!porChannel[item.channel]) {
        porChannel[item.channel] = [];
      }
      porChannel[item.channel].push(item);
    });

    // Calcular totales por channel
    const totalesChannel = {};
    Object.keys(porChannel).forEach(channel => {
      const items = porChannel[channel];
      totalesChannel[channel] = {
        facturacion: items.reduce((sum, item) => sum + item.facturacion, 0),
        costos: items.reduce((sum, item) => sum + item.costos, 0)
      };
      totalesChannel[channel].mb = totalesChannel[channel].facturacion > 0 
        ? ((totalesChannel[channel].facturacion - totalesChannel[channel].costos) / totalesChannel[channel].facturacion) * 100 
        : 0;
    });

    const totalGeneral = {
      facturacion: datos.reduce((sum, item) => sum + item.facturacion, 0),
      costos: datos.reduce((sum, item) => sum + item.costos, 0)
    };
    totalGeneral.mb = totalGeneral.facturacion > 0 
      ? ((totalGeneral.facturacion - totalGeneral.costos) / totalGeneral.facturacion) * 100 
      : 0;

    const channels = Object.keys(porChannel).sort();

    return (
      <div className="w-full">
        <div className="bg-blue-900 text-white px-3 py-2 font-semibold text-sm rounded-t text-center">
          Ventas Repuestos
        </div>
        <div className="overflow-x-auto border border-gray-700 rounded-b">
          <table className="w-full border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-600">
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">channel</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Empresa</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">Facturación</th>
                <th className="text-center px-2 py-1.5 text-gray-300 font-medium w-[25%]">MB</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(channel => {
                const items = porChannel[channel] || [];
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={channel}>
                    {items.map((item, idx) => (
                      <tr key={`${channel}-${item.empresa}-${idx}`} className="border-b border-gray-700 hover:bg-gray-800/30">
                        <td className="px-2 py-1.5 text-center text-white">{item.channel}</td>
                        <td className="px-2 py-1.5 text-center text-white">{item.empresa}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearNumero(item.facturacion)}</td>
                        <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(item.mb)}</td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-gray-500 font-semibold bg-gray-700/70">
                      <td className="px-2 py-1.5 text-center text-white">Total {channel}</td>
                      <td className="px-2 py-1.5 text-center"></td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totalesChannel[channel]?.facturacion || 0)}</td>
                      <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totalesChannel[channel]?.mb || 0)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr className="border-t-2 border-gray-400 font-bold bg-blue-900/80">
                <td className="px-2 py-1.5 text-center text-white">Total</td>
                <td className="px-2 py-1.5 text-center"></td>
                <td className="px-2 py-1.5 text-center text-white">{formatearNumero(totalGeneral.facturacion)}</td>
                <td className="px-2 py-1.5 text-center text-white">{formatearPorcentaje(totalGeneral.mb)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <PageHeader 
        title="Ventas" 
        subtitle="Resumen de ventas, descuentos y costos"
        icon={FaDollarSign}
      />

      <div className="space-y-6">
        {/* Selector de mes */}
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-300">
              Seleccionar mes:
            </label>
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {meses.length === 0 ? (
                mesSeleccionado ? (
                  <option value={mesSeleccionado}>
                    {formatearMes(mesSeleccionado)}
                  </option>
                ) : (
                  <option value="">No hay meses disponibles</option>
                )
              ) : (
                meses.map((mes) => (
                  <option key={mes.mesKey} value={mes.mesKey}>
                    {formatearMes(mes.mesKey)}
                  </option>
                ))
              )}
            </select>
            {fechaActualizacion && (
              <span className="text-xs text-gray-400 ml-auto">
                Actualizado: {new Date(fechaActualizacion).toLocaleString('es-ES')}
              </span>
            )}
          </div>
        </div>

        {/* Tarjeta principal de Ventas */}
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FaInfoCircle className="text-gray-400" />
              <h3 className="text-lg font-semibold text-white">Ventas</h3>
            </div>
            <button className="text-gray-400 hover:text-white transition-colors">
              <FaChartLine />
            </button>
          </div>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Cargando datos...</p>
            </div>
          ) : resumen.ventas === 0 && resumen.descuentos === 0 && resumen.costos === 0 && 
             resumen.factTaller.length === 0 && resumen.ventaPV.length === 0 && resumen.factRepuestos.length === 0 ? (
            <div className="text-center py-8 mt-4">
              <p className="text-gray-400 text-lg font-medium">
                No hay datos de ventas disponibles para este mes
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {meses.length === 0 
                  ? "Defina FILE_PATH_VENTAS_CTAS_PV y FILE_PATH_VENTAS_BALANCES en el .env del servidor y ejecute «Actualizar ahora» en Configuración → Actualización de datos."
                  : "Los datos de ventas para este mes están vacíos. Compruebe las rutas en el .env y vuelva a importar desde Actualización de datos."
                }
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Indicador principal */}
              <div className="mb-6 text-center">
                <div className="text-6xl font-bold text-gray-300 mb-2">
                  {formatearMillones(resumen.ventasNetas)}
                </div>
              </div>

              {/* Subtarjetas por empresa - texto al 50% del indicador principal */}
              <div className="flex gap-4 overflow-x-auto pb-2 justify-center w-full">
                {/* FC */}
                <div className="flex-shrink-0 bg-gray-800/50 border border-gray-700 rounded-lg p-4 min-w-[200px] flex flex-col items-center">
                  <div className="text-lg text-gray-300 font-medium mb-1 text-center">FC</div>
                  <div className="text-3xl font-bold text-gray-300 text-center">
                    {formatearMillones(resumen.ventasNetasFC)}
                  </div>
                </div>

                {/* GV */}
                <div className="flex-shrink-0 bg-gray-800/50 border border-gray-700 rounded-lg p-4 min-w-[200px] flex flex-col items-center">
                  <div className="text-lg text-gray-300 font-medium mb-1 text-center">GV</div>
                  <div className="text-3xl font-bold text-gray-300 text-center">
                    {formatearMillones(resumen.ventasNetasGV)}
                  </div>
                </div>

                {/* PW */}
                <div className="flex-shrink-0 bg-gray-800/50 border border-gray-700 rounded-lg p-4 min-w-[200px] flex flex-col items-center">
                  <div className="text-lg text-gray-300 font-medium mb-1 text-center">PW</div>
                  <div className="text-3xl font-bold text-gray-300 text-center">
                    {formatearMillones(resumen.ventasNetasPW)}
                  </div>
                </div>
              </div>

              {/* Tablas detalladas */}
              {!loading && (
                <div className="w-full mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <TablaFactTaller datos={resumen.factTaller} />
                  <TablaVentaPV datos={resumen.ventaPV} />
                  <TablaFactRepuestos datos={resumen.factRepuestos} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Ventas;

