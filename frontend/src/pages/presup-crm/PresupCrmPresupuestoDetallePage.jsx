import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCheckCircle,
  FaPaperclip,
  FaPaperPlane,
  FaRedoAlt,
  FaTimesCircle,
  FaInbox
} from 'react-icons/fa';
import {
  getPresupCrmPresupuestoDetalle,
  getPresupCrmComentarios,
  postPresupCrmComentario,
  getPresupCrmAdjuntosList,
  postPresupCrmAdjunto,
  patchPresupCrmEstado,
  patchPresupCrmNumeroOrdenReparacion
} from '../../services/presupCrmApi';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$ ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

function pct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
}

/** Cantidad por línea (Excel / Mongo). */
function qty(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return v.toLocaleString('es-AR', { maximumFractionDigits: 4 });
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('es-AR');
  } catch {
    return '—';
  }
}

function fmtDt(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/** Misma lógica que el listado: abierto en espera → amarillo; abierto pendiente SLA → rojo. */
function estadoAbiertoBadgeClass(detalle) {
  if (!detalle || detalle.estadoNorm !== 'abierto') return 'text-slate-100 font-medium';
  if (detalle.subestadoAbierto === 'en_espera') {
    return 'inline-block px-2 py-0.5 rounded text-sm font-medium bg-yellow-500/90 text-gray-900 border border-yellow-600/80';
  }
  if (detalle.subestadoAbierto === 'pendiente') {
    return 'inline-block px-2 py-0.5 rounded text-sm font-medium bg-red-600/90 text-white border border-red-500/80';
  }
  return 'text-slate-100 font-medium';
}

export default function PresupCrmPresupuestoDetallePage() {
  const { referencia: refParam } = useParams();
  const referencia = String(refParam ?? '').trim();
  const navigate = useNavigate();

  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [comentarios, setComentarios] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [usuarioComent, setUsuarioComent] = useState(() => {
    try {
      return localStorage.getItem('presupCrmUsuarioComentario') || '';
    } catch {
      return '';
    }
  });
  const [textoComent, setTextoComent] = useState('');
  const [enviandoComent, setEnviandoComent] = useState(false);

  const [fileUpload, setFileUpload] = useState(null);
  const [usuarioAdjunto, setUsuarioAdjunto] = useState(() => {
    try {
      return localStorage.getItem('presupCrmUsuarioAdjunto') || '';
    } catch {
      return '';
    }
  });
  const [subiendoAdj, setSubiendoAdj] = useState(false);

  const [estadoAccion, setEstadoAccion] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalRechazar, setModalRechazar] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  /** Edición del N.º OR (solo estado aceptado); sincronizado con detalle. */
  const [numeroOrdenEdit, setNumeroOrdenEdit] = useState('');
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  const showToast = useCallback((t) => {
    setToast(t);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadDetalle = useCallback(async () => {
    if (!referencia) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await getPresupCrmPresupuestoDetalle(referencia);
      setDetalle(data);
    } catch (e) {
      setDetalle(null);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [referencia]);

  const loadComentarios = useCallback(async () => {
    if (!referencia) return;
    try {
      const { data } = await getPresupCrmComentarios(referencia);
      setComentarios(data.comentarios || []);
    } catch {
      setComentarios([]);
    }
  }, [referencia]);

  const loadAdjuntos = useCallback(async () => {
    if (!referencia) return;
    try {
      const { data } = await getPresupCrmAdjuntosList(referencia);
      setAdjuntos(data.archivos || []);
    } catch {
      setAdjuntos([]);
    }
  }, [referencia]);

  useEffect(() => {
    loadDetalle();
    loadComentarios();
    loadAdjuntos();
  }, [loadDetalle, loadComentarios, loadAdjuntos]);

  useEffect(() => {
    if (detalle?.estadoNorm === 'aceptado') {
      const v = detalle.numeroOrdenReparacion != null ? String(detalle.numeroOrdenReparacion) : '';
      setNumeroOrdenEdit(v.replace(/\D/g, '').slice(0, 10));
    } else {
      setNumeroOrdenEdit('');
    }
  }, [detalle?.estadoNorm, detalle?.numeroOrdenReparacion, detalle?.referencia]);

  const estadoNorm = detalle?.estadoNorm || '';
  const puedeAceptarRechazar = estadoNorm === 'abierto';
  const puedeReabrir = estadoNorm === 'aceptado' || estadoNorm === 'rechazado';

  const onEstado = async (accion) => {
    if (!referencia) return;
    setEstadoAccion(true);
    try {
      await patchPresupCrmEstado(referencia, accion);
      showToast(
        accion === 'aceptar'
          ? 'Presupuesto aceptado'
          : accion === 'rechazar'
            ? 'Presupuesto rechazado'
            : 'Presupuesto reabierto'
      );
      await loadDetalle();
      await loadComentarios();
    } catch (e) {
      showToast(e.response?.data?.error || e.message);
    } finally {
      setEstadoAccion(false);
    }
  };

  const guardarNumeroOrdenReparacion = async () => {
    if (!referencia || estadoNorm !== 'aceptado') return;
    const digits = String(numeroOrdenEdit || '').replace(/\D/g, '').slice(0, 10);
    setGuardandoOrden(true);
    try {
      await patchPresupCrmNumeroOrdenReparacion(referencia, digits);
      showToast('N.º orden de reparación guardado');
      await loadDetalle();
    } catch (e) {
      showToast(e.response?.data?.error || e.message);
    } finally {
      setGuardandoOrden(false);
    }
  };

  const confirmarRechazar = async () => {
    const t = motivoRechazo.trim();
    if (!t) {
      showToast('El comentario es obligatorio al rechazar');
      return;
    }
    setModalRechazar(false);
    setMotivoRechazo('');
    setEstadoAccion(true);
    try {
      await patchPresupCrmEstado(referencia, {
        accion: 'rechazar',
        comentario: t,
        usuario: usuarioComent.trim() || 'Usuario'
      });
      showToast('Presupuesto rechazado');
      await loadDetalle();
      await loadComentarios();
    } catch (e) {
      showToast(e.response?.data?.error || e.message);
    } finally {
      setEstadoAccion(false);
    }
  };

  const enviarComentario = async (e) => {
    e.preventDefault();
    const t = textoComent.trim();
    if (!t || !referencia) return;
    setEnviandoComent(true);
    try {
      try {
        localStorage.setItem('presupCrmUsuarioComentario', usuarioComent.trim());
      } catch {
        /* skip */
      }
      await postPresupCrmComentario(referencia, {
        usuario: usuarioComent.trim() || 'Usuario',
        texto: t
      });
      setTextoComent('');
      await loadComentarios();
      await loadDetalle();
      showToast('Comentario guardado');
    } catch (e) {
      showToast(e.response?.data?.error || e.message);
    } finally {
      setEnviandoComent(false);
    }
  };

  const subirAdjunto = async (e) => {
    e.preventDefault();
    if (!fileUpload || !referencia) return;
    setSubiendoAdj(true);
    try {
      try {
        localStorage.setItem('presupCrmUsuarioAdjunto', usuarioAdjunto.trim());
      } catch {
        /* skip */
      }
      await postPresupCrmAdjunto(referencia, fileUpload);
      setFileUpload(null);
      const el = document.getElementById('presup-adj-file');
      if (el) el.value = '';
      await loadAdjuntos();
      showToast('Archivo subido');
    } catch (e) {
      showToast(e.response?.data?.error || e.message);
    } finally {
      setSubiendoAdj(false);
    }
  };

  const descripcionSiniestro = useMemo(() => {
    const d = detalle?.descripcionSiniestro?.trim();
    if (d) return d;
    const tipo = detalle?.tipoSiniestro?.trim();
    return tipo || '—';
  }, [detalle]);

  if (!referencia) {
    return (
      <div className="p-6 text-gray-300">
        <p>Referencia inválida.</p>
        <Link to="/presup-crm/presupuestos" className="text-sky-400 underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  const cardClass =
    'rounded-xl border border-slate-700/80 bg-[#131820] p-4 md:p-5 shadow-lg';

  return (
    <div className="w-full min-w-0 max-w-none box-border px-4 sm:px-6 xl:px-10 py-6 text-gray-200">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm shadow-xl">
          {toast}
        </div>
      )}

      {modalRechazar && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-rechazar-title"
        >
          <div className="bg-[#131820] border border-slate-600 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h2 id="modal-rechazar-title" className="text-lg font-semibold text-white mb-2">
              Rechazar presupuesto
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Debe indicar un comentario (motivo). Se guardará como comentario CRM.
            </p>
            <label className="block text-xs text-slate-500 mb-1">Comentario / motivo</label>
            <textarea
              rows={4}
              autoFocus
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4 resize-y min-h-[100px]"
              placeholder="Motivo del rechazo…"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalRechazar(false);
                  setMotivoRechazo('');
                }}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRechazar}
                disabled={estadoAccion}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-medium"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/90 hover:bg-slate-600 text-sm text-white border border-slate-600"
          >
            <FaArrowLeft /> Volver
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Presupuesto {referencia}</h1>
            <p className="text-sm text-slate-400">Detalles completos del presupuesto</p>
          </div>
        </div>
        {!loading && detalle && (
          <div className="text-right text-sm max-w-md">
            <span className="text-slate-500">Estado: </span>
            <span className={estadoAbiertoBadgeClass(detalle)}>{detalle.estadoEtiqueta || '—'}</span>
            {detalle.fechaUltimaActividad && (
              <p className="text-xs text-slate-500 mt-1">
                Última actividad (creación o comentario CRM): {fmtDt(detalle.fechaUltimaActividad)}
              </p>
            )}
          </div>
        )}
      </div>

      {loading && <p className="text-slate-400">Cargando…</p>}
      {error && (
        <div className="rounded-xl border border-red-500/50 bg-red-950/40 p-4 text-red-200">
          {error}
        </div>
      )}

      {!loading && detalle && !error && (
        <>
          {/* Fila 1: Cliente | Siniestro (dos tarjetas) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className={cardClass}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Información del cliente
              </h2>
              <p className="text-sm mb-2">
                <span className="text-slate-500">Cliente:</span>{' '}
                <span className="text-white">{detalle.cliente || '—'}</span>
              </p>
              <p className="text-sm">
                <span className="text-slate-500">CTA:</span>{' '}
                <span className="text-white">{detalle.cta || '—'}</span>
              </p>
            </div>
            <div className={cardClass}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Información del siniestro
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <div className="space-y-2 min-w-0">
                  <p className="text-sm mb-2">
                    <span className="text-slate-500">Fecha de creación:</span>{' '}
                    <span className="text-white">{fmtDate(detalle.fechaCreacion)}</span>
                  </p>
                  <p className="text-sm mb-2">
                    <span className="text-slate-500">Taller:</span>{' '}
                    <span className="text-white">{detalle.taller || '—'}</span>
                  </p>
                  <p className="text-sm mb-2">
                    <span className="text-slate-500">Descripción:</span>{' '}
                    <span className="text-white">{descripcionSiniestro}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-slate-500">Ref. OR taller:</span>{' '}
                    <span className="text-white">
                      {detalle.orEstado && String(detalle.orEstado).trim() ? detalle.orEstado : 'No disponible'}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-600/80 bg-slate-900/40 lg:self-start">
                  <label className="block text-xs text-slate-500 mb-1.5" htmlFor="presup-numero-or">
                    N.º orden de reparación (CRM)
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Solo editable cuando el presupuesto está <strong className="text-slate-400">aceptado</strong>.
                    Solo números, máximo 10 caracteres.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="presup-numero-or"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={estadoNorm !== 'aceptado' || guardandoOrden}
                      value={numeroOrdenEdit}
                      onChange={(e) => setNumeroOrdenEdit(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder={estadoNorm === 'aceptado' ? 'Ej. 123456' : '—'}
                      className="flex-1 min-w-0 w-full sm:min-w-[160px] bg-slate-900/90 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled={estadoNorm !== 'aceptado' || guardandoOrden}
                      onClick={guardarNumeroOrdenReparacion}
                      className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-medium shrink-0"
                    >
                      {guardandoOrden ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fila 2: Totales (ancho completo) */}
          <div className={`${cardClass} mb-4`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-3 py-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-red-300/80">Costo total</div>
                <div className="text-lg font-semibold text-red-200 tabular-nums">
                  {money(detalle.totales?.costo)}
                </div>
              </div>
              <div className="rounded-lg bg-amber-950/40 border border-amber-800/50 px-3 py-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-amber-300/80">PVP total</div>
                <div className="text-lg font-semibold text-amber-200 tabular-nums">
                  {money(detalle.totales?.pvp)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/50 px-3 py-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-emerald-300/80">Importe total</div>
                <div className="text-lg font-semibold text-emerald-200 tabular-nums">
                  {money(detalle.totales?.importe)}
                </div>
              </div>
              <div className="rounded-lg bg-sky-950/40 border border-sky-800/50 px-3 py-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-sky-300/80">Margen</div>
                <div className="text-lg font-semibold text-sky-200 tabular-nums">
                  {detalle.totales?.margenPct != null && !Number.isNaN(detalle.totales.margenPct)
                    ? `${detalle.totales.margenPct}%`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Fila 3: Piezas */}
          <div className={`${cardClass} mb-4`}>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Líneas / piezas ({(detalle.piezas || []).length})
            </h2>
            {(detalle.piezas || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
                <FaInbox className="text-4xl text-slate-600" aria-hidden />
                <p className="text-sm">No hay líneas registradas</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-700/60 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/80 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Código / pieza</th>
                      <th className="px-3 py-2 text-left">Concepto</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap w-[4.5rem]">Cant.</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Costo</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">PVP</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Margen %</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {(detalle.piezas || []).map((p, i) => (
                      <tr key={p._id || `${p.pieza}-${i}`}>
                        <td className="px-3 py-2 text-white">{p.pieza}</td>
                        <td className="px-3 py-2 text-slate-300">{p.concepto || '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-200 tabular-nums">
                          {qty(p.cantidad)}
                        </td>
                        <td className="px-3 py-2 text-right text-red-300/90 tabular-nums">
                          {money(p.costo)}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-300/90 tabular-nums">
                          {money(p.pvp)}
                        </td>
                        <td className="px-3 py-2 text-right text-sky-300/90 tabular-nums">
                          {pct(p.margenPct)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300 tabular-nums">
                          {money(p.importe)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Fila 4: Auditoría | Estado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className={cardClass}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Información de auditoría
              </h2>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Creación</p>
                  <p className="mb-1">
                    <span className="text-slate-500">Creado por:</span>{' '}
                    <span className="text-white">{detalle.usuarioAuditoria || '—'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Fecha de creación:</span>{' '}
                    <span className="text-white">{fmtDt(detalle.fechaAuditoria)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Cambio de estado</p>
                  <p className="text-slate-500">—</p>
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Estado del presupuesto
              </h2>
              <p className="text-sm text-slate-400 mb-4">
                <span className="text-slate-500">Actual:</span>{' '}
                <span className={estadoAbiertoBadgeClass(detalle)}>{detalle.estadoEtiqueta || '—'}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!puedeAceptarRechazar || estadoAccion}
                  onClick={() => onEstado('aceptar')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-medium"
                >
                  <FaCheckCircle /> Aceptar
                </button>
                <button
                  type="button"
                  disabled={!puedeAceptarRechazar || estadoAccion}
                  onClick={() => setModalRechazar(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-medium"
                >
                  <FaTimesCircle /> Rechazar
                </button>
                <button
                  type="button"
                  disabled={!puedeReabrir || estadoAccion}
                  onClick={() => onEstado('reabrir')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-medium"
                >
                  <FaRedoAlt /> Reabrir
                </button>
              </div>
            </div>
          </div>

          {/* Fila 5: Agregar comentario | Lista comentarios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
            <div className={`${cardClass} flex flex-col`}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Agregar comentario
              </h2>
              <form onSubmit={enviarComentario} className="flex flex-col flex-1 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Usuario</label>
                  <input
                    value={usuarioComent}
                    onChange={(e) => setUsuarioComent(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-600"
                    placeholder="Ingresa tu nombre…"
                  />
                </div>
                <div className="flex-1 flex flex-col min-h-[140px]">
                  <label className="block text-xs text-slate-500 mb-1">Comentario</label>
                  <textarea
                    value={textoComent}
                    onChange={(e) => setTextoComent(e.target.value)}
                    rows={5}
                    className="w-full flex-1 min-h-[120px] bg-slate-900/90 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-600 resize-y"
                    placeholder="Escribe un comentario…"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={enviandoComent || !textoComent.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-medium"
                    title="Enviar"
                  >
                    <FaPaperPlane className="text-sm" />
                    Enviar
                  </button>
                </div>
              </form>
            </div>

            <div className={`${cardClass} flex flex-col`}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Comentarios ({comentarios.length})
              </h2>
              <div className="flex-1 min-h-[240px] max-h-[min(420px,55vh)] overflow-y-auto pr-1">
                {comentarios.length === 0 ? (
                  <p className="text-slate-500 text-sm py-6">No hay comentarios aún.</p>
                ) : (
                  <ul className="space-y-3">
                    {comentarios.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 text-sm"
                      >
                        <div className="flex justify-between gap-2 text-xs text-slate-500 mb-1">
                          <span className="text-sky-300/90 font-medium">{c.usuario || 'Usuario'}</span>
                          <span className="tabular-nums">{fmtDt(c.createdAt)}</span>
                        </div>
                        <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Fila 6: Subir adjunto | Archivos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
            <div className={`${cardClass} flex flex-col`}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Subir archivo adjunto
              </h2>
              {!detalle.directorioAdjuntos ? (
                <p className="text-amber-200/90 text-sm">
                  No hay directorio de adjuntos configurado. Defínalo en{' '}
                  <Link to="/configuracion/parametros?tab=presupuestos" className="text-white underline">
                    Parámetros de presupuestos → General
                  </Link>
                  .
                </p>
              ) : (
                <form onSubmit={subirAdjunto} className="flex flex-col flex-1 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Usuario</label>
                    <input
                      value={usuarioAdjunto}
                      onChange={(e) => setUsuarioAdjunto(e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Archivo (máx. 50MB)</label>
                    <input
                      id="presup-adj-file"
                      type="file"
                      onChange={(e) => setFileUpload(e.target.files?.[0] || null)}
                      className="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={subiendoAdj || !fileUpload}
                    className="w-full mt-auto py-3 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-semibold"
                  >
                    Subir archivo
                  </button>
                </form>
              )}
            </div>

            <div className={`${cardClass} flex flex-col`}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <FaPaperclip className="text-slate-500" aria-hidden />
                Archivos adjuntos ({adjuntos.length})
              </h2>
              <div className="flex-1 min-h-[200px] flex flex-col">
                {adjuntos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 py-10 text-center text-slate-500 text-sm gap-3">
                    <FaPaperclip className="text-4xl text-slate-600 opacity-80" aria-hidden />
                    <p>No hay archivos adjuntos. Sube el primer archivo usando el formulario.</p>
                  </div>
                ) : (
                  <ul className="space-y-2 overflow-y-auto max-h-[min(360px,50vh)] pr-1">
                    {adjuntos.map((a) => (
                      <li
                        key={a.nombre}
                        className="flex justify-between gap-2 text-sm border border-slate-700/50 rounded-lg px-3 py-2.5 bg-slate-900/30"
                      >
                        <span className="text-slate-200 truncate">{a.nombre}</span>
                        <span className="text-slate-500 tabular-nums whitespace-nowrap text-xs">
                          {a.size != null ? `${(a.size / 1024).toFixed(1)} KB` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
