import { useEffect, useState, useCallback, useMemo } from 'react';
import { getPresupCrmDashboard } from '../../services/presupCrmApi';
import {
  FaSync,
  FaPhoneSlash,
  FaDollarSign,
  FaClock,
  FaChartBar,
  FaInfoCircle,
  FaCheck,
  FaTimes
} from 'react-icons/fa';

/** Importe principal tipo OC Presup CRM: ($ 0) o millones (sin redondear a entero: coincide mejor con Mongo) */
function formatMainMoney(n) {
  if (n === undefined || n === null || Number.isNaN(n) || n === 0) return '$ 0';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$ ${(n / 1e6).toFixed(1)}M`;
  return `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatCellMoney(n) {
  if (n === undefined || n === null || Number.isNaN(n) || n === 0) return '$ 0';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$ ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$ ${(n / 1e3).toFixed(1)}K`;
  return `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Evita desfase UTC: parsea yyyy-mm-dd como fecha local */
function parseYmdLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatLocalYmd(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Días entre dos fechas yyyy-mm-dd (calendario local) */
function daysBetween(startStr, endStr) {
  const a = parseYmdLocal(startStr);
  const b = parseYmdLocal(endStr);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function formatFechaLarga(ymdStr) {
  if (!ymdStr) return '';
  const d = parseYmdLocal(ymdStr);
  if (!d || Number.isNaN(d.getTime())) return String(ymdStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const THEME = {
  /** Paridad OC Presup: badge Filtrado naranja, título blanco, números verdes */
  pendiente: {
    cardBorder: 'border-blue-900/50',
    cardBg: 'from-[#0c1220] via-[#0a0f18] to-background-card',
    icon: FaInfoCircle,
    iconClass: 'text-sky-400',
    titleClass: 'text-white',
    badgeWrap: 'bg-blue-600 text-white border-blue-500 shadow-inner',
    filtrado: 'bg-amber-500/90 text-white border-amber-400 shadow-sm font-semibold',
    numberClass: 'text-emerald-400',
    cellLabel: 'text-gray-100',
    cellText: 'text-emerald-400'
  },
  aceptado: {
    cardBorder: 'border-emerald-600/40',
    cardBg: 'from-emerald-950/35 to-background-card',
    icon: FaDollarSign,
    iconClass: 'text-emerald-400',
    titleClass: 'text-white',
    badgeWrap: 'bg-emerald-600 text-white border-emerald-500',
    filtrado: 'bg-emerald-600/85 text-white border-emerald-400 font-semibold',
    numberClass: 'text-emerald-400',
    cellLabel: 'text-gray-100',
    cellText: 'text-emerald-400'
  },
  rechazado: {
    cardBorder: 'border-rose-600/45',
    cardBg: 'from-rose-950/35 to-background-card',
    icon: FaTimes,
    iconClass: 'text-rose-400',
    titleClass: 'text-white',
    badgeWrap: 'bg-rose-600 text-white border-rose-500',
    filtrado: 'bg-rose-600/85 text-white border-rose-400 font-semibold',
    numberClass: 'text-rose-400',
    cellLabel: 'text-gray-100',
    cellText: 'text-rose-400'
  }
};

/** Matriz 16 talleres: 2 filas × 8 columnas como OC Presup (etiqueta blanca + importes en color de tema) */
function Matriz16Talleres({ celdas, themeKey }) {
  const t = THEME[themeKey] || THEME.pendiente;
  const labelCls = t.cellLabel || 'text-gray-100';
  if (!Array.isArray(celdas) || celdas.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center mt-4 py-2 border-t border-gray-700/80">
        Sin desglose por taller
      </p>
    );
  }
  return (
    <div className="mt-5 pt-5 border-t border-gray-700/70">
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
        {celdas.map((c) => (
          <div
            key={`${c.index}-${c.taller}`}
            className="rounded-lg bg-[#0f141c]/95 border border-gray-700/80 px-1.5 py-2 text-center min-h-[92px] flex flex-col justify-center shadow-inner"
          >
            <div
              className={`text-[11px] font-medium leading-snug truncate ${labelCls}`}
              title={c.taller}
            >
              {c.taller}:
            </div>
            <div className={`text-sm font-bold tabular-nums ${t.cellText}`}>{c.count ?? 0}</div>
            <div className={`text-[11px] tabular-nums ${t.cellText}`}>({formatCellMoney(c.importe)})</div>
            <div className="text-[10px] text-gray-500 mt-1">#{c.index}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-center text-gray-500 mt-3 max-w-3xl mx-auto leading-relaxed">
        Misma grilla que OC Presup CRM (16 talleres: GV PE … Sin taller). Catálogo:{' '}
        <strong className="text-gray-400">Configuración → Mapeo de Campos → Talleres presup</strong>.
      </p>
    </div>
  );
}

function TarjetaEstado({ titulo, subtitulo, themeKey, total, importe, celdas, children }) {
  const t = THEME[themeKey];
  const Icon = t.icon;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${t.cardBorder} bg-gradient-to-b ${t.cardBg} p-6 shadow-lg`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Icon className={`text-xl flex-shrink-0 ${t.iconClass}`} aria-hidden />
          <div>
            <h3 className={`text-lg font-semibold ${t.titleClass}`}>{titulo}</h3>
            {subtitulo ? (
              <p className="text-xs text-gray-400 mt-1 max-w-xl leading-relaxed">{subtitulo}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs ${t.badgeWrap}`}
            title="Estado"
          >
            {themeKey === 'rechazado' ? <FaTimes className="text-sm" /> : <FaCheck className="text-sm" />}
          </span>
        </div>
        <span
          className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap ${t.filtrado}`}
        >
          Filtrado
        </span>
      </div>
      <div className="text-center flex flex-wrap items-baseline justify-center gap-2 sm:gap-3 mb-2">
        <span className={`text-5xl sm:text-6xl font-bold tabular-nums leading-none ${t.numberClass}`}>
          {total ?? 0}
        </span>
        <span className={`text-2xl sm:text-3xl font-semibold tabular-nums ${t.numberClass}`}>
          ({formatMainMoney(importe)})
        </span>
      </div>
      {children}
      <Matriz16Talleres celdas={celdas} themeKey={themeKey} />
    </div>
  );
}

function iconoMotivo(motivo) {
  const m = String(motivo || '').toLowerCase();
  if (m.includes('no responde') || m.includes('respuesta')) return FaPhoneSlash;
  if (m.includes('precio') || m.includes('elevado')) return FaDollarSign;
  if (m.includes('demora') || m.includes('tiempo')) return FaClock;
  return FaChartBar;
}

function MotivosRechazo({ motivos }) {
  const entries = Object.entries(motivos || {}).filter(([, c]) => c > 0);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-4 justify-center items-center mt-4 pt-4 border-t border-red-900/30">
      {entries.map(([m, c]) => {
        const Icon = iconoMotivo(m);
        return (
          <div
            key={m}
            className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900/50 px-3 py-1.5 rounded-full border border-gray-600/60"
          >
            <Icon className="text-red-300" />
            <span>{m}</span>
            <strong className="text-white tabular-nums">{c}</strong>
          </div>
        );
      })}
    </div>
  );
}

export default function PresupCrmDashboardPanel({ compact = false }) {
  const today = new Date();
  const defDesde = new Date(today);
  defDesde.setDate(defDesde.getDate() - 45);
  const [fechaDesde, setFechaDesde] = useState(() => formatLocalYmd(defDesde));
  const [fechaHasta, setFechaHasta] = useState(() => formatLocalYmd(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const diasRango = useMemo(() => daysBetween(fechaDesde, fechaHasta), [fechaDesde, fechaHasta]);
  const badgeDias = diasRango >= 40 && diasRango <= 50 ? 'Últimos 45 días' : `${diasRango} días`;

  const aplicarUltimos45Dias = useCallback(() => {
    const t = new Date();
    const d = new Date(t);
    d.setDate(d.getDate() - 45);
    setFechaDesde(formatLocalYmd(d));
    setFechaHasta(formatLocalYmd(t));
  }, []);

  const aplicarMesActual = useCallback(() => {
    const t = new Date();
    const d = new Date(t.getFullYear(), t.getMonth(), 1);
    setFechaDesde(formatLocalYmd(d));
    setFechaHasta(formatLocalYmd(t));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: res } = await getPresupCrmDashboard({
        fechaDesde,
        fechaHasta
      });
      setData(res);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    load();
  }, [load]);

  const ultimaActualizacionStr = data?.ultimaActualizacion
    ? new Date(data.ultimaActualizacion).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  return (
    <div className={compact ? '' : 'space-y-6'}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-gray-400 text-sm mt-1">Resumen de presupuestos y estadísticas del sistema</p>
        </div>
        {ultimaActualizacionStr && (
          <p className="text-sm text-gray-400 sm:text-right whitespace-nowrap">
            Última actualización{' '}
            <span className="text-gray-200 font-medium">{ultimaActualizacionStr}</span>
          </p>
        )}
      </div>

      <div className="bg-background-card border border-gray-700 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-white">Filtros por Fecha</h3>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/25 text-primary border border-primary/40">
            {badgeDias}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fecha desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm min-w-[160px]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm min-w-[160px]"
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              <FaSync className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <button
              type="button"
              onClick={aplicarUltimos45Dias}
              className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline font-medium"
            >
              Últimos 45 días
            </button>
            <button
              type="button"
              onClick={aplicarMesActual}
              className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline font-medium"
            >
              Mes actual
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-4 pt-4 border-t border-gray-700/80">
          <span className="text-gray-500">Periodo seleccionado:</span>{' '}
          <span className="text-gray-200">
            Desde {formatFechaLarga(fechaDesde)} — Hasta {formatFechaLarga(fechaHasta)}
          </span>
        </p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-200 text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <FaSync className="animate-spin mr-3 text-xl text-primary" />
          Cargando estadísticas de presupuestos…
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <TarjetaEstado
            titulo="Presupuestos abiertos"
            subtitulo={
              data.pendientes?.total != null
                ? `Desglose SLA: en espera ${data.pendientes.enEspera ?? 0} · pendiente (por plazo) ${data.pendientes.slaPendiente ?? 0}`
                : null
            }
            themeKey="pendiente"
            total={data.pendientes?.total}
            importe={data.pendientes?.importe}
            celdas={data.pendientes?.porTallerMatriz}
          />

          <TarjetaEstado
            titulo="Presupuestos Aceptados"
            themeKey="aceptado"
            total={data.aceptados?.total}
            importe={data.aceptados?.importe}
            celdas={data.aceptados?.porTallerMatriz}
          />

          <TarjetaEstado
            titulo="Presupuestos Rechazados"
            themeKey="rechazado"
            total={data.rechazados?.total}
            importe={data.rechazados?.importe}
            celdas={data.rechazados?.porTallerMatriz}
          >
            <MotivosRechazo motivos={data.rechazados?.motivos} />
          </TarjetaEstado>
        </div>
      )}
    </div>
  );
}
