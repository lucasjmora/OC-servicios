/**
 * Servicio Presup CRM: conexión dedicada, importación Excel y agregaciones.
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';
import xlsx from 'xlsx';
import Configuracion from '../models/Configuracion.js';
import configStorageService from './configStorageService.js';
import { mergePresupCrmWithEnv } from './envConfig.js';

let cachedConn = null;
let cachedUri = null;

export function resetPresupConnection() {
  if (cachedConn) {
    cachedConn.close().catch(() => {});
    cachedConn = null;
    cachedUri = null;
  }
}

export async function getPresupConnection(presupCfg) {
  const uri = presupCfg?.mongodb?.uri?.trim();
  if (!uri) {
    throw new Error('Configure la URI de MongoDB en Parámetros de presupuestos');
  }
  if (cachedConn && cachedUri === uri && cachedConn.readyState === 1) {
    return cachedConn;
  }
  if (cachedConn) {
    await cachedConn.close().catch(() => {});
    cachedConn = null;
  }
  const dbName = presupCfg?.mongodb?.database || 'Presupuestos';
  cachedConn = mongoose.createConnection(uri, {
    dbName,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000
  });
  cachedUri = uri;
  await cachedConn.asPromise();
  return cachedConn;
}

/**
 * Garantiza la conexión por defecto de Mongoose (config en BD principal / oc_servicios).
 * Sin esto, Configuracion.findOne lanza "Client must be connected before running operations".
 */
export async function ensureMongoDefaultConnection() {
  if (mongoose.connection.readyState === 1) return true;
  try {
    const local = configStorageService.isInitialized ? configStorageService.getEffectiveConfig() : null;
    const uri = process.env.MONGODB_URI || local?.mongodb?.uri;
    if (!uri) return false;
    await mongoose.connect(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    return true;
  } catch {
    return false;
  }
}

export async function loadPresupConfigFromDb() {
  const ok = await ensureMongoDefaultConnection();
  if (!ok) return null;
  const doc = await Configuracion.findOne({ singleton: true }).lean();
  return doc?.presupCrm || null;
}

function defaultPresupCrmForMerge() {
  return {
    mongodb: {
      uri: '',
      database: 'Presupuestos',
      collection: 'presup_taller',
      collectionTalleres: 'talleres'
    },
    excel: { filePath: '' },
    scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
    talleres: [],
    aceites: [],
    general: {},
    lastImport: null
  };
}

/**
 * Config Presup CRM con variables de entorno aplicadas (misma lógica que GET /api/presup-crm/config).
 */
export async function getMergedPresupCrm() {
  let presupCfg = await loadPresupConfigFromDb();
  if (!presupCfg?.mongodb?.uri && configStorageService.isInitialized) {
    presupCfg = configStorageService.getConfig().presupCrm;
  }
  return mergePresupCrmWithEnv({ ...defaultPresupCrmForMerge(), ...presupCfg });
}

/** Colección de catálogo en la BD Presupuestos (p. ej. `Presupuestos.talleres` en Compass). */
export function getTalleresCollectionName(presupCfg) {
  const n = String(presupCfg?.mongodb?.collectionTalleres ?? 'talleres').trim();
  return n || 'talleres';
}

function normalizeTallerDocFromMongo(doc) {
  if (!doc || typeof doc !== 'object') return { codigo: '', nombre: '', activo: true };
  const codigo = pickField(doc, ['codigo', 'cod', 'COD']);
  const nombre = pickField(doc, ['nombre', 'nom', 'Nom', 'NOM']);
  let activo = true;
  if (doc.activo !== undefined) activo = !!doc.activo;
  else if (doc.act !== undefined) activo = !!doc.act;
  return {
    _id: doc._id != null ? String(doc._id) : undefined,
    codigo: codigo != null ? String(codigo).trim() : '',
    nombre: nombre != null ? String(nombre).trim() : '',
    activo
  };
}

function tallerRowToMongoDoc(row, now) {
  const codigo = String(row.codigo ?? '').trim();
  const nombre = String(row.nombre ?? '').trim();
  const activo = row.activo !== false;
  return {
    cod: codigo,
    codigo,
    nom: nombre,
    nombre,
    act: activo,
    activo,
    updatedAt: now
  };
}

function buildCodigoMatchFilter(codigoStr) {
  const c = String(codigoStr ?? '').trim();
  if (!c) return { _id: null };
  const n = Number(c);
  const or = [{ cod: c }, { codigo: c }];
  if (!Number.isNaN(n) && String(n) === c) {
    or.push({ cod: n }, { codigo: n });
  }
  return { $or: or };
}

/**
 * Catálogo talleres Presup CRM: colección Mongo `talleres` (misma BD que `presup_taller`).
 * Si la colección está vacía y existía `presupCrm.talleres` en configuración, migra una vez.
 */
export async function fetchTalleresCatalog(presupCfg) {
  const conn = await getPresupConnection(presupCfg);
  const collName = getTalleresCollectionName(presupCfg);
  const col = conn.db.collection(collName);
  let count = await col.countDocuments();
  if (count === 0) {
    const ok = await ensureMongoDefaultConnection();
    if (ok) {
      const cfgDoc = await Configuracion.findOne({ singleton: true }).lean();
      const legacy = cfgDoc?.presupCrm?.talleres;
      if (Array.isArray(legacy) && legacy.length) {
        const now = new Date();
        const docs = legacy
          .filter((r) => String(r?.codigo ?? '').trim() || String(r?.nombre ?? '').trim())
          .map((r) => ({
            ...tallerRowToMongoDoc(
              { codigo: r.codigo, nombre: r.nombre, activo: r.activo !== false },
              now
            ),
            createdAt: now
          }));
        if (docs.length) {
          await col.insertMany(docs);
        }
      }
    }
  }
  const docs = await col.find({}).toArray();
  docs.sort((a, b) => {
    const ka = String(a.cod ?? a.codigo ?? '');
    const kb = String(b.cod ?? b.codigo ?? '');
    return ka.localeCompare(kb, 'es', { numeric: true });
  });
  return docs.map(normalizeTallerDocFromMongo);
}

/**
 * Guarda el catálogo en la colección `talleres` (upsert por código; elimina filas quitadas en el UI).
 */
export async function persistTalleresCatalog(presupCfg, rows) {
  const conn = await getPresupConnection(presupCfg);
  const collName = getTalleresCollectionName(presupCfg);
  const col = conn.db.collection(collName);
  const now = new Date();

  const incoming = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      codigo: String(r?.codigo ?? '').trim(),
      nombre: String(r?.nombre ?? '').trim(),
      activo: r?.activo !== false
    }))
    .filter((r) => r.codigo);

  const codes = [...new Set(incoming.map((r) => r.codigo))];

  const existing = await col.find({}).project({ cod: 1, codigo: 1 }).toArray();
  const toDelete = [];
  for (const d of existing) {
    const k = String(d.cod ?? d.codigo ?? '').trim();
    if (!k) continue;
    if (!codes.includes(k)) toDelete.push(d._id);
  }
  if (toDelete.length) {
    await col.deleteMany({ _id: { $in: toDelete } });
  }

  for (const r of incoming) {
    const doc = tallerRowToMongoDoc(r, now);
    const filt = buildCodigoMatchFilter(r.codigo);
    await col.updateOne(filt, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
  }

  return fetchTalleresCatalog(presupCfg);
}

function pickField(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }
  const keys = Object.keys(obj);
  for (const n of names) {
    const low = n.toLowerCase();
    const found = keys.find((k) => k.toLowerCase() === low);
    if (found !== undefined && obj[found] !== undefined && obj[found] !== null && obj[found] !== '') {
      return obj[found];
    }
  }
  return undefined;
}

