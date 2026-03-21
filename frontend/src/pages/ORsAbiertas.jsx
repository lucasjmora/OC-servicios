import React, { useEffect, useState, useRef } from 'react';
import PageHeader from '../components/PageHeader';
import { FaFileInvoice, FaExclamationTriangle, FaChevronDown, FaChevronUp, FaFileExport } from 'react-icons/fa';
import { getORsPivot, getMappings } from '../services/api';

const ORsAbiertas = () => {
  const [pivot, setPivot] = useState(null);
  const [tallerMappings, setTallerMappings] = useState({});
  const [filterTaller, setFilterTaller] = useState([]);
  const [filterTipo, setFilterTipo] = useState([]);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [tallerDropdownOpen, setTallerDropdownOpen] = useState(false);
  const [tipoDropdownOpen, setTipoDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [cuadroHeight, setCuadroHeight] = useState(null);
  const cuadroRef = useRef(null);

  const mapTaller = (nombre) => {
    if (!nombre || typeof nombre !== 'string') return nombre;
    const key = String(nombre).trim();
    let mapped = tallerMappings[key]?.trim();
    if (mapped) return mapped;
    // Variantes: Excel puede tener "GRANVILLE PEUGEOT" / " - " y mapeo ".GRANVILLE-PEUGEOT"
    const conPunto = key.startsWith('.') ? key : '.' + key;
    const sinPunto = key.startsWith('.') ? key.slice(1) : key;
    const conGuion = key.replace(/\s+/g, '-').replace(/\s*-\s*/g, '-');
    const conEspacio = key.replace(/-/g, ' ');
    const conEspacioGuion = key.replace(/\s*-\s*/g, ' ');
    const variantes = [
      conPunto, sinPunto, conGuion, conEspacio, conEspacioGuion,
      conPunto.replace(/\s+/g, '-'), sinPunto.replace(/-/g, ' ')
    ];
    for (const v of variantes) {
      mapped = tallerMappings[v]?.trim();
      if (mapped) return mapped;
    }
    return nombre;
  };

  const talleresOpciones = (pivot?.talleres || []).filter(t => t !== 'Total');
  const tiposOpciones = (pivot?.tiposOrden || []).filter(t => t !== 'Total');

  const getSortValue = (order, key) => {
    const v = order[key];
    if (v === '-' || v === null || v === undefined || v === '') return -Infinity;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? -Infinity : n;
  };

  let filteredOrders = (pivot?.orders || []).filter(order => {
    if (filterTaller.length > 0 && !filterTaller.includes(mapTaller(order.nombreTaller))) return false;
    const tipoVal = order.tipo || '-';
    if (filterTipo.length > 0 && !filterTipo.includes(tipoVal)) return false;
    return true;
  });

  if (sortBy) {
    const keyMap = { dias: 'dias', MO: 'manoObra', Rep: 'totalMaterial', TOT: 'subarrenda', Total: 'base' };
    const key = keyMap[sortBy];
    if (key) {
      const mult = sortDir === 'desc' ? 1 : -1;
      filteredOrders = [...filteredOrders].sort((a, b) => {
        const va = getSortValue(a, key);
        const vb = getSortValue(b, key);
        return mult * (vb - va);
      });
    }
  }

  const filtersActive = filterTaller.length > 0 || filterTipo.length > 0;

  const handleSort = (col) => {
    if (sortBy !== col) {
      setSortBy(col);
      setSortDir('desc');
    } else {
      if (sortDir === 'desc') {
        setSortDir('asc');
      } else {
        setSortBy(null);
        setSortDir('desc');
      }
    }
  };

  useEffect(() => {
    loadPivot();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tallerDropdownOpen && !e.target.closest('.ors-taller-dropdown')) setTallerDropdownOpen(false);
      if (tipoDropdownOpen && !e.target.closest('.ors-tipo-dropdown')) setTipoDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tallerDropdownOpen, tipoDropdownOpen]);

  const hasData = pivot && pivot.talleres?.length > 0 && pivot.tiposOrden?.length > 0;

  const handleTallerFilterChange = (taller, checked) => {
    setFilterTaller(prev => checked ? [...prev, taller] : prev.filter(t => t !== taller));
  };
  const handleTipoFilterChange = (tipo, checked) => {
    setFilterTipo(prev => checked ? [...prev, tipo] : prev.filter(t => t !== tipo));
  };
  const handleClearFilters = () => {
    setFilterTaller([]);
    setFilterTipo([]);
  };

  const formatCsvValue = (val) => {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'number') return val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(val).replace(/"/g, '""');
  };

  const handleExportCsv = () => {
    const headers = ['Taller', 'Días', 'Referencia', 'Tipo', 'Des.averia', 'MO', 'Rep', 'TOT', 'Total'];
    const quote = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filteredOrders.map(order => [
      quote(mapTaller(order.nombreTaller)),
      quote(order.dias),
      quote(order.referencia),
      quote(order.tipo || '-'),
      quote(order.desAveria || '-'),
      quote(typeof order.manoObra === 'number' ? formatCsvValue(order.manoObra) : order.manoObra),
      quote(typeof order.totalMaterial === 'number' ? formatCsvValue(order.totalMaterial) : order.totalMaterial),
      quote(typeof order.subarrenda === 'number' ? formatCsvValue(order.subarrenda) : order.subarrenda),
      quote(typeof order.base === 'number' ? formatCsvValue(order.base) : order.base)
    ]);
    const csvContent = [
      headers.map(quote).join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ors-abiertas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
                      <td className="w-32 px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap sticky left-0 bg-inherit z-10 truncate" title={taller}>
                        {taller}
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
            {/* Filtros sobre la tabla */}
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
              <span className="text-xs font-medium text-gray-400">Filtros:</span>
              <div className="relative ors-taller-dropdown">
                <button
                  type="button"
                  onClick={() => setTallerDropdownOpen(!tallerDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-white"
                >
                  <span>
                    {filterTaller.length === 0 ? 'Taller' : `${filterTaller.length} taller${filterTaller.length > 1 ? 'es' : ''}`}
                  </span>
                  {tallerDropdownOpen ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                </button>
                {tallerDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-48 max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded shadow-lg py-1">
                    {talleresOpciones.map(t => (
                      <label key={t} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterTaller.includes(t)}
                          onChange={(e) => handleTallerFilterChange(t, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded"
                        />
                        <span className="text-sm text-white truncate" title={t}>{t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative ors-tipo-dropdown">
                <button
                  type="button"
                  onClick={() => setTipoDropdownOpen(!tipoDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-white"
                >
                  <span>
                    {filterTipo.length === 0 ? 'Tipo' : `${filterTipo.length} tipo${filterTipo.length > 1 ? 's' : ''}`}
                  </span>
                  {tipoDropdownOpen ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                </button>
                {tipoDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-48 max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded shadow-lg py-1">
                    {tiposOpciones.map(t => (
                      <label key={t} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterTipo.includes(t)}
                          onChange={(e) => handleTipoFilterChange(t, e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded"
                        />
                        <span className="text-sm text-white truncate">{t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-white"
                title="Exportar selección a CSV"
              >
                <FaFileExport className="text-xs" />
                <span>Exportar CSV</span>
              </button>
              {(filterTaller.length > 0 || filterTipo.length > 0) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Taller</th>
                    <th
                      onClick={() => handleSort('dias')}
                      className="px-2 py-1.5 text-center text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-700 select-none"
                      title={sortBy === 'dias' ? (sortDir === 'desc' ? 'Clic para orden ascendente' : 'Clic para quitar orden') : 'Clic para ordenar de mayor a menor'}
                    >
                      días{sortBy === 'dias' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </th>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Referencia</th>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Tipo</th>
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap">Des.averia</th>
                    <th
                      onClick={() => handleSort('MO')}
                      className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-700 select-none"
                      title={sortBy === 'MO' ? (sortDir === 'desc' ? 'Clic para orden ascendente' : 'Clic para quitar orden') : 'Clic para ordenar de mayor a menor'}
                    >
                      MO{sortBy === 'MO' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </th>
                    <th
                      onClick={() => handleSort('Rep')}
                      className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-700 select-none"
                      title={sortBy === 'Rep' ? (sortDir === 'desc' ? 'Clic para orden ascendente' : 'Clic para quitar orden') : 'Clic para ordenar de mayor a menor'}
                    >
                      Rep{sortBy === 'Rep' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </th>
                    <th
                      onClick={() => handleSort('TOT')}
                      className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-700 select-none"
                      title={sortBy === 'TOT' ? (sortDir === 'desc' ? 'Clic para orden ascendente' : 'Clic para quitar orden') : 'Clic para ordenar de mayor a menor'}
                    >
                      TOT{sortBy === 'TOT' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </th>
                    <th
                      onClick={() => handleSort('Total')}
                      className="px-2 py-1.5 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-700 select-none"
                      title={sortBy === 'Total' ? (sortDir === 'desc' ? 'Clic para orden ascendente' : 'Clic para quitar orden') : 'Clic para ordenar de mayor a menor'}
                    >
                      Total{sortBy === 'Total' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredOrders.map((order, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}>
                      <td className="px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap truncate max-w-[120px]" title={mapTaller(order.nombreTaller)}>{mapTaller(order.nombreTaller)}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 text-center">{order.dias}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap">{order.referencia}</td>
                      <td className="px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap">{order.tipo || '-'}</td>
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
            <div className="px-2 py-2 text-xs text-gray-500 border-t border-gray-700 flex-shrink-0">
              {filteredOrders.length} órdenes{filtersActive ? ` (de ${(pivot.orders || []).length})` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ORsAbiertas;
