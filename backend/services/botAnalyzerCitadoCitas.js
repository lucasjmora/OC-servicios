import Cita from '../models/Cita.js';
import { normalizeTelefonoCita549 } from '../utils/fieldCleaner.js';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Solo dígitos del sessionId (p. ej. WhatsApp). */
function sessionDigitsOnly(sessionId) {
  return String(sessionId ?? '').replace(/\D/g, '');
}

/** Mínimo de dígitos para considerar un número válido (evita falsos positivos). */
const MIN_SESSION_DIGITS = 10;

/** Tamaño de cada $or contra citas (consultas más pequeñas + en paralelo = menos tiempo total). */
const CITA_TELEFONO_OR_CHUNK = 35;
/** Máximo de consultas Cita simultáneas para no saturar el pool de Mongo. */
const CITA_QUERY_PARALLEL = 6;

/** Día calendario local comparable: AAAAMMDD numérico */
function calendarDayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return null;
  return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate();
}

/**
 * Marca citado: cita en CRM (teléfono = session en dígitos y Fecha cr >= día último mensaje)
 * o bien conversación con herramienta agendar_turno (turno tomado en el bot).
 * @param {Array<Object>} conversations
 * @returns {Promise<Array<Object>>}
 */
export async function mergeCitadoEnConversaciones(conversations) {
  if (!conversations?.length) return conversations;

  const sessionSet = new Set();
  for (const conv of conversations) {
    const sd = sessionDigitsOnly(conv.sessionId);
    if (sd.length >= MIN_SESSION_DIGITS) sessionSet.add(sd);
  }
  const sessionFullList = [...sessionSet];
  if (sessionFullList.length === 0) {
    return conversations.map((c) => ({
      ...c,
      citado: Boolean(c.herramientasUtilizadas?.tieneAgendarTurno)
    }));
  }

  const chunks = [];
  for (let i = 0; i < sessionFullList.length; i += CITA_TELEFONO_OR_CHUNK) {
    chunks.push(sessionFullList.slice(i, i + CITA_TELEFONO_OR_CHUNK));
  }

  const runOrChunk = (phones) =>
    Cita.find(
      {
        $or: phones.map((sd) => ({
          Telefono: { $regex: '^' + escapeRegex(sd) }
        }))
      },
      { Telefono: 1, 'Fecha cr': 1 }
    ).lean();

  const citasNested = [];
  for (let i = 0; i < chunks.length; i += CITA_QUERY_PARALLEL) {
    const batch = chunks.slice(i, i + CITA_QUERY_PARALLEL);
    const part = await Promise.all(batch.map(runOrChunk));
    citasNested.push(...part);
  }

  const citasRaw = citasNested.flat();
  const citaPorId = new Map();
  for (const cita of citasRaw) {
    if (cita?._id != null) citaPorId.set(String(cita._id), cita);
  }
  const citas = [...citaPorId.values()];

  /** @type {Map<string, number[]>} clave = tel normalizado completo */
  const byFullPhone = new Map();
  for (const cita of citas) {
    const norm = normalizeTelefonoCita549(cita.Telefono);
    if (!norm || norm.length < MIN_SESSION_DIGITS) continue;
    const fk = calendarDayKey(cita['Fecha cr']);
    if (fk == null) continue;
    if (!byFullPhone.has(norm)) byFullPhone.set(norm, []);
    byFullPhone.get(norm).push(fk);
  }

  return conversations.map((conv) => {
    const porAgendar = Boolean(conv.herramientasUtilizadas?.tieneAgendarTurno);

    const sd = sessionDigitsOnly(conv.sessionId);
    if (sd.length < MIN_SESSION_DIGITS) {
      return { ...conv, citado: porAgendar };
    }
    const lastDay = calendarDayKey(conv.lastMessageDate);
    let porCita = false;
    if (lastDay != null) {
      const fechasCita = byFullPhone.get(sd);
      if (fechasCita?.length) {
        porCita = fechasCita.some((d) => d >= lastDay);
      }
    }
    return { ...conv, citado: porCita || porAgendar };
  });
}