function parseNumber(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    // Serial Excel (aprox.)
    if (v > 20000 && v < 60000) {
      const utc = (v - 25569) * 86400 * 1000;
      const d = new Date(utc);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Estados canónicos CRM: `abierto` | `aceptado` | `rechazado`.
 * (El antiguo `pendiente` como estado “abierto” se mapea a `abierto`.)
 */
export function normalizeEstado(raw) {
  if (raw === undefined || raw === null || raw === '') return 'abierto';
  const t = String(raw).toLowerCase();
  if (t.includes('acept')) return 'aceptado';
  if (t.includes('aprob')) return 'aceptado';
  if (t.includes('rechaz')) return 'rechazado';
  if (t.includes('cancel')) return 'rechazado';
  if (t.includes('pendient') || t.includes('abierto') || t.includes('espera') || t.includes('abiert')) {
    return 'abierto';
  }
  return t;
}

/** Normaliza valores legacy ya guardados en Mongo (`pendiente` → `abierto`). */
export function canonEstadoNorm(raw) {
  const n = normalizeEstado(raw);
  return n === 'pendiente' ? 'abierto' : n;
}

/**
 * Diferencia en días de calendario (zona local del servidor) entre dos instantes.
 * Documentado: mismo criterio que buildDateMatch (fechas locales).
 */
export function diffCalendarDaysLocal(fromDate, toDate) {
  const a = fromDate instanceof Date ? fromDate : fromDate ? new Date(fromDate) : null;
  const b = toDate instanceof Date ? toDate : toDate ? new Date(toDate) : new Date();
  if (!a || Number.isNaN(a.getTime()) || !b || Number.isNaN(b.getTime())) return 0;
  const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const d1 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.floor((d1 - d0) / 86400000);
}

/**
 * Subestado solo bajo estado canónico `abierto`: `pendiente` (SLA vencido) | `en_espera`.
 * Ancla: max(fecha creación presupuesto, último comentario CRM).
 */
export function computeSubestadoAbierto({
  fechaCreacion,
  ultimoComentarioAt,
  periodoDias,
  ahora = new Date()
}) {
  const periodo = Math.min(365, Math.max(1, Number(periodoDias) || 7));
  const tCre = fechaCreacion ? new Date(fechaCreacion).getTime() : 0;
  const tCom = ultimoComentarioAt ? new Date(ultimoComentarioAt).getTime() : 0;
  const anchorMs = Math.max(tCre, tCom);
  if (!anchorMs || Number.isNaN(anchorMs)) return 'en_espera';
  const anchor = new Date(anchorMs);
  const dias = diffCalendarDaysLocal(anchor, ahora);
  return dias >= periodo ? 'pendiente' : 'en_espera';
}

/**
 * Muchos informes tienen Estado genérico ("Pendiente") y el cierre en Subestado ("Aceptado"/"Rechazado").
 * Si solo se usa estadoRaw, los aceptados quedan mal clasificados vs Mongo/Excel.
 */
export function mergeEstadoSubestado(estadoRaw, subestado) {
  const s =
    subestado !== undefined && subestado !== null && String(subestado).trim() !== ''
      ? String(subestado).toLowerCase()
      : '';
  if (s.includes('acept')) return 'aceptado';
  if (s.includes('rechaz')) return 'rechazado';
  if (s.includes('cancel')) return 'rechazado';
  return normalizeEstado(estadoRaw ?? subestado);
}

function normalizeMotivoRechazo(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  if (!t) return '';
  if (/no responde|sin respuesta/i.test(t)) return 'No responde';
  if (/precio|caro|elevado/i.test(t)) return 'Precio elevado';
  if (/demora|tiempo|plazo/i.test(t)) return 'Tiempo de demora';
  return t;
}

export function normalizePresupRow(row) {
  const referencia = pickField(row, [
    'Referencia',
    'referencia',
    'REF',
    'ref',
    'Referencia presupuesto',
    'Ref presupuesto',
    'Ref. presupuesto',
    'N° presupuesto',
    'Nº presupuesto'
  ]);
  const fecha = parseDate(pickField(row, ['Fecha', 'fecha', 'FECHA']));
  const cta = pickField(row, ['CTA', 'cta', 'Cta']);
  const nombre = pickField(row, ['NOMBRE', 'Nombre', 'nombre', 'Cliente', 'cliente']);
  /** Muchos informes exportan "Talle" (código de taller / talla operativa); también "Taller". */
  const taller = pickField(row, [
    'Taller',
    'taller',
    'TALLER',
    'Talle',
    'talle',
    'TALLE',
    'Tall',
    'Cod. taller',
    'Cod taller'
  ]);
  /** Código de pieza / repuesto; en informes a veces viene como Código, Ref, etc. */
  const pieza = pickField(row, [
    'Pieza',
    'pieza',
    'PIEZA',
    'Código',
    'Codigo',
    'codigo',
    'CODIGO',
    'Cód.',
    'Cod.',
    'Ref pieza',
    'Ref. pieza',
    'Material',
    'material'
  ]);
  const concepto = pickField(row, ['Concepto', 'concepto', 'CONCEPTO']);
  const cantidadRaw = pickField(row, [
    'Cantidad',
    'cantidad',
    'CANTIDAD',
    'Cant.',
    'Cant',
    'Qty',
    'qty',
    'Cant '
  ]);
  let cantidad = null;
  if (cantidadRaw !== undefined && cantidadRaw !== null && String(cantidadRaw).trim() !== '') {
    const cn = parseNumber(cantidadRaw);
    if (!Number.isNaN(cn)) cantidad = cn;
  }
  const costo = parseNumber(pickField(row, ['COSTO', 'Costo', 'costo']));
  const pvp = parseNumber(pickField(row, ['PVP', 'pvp']));
  const importe = parseNumber(pickField(row, ['Importe', 'importe', 'IMPORTE']));
  const usuario = pickField(row, [
    'Usuario',
    'usuario',
    'USUARIO',
    'User',
    'user',
    'USR',
    'Usr',
    'Operador',
    'operador',
    'Vendedor',
    'vendedor',
    'Creado por',
    'Creado Por',
    'Usuario CRM'
  ]);
  const descripcionSiniestro = pickField(row, [
    'Descripcion siniestro',
    'Descripción siniestro',
    'Descripcion Siniestro',
    'descripcion siniestro'
  ]);
  const descripcion = pickField(row, ['Descripción', 'Descripcion', 'descripcion', 'DESCRIPCION']);
  const estadoRaw = pickField(row, ['Estado', 'estado', 'ESTADO']);
  const subestado = pickField(row, ['Subestado', 'subestado', 'SUBESTADO']);
  const motivoRechazo = pickField(row, [
    'Motivo rechazo',
    'Motivo Rechazo',
    'motivoRechazo',
    'Motivo',
    'motivo'
  ]);
  const tipoSiniestro = pickField(row, ['Tipo de siniestro', 'Tipo siniestro', 'tipoSiniestro', 'Tipo']);
  const orRaw = pickField(row, ['OR', 'Or', 'or', 'Orden reparacion', 'Orden OR', 'Estado OR']);
  const comentariosRaw = pickField(row, [
    'Comentarios',
    'N° comentarios',
    'N comentarios',
    'comentarios'
  ]);
  const margenCol = pickField(row, ['Margen %', 'Margen%', 'Margen ', 'Margen', 'margen %']);

  const estadoNorm = mergeEstadoSubestado(estadoRaw, subestado);
  const refStr = referencia !== undefined && referencia !== null ? String(referencia).trim() : '';
  const motivoNorm = estadoNorm === 'rechazado' ? normalizeMotivoRechazo(motivoRechazo || subestado || descripcion) : '';

  let margenPctVal = null;
  if (margenCol !== undefined && margenCol !== null && margenCol !== '') {
    const s = String(margenCol).replace('%', '').replace(',', '.').trim();
    const n = parseFloat(s);
    if (!Number.isNaN(n)) margenPctVal = Math.round(n * 100) / 100;
  }
  if (margenPctVal === null && pvp > 0 && costo >= 0) {
    margenPctVal = Math.round(((pvp - costo) / pvp) * 10000) / 100;
  }

  let comentariosCount = 0;
  if (comentariosRaw !== undefined && comentariosRaw !== null && comentariosRaw !== '') {
    const n = parseInt(String(comentariosRaw).replace(/\D/g, ''), 10);
    if (!Number.isNaN(n)) comentariosCount = n;
  }

  /** Número BSON para consultas en Compass / filtros por tipo numérico (referencia sigue en string). */
  const refNumParsed = parseInt(refStr, 10);
  const referenciaNum =
    refStr && !Number.isNaN(refNumParsed) && String(refNumParsed) === refStr ? refNumParsed : undefined;

  return {
    referencia: refStr,
    referenciaNorm: refStr,
    ...(referenciaNum !== undefined ? { referenciaNum } : {}),
    fecha,
    fechaNorm: fecha,
    cta: cta !== undefined ? String(cta) : '',
    cliente: nombre !== undefined ? String(nombre) : '',
    taller: taller !== undefined ? String(taller) : '',
    tallerNorm: taller !== undefined ? String(taller).trim() : '',
    pieza: pieza !== undefined ? String(pieza) : '',
    concepto: concepto !== undefined ? String(concepto) : '',
    ...(cantidad !== null ? { cantidad } : {}),
    costo,
    pvp,
    importe,
    usuario: usuario !== undefined ? String(usuario) : '',
    descripcionSiniestro: descripcionSiniestro !== undefined ? String(descripcionSiniestro) : '',
    descripcion: descripcion !== undefined ? String(descripcion) : '',
    estado: estadoNorm,
    estadoNorm,
    subestado: subestado !== undefined ? String(subestado) : '',
    tipoSiniestro: tipoSiniestro !== undefined ? String(tipoSiniestro) : '',
    motivoRechazo: motivoNorm,
    margenPct: margenPctVal,
    orEstado: orRaw !== undefined && orRaw !== null ? String(orRaw).trim() : '',
    comentariosCount,
    raw: row,
    updatedAt: new Date()
  };
}

/**
 * Un documento Mongo por presupuesto: cabecera + array `lineas` (piezas/MO).
 * @param {string} refKey referencia normalizada
 * @param {object[]} groupDocs salidas de normalizePresupRow (misma referencia, orden Excel)
 */
export function buildPresupuestoDocumentFromNormalizedLines(refKey, groupDocs) {
  if (!groupDocs?.length) throw new Error('Sin líneas para el presupuesto');
  const sorted = [...groupDocs].sort((a, b) => {
    const da = a.fechaNorm ? new Date(a.fechaNorm).getTime() : 0;
    const db = b.fechaNorm ? new Date(b.fechaNorm).getTime() : 0;
    return da - db;
  });
  const first = sorted[0];
  const fechas = sorted.map((d) => d.fechaNorm).filter(Boolean);
  let fechaMin = first.fechaNorm;
  if (fechas.length) {
    fechaMin = fechas.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
  }

  /** Usuario: a menudo solo en la 1.ª fila; propagado en forward-fill, pero reforzamos cabecera y líneas. */
  const usuarioCabecera =
    sorted.find((d) => d.usuario != null && String(d.usuario).trim() !== '')?.usuario ?? first.usuario ?? '';

  const lineas = sorted.map((d) => {
    const usuarioLinea =
      d.usuario != null && String(d.usuario).trim() !== '' ? d.usuario : usuarioCabecera;
    const line = {
      pieza: d.pieza,
      concepto: d.concepto,
      descripcion: d.descripcion,
      descripcionSiniestro: d.descripcionSiniestro,
      costo: d.costo,
      pvp: d.pvp,
      importe: d.importe,
      margenPct: d.margenPct,
      fechaNorm: d.fechaNorm,
      taller: d.tallerNorm ?? d.taller,
      tallerNorm: d.tallerNorm,
      usuario: usuarioLinea !== undefined && usuarioLinea !== null ? String(usuarioLinea) : '',
      estado: d.estado,
      estadoNorm: d.estadoNorm,
      subestado: d.subestado,
      tipoSiniestro: d.tipoSiniestro,
      orEstado: d.orEstado,
      comentariosCount: d.comentariosCount,
      motivoRechazo: d.motivoRechazo
    };
    if (d.cantidad != null) line.cantidad = d.cantidad;
    return line;
  });

  const comentariosMax = Math.max(0, ...sorted.map((d) => Number(d.comentariosCount) || 0));

  return {
    referencia: refKey,
    referenciaNorm: refKey,
    ...(first.referenciaNum != null ? { referenciaNum: first.referenciaNum } : {}),
    cliente: first.cliente,
    taller: first.tallerNorm,
    tallerNorm: first.tallerNorm,
    cta: first.cta,
    fecha: fechaMin,
    fechaNorm: fechaMin,
    estado: first.estadoNorm,
    estadoNorm: first.estadoNorm,
    subestado: first.subestado,
    descripcion: first.descripcion,
    descripcionSiniestro: first.descripcionSiniestro,
    tipoSiniestro: first.tipoSiniestro,
    usuario:
      usuarioCabecera !== undefined && usuarioCabecera !== null ? String(usuarioCabecera).trim() : '',
    orEstado: first.orEstado,
    motivoRechazo: first.motivoRechazo,
    comentariosCount: comentariosMax,
    lineas,
    tipoDocumento: 'presupuesto_crm',
    updatedAt: new Date()
  };
}

/**
 * Actualiza un presupuesto existente con datos del Excel sin perder campos que no vienen del informe
 * (extensiones en Mongo, metadatos, etc.). Los campos solo presentes en `existing` se conservan.
 * Si el estado ya fue fijado en CRM (aceptado/rechazado) y el Excel trae pendiente/abierto, no se pisa ese estado.
 */
export function mergePresupuestoExcelIntoExisting(existing, incoming) {
  if (!existing || !incoming) return incoming;
  const merged = { ...incoming };
  const incomingKeys = new Set(Object.keys(incoming));
  for (const k of Object.keys(existing)) {
    if (k === '_id') continue;
    if (!incomingKeys.has(k)) {
      merged[k] = existing[k];
    }
  }
  if (existing._id != null) {
    merged._id = existing._id;
  }

  const prevNorm = String(existing.estadoNorm || existing.estado || '').toLowerCase();
  const incNorm = String(incoming.estadoNorm || '').toLowerCase();
  const crmYaDefinido = prevNorm.includes('acept') || prevNorm.includes('rechaz');
  const excelPendienteUAbierto =
    incNorm.includes('pend') ||
    incNorm.includes('abiert') ||
    incNorm.includes('espera') ||
    incNorm === '';
  if (crmYaDefinido && excelPendienteUAbierto) {
    merged.estadoNorm = existing.estadoNorm;
    if (existing.estado !== undefined) merged.estado = existing.estado;
    if (existing.subestado !== undefined) merged.subestado = existing.subestado;
  }

  merged.updatedAt = new Date();
  return merged;
}

/** Mismas claves que `normalizePresupRow` para leer la referencia en una fila cruda del Excel. */
const REFERENCIA_EXCEL_KEYS = [
  'Referencia',
  'referencia',
  'REF',
  'ref',
  'Referencia presupuesto',
  'Ref presupuesto',
  'Ref. presupuesto',
  'N° presupuesto',
  'Nº presupuesto'
];

/**
 * En informes (PBI/Excel) la referencia del presupuesto suele ir solo en la **primera fila** del bloque;
 * las demás líneas de repuesto/MO quedan con referencia en blanco. Sin propagar, solo se importa
 * un documento Mongo por presupuesto y en la app se ve una sola "pieza".
 */
function forwardFillPresupExcelRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  let lastRef = '';
  let lastCta = '';
  let lastCliente = '';
  let lastTaller = '';
  let lastUsuario = '';

  const rowLooksLikeLine = (row) => {
    if (!row || typeof row !== 'object') return false;
    const imp = parseNumber(pickField(row, ['Importe', 'importe', 'IMPORTE']));
    if (imp !== 0) return true;
    const costo = parseNumber(pickField(row, ['COSTO', 'Costo', 'costo']));
    if (costo !== 0) return true;
    const pvp = parseNumber(pickField(row, ['PVP', 'pvp']));
    if (pvp !== 0) return true;
    const t = (v) =>
      v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : '';
    if (
      t(
        pickField(row, [
          'Pieza',
          'pieza',
          'PIEZA',
          'Código',
          'Codigo',
          'codigo',
          'Concepto',
          'concepto',
          'CONCEPTO',
          'Descripción',
          'Descripcion',
          'descripcion'
        ])
      )
    ) {
      return true;
    }
    return false;
  };

  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    const hasData = rowLooksLikeLine(out);

    const refRaw = pickField(out, REFERENCIA_EXCEL_KEYS);
    const refStr =
      refRaw !== undefined && refRaw !== null && String(refRaw).trim() !== ''
        ? String(refRaw).trim()
        : '';
    if (refStr) {
      lastRef = refStr;
    } else if (lastRef && hasData) {
      out.Referencia = lastRef;
    }

    const ctaRaw = pickField(out, ['CTA', 'cta', 'Cta']);
    const ctaStr =
      ctaRaw !== undefined && ctaRaw !== null && String(ctaRaw).trim() !== ''
        ? String(ctaRaw).trim()
        : '';
    if (ctaStr) {
      lastCta = ctaStr;
    } else if (lastCta && hasData) {
      out.CTA = lastCta;
    }

    const nomRaw = pickField(out, ['NOMBRE', 'Nombre', 'nombre', 'Cliente', 'cliente']);
    const nomStr =
      nomRaw !== undefined && nomRaw !== null && String(nomRaw).trim() !== ''
        ? String(nomRaw).trim()
        : '';
    if (nomStr) {
      lastCliente = nomStr;
    } else if (lastCliente && hasData) {
      out.Nombre = lastCliente;
    }

    const tallerRaw = pickField(out, [
      'Taller',
      'taller',
      'TALLER',
      'Talle',
      'talle',
      'TALLE'
    ]);
    const tallerStr =
      tallerRaw !== undefined && tallerRaw !== null && String(tallerRaw).trim() !== ''
        ? String(tallerRaw).trim()
        : '';
    if (tallerStr) {
      lastTaller = tallerStr;
    } else if (lastTaller && hasData) {
      out.Taller = lastTaller;
    }

    const usuarioRaw = pickField(out, [
      'Usuario',
      'usuario',
      'USUARIO',
      'User',
      'user',
      'USR',
      'Operador',
      'operador',
      'Vendedor',
      'vendedor',
      'Creado por',
      'Creado Por'
    ]);
    const usuarioStr =
      usuarioRaw !== undefined && usuarioRaw !== null && String(usuarioRaw).trim() !== ''
        ? String(usuarioRaw).trim()
        : '';
    if (usuarioStr) {
      lastUsuario = usuarioStr;
    } else if (lastUsuario && hasData) {
      out.Usuario = lastUsuario;
    }

    return out;
  });
}

