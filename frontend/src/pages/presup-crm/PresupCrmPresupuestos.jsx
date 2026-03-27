import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import PresupAccionesMenu from '../../components/presup-crm/PresupAccionesMenu';
import { getPresupCrmPresupuestos, getPresupCrmPresupuestosFiltros } from '../../services/presupCrmApi';
import { FaCheckCircle, FaTimesCircle, FaCircle } from 'react-icons/fa';

const estadoClass = (estado) => {
  const e = String(estado || '').toLowerCase();
  if (e.includes('acept')) return 'bg-green-600/30 text-green-100 border border-green-500/50';
  if (e.includes('rechaz')) return 'bg-red-600/30 text-red-100 border border-red-500/50';
  if (e.includes('abiert')) return 'bg-sky-600/25 text-sky-100 border border-sky-500/40';
  return 'bg-white/10 text-white border border-white/40';
};

/** Abierto + SLA: en espera → amarillo; pendiente (plazo) → rojo. */
const estadoBadgeClass = (row) => {
  const est = String(row?.estado || '').toLowerCase();
  if (est === 'abierto' && row?.subestadoAbierto === 'en_espera') {
    return 'bg-yellow-500/90 text-gray-900 border border-yellow-600/80 font-medium';
  }
  if (est === 'abierto' && row?.subestadoAbierto === 'pendiente') {
    return 'bg-red-600/90 text-white border border-red-500/80 font-medium';
  }
  return estadoClass(row?.estado);
};

/** Tamaño único para columna OR (punto + iconos FA). */
const OR_ICON_SIZE = 'h-3.5 w-3.5 shrink-0';

/** Punto neutro (mismo aspecto para abierto, rechazado, etc.). */
function OrDotNeutral({ title = 'OR' }) {
  return (
    <span
      className={`inline-block ${OR_ICON_SIZE} rounded-full bg-gray-500/90`}
      title={title}
      role="img"
      aria-label={title}
    />
  );
}

function OrIcon({ orEstado, numeroOrdenReparacion, estadoPresupuesto }) {
  const estCanon = String(estadoPresupuesto || '').toLowerCase();

  if (estCanon !== 'aceptado') {
    return <OrDotNeutral title="OR" />;
  }

  const orNum = String(numeroOrdenReparacion ?? '').trim();
  if (orNum) {
    return (
      <FaCheckCircle
        className={`${OR_ICON_SIZE} text-green-500`}
        title={`N.º orden de reparación: ${orNum}`}
        aria-label={`Orden de reparación ${orNum}`}
      />
    );
  }
  const raw = String(orEstado || '').trim();
  const t = raw.toLowerCase();
  if (!t) {
    return <FaCircle className={`${OR_ICON_SIZE} text-gray-500`} title="OR" />;
  }
  if (/cerrad|factur|ok|complet|entregad|listo|^(sí|si|1|true)$/.test(t)) {
    return <FaCheckCircle className={`${OR_ICON_SIZE} text-green-500`} title={raw} />;
  }
  if (/no|abiert|pend|neg|rechaz|^0$|false/.test(t)) {
    return <FaTimesCircle className={`${OR_ICON_SIZE} text-red-500`} title={raw} />;
  }
  return <FaCircle className={`${OR_ICON_SIZE} text-gray-400`} title={raw} />;
}

