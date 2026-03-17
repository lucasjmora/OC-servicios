import React, { useEffect, useState, useRef } from 'react';
import PageHeader from '../components/PageHeader';
import { FaFileInvoice, FaExclamationTriangle } from 'react-icons/fa';
import { getORsPivot, getMappings } from '../services/api';

const ORsAbiertas = () => {
  const [pivot, setPivot] = useState(null);
  const [tallerMappings, setTallerMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [cuadroHeight, setCuadroHeight] = useState(null);
  const cuadroRef = useRef(null);

  const mapTaller = (nombre) => (tallerMappings[nombre] && tallerMappings[nombre].trim()) ? tallerMappings[nombre].trim() : nombre;

  useEffect(() => {
    loadPivot();
  }, []);

  const hasData = pivot && pivot.talleres?.length > 0 && pivot.tiposOrden?.length > 0;

  useEffect(() => {
    if (!hasData || !cuadroRef.current) return;
    const el = cuadroRef.current;
    const ro = new ResizeObserver(() => {
      setCuadroHeight(el.offsetHeight);
    });
    ro.observe(el);
    setCuadroHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [hasData]);

  const loadPivot = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pivotRes, mappingsRes] = await Promise.all([
        getORsPivot(),
        getMappings('orsAbiertasTalleres')
      ]);
      const data = pivotRes.data?.data || {};
      setPivot(data);
      setMessage(pivotRes.data?.message || null);
      setTallerMappings(mappingsRes.data || {});
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setPivot(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <PageHeader 
        title="ORs Abiertas" 
        subtitle="Gestión de órdenes de reparación abiertas"
        icon={FaFileInvoice}
      />

      {loading && (
        <div className="mt-8 bg-background-card border border-gray-700 rounded-lg p-12 text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-400">Cargando cuadro de datos...</p>
        </div>
      )}

      {!loading && error && (
        <div className="mt-8 bg-background-card border border-gray-700 rounded-lg p-12 text-center">
          <FaExclamationTriangle className="text-5xl text-amber-500 mx-auto mb-4" />
          <p className="text-gray-300">{error}</p>
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="mt-8 bg-background-card border border-gray-700 rounded-lg p-12 text-center max-w-md mx-auto">
          <p className="text-gray-400">
            {message || 'Actualice los datos para cargar el cuadro de ORs Abiertas.'}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Configure la ruta del archivo Excel en Configuración → Actualización de datos y ejecute &quot;Actualizar Ahora&quot;.
          </p>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="mt-8 flex flex-row gap-4 items-start">
          {/* Cuadro pivot a la izquierda */}
          <div ref={cuadroRef} className="flex-shrink-0 bg-background-card border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-max">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="w-32 px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-800 z-10">
                      Taller
                    </th>
                    {pivot.tiposOrden.map((tipo) => (
                      <th
                        key={tipo}
                        className="px-2 py-1.5 text-center text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap"
                      >
                        {tipo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {pivot.talleres.map((taller, idx) => (
                    <tr
                      key={taller}
                      className={taller === 'Total' ? 'bg-gray-800/80 font-bold' : idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}
                    >
                      <td className="w-32 px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap sticky left-0 bg-inherit z-10 truncate" title={mapTaller(taller)}>
                        {mapTaller(taller)}
                      </td>
                      {pivot.tiposOrden.map((tipo) => (
                        <td
                          key={tipo}
                          className={`px-2 py-1.5 text-sm text-center ${taller === 'Total' || tipo === 'Total' ? 'font-bold text-white' : 'text-gray-300'}`}
                        >
                          {(() => {
                            const count = pivot.data[taller]?.[tipo] ?? 0;
                            if (count === 0) return '';
                            const baseMillones = (pivot.sumBase?.[taller]?.[tipo] ?? 0) / 1000000;
                            return (
                              <span className="flex flex-col items-center">
                                <span>{count}</span>
                                <span className="text-xs text-gray-400">${baseMillones.toFixed(2)} M</span>
                              </span>
                            );
                          })()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pivot.lastUpdated && (
              <div className="px-2 py-2 text-xs text-gray-500 border-t border-gray-700">
                Última actualización: {new Date(pivot.lastUpdated).toLocaleString('es-AR')}
              </div>
            )}
          </div>

          {/* Tabla detalle a la derecha - mismo alto que el cuadro, scroll vertical */}
          <div className="flex-1 min-w-0 bg-background-card border border-gray-700 rounded-lg overflow-hidden flex flex-col" style={cuadroHeight ? { height: cuadroHeight } : undefined}>
            <div className="overflow-y-auto flex-1 min-h-0">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Taller</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">días</th>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Referencia</th>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Des.averia</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">MO</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Rep</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">TOT</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {(pivot.orders || []).map((order, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}>
                      <td className="px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap truncate max-w-[120px]" title={mapTaller(order.nombreTaller)}>{mapTaller(order.nombreTaller)}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-center">{order.dias}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap">{order.referencia}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 max-w-[180px] truncate" title={order.desAveria}>{order.desAveria || '-'}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-right">{typeof order.manoObra === 'number' ? order.manoObra.toLocaleString('es-AR') : order.manoObra}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-right">{typeof order.totalMaterial === 'number' ? order.totalMaterial.toLocaleString('es-AR') : order.totalMaterial}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-right">{typeof order.subarrenda === 'number' ? order.subarrenda.toLocaleString('es-AR') : order.subarrenda}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-right">{typeof order.base === 'number' ? order.base.toLocaleString('es-AR') : order.base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(pivot.orders || []).length > 0 && (
              <div className="px-2 py-2 text-xs text-gray-500 border-t border-gray-700 flex-shrink-0">
                {pivot.orders.length} órdenes
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ORsAbiertas;