function getCollectionModel(conn, collectionName) {
  const coll = collectionName || 'presup_taller';
  if (conn.models.PresupCrmLinea) {
    return conn.models.PresupCrmLinea;
  }
  const schema = new mongoose.Schema({}, { strict: false, collection: coll, timestamps: true });
  return conn.model('PresupCrmLinea', schema);
}

let migracionEstadoNormEjecutada = false;

/** Migración idempotente: `estadoNorm: pendiente` → `abierto` (una vez por proceso). */
async function ensurePresupEstadoNormMigrado(conn, collName) {
  if (migracionEstadoNormEjecutada) return;
  migracionEstadoNormEjecutada = true;
  try {
    const Model = getCollectionModel(conn, collName);
    await Model.updateMany(
      { estadoNorm: 'pendiente' },
      { $set: { estadoNorm: 'abierto', estado: 'Abierto', updatedAt: new Date() } }
    );
  } catch (e) {
    console.warn('[presupCrm] migración estadoNorm pendiente→abierto:', e?.message || e);
  }
}

function getComentariosModel(conn) {
  if (conn.models.PresupCrmComentario) {
    return conn.models.PresupCrmComentario;
  }
  const schema = new mongoose.Schema(
    {
      referencia: { type: String, required: true, index: true },
      usuario: { type: String, default: '' },
      texto: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    },
    { collection: 'presup_crm_comentarios' }
  );
  return conn.model('PresupCrmComentario', schema);
}

/** Coincide referencia guardada como string o número en comentarios CRM */
function buildReferenciaComentarioFilter(ref) {
  const refStr = String(ref ?? '').trim();
  if (!refStr) return null;
  const refNum = parseInt(refStr, 10);
  const or = [{ referencia: refStr }];
  if (!Number.isNaN(refNum) && String(refNum) === refStr) {
    or.push({ referencia: refNum });
  }
  return { $or: or };
}

/**
 * Última fecha de comentario CRM por referencia (Map key = string referencia).
 */