function SelectTodos({ label, value, onChange, options, disabled }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm disabled:opacity-45 disabled:cursor-not-allowed"
      >
        <option value="">Todos</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Solo estado «abierto» habilita el filtro de subestado (SLA). */
function isEstadoSeleccionAbierto(estadoCanonico) {
  return String(estadoCanonico || '').toLowerCase() === 'abierto';
}

/** Estados canónicos CRM (mismo criterio que `estadoNorm` en backend). */
const ESTADO_CANONICO_OPCIONES = [
  { value: 'abierto', label: 'Abierto' },
  { value: 'aceptado', label: 'Aceptado' },
  { value: 'rechazado', label: 'Rechazado' }
];

const SUBESTADO_ABIERTO_OPCIONES = [
  { value: 'en_espera', label: 'En espera' },
  { value: 'pendiente', label: 'Pendiente' }
];

export default function PresupCrmPresupuestos() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    search: '',
    fechaDesde: '',
    fechaHasta: '',
    estado: '',
    /** Solo aplica con estado «abierto»: en_espera | pendiente (CRM/SLA). */
    subestado: '',
    taller: '',
    page: 1,
    limit: 50
  });
  const [opciones, setOpciones] = useState({
    taller: []
  });
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingOpciones, setLoadingOpciones] = useState(true);
  const [error, setError] = useState(null);

  const openDetalle = useCallback(
    (ref) => {
      navigate(`/presup-crm/presupuesto/${encodeURIComponent(String(ref))}`);
    },
    [navigate]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingOpciones(true);
        const { data: o } = await getPresupCrmPresupuestosFiltros();
        if (!cancelled) {
          setOpciones({
            taller: o.taller || []
          });
        }
      } catch {
        if (!cancelled) {
          setOpciones({ taller: [] });
        }
      } finally {
        if (!cancelled) setLoadingOpciones(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const abierto = isEstadoSeleccionAbierto(filters.estado);
      const { data: res } = await getPresupCrmPresupuestos({
        search: filters.search,
        fechaDesde: filters.fechaDesde,
        fechaHasta: filters.fechaHasta,
        estado: filters.estado,
        taller: filters.taller,
        page: filters.page,
        limit: filters.limit,
        /** Filtro Excel de subestado ya no se envía; solo SLA cuando estado es abierto. */
        subestado: '',
        subestadoAbierto: abierto && filters.subestado ? filters.subestado : ''
      });
      setData(res);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: k === 'page' ? v : 1 }));

  const onEstadoChange = (v) => {
    setFilters((f) => ({
      ...f,
      estado: v,
      /** Si deja de ser abierto, limpiar subestado CRM. */
      subestado: isEstadoSeleccionAbierto(v) ? f.subestado : '',
      page: 1
    }));
  };

  const limpiar = () =>
    setFilters({
      search: '',
      fechaDesde: '',
      fechaHasta: '',
      estado: '',
      subestado: '',
      taller: '',
      page: 1,
      limit: 50
    });

  const subestadoHabilitado = isEstadoSeleccionAbierto(filters.estado);

  return (
    <div className="w-full min-w-0 max-w-none box-border px-4 sm:px-6 xl:px-10 py-6">
      <PageHeader
        title="Presupuestos"
        subtitle="Gestión y seguimiento de presupuestos automotores"
        action={
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 bg-primary rounded-lg text-white text-sm hover:opacity-90"
          >
            Actualizar
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">{error}</div>
      )}

      <div className="w-full bg-background-card border border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-medium">Filtros</h3>
          <button type="button" className="text-sm text-primary hover:underline" onClick={limpiar}>
            Limpiar filtros
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Búsqueda</label>
            <input
              placeholder="Referencia, cliente..."
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha desde</label>
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={(e) => set('fechaDesde', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha hasta</label>
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={(e) => set('fechaHasta', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <SelectTodos
            label="Taller"
            value={filters.taller}
            onChange={(v) => set('taller', v)}
            options={opciones.taller}
            disabled={loadingOpciones}
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select
              value={filters.estado}
              onChange={(e) => onEstadoChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="">Todos</option>
              {ESTADO_CANONICO_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Subestado</label>
            <select
              value={subestadoHabilitado ? filters.subestado : ''}
              disabled={!subestadoHabilitado || loadingOpciones}
              onChange={(e) => set('subestado', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <option value="">Todos</option>
              {SUBESTADO_ABIERTO_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1 leading-snug">
              Solo aplica si el estado es <span className="text-gray-400">abierto</span> (en espera / pendiente
              SLA).
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Por página</label>
            <select
              value={filters.limit}
              onChange={(e) => set('limit', Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      <div className="w-full max-w-none overflow-x-auto bg-background-card border border-gray-700 rounded-lg">
        <table className="w-full min-w-full text-sm text-left text-gray-300 table-fixed">
          <colgroup>
            <col span={9} />
            <col style={{ width: '3rem' }} />
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead className="bg-gray-800 text-gray-200">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">Referencia</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2 whitespace-nowrap">Fecha</th>
              <th className="px-3 py-2 min-w-[140px]">Descripción</th>
              <th className="px-3 py-2 whitespace-nowrap">Taller</th>
              <th className="px-3 py-2 whitespace-nowrap">Estado</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Importe</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Margen %</th>
              <th className="px-3 py-2 whitespace-nowrap">Usuario</th>
              <th className="px-2 py-2 text-center whitespace-nowrap w-12 min-w-[3rem]">OR</th>
              <th className="px-2 py-2 text-center whitespace-nowrap w-[120px] min-w-[120px]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : (
              data.items?.map((row) => (
                <tr key={row.referencia} className="border-t border-gray-700 hover:bg-gray-800/50">
                  <td className="px-3 py-2 text-primary font-medium whitespace-nowrap">{row.referencia}</td>
                  <td className="px-3 py-2 max-w-[200px]">{row.cliente}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.fecha ? new Date(row.fecha).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate" title={row.descripcion}>
                    {row.descripcion || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.taller ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs inline-block whitespace-nowrap w-fit max-w-full ${estadoBadgeClass(row)}`}
                      title={row.estadoLabel || row.estado}
                    >
                      {row.estadoLabel || row.estado}
                      {row.estado === 'abierto' && row.subestado
                        ? ` · ${row.subestado}`
                        : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-green-400 whitespace-nowrap">
                    {row.importe != null
                      ? `$ ${Number(row.importe).toLocaleString('es-AR', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        })}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-blue-400 whitespace-nowrap">
                    {row.margenPct != null && !Number.isNaN(row.margenPct) ? `${row.margenPct}%` : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.usuario || '—'}</td>
                  <td className="px-2 py-2 align-middle w-12 min-w-[3rem]">
                    <div className="flex h-full min-h-[1.75rem] w-full items-center justify-center">
                      <OrIcon
                        orEstado={row.orEstado}
                        numeroOrdenReparacion={row.numeroOrdenReparacion}
                        estadoPresupuesto={row.estado}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center align-middle whitespace-nowrap w-[120px] min-w-[120px]">
                    <div className="flex w-full items-center justify-center">
                    <PresupAccionesMenu
                      referencia={row.referencia}
                      comentariosCount={row.comentariosCount}
                      onVerDetalle={openDetalle}
                    />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && data.total === 0 && (
        <p className="text-center text-gray-500 mt-4">No hay presupuestos para los filtros seleccionados.</p>
      )}

      {data.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() => set('page', filters.page - 1)}
            className="px-3 py-1 rounded bg-gray-700 text-white disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-gray-400 py-1">
            Página {filters.page} de {data.pages} ({data.total} registros)
          </span>
          <button
            type="button"
            disabled={filters.page >= data.pages}
            onClick={() => set('page', filters.page + 1)}
            className="px-3 py-1 rounded bg-gray-700 text-white disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

    </div>
  );
}
