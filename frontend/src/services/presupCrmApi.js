/**
 * Cliente API del módulo Presup CRM (prefijo /api/presup-crm)
 */
import api from './api.js';

/** El import lee Excel completo y escribe en Mongo; suele superar el timeout global de 30s. */
const IMPORT_TIMEOUT_MS = 600000; // 10 min (misma idea que executeManualImport en api.js)
/** Probar Excel puede leer hojas muy grandes. */
const TEST_EXCEL_TIMEOUT_MS = 120000; // 2 min
/** Stats dashboard (agregación Mongo) — mismo orden de magnitud que otras stats. */
const STATS_TIMEOUT_MS = 30000;

export const getPresupCrmConfig = () => api.get('/presup-crm/config');

export const updatePresupCrmConfig = (presupCrm) => api.put('/presup-crm/config', { presupCrm });

export const testPresupCrmMongo = (presupCrm) => api.post('/presup-crm/test-mongo', { presupCrm });

export const testPresupCrmExcel = (presupCrm) =>
  api.post('/presup-crm/test-excel', { presupCrm }, { timeout: TEST_EXCEL_TIMEOUT_MS });

export const importPresupCrmExcel = (body = {}) =>
  api.post('/presup-crm/import', body, { timeout: IMPORT_TIMEOUT_MS });

export const getPresupCrmDashboard = (params) => api.get('/presup-crm/dashboard', { params });

/** Abierto + subestado SLA pendiente por empresa (FC/GV/PW) — dashboard */
export const getPresupCrmSlaPendienteEmpresas = () =>
  api.get('/presup-crm/stats/sla-pendiente-empresas', { timeout: STATS_TIMEOUT_MS });

export const getPresupCrmPresupuestos = (params) => api.get('/presup-crm/presupuestos', { params });

export const getPresupCrmPresupuestosFiltros = () => api.get('/presup-crm/presupuestos/filtros');

/** Detalle por referencia (líneas Mongo + ruta adjuntos) — menú Acciones */
export const getPresupCrmPresupuestoDetalle = (referencia) =>
  api.get(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}`);

/** Comentarios CRM (colección presup_crm_comentarios) */
export const getPresupCrmComentarios = (referencia) =>
  api.get(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/comentarios`);

export const postPresupCrmComentario = (referencia, body) =>
  api.post(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/comentarios`, body);

/** Listado de archivos en carpeta de adjuntos (servidor) */
export const getPresupCrmAdjuntosList = (referencia) =>
  api.get(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/adjuntos`);

/** Subir archivo (campo multipart `file`) */
export const postPresupCrmAdjunto = (referencia, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/adjuntos`, fd);
};

/**
 * Transiciones: aceptar | rechazar | reabrir
 * @param {object} [payload] `{ accion, numeroOrdenReparacion?, comentario?, motivo?, usuario? }` o string solo acción (retrocompat)
 */
export const patchPresupCrmEstado = (referencia, accionOrPayload) => {
  const body =
    typeof accionOrPayload === 'string'
      ? { accion: accionOrPayload }
      : { ...accionOrPayload };
  return api.patch(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/estado`, body);
};

/** Solo con presupuesto aceptado. `numeroOrdenReparacion` string numérica ≤10 o vacío para borrar. */
export const patchPresupCrmNumeroOrdenReparacion = (referencia, numeroOrdenReparacion) =>
  api.patch(`/presup-crm/presupuestos/${encodeURIComponent(String(referencia))}/estado`, {
    accion: 'guardarOrdenReparacion',
    numeroOrdenReparacion
  });

export const getPresupCrmTalleres = () => api.get('/presup-crm/talleres');

export const updatePresupCrmTalleres = (talleres) => api.put('/presup-crm/talleres', { talleres });

export const getPresupCrmAceites = () => api.get('/presup-crm/aceites');

export const updatePresupCrmAceites = (aceites) => api.put('/presup-crm/aceites', { aceites });

export const getPresupCrmGeneral = () => api.get('/presup-crm/general');

export const updatePresupCrmGeneral = (general) => api.put('/presup-crm/general', { general });

export const presupCrmHealth = () => api.get('/presup-crm/health');