async function fetchUltimoComentarioAtPorReferencias(presupCfg, referencias) {
  const ids = [...new Set((referencias || []).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const inVals = new Set();
  for (const id of ids) {
    inVals.add(id);
    const n = parseInt(id, 10);
    if (!Number.isNaN(n) && String(n) === id) inVals.add(n);
  }
  const arr = [...inVals];
  const conn = await getPresupConnection(presupCfg);
  const Model = getComentariosModel(conn);
  const rows = await Model.aggregate([
    { $match: { referencia: { $in: arr } } },
    {
      $group: {
        _id: { $toString: '$referencia' },
        maxAt: { $max: '$createdAt' }
      }
    }
  ]);
  const out = new Map();
  for (const row of rows) {
    out.set(String(row._id), row.maxAt);
  }
  return out;
}

/**
 * Un documento por presupuesto → índice **único** en `referenciaNorm`.
 * Elimina índices viejos en referencia/referenciaNorm y recrea; si hay duplicados legacy, el único falla y se usa no único.
 */
async function ensurePresupTallerIndexesForPresupuestoDoc(conn, collName) {
  const coll = conn.db.collection(collName);
  let indexes;
  try {
    indexes = await coll.indexes();
  } catch {
    return;
  }
  for (const idx of indexes) {
    const k = idx.key || {};
    const names = Object.keys(k);
    if (names.length !== 1) continue;
    const field = names[0];
    if (field !== 'referencia' && field !== 'referenciaNorm') continue;
    try {
      await coll.dropIndex(idx.name);
    } catch (e) {
      console.warn(`[presupCrm] no se pudo eliminar índice ${idx.name}:`, e?.message || e);
    }
  }
  try {
    await coll.createIndex({ referenciaNorm: 1 }, { unique: true, background: true });
  } catch (e) {
    console.warn(
      '[presupCrm] índice único referenciaNorm no aplicado (¿datos legacy duplicados?). Se usa índice no único:',
      e?.message || e
    );
    try {
      await coll.createIndex({ referenciaNorm: 1 }, { background: true });
    } catch (e2) {
      console.warn('[presupCrm] createIndex referenciaNorm:', e2?.message || e2);
    }
  }
  try {
    await coll.createIndex({ referencia: 1 }, { background: true });
  } catch (e) {
    console.warn('[presupCrm] createIndex referencia:', e?.message || e);
  }
}

export async function testMongoConnection(presupCfg) {
  const conn = await getPresupConnection(presupCfg);
  const n = await conn.db.admin().ping();
  return { ok: true, ping: n };
}

/** Misma regla que Citas/Ingresos/ORs: primera hoja del libro. */
function pickFirstExcelSheetName(wb) {
  if (!wb?.SheetNames?.length) throw new Error('El archivo Excel no tiene hojas');
  return wb.SheetNames[0];
}

export async function testExcelRead(presupCfg) {
  const filePath = presupCfg?.excel?.filePath?.trim();
  if (!filePath) throw new Error('Indique la ruta del archivo Excel');
  if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = pickFirstExcelSheetName(wb);
  const ws = wb.Sheets[sheet];
  const rows = xlsx.utils.sheet_to_json(ws, { raw: true, defval: null });
  return {
    ok: true,
    sheetUsed: sheet,
    rowCount: rows.length,
    sampleKeys: rows[0] ? Object.keys(rows[0]) : []
  };
}

/**
 * Importación desde Excel.
 * Por referencia: si el presupuesto ya existe, se fusiona el documento generado desde el Excel conservando
 * cualquier campo en Mongo que no forme parte del payload del Excel; el estado aceptado/rechazado en CRM
 * no se pisa si el Excel aún muestra pendiente/abierto. Modo total: vacía la colección y carga solo Excel.
 * @param {object} options
 * @param {boolean} [options.fullReplace=false] Si true, vacía toda la colección y vuelve a importar (comportamiento legacy).
 */
export async function importFromExcel(presupCfg, options = {}) {
  const { fullReplace = false } = options;
  const filePath = presupCfg?.excel?.filePath?.trim();
  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  if (!filePath) throw new Error('Indique la ruta del archivo Excel');
  if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);

  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = pickFirstExcelSheetName(wb);
  const ws = wb.Sheets[sheet];
  const rowsRaw = xlsx.utils.sheet_to_json(ws, { raw: true, defval: null });
  const rows = forwardFillPresupExcelRows(rowsRaw);

  const conn = await getPresupConnection(presupCfg);
  const Model = getCollectionModel(conn, collName);
  await ensurePresupEstadoNormMigrado(conn, collName);
  await ensurePresupTallerIndexesForPresupuestoDoc(conn, collName);

  const flatRows = rows.map((r) => normalizePresupRow(r)).filter((d) => d.referenciaNorm);

  let result;

  if (fullReplace) {
    await Model.deleteMany({});
    if (flatRows.length) {
      const byRef = new Map();
      for (const d of flatRows) {
        const key = String(d.referenciaNorm ?? '').trim();
        if (!key) continue;
        if (!byRef.has(key)) byRef.set(key, []);
        byRef.get(key).push(d);
      }
      const presupDocs = [];
      for (const [refKey, groupDocs] of byRef) {
        presupDocs.push(buildPresupuestoDocumentFromNormalizedLines(refKey, groupDocs));
      }
      if (presupDocs.length) {
        await Model.insertMany(presupDocs, { ordered: false });
      }
    }
    result = {
      imported: flatRows.length,
      collection: collName,
      mode: 'fullReplace',
      updatedReferencias: 0,
      createdReferencias: 0,
      uniqueReferencias: 0
    };
  } else {
    const byRef = new Map();
    for (const d of flatRows) {
      const key = String(d.referenciaNorm ?? '').trim();
      if (!key) continue;
      if (!byRef.has(key)) byRef.set(key, []);
      byRef.get(key).push(d);
    }

    let updatedReferencias = 0;
    let createdReferencias = 0;

    for (const [refKey, groupDocs] of byRef) {
      const filter = buildReferenciaFilter(refKey);
      if (!filter || !groupDocs.length) continue;

      const docFromExcel = buildPresupuestoDocumentFromNormalizedLines(refKey, groupDocs);
      const existingDocs = await Model.find(filter).sort({ updatedAt: -1 }).lean();

      if (existingDocs.length === 0) {
        await Model.insertMany([docFromExcel], { ordered: false });
        createdReferencias += 1;
        continue;
      }

      const merged = mergePresupuestoExcelIntoExisting(existingDocs[0], docFromExcel);
      if (existingDocs.length === 1) {
        await Model.replaceOne({ _id: existingDocs[0]._id }, merged);
      } else {
        await Model.deleteMany(filter);
        await Model.insertMany([merged], { ordered: false });
      }
      updatedReferencias += 1;
    }

    result = {
      imported: flatRows.length,
      collection: collName,
      mode: 'upsertByReferencia',
      updatedReferencias,
      createdReferencias,
      uniqueReferencias: byRef.size
    };
  }

  await Configuracion.findOneAndUpdate(
    { singleton: true },
    {
      $set: {
        'presupCrm.lastImport': {
          timestamp: new Date(),
          status: 'success',
          rows: flatRows.length,
          error: null,
          mode: result.mode,
          updatedReferencias: result.updatedReferencias,
          createdReferencias: result.createdReferencias
        }
      }
    },
    { upsert: true }
  );

  return result;
}

/**
 * Unifica nombres de campos: importación Excel usa *Norm; otros orígenes pueden usar fecha/estado/taller/referencia.
 * Debe ir antes de $match por rango de fechas.
 */
function coalescePresupDocFieldsStage() {
  return {
    $addFields: {
      fechaNorm: { $ifNull: ['$fechaNorm', '$fecha'] },
      referenciaNorm: {
        $ifNull: [
          '$referenciaNorm',
          { $toString: { $ifNull: ['$referencia', ''] } }
        ]
      },
      estadoNorm: { $ifNull: ['$estadoNorm', '$estado'] },
      tallerNorm: { $ifNull: ['$tallerNorm', '$taller'] },
      cliente: { $ifNull: ['$cliente', '$nombre'] },
      importe: { $ifNull: ['$importe', 0] },
      motivoRechazo: { $ifNull: ['$motivoRechazo', '$motivo'] }
    }
  };
}

/**
 * Agrupa por referencia. Soporta documento único con `lineas[]` y documentos legacy (una línea = un doc).
 */
async function aggregateByReferencia(conn, collName, match) {
  await ensurePresupEstadoNormMigrado(conn, collName);
  const Model = getCollectionModel(conn, collName);
  const pipeline = [
    coalescePresupDocFieldsStage(),
    { $match: match },
    {
      $addFields: {
        fechaSort: { $ifNull: ['$fechaNorm', new Date(0)] },
        docImporte: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lineas', []] } }, 0] },
            {
              $sum: {
                $map: {
                  input: '$lineas',
                  as: 'l',
                  in: { $toDouble: { $ifNull: ['$$l.importe', 0] } }
                }
              }
            },
            { $toDouble: { $ifNull: ['$importe', 0] } }
          ]
        },
        docMargenAvg: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lineas', []] } }, 0] },
            {
              $divide: [
                {
                  $reduce: {
                    input: '$lineas',
                    initialValue: 0,
                    in: { $add: ['$$value', { $toDouble: { $ifNull: ['$$this.margenPct', 0] } }] }
                  }
                },
                { $size: { $ifNull: ['$lineas', []] } }
              ]
            },
            { $toDouble: { $ifNull: ['$margenPct', 0] } }
          ]
        },
        docComentariosMax: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lineas', []] } }, 0] },
            {
              $max: {
                $map: {
                  input: '$lineas',
                  as: 'l',
                  in: { $toDouble: { $ifNull: ['$$l.comentariosCount', 0] } }
                }
              }
            },
            { $toDouble: { $ifNull: ['$comentariosCount', 0] } }
          ]
        }
      }
    },
    { $sort: { fechaSort: -1, _id: 1 } },
    {
      $group: {
        _id: '$referenciaNorm',
        importeTotal: { $sum: '$docImporte' },
        fecha: { $first: '$fechaNorm' },
        cliente: { $first: '$cliente' },
        taller: { $first: '$tallerNorm' },
        estado: { $first: '$estadoNorm' },
        descripcion: { $first: '$descripcion' },
        descripcionSiniestro: { $first: '$descripcionSiniestro' },
        concepto: { $first: '$concepto' },
        usuario: { $first: '$usuario' },
        tipoSiniestro: { $first: '$tipoSiniestro' },
        motivoRechazo: { $first: '$motivoRechazo' },
        subestado: { $first: '$subestado' },
        orEstado: { $first: '$orEstado' },
        numeroOrdenReparacion: { $first: '$numeroOrdenReparacion' },
        margenPct: { $avg: '$docMargenAvg' },
        comentariosCount: { $max: '$docComentariosMax' }
      }
    }
  ];
  const rows = await Model.aggregate(pipeline);
  return rows.map((r) => ({
    ...r,
    estado: canonEstadoNorm(mergeEstadoSubestado(r.estado, r.subestado))
  }));
}

/** Rango por yyyy-mm-dd en calendario local del servidor (evita desfase UTC de `new Date('2026-02-04')`). */
function buildDateMatch(fechaDesde, fechaHasta) {
  const m = {};
  if (!fechaDesde && !fechaHasta) return m;

  const parseLocalYmd = (s) => {
    const str = String(s || '').trim();
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!p) return null;
    const y = parseInt(p[1], 10);
    const mo = parseInt(p[2], 10) - 1;
    const d = parseInt(p[3], 10);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  m.fechaNorm = {};
  if (fechaDesde) {
    const fd = parseLocalYmd(fechaDesde);
    if (fd) {
      m.fechaNorm.$gte = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 0, 0, 0, 0);
    } else {
      m.fechaNorm.$gte = new Date(fechaDesde);
    }
  }
  if (fechaHasta) {
    const fh = parseLocalYmd(fechaHasta);
    if (fh) {
      m.fechaNorm.$lte = new Date(fh.getFullYear(), fh.getMonth(), fh.getDate(), 23, 59, 59, 999);
    } else {
      const end = new Date(fechaHasta);
      end.setHours(23, 59, 59, 999);
      m.fechaNorm.$lte = end;
    }
  }
  return m;
}

function tallyPorTaller(rows) {
  const out = {};
  for (const r of rows) {
    const t = r.taller || '—';
    const key = String(t).trim() || '—';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * Sustituye códigos numéricos de taller por etiqueta legible usando el catálogo Mongo `talleres` (codigo + nombre).
 * Si no hay coincidencia, mantiene la clave original.
 */
function applyTallerLabelsToPorTaller(porTaller, talleresCatalog) {
  if (!porTaller || typeof porTaller !== 'object') return porTaller;
  const list = Array.isArray(talleresCatalog) ? talleresCatalog : [];
  if (!list.length) return porTaller;

  const byCodigo = new Map();
  for (const t of list) {
    const c = t?.codigo != null ? String(t.codigo).trim() : '';
    if (c) byCodigo.set(c, t);
  }

  const out = {};
  for (const [k, v] of Object.entries(porTaller)) {
    const key = String(k).trim();
    const match = byCodigo.get(key);
    let label = key;
    if (match) {
      const cod = match.codigo != null ? String(match.codigo).trim() : '';
      const nom = match.nombre != null ? String(match.nombre).trim() : '';
      /** El catálogo reemplaza el código numérico: solo etiqueta (`nombre`), no `codigo nombre`. */
      if (nom) label = nom;
      else if (cod) label = cod;
    }
    out[label] = (out[label] || 0) + v;
  }
  return out;
}

/** Orden fijo tipo OC Presup CRM (16 celdas + Sin taller). Override: presupCfg.talleresDashboardOrden */
/** Orden y etiquetas como OC Presup CRM (16 celdas). GV PE / GV PM (no GV FE / GY PM). */
export const DEFAULT_CANONICAL_TALLERES = [
  'GV PE',
  'GV JU',
  'GV SN',
  'GV CO',
  'GV TR',
  'FC JU',
  'FC SN',
  'FC CH',
  'FC 90',
  'PW GP',
  'PW SR',
  'GV PM',
  'FC CS',
  'FC OL',
  'FC TL',
  'Sin taller'
];

function normalizeTallerKey(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveLabelFromTallerRaw(raw, talleresCatalog) {
  const key = String(raw ?? '').trim();
  if (!key || key === '—') return 'Sin taller';
  const list = Array.isArray(talleresCatalog) ? talleresCatalog : [];
  const byCodigo = new Map();
  for (const t of list) {
    const c = t?.codigo != null ? String(t.codigo).trim() : '';
    if (c) byCodigo.set(c, t);
  }
  const match = byCodigo.get(key);
  if (match) {
    const cod = match.codigo != null ? String(match.codigo).trim() : '';
    const nom = match.nombre != null ? String(match.nombre).trim() : '';
    /** Reemplazar el n.º de taller por la etiqueta del catálogo (solo `nombre`). */
    if (nom) return nom;
    if (cod) return cod;
  }
  return key;
}

/** Sinónimos frecuentes Excel / catálogo vs tablero OC Presup */
const TALLER_ALIASES = {
  'GV FE': 'GV PE',
  'GY PM': 'GV PM',
  'FC 9J': 'FC 90',
  'FC 92': 'FC 90',
  'FC SJ': 'FC 90'
};

function mapResolvedToCanonical(resolved, canonicalList) {
  const raw = String(resolved || '').trim();
  if (!raw || raw === '—') return 'Sin taller';
  let n = normalizeTallerKey(raw);
  if (n === 'SIN TALLER' || n === '—') return 'Sin taller';

  const aliased = TALLER_ALIASES[n];
  if (aliased && canonicalList.includes(aliased)) {
    return aliased;
  }

  for (const c of canonicalList) {
    if (c === 'Sin taller') continue;
    if (normalizeTallerKey(c) === n) return c;
  }
  for (const c of canonicalList) {
    if (c === 'Sin taller') continue;
    const cn = normalizeTallerKey(c);
    if (n.includes(cn) || cn.includes(n)) return c;
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts.slice(-2).join(' ');
    for (const c of canonicalList) {
      if (c === 'Sin taller') continue;
      if (normalizeTallerKey(candidate) === normalizeTallerKey(c)) return c;
    }
  }
  if (parts.length === 1) {
    const one = parts[0];
    for (const c of canonicalList) {
      if (c === 'Sin taller') continue;
      if (normalizeTallerKey(one) === normalizeTallerKey(c)) return c;
    }
  }
  return 'Sin taller';
}

function getCanonicalTalleresList(presupCfg) {
  const custom = presupCfg?.talleresDashboardOrden;
  if (Array.isArray(custom) && custom.length === 16) {
    const mapped = custom.map((x) => String(x || '').trim()).filter(Boolean);
    if (mapped.length === 16) return mapped;
  }
  return [...DEFAULT_CANONICAL_TALLERES];
}

/**
 * Matriz fija 16 talleres: conteo + importe por celda (paridad OC Presup CRM).
 */
function buildPorTallerMatriz(rows, canonicalList, talleresCatalog) {
  const count = {};
  const imp = {};
  for (const c of canonicalList) {
    count[c] = 0;
    imp[c] = 0;
  }
  for (const r of rows) {
    const raw = r.taller;
    const resolved = resolveLabelFromTallerRaw(raw, talleresCatalog);
    const canon = mapResolvedToCanonical(resolved, canonicalList);
    count[canon] = (count[canon] || 0) + 1;
    imp[canon] = (imp[canon] || 0) + (r.importeTotal || 0);
  }
  return canonicalList.map((taller, i) => ({
    taller,
    count: count[taller] ?? 0,
    importe: imp[taller] ?? 0,
    index: i + 1
  }));
}

function sumImporte(rows) {
  return rows.reduce((a, r) => a + (Number(r.importeTotal) || 0), 0);
}

/** Comparación Mongo vs agregado: suma por línea debe coincidir con suma de importeTotal por referencia */
async function getPresupMongoDebug(conn, collName, dateMatch, groupedRows) {
  const Model = getCollectionModel(conn, collName);
  const pipeline = [
    coalescePresupDocFieldsStage(),
    { $match: dateMatch },
    {
      $addFields: {
        docImporte: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lineas', []] } }, 0] },
            {
              $sum: {
                $map: {
                  input: '$lineas',
                  as: 'l',
                  in: { $toDouble: { $ifNull: ['$$l.importe', 0] } }
                }
              }
            },
            { $toDouble: { $ifNull: ['$importe', 0] } }
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        lineas: { $sum: 1 },
        sumImporteLineas: { $sum: '$docImporte' }
      }
    }
  ];
  const [agg] = await Model.aggregate(pipeline);
  const sumGrouped = groupedRows.reduce((a, r) => a + (Number(r.importeTotal) || 0), 0);
  const sumLin = agg?.sumImporteLineas ?? 0;
  const lineas = agg?.lineas ?? 0;
  const diff = Math.abs(sumLin - sumGrouped);
  return {
    lineasEnRango: lineas,
    sumImporteLineas: sumLin,
    presupuestosAgrupados: groupedRows.length,
    sumImportePorReferencia: sumGrouped,
    diferenciaImporte: diff,
    coincidenSumaImportes: lineas === 0 || diff < Math.max(0.02, Math.abs(sumLin) * 1e-9)
  };
}

export async function getDashboardStats(presupCfg, query) {
  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  const fechaDesde = query.fechaDesde || null;
  const fechaHasta = query.fechaHasta || null;
  const conn = await getPresupConnection(presupCfg);
  const dateMatch = buildDateMatch(fechaDesde, fechaHasta);
  const rows = await aggregateByReferencia(conn, collName, dateMatch);

  const pendiente = rows.filter((r) => r.estado === 'abierto' || r.estado === 'pendiente');
  const aceptados = rows.filter((r) => r.estado === 'aceptado');
  const rechazados = rows.filter((r) => r.estado === 'rechazado');

  const periodoDias = Math.min(
    365,
    Math.max(1, parseInt(String(presupCfg?.general?.periodoDiasPendiente ?? 7), 10) || 7)
  );
  const ultimosCom = await fetchUltimoComentarioAtPorReferencias(
    presupCfg,
    pendiente.map((r) => r._id)
  );
  let enEspera = 0;
  let slaPendiente = 0;
  for (const r of pendiente) {
    const sub = computeSubestadoAbierto({
      fechaCreacion: r.fecha,
      ultimoComentarioAt: ultimosCom.get(String(r._id)),
      periodoDias: periodoDias
    });
    if (sub === 'pendiente') slaPendiente += 1;
    else enEspera += 1;
  }

  const motivos = {};
  for (const r of rechazados) {
    const m = r.motivoRechazo || 'Sin motivo';
    motivos[m] = (motivos[m] || 0) + 1;
  }

  const catalog = await fetchTalleresCatalog(presupCfg);
  const canonical = getCanonicalTalleresList(presupCfg);

  const out = {
    fechaDesde: fechaDesde || null,
    fechaHasta: fechaHasta || null,
    ultimaActualizacion: new Date().toISOString(),
    pendientes: {
      total: pendiente.length,
      enEspera,
      slaPendiente,
      importe: sumImporte(pendiente),
      porTaller: applyTallerLabelsToPorTaller(tallyPorTaller(pendiente), catalog),
      porTallerMatriz: buildPorTallerMatriz(pendiente, canonical, catalog)
    },
    aceptados: {
      total: aceptados.length,
      importe: sumImporte(aceptados),
      porTaller: applyTallerLabelsToPorTaller(tallyPorTaller(aceptados), catalog),
      porTallerMatriz: buildPorTallerMatriz(aceptados, canonical, catalog)
    },
    rechazados: {
      total: rechazados.length,
      importe: sumImporte(rechazados),
      porTaller: applyTallerLabelsToPorTaller(tallyPorTaller(rechazados), catalog),
      porTallerMatriz: buildPorTallerMatriz(rechazados, canonical, catalog),
      motivos
    }
  };

  const dbg = query?.debug === '1' || query?.debug === 'true';
  if (dbg) {
    out._debug = await getPresupMongoDebug(conn, collName, dateMatch, rows);
  }

  return out;
}

/**
 * Primera palabra del nombre de taller (p. ej. "GV PE" → GV). Solo FC | GV | PW.
 * Misma idea que oportunidades/stats/dashboard.
 */
function empresaDesdeEtiquetaTaller(tallerNombre) {
  const s = String(tallerNombre || '').trim();
  if (!s || s === '—') return null;
  const partes = s.split(/\s+/).filter((p) => p.length > 0);
  let empresa = null;
  if (partes.length >= 1) {
    empresa = partes[0].toUpperCase();
  } else if (s.length >= 2) {
    empresa = s.substring(0, 2).toUpperCase();
  }
  if (empresa && ['FC', 'GV', 'PW'].includes(empresa)) return empresa;
  return null;
}

const emptySlaPendienteEmpresaStats = () => ({
  FC: { total: 0, porTaller: {} },
  GV: { total: 0, porTaller: {} },
  PW: { total: 0, porTaller: {} }
});

function endOfTodayLocal() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Presupuestos abiertos con subestado SLA "pendiente" (computeSubestadoAbierto), agrupados por FC/GV/PW.
 * Incluye `fechaDesde` / `fechaHasta` para el dashboard (rango cubierto: creación más antigua incluida → fin de hoy).
 */
export async function getPresupSlaPendienteStatsPorEmpresa(presupCfg) {
  const fechaHasta = endOfTodayLocal();
  const fechaHastaIso = fechaHasta.toISOString();

  if (!presupCfg?.mongodb?.uri) {
    return { ...emptySlaPendienteEmpresaStats(), fechaDesde: null, fechaHasta: fechaHastaIso };
  }
  try {
    const collName = presupCfg?.mongodb?.collection || 'presup_taller';
    const conn = await getPresupConnection(presupCfg);
    const rows = await aggregateByReferencia(conn, collName, {});
    const pendiente = rows.filter((r) => r.estado === 'abierto' || r.estado === 'pendiente');
    const periodoDias = Math.min(
      365,
      Math.max(1, parseInt(String(presupCfg?.general?.periodoDiasPendiente ?? 7), 10) || 7)
    );
    const ultimosCom = await fetchUltimoComentarioAtPorReferencias(
      presupCfg,
      pendiente.map((r) => r._id)
    );
    const catalog = await fetchTalleresCatalog(presupCfg);
    const stats = emptySlaPendienteEmpresaStats();
    let minFechaCreacion = null;
    for (const r of pendiente) {
      const sub = computeSubestadoAbierto({
        fechaCreacion: r.fecha,
        ultimoComentarioAt: ultimosCom.get(String(r._id)),
        periodoDias
      });
      if (sub !== 'pendiente') continue;
      const label = resolveLabelFromTallerRaw(r.taller, catalog);
      const empresa = empresaDesdeEtiquetaTaller(label);
      if (!empresa) continue;
      const fc = r.fecha ? new Date(r.fecha) : null;
      if (fc && !Number.isNaN(fc.getTime())) {
        if (!minFechaCreacion || fc.getTime() < minFechaCreacion.getTime()) minFechaCreacion = fc;
      }
      stats[empresa].total += 1;
      const porT = stats[empresa].porTaller;
      porT[label] = (porT[label] || 0) + 1;
    }
    let fechaDesdeIso = null;
    if (minFechaCreacion) {
      const fd = new Date(minFechaCreacion);
      fd.setHours(0, 0, 0, 0);
      fechaDesdeIso = fd.toISOString();
    }
    return { ...stats, fechaDesde: fechaDesdeIso, fechaHasta: fechaHastaIso };
  } catch (e) {
    console.warn('[presupCrm] getPresupSlaPendienteStatsPorEmpresa:', e?.message || e);
    return { ...emptySlaPendienteEmpresaStats(), fechaDesde: null, fechaHasta: fechaHastaIso };
  }
}

export async function listPresupuestos(presupCfg, query) {
  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
  const search = (query.search || '').trim().toLowerCase();
  const estadoRaw = (query.estado || '').trim();
  const estado = estadoRaw.toLowerCase();
  const subestado = (query.subestado || '').trim().toLowerCase();
  const taller = (query.taller || '').trim().toLowerCase();
  const tipoSiniestro = (query.tipoSiniestro || '').trim().toLowerCase();
  const subestadoAbiertoQ = (query.subestadoAbierto || '').trim().toLowerCase();

  const conn = await getPresupConnection(presupCfg);
  const dateMatch = buildDateMatch(query.fechaDesde || null, query.fechaHasta || null);
  let rows = await aggregateByReferencia(conn, collName, dateMatch);

  if (search) {
    rows = rows.filter(
      (r) =>
        String(r._id).toLowerCase().includes(search) ||
        String(r.cliente || '')
          .toLowerCase()
          .includes(search)
    );
  }
  if (estado) {
    const nq = canonEstadoNorm(mergeEstadoSubestado(estadoRaw, ''));
    rows = rows.filter((r) => r.estado === nq);
  }
  if (subestado) {
    rows = rows.filter((r) => String(r.subestado || '').toLowerCase() === subestado);
  }
  if (taller) {
    rows = rows.filter((r) => String(r.taller || '').toLowerCase() === taller);
  }
  if (tipoSiniestro) {
    rows = rows.filter(
      (r) => String(r.tipoSiniestro || '').toLowerCase() === tipoSiniestro
    );
  }

  const periodoDiasLista = Math.min(
    365,
    Math.max(1, parseInt(String(presupCfg?.general?.periodoDiasPendiente ?? 7), 10) || 7)
  );
  if (subestadoAbiertoQ === 'pendiente' || subestadoAbiertoQ === 'en_espera') {
    const ultMap = await fetchUltimoComentarioAtPorReferencias(
      presupCfg,
      rows.map((r) => r._id)
    );
    rows = rows.filter((r) => {
      if (canonEstadoNorm(r.estado) !== 'abierto') return false;
      const sub = computeSubestadoAbierto({
        fechaCreacion: r.fecha,
        ultimoComentarioAt: ultMap.get(String(r._id)),
        periodoDias: periodoDiasLista
      });
      return sub === subestadoAbiertoQ;
    });
  }

  rows.sort((a, b) => {
    const da = a.fecha ? new Date(a.fecha).getTime() : 0;
    const db = b.fecha ? new Date(b.fecha).getTime() : 0;
    return db - da;
  });

  const total = rows.length;
  const slice = rows.slice((page - 1) * limit, page * limit);

  const crmComentariosMap = await countCrmComentariosPorReferencias(
    presupCfg,
    slice.map((r) => r._id)
  );
  const ultimosSlice = await fetchUltimoComentarioAtPorReferencias(
    presupCfg,
    slice.map((r) => r._id)
  );

  const talleresCatalog = await fetchTalleresCatalog(presupCfg);

  const items = slice.map((r) => {
    const margenPct =
      r.margenPct != null && !Number.isNaN(r.margenPct)
        ? Math.round(Number(r.margenPct) * 100) / 100
        : null;
    const descripcion =
      [r.descripcionSiniestro, r.descripcion, r.concepto]
        .map((x) => (x != null ? String(x).trim() : ''))
        .find(Boolean) || '—';
    const excelCom = r.comentariosCount || 0;
    const crmCom = pickCrmComentariosCount(crmComentariosMap, r._id);
    /** Excel (importación) + comentarios CRM en presup_crm_comentarios */
    const comentariosCount = excelCom + crmCom;
    const estNorm = canonEstadoNorm(r.estado);
    let subestadoAbierto = null;
    if (estNorm === 'abierto') {
      subestadoAbierto = computeSubestadoAbierto({
        fechaCreacion: r.fecha,
        ultimoComentarioAt: ultimosSlice.get(String(r._id)),
        periodoDias: periodoDiasLista
      });
    }
    let estadoLabel;
    if (estNorm === 'abierto' && subestadoAbierto) {
      estadoLabel =
        subestadoAbierto === 'pendiente' ? 'abierto · Pendiente' : 'abierto · En espera';
    } else if (estNorm === 'aceptado') {
      estadoLabel = 'Aceptado';
    } else if (estNorm === 'rechazado') {
      estadoLabel = 'Rechazado';
    } else {
      estadoLabel = estNorm;
    }
    const tallerRaw = String(r.taller ?? '').trim();
    let tallerLabel = '—';
    if (tallerRaw && tallerRaw !== '—') {
      tallerLabel = talleresCatalog.length
        ? resolveLabelFromTallerRaw(tallerRaw, talleresCatalog)
        : tallerRaw;
    }

    return {
      referencia: r._id,
      cliente: r.cliente,
      fecha: r.fecha,
      descripcion,
      taller: tallerLabel,
      estado: estNorm,
      estadoLabel,
      subestadoAbierto,
      importe: r.importeTotal,
      margenPct,
      usuario: r.usuario,
      tipoSiniestro: r.tipoSiniestro,
      subestado: r.subestado,
      orEstado: r.orEstado || '',
      numeroOrdenReparacion:
        r.numeroOrdenReparacion != null && String(r.numeroOrdenReparacion).trim() !== ''
          ? String(r.numeroOrdenReparacion).trim()
          : '',
      comentariosCount
    };
  });

  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

/**
 * Todas las líneas Mongo de una referencia (detalle presupuesto / acciones).
 */
export async function getPresupuestoByReferencia(presupCfg, referencia) {
  const ref = String(referencia ?? '').trim();
  if (!ref) throw new Error('Referencia requerida');

  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  const conn = await getPresupConnection(presupCfg);
  await ensurePresupEstadoNormMigrado(conn, collName);
  const Model = getCollectionModel(conn, collName);

  const refNum = parseInt(ref, 10);
  const orConds = [{ referenciaNorm: ref }, { referencia: ref }];
  if (!Number.isNaN(refNum) && String(refNum) === ref) {
    orConds.push({ referenciaNorm: refNum });
    orConds.push({ referencia: refNum });
  }

  const docs = await Model.find({ $or: orConds }).sort({ fechaNorm: -1 }).lean();

  if (!docs.length) return null;

  /** Un doc con `lineas[]` (nuevo) o varios docs planos por ref (legacy). */
  let root;
  let rawLines;
  if (docs.length === 1) {
    root = docs[0];
    if (Array.isArray(root.lineas) && root.lineas.length > 0) {
      rawLines = root.lineas;
    } else {
      rawLines = [root];
    }
  } else {
    root = docs[0];
    rawLines = docs;
  }

  const lineas = rawLines.map((d, i) => {
    const id = d._id != null ? String(d._id) : `line-${i}`;
    return {
      _id: id,
      fecha: d.fechaNorm,
      taller: d.tallerNorm ?? d.taller ?? '',
      pieza: d.pieza != null ? String(d.pieza) : '',
      concepto: d.concepto != null ? String(d.concepto) : '',
      descripcion: d.descripcion != null ? String(d.descripcion) : '',
      descripcionSiniestro:
        d.descripcionSiniestro != null ? String(d.descripcionSiniestro) : '',
      importe: Number(d.importe) || 0,
      costo: Number(d.costo) || 0,
      pvp: Number(d.pvp) || 0,
      cantidad:
        d.cantidad !== undefined && d.cantidad !== null && String(d.cantidad).trim() !== ''
          ? Number(d.cantidad)
          : null,
      estado: d.estadoNorm ?? d.estado ?? '',
      subestado: d.subestado != null ? String(d.subestado) : '',
      usuario: d.usuario != null ? String(d.usuario) : '',
      tipoSiniestro: d.tipoSiniestro != null ? String(d.tipoSiniestro) : '',
      comentariosCount: Number(d.comentariosCount) || 0,
      margenPct: d.margenPct != null && !Number.isNaN(d.margenPct) ? Number(d.margenPct) : null
    };
  });

  const first = root;
  const importeTotal = lineas.reduce((a, l) => a + l.importe, 0);
  const costoTotal = lineas.reduce((a, l) => a + l.costo, 0);
  const pvpTotal = lineas.reduce((a, l) => a + l.pvp, 0);
  const margenGlobalPct =
    pvpTotal > 0
      ? Math.round(((pvpTotal - costoTotal) / pvpTotal) * 10000) / 100
      : null;
  const comentariosMax = Math.max(0, ...lineas.map((l) => l.comentariosCount));

  const fechaTimes = lineas.map((l) => l.fecha).filter(Boolean);
  let fechaCreacion = null;
  if (fechaTimes.length) {
    const tMin = Math.min(...fechaTimes.map((t) => new Date(t).getTime()));
    fechaCreacion = new Date(tMin);
  }

  const oldest = [...rawLines].sort(
    (a, b) => new Date(a.fechaNorm || 0) - new Date(b.fechaNorm || 0)
  )[0];
  const cta = first.cta != null ? String(first.cta) : '';
  const usuarioAuditoria =
    oldest?.usuario != null ? String(oldest.usuario) : first.usuario != null ? String(first.usuario) : '';
  const fechaAuditoria = oldest?.fechaNorm || first.fechaNorm || null;

  const sub = first.subestado != null ? String(first.subestado).trim() : '';
  const periodoDiasDet = Math.min(
    365,
    Math.max(1, parseInt(String(presupCfg?.general?.periodoDiasPendiente ?? 7), 10) || 7)
  );
  const estadoNormCanon = canonEstadoNorm(mergeEstadoSubestado(first.estadoNorm ?? first.estado, first.subestado));

  const comentariosModel = getComentariosModel(conn);
  const filtroCom = buildReferenciaComentarioFilter(ref);
  const lastComRows = filtroCom
    ? await comentariosModel.find(filtroCom).sort({ createdAt: -1 }).limit(1).lean()
    : [];
  const lastComDoc = lastComRows[0];
  const ultimoComentarioAt = lastComDoc?.createdAt ?? null;

  const fechaUltimaActividad = (() => {
    const t0 = fechaCreacion ? new Date(fechaCreacion).getTime() : 0;
    const t1 = ultimoComentarioAt ? new Date(ultimoComentarioAt).getTime() : 0;
    const m = Math.max(t0, t1);
    if (!m || Number.isNaN(m)) return fechaCreacion;
    return new Date(m);
  })();

  let subestadoAbierto = null;
  let estadoEtiqueta = '—';
  if (estadoNormCanon === 'abierto') {
    subestadoAbierto = computeSubestadoAbierto({
      fechaCreacion,
      ultimoComentarioAt,
      periodoDias: periodoDiasDet
    });
    estadoEtiqueta =
      subestadoAbierto === 'pendiente' ? 'Abierto — Pendiente' : 'Abierto — En espera';
  } else {
    const est = first.estadoNorm != null ? String(first.estadoNorm) : first.estado != null ? String(first.estado) : '';
    estadoEtiqueta = sub && est ? `${est} (${sub})` : sub || est || '—';
  }

  /** Todas las líneas del presupuesto (MO, repuestos, etc.). Antes solo se listaban filas con columna Pieza no vacía y se ocultaban mano de obra y otras. */
  const piezasList = lineas.map((l) => {
    let margenLinea = l.margenPct;
    if (
      (margenLinea == null || Number.isNaN(Number(margenLinea))) &&
      l.pvp > 0 &&
      l.costo >= 0
    ) {
      margenLinea = Math.round(((l.pvp - l.costo) / l.pvp) * 10000) / 100;
    }
    return {
      _id: l._id,
      pieza: (l.pieza && String(l.pieza).trim()) || '—',
      concepto: l.concepto || l.descripcion || '—',
      cantidad: l.cantidad != null && !Number.isNaN(Number(l.cantidad)) ? Number(l.cantidad) : null,
      costo: l.costo,
      pvp: l.pvp,
      margenPct:
        margenLinea != null && !Number.isNaN(Number(margenLinea))
          ? Math.round(Number(margenLinea) * 100) / 100
          : null,
      importe: l.importe
    };
  });

  const tallerCab =
    first.tallerNorm != null && String(first.tallerNorm).trim()
      ? String(first.tallerNorm)
      : first.taller != null
        ? String(first.taller)
        : '';

  const talleresCatalogDet = await fetchTalleresCatalog(presupCfg);
  const tallerTrim = String(tallerCab ?? '').trim();
  const tallerDisplay =
    tallerTrim && talleresCatalogDet.length
      ? resolveLabelFromTallerRaw(tallerTrim, talleresCatalogDet)
      : tallerCab;

  const crmComentariosMap = await countCrmComentariosPorReferencias(presupCfg, [ref]);
  const crmCom = pickCrmComentariosCount(crmComentariosMap, ref);
  const comentariosCountTotal = comentariosMax + crmCom;

  return {
    referencia: ref,
    cliente: first.cliente != null ? String(first.cliente) : '',
    taller: tallerDisplay || tallerCab,
    cta,
    tipoSiniestro: first.tipoSiniestro != null ? String(first.tipoSiniestro) : '',
    orEstado: first.orEstado != null ? String(first.orEstado) : '',
    motivoRechazo: first.motivoRechazo != null ? String(first.motivoRechazo) : '',
    descripcionSiniestro:
      first.descripcionSiniestro != null ? String(first.descripcionSiniestro) : '',
    estadoEtiqueta,
    estadoNorm: estadoNormCanon,
    subestadoAbierto,
    fechaUltimaActividad,
    numeroOrdenReparacion:
      first.numeroOrdenReparacion != null && String(first.numeroOrdenReparacion).trim() !== ''
        ? String(first.numeroOrdenReparacion).trim()
        : '',
    subestado: sub,
    fechaCreacion,
    usuarioAuditoria,
    fechaAuditoria,
    lineas,
    piezas: piezasList,
    totales: {
      importe: importeTotal,
      costo: costoTotal,
      pvp: pvpTotal,
      margenPct: margenGlobalPct,
      lineas: lineas.length
    },
    comentariosCount: comentariosCountTotal
  };
}

function buildReferenciaFilter(ref) {
  const refStr = String(ref ?? '').trim();
  if (!refStr) return null;
  const refNum = parseInt(refStr, 10);
  const orConds = [{ referenciaNorm: refStr }, { referencia: refStr }];
  if (!Number.isNaN(refNum) && String(refNum) === refStr) {
    orConds.push({ referenciaNorm: refNum });
    orConds.push({ referencia: refNum });
    /** Importaciones recientes guardan referenciaNum para coincidir con consultas numéricas en Compass */
    orConds.push({ referenciaNum: refNum });
  }
  return { $or: orConds };
}

/**
 * Conteo de comentarios en presup_crm_comentarios por lote de referencias (listado).
 * Agrupa por referencia normalizada a string para alinear con _id del listado.
 */
async function countCrmComentariosPorReferencias(presupCfg, referencias) {
  const ids = [...new Set((referencias || []).filter((x) => x !== undefined && x !== null))];
  if (!ids.length) return {};
  const inVals = new Set();
  for (const id of ids) {
    const s = String(id).trim();
    if (!s) continue;
    inVals.add(s);
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && String(n) === s) inVals.add(n);
  }
  const arr = [...inVals];
  if (!arr.length) return {};
  const conn = await getPresupConnection(presupCfg);
  const Model = getComentariosModel(conn);
  const rows = await Model.aggregate([
    { $match: { referencia: { $in: arr } } },
    {
      $group: {
        _id: { $toString: '$referencia' },
        n: { $sum: 1 }
      }
    }
  ]);
  const out = {};
  for (const row of rows) {
    out[String(row._id)] = row.n;
  }
  return out;
}

function pickCrmComentariosCount(crmMap, referenciaId) {
  if (!crmMap || referenciaId === undefined || referenciaId === null) return 0;
  const s = String(referenciaId).trim();
  if (crmMap[s] != null) return crmMap[s];
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && crmMap[String(n)] != null) return crmMap[String(n)];
  return 0;
}

export async function listComentariosPresup(presupCfg, referencia) {
  const ref = String(referencia ?? '').trim();
  if (!ref) return [];
  const conn = await getPresupConnection(presupCfg);
  const Model = getComentariosModel(conn);
  const filter = buildReferenciaComentarioFilter(ref);
  const rows = await Model.find(filter).sort({ createdAt: -1 }).lean().exec();
  return rows.map((r) => ({
    id: String(r._id),
    usuario: r.usuario || '',
    texto: r.texto || '',
    createdAt: r.createdAt
  }));
}

export async function addComentarioPresup(presupCfg, referencia, { usuario, texto }) {
  const ref = String(referencia ?? '').trim();
  const t = String(texto ?? '').trim();
  if (!ref) throw new Error('Referencia requerida');
  if (!t) throw new Error('Comentario vacío');
  const conn = await getPresupConnection(presupCfg);
  const Model = getComentariosModel(conn);
  const doc = await Model.create({
    referencia: ref,
    usuario: String(usuario ?? '').trim() || 'Usuario',
    texto: t
  });
  return { id: String(doc._id), usuario: doc.usuario, texto: doc.texto, createdAt: doc.createdAt };
}

/**
 * @param {object|string} accionOrPayload  `{ accion, numeroOrdenReparacion?, comentario?, motivo?, usuario? }` o solo `accion` (retrocompat).
 */
export async function updatePresupuestoEstado(presupCfg, referencia, accionOrPayload) {
  const payload =
    typeof accionOrPayload === 'object' && accionOrPayload !== null && !Array.isArray(accionOrPayload)
      ? accionOrPayload
      : { accion: accionOrPayload };
  const acc = String(payload.accion ?? '')
    .toLowerCase()
    .trim();
  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  const conn = await getPresupConnection(presupCfg);
  await ensurePresupEstadoNormMigrado(conn, collName);
  const Model = getCollectionModel(conn, collName);
  const filter = buildReferenciaFilter(referencia);
  if (!filter) throw new Error('Referencia requerida');

  let estadoNorm;
  let estado;
  let subestado;
  /** @type {Record<string, unknown>} */
  const extraSet = {};

  if (acc === 'aceptar') {
    estadoNorm = 'aceptado';
    estado = 'Aceptado';
    subestado = 'Aceptado';
    /** N.º OR opcional al aceptar; se puede cargar después desde la ficha del presupuesto. */
    const rawOr = payload.numeroOrdenReparacion;
    const orStr = rawOr != null ? String(rawOr).trim() : '';
    if (orStr !== '') {
      if (!/^\d{1,10}$/.test(orStr)) {
        throw new Error('Número de orden de reparación: solo dígitos, máximo 10 caracteres');
      }
      extraSet.numeroOrdenReparacion = orStr;
    } else {
      /** Al pasar de abierto → aceptado sin OR, no conservar un n.º previo (p. ej. tras reabrir). */
      extraSet.numeroOrdenReparacion = '';
    }
  } else if (acc === 'guardarordenreparacion' || acc === 'guardar_orden_reparacion') {
    const docs = await Model.find(filter).limit(1).lean();
    if (!docs.length) throw new Error('No se encontró el presupuesto');
    const cur = canonEstadoNorm(
      mergeEstadoSubestado(docs[0].estadoNorm ?? docs[0].estado, docs[0].subestado)
    );
    if (cur !== 'aceptado') {
      throw new Error('El número de orden solo se puede editar con el presupuesto en estado Aceptado');
    }
    const rawOr = payload.numeroOrdenReparacion;
    const orStr = rawOr != null ? String(rawOr).trim() : '';
    if (orStr !== '' && !/^\d{1,10}$/.test(orStr)) {
      throw new Error('Número de orden de reparación: solo dígitos, máximo 10 caracteres');
    }
    const r = await Model.updateMany(filter, {
      $set: { numeroOrdenReparacion: orStr, updatedAt: new Date() }
    });
    return { modified: r.modifiedCount, matched: r.matchedCount };
  } else if (acc === 'rechazar') {
    const comentario = String(payload.comentario ?? payload.motivo ?? '').trim();
    if (!comentario) {
      throw new Error('Comentario obligatorio al rechazar');
    }
    await addComentarioPresup(presupCfg, referencia, {
      usuario: String(payload.usuario ?? '').trim() || 'Usuario',
      texto: comentario
    });
    estadoNorm = 'rechazado';
    estado = 'Rechazado';
    subestado = 'Rechazado';
    /** Al pasar de abierto → rechazado, no conservar OR CRM (evita check verde en listado). */
    extraSet.numeroOrdenReparacion = '';
  } else if (acc === 'reabrir') {
    /** Conservar historial: no se borra `numeroOrdenReparacion` en reabrir. */
    estadoNorm = 'abierto';
    estado = 'Abierto';
    subestado = '';
  } else {
    throw new Error('Acción no válida (aceptar, rechazar, reabrir)');
  }

  const r = await Model.updateMany(filter, {
    $set: {
      estadoNorm,
      estado,
      subestado,
      updatedAt: new Date(),
      ...extraSet
    }
  });
  return { modified: r.modifiedCount, matched: r.matchedCount };
}

function safeDirForReferencia(dirBase, referencia) {
  const base = path.resolve(String(dirBase || '').trim());
  const ref = String(referencia ?? '').trim();
  if (!ref || ref.includes('..') || /[/\\]/.test(ref)) {
    throw new Error('Referencia inválida');
  }
  const full = path.resolve(path.join(base, ref));
  if (!full.startsWith(base)) throw new Error('Ruta fuera del directorio base');
  return full;
}

export async function listAdjuntosPresup(presupCfg, referencia) {
  const base = String(presupCfg?.general?.directorioAdjuntos || '').trim();
  if (!base) return [];
  const dir = safeDirForReferencia(base, referencia);
  try {
    const names = await fsp.readdir(dir);
    const out = [];
    for (const name of names) {
      const fp = path.join(dir, name);
      try {
        const st = await fsp.stat(fp);
        if (st.isFile()) out.push({ nombre: name, size: st.size, mtime: st.mtime });
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function guardarAdjuntoPresup(presupCfg, referencia, file) {
  const base = String(presupCfg?.general?.directorioAdjuntos || '').trim();
  if (!base) throw new Error('Configure el directorio de adjuntos en Parámetros de presupuestos → General');
  if (!file?.buffer?.length) throw new Error('Archivo vacío');
  const dir = safeDirForReferencia(base, referencia);
  await fsp.mkdir(dir, { recursive: true });
  const safeName = String(file.originalname || 'archivo')
    .replace(/[^a-zA-Z0-9._\s-]/g, '_')
    .trim() || 'archivo';
  const fp = path.join(dir, safeName);
  await fsp.writeFile(fp, file.buffer);
  const st = await fsp.stat(fp);
  return { nombre: safeName, size: st.size };
}

function sortDistinctStrings(arr) {
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
}

/** Une distinct de campos alternativos (p. ej. taller vs tallerNorm) para desplegables. */
async function mergeDistinct(Model, ...fieldNames) {
  const parts = await Promise.all(fieldNames.map((f) => Model.distinct(f)));
  return sortDistinctStrings(parts.flat());
}

/** Estados canónicos CRM (`estadoNorm`); el listado filtra solo con estos valores. */
export const PRESUP_ESTADOS_CANONICOS = ['abierto', 'aceptado', 'rechazado'];

export async function getPresupFiltrosOpciones(presupCfg) {
  const collName = presupCfg?.mongodb?.collection || 'presup_taller';
  const conn = await getPresupConnection(presupCfg);
  const Model = getCollectionModel(conn, collName);
  const cap = 500;
  const [tipoSiniestro, taller, subestado] = await Promise.all([
    Model.distinct('tipoSiniestro'),
    mergeDistinct(Model, 'tallerNorm', 'taller'),
    Model.distinct('subestado')
  ]);
  return {
    tipoSiniestro: sortDistinctStrings(tipoSiniestro).slice(0, cap),
    taller: taller.slice(0, cap),
    estado: [...PRESUP_ESTADOS_CANONICOS],
    subestado: sortDistinctStrings(subestado).slice(0, cap)
  };
}
