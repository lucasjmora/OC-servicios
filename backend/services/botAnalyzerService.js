import mongoose from 'mongoose';
import botMessageSchema from '../models/BotMessage.js';
import Configuracion from '../models/Configuracion.js';
import MartinaInteracciones from '../models/MartinaInteracciones.js';
import BotConversacionGestion from '../models/BotConversacionGestion.js';
import { mergeCitadoEnConversaciones } from './botAnalyzerCitadoCitas.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeo de empresas a colecciones
const EMPRESA_COLLECTIONS = {
  'FC': 'asistente_fortecar_3_1_v2_martina_flows',
  'GV': 'asistente_granville_3_1_v2_martina_flows',
  'PW': 'asistente_pampawagen_3_1_v2_martina_flows'
};

/** Query `localidad` = este valor → solo conversaciones sin localidad (sync con FILTRO_BOT_ANALYZER_SIN_LOCALIDAD en frontend). */
const FILTRO_LOCALIDAD_SIN = '__sin_localidad__';

function esLocalidadVaciaParaFiltro(loc) {
  return loc == null || String(loc).trim() === '';
}

/** Valor sintético en respuestas del listado (no se persiste en gestión). */
export const ESTADO_ANALIZADOR_AGENDADO = 'agendado';

/**
 * Si hubo agendar_turno / agendar_turno_v2, el estado en API es `agendado` (UI/CSV: campo vacío); no cuenta como tratado ni como “no tratado” a gestionar.
 */
export function aplicarEstadoPorReglaAgendarBotAnalyzer(conversations) {
  if (!conversations?.length) return;
  for (const c of conversations) {
    if (c.herramientasUtilizadas?.tieneAgendarTurno) {
      c.estado = ESTADO_ANALIZADOR_AGENDADO;
    }
  }
}

/** @deprecated usar aplicarEstadoPorReglaAgendarBotAnalyzer */
export const aplicarEstadoNoTratadoSiAgendarTurno = aplicarEstadoPorReglaAgendarBotAnalyzer;

/** True si el nombre de herramienta es agendar_turno_v2 o cualquier agendar_turno… (Flowise). */
export function esNombreHerramientaAgendarTurno(raw) {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  if (!s) return false;
  return s === 'agendar_turno_v2' || s.startsWith('agendar_turno');
}

/**
 * Detecta ejecución de agendar en un elemento de usedTools (objeto, string o nombre en toolInput).
 */
export function entradaUsedToolsEsAgendarTurno(tool) {
  if (tool == null) return false;
  if (typeof tool === 'string') return esNombreHerramientaAgendarTurno(tool);
  if (typeof tool === 'object') {
    const n = tool.tool ?? tool.name ?? tool.toolName;
    if (esNombreHerramientaAgendarTurno(n)) return true;
    const ti = tool.toolInput;
    if (ti && typeof ti === 'object') {
      const nested = ti.tool ?? ti.toolName ?? ti.tool_used;
      if (esNombreHerramientaAgendarTurno(nested)) return true;
    }
  }
  return false;
}

function usedToolsArrayTieneAgendarTurno(toolsArray) {
  if (!toolsArray || !Array.isArray(toolsArray)) return false;
  return toolsArray.some(entradaUsedToolsEsAgendarTurno);
}

/** Normaliza req.query.estado → 'tratado' | 'no_tratado' | null (arrays Express, espacios, mayúsculas). */
export function parseBotAnalyzerEstadoQuery(raw) {
  if (raw == null || raw === '') return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim().toLowerCase();
  if (s === 'tratado') return 'tratado';
  if (s === 'no_tratado') return 'no_tratado';
  return null;
}

/** Clave canónica para cruzar sessionId del bot con BotConversacionGestion (sufijos tipo @c.us). */
export function canonicalSessionIdForGestion(sessionId) {
  if (sessionId == null || sessionId === '') return '';
  const s = String(sessionId).trim();
  const i = s.indexOf('@');
  return i > 0 ? s.slice(0, i) : s;
}

/** Variantes a buscar en Mongo para encontrar el documento de gestión aunque el ID lleve o no JID. */
export function collectSessionIdVariantsForGestion(sessionIds) {
  const variantSet = new Set();
  const arr = Array.isArray(sessionIds) ? sessionIds : [];
  for (const sid of arr) {
    const k = canonicalSessionIdForGestion(sid);
    if (!k) continue;
    variantSet.add(k);
    variantSet.add(`${k}@c.us`);
    variantSet.add(`${k}@s.whatsapp.net`);
  }
  return [...variantSet];
}

const GESTION_SESSION_IN_CHUNK = 8000;

async function mergeEstadosGestionBotAnalyzer(conversations, empresaUpper) {
  const baseIds = conversations.map((c) => c.sessionId);
  const queryIds = collectSessionIdVariantsForGestion(baseIds);
  if (queryIds.length === 0) {
    for (const c of conversations) {
      if (c.estado == null) c.estado = 'no_tratado';
    }
    return;
  }
  const map = {};
  for (let i = 0; i < queryIds.length; i += GESTION_SESSION_IN_CHUNK) {
    const chunk = queryIds.slice(i, i + GESTION_SESSION_IN_CHUNK);
    const rows = await BotConversacionGestion.find({
      sessionId: { $in: chunk },
      empresa: empresaUpper
    }).lean();
    rows.forEach((r) => {
      map[canonicalSessionIdForGestion(r.sessionId)] = r.estado;
    });
  }
  for (const c of conversations) {
    c.estado = map[canonicalSessionIdForGestion(c.sessionId)] || 'no_tratado';
  }
}

/** Variantes de sessionId presentes en Flowise para todas las sesiones marcadas tratado en gestión. */
async function fetchTratadoSessionIdVariants(empresaUpper) {
  if (!empresaUpper) return [];
  const rows = await BotConversacionGestion.find(
    { empresa: empresaUpper, estado: 'tratado' },
    { sessionId: 1, _id: 0 }
  ).lean();
  const ids = rows.map((r) => r.sessionId).filter(Boolean);
  return collectSessionIdVariantsForGestion(ids);
}

/**
 * Combina matchStage.sessionId con $in / $nin (filtro estado en Mongo).
 * Soporta $in previo (keyword), $regex (búsqueda por sessionId) y ausencia de filtro.
 */
function mergeSessionIdConstraint(matchStage, constraint) {
  const existing = matchStage.sessionId;
  if (existing == null) {
    matchStage.sessionId = constraint;
    return;
  }
  if (existing.$in && constraint.$in) {
    const allow = new Set(constraint.$in);
    matchStage.sessionId = { $in: existing.$in.filter((id) => allow.has(id)) };
    return;
  }
  if (existing.$in && constraint.$nin) {
    const deny = new Set(constraint.$nin);
    matchStage.sessionId = { $in: existing.$in.filter((id) => !deny.has(id)) };
    return;
  }
  if (existing.$in && constraint.$regex != null) {
    const andArr = [...(matchStage.$and || [])];
    andArr.push({ sessionId: { $in: existing.$in } });
    andArr.push({
      sessionId: { $regex: constraint.$regex, $options: constraint.$options || 'i' }
    });
    matchStage.$and = andArr;
    delete matchStage.sessionId;
    return;
  }
  if (existing.$regex != null && (constraint.$in || constraint.$nin)) {
    const andArr = [...(matchStage.$and || [])];
    andArr.push({
      sessionId: { $regex: existing.$regex, $options: existing.$options || 'i' }
    });
    andArr.push({ sessionId: constraint });
    matchStage.$and = andArr;
    delete matchStage.sessionId;
    return;
  }
  matchStage.$and = [...(matchStage.$and || []), { sessionId: existing }, { sessionId: constraint }];
  delete matchStage.sessionId;
}

function isEmptySessionIdInMatch(matchStage) {
  const s = matchStage.sessionId;
  return Boolean(s && s.$in && Array.isArray(s.$in) && s.$in.length === 0);
}

// Conexión separada para flowiseProd
let botAnalyzerConnection = null;

/**
 * Conecta a MongoDB flowiseProd usando conexión separada
 */
async function connectToFlowiseProd() {
  try {
    // Si ya está conectado, reutilizar la conexión
    if (botAnalyzerConnection && botAnalyzerConnection.readyState === 1) {
      return botAnalyzerConnection;
    }

    const uri = process.env.BOT_ANALYZER_MONGODB_URI;
    
    if (!uri) {
      throw new Error('BOT_ANALYZER_MONGODB_URI no está configurada en las variables de entorno');
    }

    // Crear conexión separada
    botAnalyzerConnection = mongoose.createConnection(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: true // Permitir buffer mientras se conecta
    });

    // Esperar a que la conexión esté lista
    await botAnalyzerConnection.asPromise();

    console.log('[BOT ANALYZER] Conectado a MongoDB flowiseProd');
    return botAnalyzerConnection;
  } catch (error) {
    console.error('[BOT ANALYZER] Error conectando a flowiseProd:', error.message);
    throw error;
  }
}

/**
 * Obtiene el modelo de mensaje para una empresa específica
 */
function getBotMessageModel(empresa) {
  const collectionName = EMPRESA_COLLECTIONS[empresa.toUpperCase()];
  
  if (!collectionName) {
    throw new Error(`Empresa no válida: ${empresa}. Debe ser FC, GV o PW`);
  }

  // Usar el modelo si ya existe, sino crearlo
  if (!botAnalyzerConnection) {
    throw new Error('No hay conexión a flowiseProd. Llama a connectToFlowiseProd primero.');
  }

  // Verificar si el modelo ya existe en la conexión
  if (botAnalyzerConnection.models[collectionName]) {
    return botAnalyzerConnection.models[collectionName];
  }

  // Crear el modelo dinámicamente
  return botAnalyzerConnection.model(collectionName, botMessageSchema, collectionName);
}

/** Dígitos del sessionId desde el 4.º carácter (índice 3). */
function normalizeSessionDigitTail(sessionId) {
  if (sessionId == null) return '';
  return String(sessionId).slice(3).replace(/\D/g, '');
}

/**
 * Resuelve localidad por prefijo de dígitos (regla más larga primero).
 * @param {object} mappingBlob - { FC: [{ secuencia, localidad }], ... }
 */
function resolveLocalidadFromSessionMapping(sessionId, empresa, mappingBlob) {
  if (!mappingBlob || typeof mappingBlob !== 'object') return null;
  const emp = (empresa || '').toUpperCase();
  const rows = mappingBlob[emp];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const tail = normalizeSessionDigitTail(sessionId);
  if (!tail) return null;
  const sorted = rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      secuencia: String(r.secuencia ?? '').replace(/\D/g, ''),
      localidad: String(r.localidad ?? '').trim()
    }))
    .filter((r) => r.secuencia && r.localidad)
    .sort((a, b) => b.secuencia.length - a.secuencia.length);
  for (const r of sorted) {
    if (tail.startsWith(r.secuencia)) return r.localidad;
  }
  return null;
}

const LOCALIDAD_MAP_CACHE_MS = 45_000;
let localidadMapCache = { t: 0, data: null };

async function fetchBotAnalyzerLocalidadMapping() {
  const now = Date.now();
  if (localidadMapCache.data && now - localidadMapCache.t < LOCALIDAD_MAP_CACHE_MS) {
    return localidadMapCache.data;
  }
  const empty = () => {
    const o = { FC: [], GV: [], PW: [] };
    localidadMapCache = { t: now, data: o };
    return o;
  };
  try {
    const doc = await Configuracion.findOne({ singleton: true }).lean();
    const raw = doc?.mappings?.botAnalyzerLocalidadSesion;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return empty();
    }
    const out = {
      FC: Array.isArray(raw.FC) ? raw.FC : [],
      GV: Array.isArray(raw.GV) ? raw.GV : [],
      PW: Array.isArray(raw.PW) ? raw.PW : []
    };
    localidadMapCache = { t: now, data: out };
    return out;
  } catch {
    if (localidadMapCache.data) return localidadMapCache.data;
    return { FC: [], GV: [], PW: [] };
  }
}

/** Ciudad/nombre leído del chat → código Granville (tabla estándar). */
const GRANVILLE_CHAT_NOMBRE_A_CODIGO = new Map(
  [
    ['Trelew', 'TW'],
    ['Junín', 'JU'],
    ['San Nicolás', 'SN'],
    ['Comodoro Rivadavia', 'CO'],
    ['Pergamino', 'PE'],
    ['Puerto Madryn', 'PM']
  ].map(([nombre, codigo]) => [nombre.toLowerCase(), codigo])
);

const GRANVILLE_CODIGOS_VALIDOS = new Set(['TW', 'JU', 'SN', 'CO', 'PE', 'PM']);

/**
 * Para GV: convierte el texto devuelto por el extractor de chat al código de localidad.
 * Si ya es un código válido o no hay match, devuelve el valor (recortado) tal cual.
 */
function mapGranvilleLocalidadFromChat(valor, empresa) {
  if ((empresa || '').toUpperCase() !== 'GV' || valor == null) return valor;
  const t = String(valor).trim();
  if (!t) return valor;
  const porNombre = GRANVILLE_CHAT_NOMBRE_A_CODIGO.get(t.toLowerCase());
  if (porNombre) return porNombre;
  const upper = t.toUpperCase();
  if (GRANVILLE_CODIGOS_VALIDOS.has(upper)) return upper;
  return t;
}

/** Nombre leído del chat → código Fortecar (tabla estándar). */
const FORTECAR_CHAT_NOMBRE_A_CODIGO = new Map(
  [
    ['Junín', 'JU'],
    ['San Nicolás', 'SN'],
    ['Chivilcoy', 'CH'],
    ['9 de Julio', '9J'],
    ['Coronel Suárez', 'CS'],
    ['Olavarría', 'OL'],
    ['Trenque Lauquen', 'TL'],
    ['Pergamino', 'PE']
  ].map(([nombre, codigo]) => [nombre.toLowerCase(), codigo])
);

const FORTECAR_CODIGOS_VALIDOS = new Set(['JU', 'SN', 'CH', '9J', 'CS', 'OL', 'TL', 'PE']);

/**
 * Para FC: convierte el texto devuelto por el extractor de chat al código de localidad.
 */
function mapFortecarLocalidadFromChat(valor, empresa) {
  if ((empresa || '').toUpperCase() !== 'FC' || valor == null) return valor;
  const t = String(valor).trim();
  if (!t) return valor;
  const porNombre = FORTECAR_CHAT_NOMBRE_A_CODIGO.get(t.toLowerCase());
  if (porNombre) return porNombre;
  const upper = t.toUpperCase();
  if (FORTECAR_CODIGOS_VALIDOS.has(upper)) return upper;
  return t;
}

/** Nombre leído del chat → código Pampa-viajes (Pampawagen). */
const PAMPAWAGEN_CHAT_NOMBRE_A_CODIGO = new Map(
  [
    ['General Pico', 'GP'],
    ['Santa Rosa', 'SR']
  ].map(([nombre, codigo]) => [nombre.toLowerCase(), codigo])
);

const PAMPAWAGEN_CODIGOS_VALIDOS = new Set(['GP', 'SR']);

/**
 * Para PW: convierte el texto devuelto por el extractor de chat al código de localidad.
 */
function mapPampawagenLocalidadFromChat(valor, empresa) {
  if ((empresa || '').toUpperCase() !== 'PW' || valor == null) return valor;
  const t = String(valor).trim();
  if (!t) return valor;
  const porNombre = PAMPAWAGEN_CHAT_NOMBRE_A_CODIGO.get(t.toLowerCase());
  if (porNombre) return porNombre;
  const upper = t.toUpperCase();
  if (PAMPAWAGEN_CODIGOS_VALIDOS.has(upper)) return upper;
  return t;
}

/** Aplica mapeo nombre/código del chat según empresa (FC, GV, PW). */
function mapLocalidadDesdeChatPorEmpresa(valor, empresa) {
  return mapPampawagenLocalidadFromChat(
    mapFortecarLocalidadFromChat(mapGranvilleLocalidadFromChat(valor, empresa), empresa),
    empresa
  );
}

/**
 * Normaliza una fecha a día único (YYYY-MM-DD) sin horas
 * @param {Date|string} fecha - Fecha a normalizar
 * @returns {string|null} Fecha normalizada en formato YYYY-MM-DD o null si no es válida
 */
function normalizarFechaADia(fecha) {
  if (!fecha) return null;
  try {
    const date = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  } catch (e) {
    return null;
  }
}

/**
 * Extrae la localidad mencionada en una conversación de Fortecar
 * Busca referencias a las localidades en toda la conversación (mensajes del bot y del usuario)
 * @param {Object} conv - Objeto de conversación con allTools, userMessages y allMessages
 * @param {Array} localidadesFortecar - Lista de localidades de Fortecar
 * @returns {string|null} Localidad encontrada o null
 */
function extractLocalidadFortecar(conv, localidadesFortecar) {
  let localidadEncontrada = null;
  
  // PRIMERO: Buscar en toolInput de agendar_turno_v2 (más confiable)
  if (conv.allTools && Array.isArray(conv.allTools)) {
    for (const toolsArray of conv.allTools) {
      if (toolsArray && Array.isArray(toolsArray)) {
        for (const tool of toolsArray) {
          if (tool && typeof tool === 'object' && tool.tool === 'agendar_turno_v2') {
            const toolInput = tool.toolInput;
            if (toolInput && typeof toolInput === 'object') {
              const camposLocalidad = ['localidad', 'ciudad', 'taller', 'sucursal', 'ubicacion', 'location', 'city', 'localidad_nombre'];
              for (const campo of camposLocalidad) {
                if (toolInput[campo] && typeof toolInput[campo] === 'string' && toolInput[campo].trim()) {
                  const valor = toolInput[campo].trim();
                  const valorLower = valor.toLowerCase();
                  
                  // Verificar si coincide con alguna localidad de Fortecar
                  for (const loc of localidadesFortecar) {
                    const locLower = loc.toLowerCase();
                    if (valorLower === locLower || 
                        valorLower.includes(locLower) || 
                        locLower.includes(valorLower)) {
                      return loc;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // SEGUNDO: Buscar en todos los mensajes de la conversación (bot y usuario)
  if (conv.allMessages && Array.isArray(conv.allMessages)) {
    // Ordenar mensajes por fecha para procesar en orden cronológico
    const mensajesOrdenados = conv.allMessages
      .filter(msg => msg && msg.content && typeof msg.content === 'string')
      .sort((a, b) => {
        if (!a.createdDate || !b.createdDate) return 0;
        return new Date(a.createdDate) - new Date(b.createdDate);
      });
    
    // Buscar referencias a localidades en todos los mensajes
    // Priorizar mensajes del usuario sobre mensajes del bot
    const mensajesUsuario = mensajesOrdenados.filter(msg => msg.role === 'userMessage');
    const mensajesBot = mensajesOrdenados.filter(msg => msg.role === 'apiMessage');
    
    // Buscar primero en mensajes del usuario (más relevantes)
    for (const mensaje of mensajesUsuario) {
      const contenido = mensaje.content.toLowerCase();
      
      // Buscar cada localidad de Fortecar
      for (const loc of localidadesFortecar) {
        const locLower = loc.toLowerCase();
        // Buscar coincidencia exacta o como palabra completa
        const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(mensaje.content) || contenido.includes(locLower)) {
          localidadEncontrada = loc;
          break;
        }
      }
      if (localidadEncontrada) break;
    }
    
    // Si no se encontró en mensajes del usuario, buscar en mensajes del bot
    if (!localidadEncontrada) {
      for (const mensaje of mensajesBot) {
        const contenido = mensaje.content.toLowerCase();
        
        for (const loc of localidadesFortecar) {
          const locLower = loc.toLowerCase();
          const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
          if (regex.test(mensaje.content) || contenido.includes(locLower)) {
            // Verificar que no sea solo parte de la pregunta de opciones
            // Si el mensaje contiene múltiples localidades, probablemente es la lista de opciones
            const localidadesEnMensaje = localidadesFortecar.filter(l => 
              contenido.includes(l.toLowerCase())
            ).length;
            
            // Si solo menciona una localidad, es más probable que sea una referencia válida
            if (localidadesEnMensaje <= 2) {
              localidadEncontrada = loc;
              break;
            }
          }
        }
        if (localidadEncontrada) break;
      }
    }
  }
  
  return localidadEncontrada;
}

/**
 * Extrae la localidad mencionada en una conversación de Pampawagen
 * Busca referencias a las localidades en toda la conversación (mensajes del bot y del usuario)
 * @param {Object} conv - Objeto de conversación con allTools, userMessages y allMessages
 * @param {Array} localidadesPampawagen - Lista de localidades de Pampawagen
 * @returns {string|null} Localidad encontrada o null
 */
function extractLocalidadPampawagen(conv, localidadesPampawagen) {
  let localidadEncontrada = null;
  
  // PRIMERO: Buscar en toolInput de agendar_turno_v2 (más confiable)
  if (conv.allTools && Array.isArray(conv.allTools)) {
    for (const toolsArray of conv.allTools) {
      if (toolsArray && Array.isArray(toolsArray)) {
        for (const tool of toolsArray) {
          if (tool && typeof tool === 'object' && tool.tool === 'agendar_turno_v2') {
            const toolInput = tool.toolInput;
            if (toolInput && typeof toolInput === 'object') {
              const camposLocalidad = ['localidad', 'ciudad', 'taller', 'sucursal', 'ubicacion', 'location', 'city', 'localidad_nombre'];
              for (const campo of camposLocalidad) {
                if (toolInput[campo] && typeof toolInput[campo] === 'string' && toolInput[campo].trim()) {
                  const valor = toolInput[campo].trim();
                  const valorLower = valor.toLowerCase();
                  
                  // Verificar si coincide con alguna localidad de Pampawagen
                  for (const loc of localidadesPampawagen) {
                    const locLower = loc.toLowerCase();
                    if (valorLower === locLower || 
                        valorLower.includes(locLower) || 
                        locLower.includes(valorLower)) {
                      return loc;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // SEGUNDO: Buscar en todos los mensajes de la conversación (bot y usuario)
  if (conv.allMessages && Array.isArray(conv.allMessages)) {
    // Ordenar mensajes por fecha para procesar en orden cronológico
    const mensajesOrdenados = conv.allMessages
      .filter(msg => msg && msg.content && typeof msg.content === 'string')
      .sort((a, b) => {
        if (!a.createdDate || !b.createdDate) return 0;
        return new Date(a.createdDate) - new Date(b.createdDate);
      });
    
    // Buscar referencias a localidades en todos los mensajes
    // Priorizar mensajes del usuario sobre mensajes del bot
    const mensajesUsuario = mensajesOrdenados.filter(msg => msg.role === 'userMessage');
    const mensajesBot = mensajesOrdenados.filter(msg => msg.role === 'apiMessage');
    
    // Buscar primero en mensajes del usuario (más relevantes)
    for (const mensaje of mensajesUsuario) {
      const contenido = mensaje.content.toLowerCase();
      
      // Buscar cada localidad de Pampawagen
      for (const loc of localidadesPampawagen) {
        const locLower = loc.toLowerCase();
        // Buscar coincidencia exacta o como palabra completa
        const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(mensaje.content) || contenido.includes(locLower)) {
          localidadEncontrada = loc;
          break;
        }
      }
      if (localidadEncontrada) break;
    }
    
    // Si no se encontró en mensajes del usuario, buscar en mensajes del bot
    if (!localidadEncontrada) {
      for (const mensaje of mensajesBot) {
        const contenido = mensaje.content.toLowerCase();
        
        for (const loc of localidadesPampawagen) {
          const locLower = loc.toLowerCase();
          const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
          if (regex.test(mensaje.content) || contenido.includes(locLower)) {
            // Verificar que no sea solo parte de la pregunta de opciones
            // Si el mensaje contiene múltiples localidades, probablemente es la lista de opciones
            const localidadesEnMensaje = localidadesPampawagen.filter(l => 
              contenido.includes(l.toLowerCase())
            ).length;
            
            // Si solo menciona una localidad, es más probable que sea una referencia válida
            // Para Pampawagen solo hay 2, así que si menciona ambas es la lista de opciones
            if (localidadesEnMensaje === 1) {
              localidadEncontrada = loc;
              break;
            }
          }
        }
        if (localidadEncontrada) break;
      }
    }
  }
  
  return localidadEncontrada;
}

/**
 * Extrae la localidad mencionada en una conversación de Granville
 * Busca referencias a las localidades en toda la conversación (mensajes del bot y del usuario)
 * @param {Object} conv - Objeto de conversación con allTools, userMessages y allMessages
 * @param {Array} localidadesGranville - Lista de localidades de Granville
 * @returns {string|null} Localidad encontrada o null
 */
function extractLocalidadGranville(conv, localidadesGranville) {
  let localidadEncontrada = null;
  
  // PRIMERO: Buscar en toolInput de agendar_turno_v2 (más confiable)
  if (conv.allTools && Array.isArray(conv.allTools)) {
    for (const toolsArray of conv.allTools) {
      if (toolsArray && Array.isArray(toolsArray)) {
        for (const tool of toolsArray) {
          if (tool && typeof tool === 'object' && tool.tool === 'agendar_turno_v2') {
            const toolInput = tool.toolInput;
            if (toolInput && typeof toolInput === 'object') {
              const camposLocalidad = ['localidad', 'ciudad', 'taller', 'sucursal', 'ubicacion', 'location', 'city', 'localidad_nombre'];
              for (const campo of camposLocalidad) {
                if (toolInput[campo] && typeof toolInput[campo] === 'string' && toolInput[campo].trim()) {
                  const valor = toolInput[campo].trim();
                  const valorLower = valor.toLowerCase();
                  
                  // Verificar si coincide con alguna localidad de Granville
                  for (const loc of localidadesGranville) {
                    const locLower = loc.toLowerCase();
                    if (valorLower === locLower || 
                        valorLower.includes(locLower) || 
                        locLower.includes(valorLower)) {
                      return loc;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // SEGUNDO: Buscar en todos los mensajes de la conversación (bot y usuario)
  if (conv.allMessages && Array.isArray(conv.allMessages)) {
    // Ordenar mensajes por fecha para procesar en orden cronológico
    const mensajesOrdenados = conv.allMessages
      .filter(msg => msg && msg.content && typeof msg.content === 'string')
      .sort((a, b) => {
        if (!a.createdDate || !b.createdDate) return 0;
        return new Date(a.createdDate) - new Date(b.createdDate);
      });
    
    // Buscar referencias a localidades en todos los mensajes
    // Priorizar mensajes del usuario sobre mensajes del bot
    const mensajesUsuario = mensajesOrdenados.filter(msg => msg.role === 'userMessage');
    const mensajesBot = mensajesOrdenados.filter(msg => msg.role === 'apiMessage');
    
    // Buscar primero en mensajes del usuario (más relevantes)
    for (const mensaje of mensajesUsuario) {
      const contenido = mensaje.content.toLowerCase();
      
      // Buscar cada localidad de Granville
      for (const loc of localidadesGranville) {
        const locLower = loc.toLowerCase();
        // Buscar coincidencia exacta o como palabra completa
        const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(mensaje.content) || contenido.includes(locLower)) {
          localidadEncontrada = loc;
          break;
        }
      }
      if (localidadEncontrada) break;
    }
    
    // Si no se encontró en mensajes del usuario, buscar en mensajes del bot
    if (!localidadEncontrada) {
      for (const mensaje of mensajesBot) {
        const contenido = mensaje.content.toLowerCase();
        
        for (const loc of localidadesGranville) {
          const locLower = loc.toLowerCase();
          const regex = new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
          if (regex.test(mensaje.content) || contenido.includes(locLower)) {
            // Verificar que no sea solo parte de la pregunta de opciones
            // Si el mensaje contiene múltiples localidades, probablemente es la lista de opciones
            const localidadesEnMensaje = localidadesGranville.filter(l => 
              contenido.includes(l.toLowerCase())
            ).length;
            
            // Si solo menciona una o dos localidades (de las 6 posibles), es más probable que sea una referencia válida
            if (localidadesEnMensaje <= 2) {
              localidadEncontrada = loc;
              break;
            }
          }
        }
        if (localidadEncontrada) break;
      }
    }
  }
  
  return localidadEncontrada;
}

/**
 * Extrae la localidad mencionada en una conversación
 * Para Fortecar: busca cualquier referencia a las localidades en toda la conversación
 * Para Granville: busca cualquier referencia a las localidades en toda la conversación
 * Para Pampawagen: busca cualquier referencia a las localidades en toda la conversación
 * Para otras empresas: busca primero en toolInput, luego en la pregunta del bot y respuesta del usuario
 * @param {Object} conv - Objeto de conversación con allTools, userMessages y allMessages
 * @param {string} empresa - FC, GV o PW (para aplicar lógica específica)
 * @returns {string|null} Localidad encontrada o null
 */
function extractLocalidad(conv, empresa = null) {
  // Lista de localidades donde tenemos talleres (basado en opciones del bot)
  // Orden corresponde al orden en que el bot las presenta (1-8)
  const localidadesTalleres = [
    'Junín',           // Opción 1
    'Pergamino',       // Opción 2
    'San Nicolás',     // Opción 3
    'Chivilcoy',       // Opción 4
    '9 de Julio',      // Opción 5
    'Coronel Suárez',  // Opción 6
    'Olavarría',       // Opción 7
    'Trenque Lauquen'  // Opción 8
  ];
  
  // Localidades específicas de Fortecar (en el orden que las mencionó el usuario)
  const localidadesFortecar = [
    'Junín',
    'Pergamino',
    'Trenque Lauquen',
    '9 de Julio',
    'Chivilcoy',
    'San Nicolás',
    'Olavarría',
    'Coronel Suárez'
  ];
  
  // Localidades específicas de Pampawagen
  const localidadesPampawagen = [
    'General Pico',
    'Santa Rosa'
  ];
  
  // Localidades específicas de Granville
  const localidadesGranville = [
    'Junín',
    'Pergamino',
    'San Nicolás',
    'Comodoro Rivadavia',
    'Trelew',
    'Puerto Madryn'
  ];
  
  // Textos de las preguntas del bot sobre localidad (diferentes variaciones)
  const preguntasLocalidad = [
    'en qué localidad',
    'qué localidad',
    'localidad querés',
    'localidad te gustaría',
    'opciones disponibles'
  ];
  
  // Si es Fortecar, usar búsqueda amplia en toda la conversación
  if (empresa && empresa.toUpperCase() === 'FC') {
    return extractLocalidadFortecar(conv, localidadesFortecar);
  }
  
  // Si es Granville, usar búsqueda amplia en toda la conversación
  if (empresa && empresa.toUpperCase() === 'GV') {
    return extractLocalidadGranville(conv, localidadesGranville);
  }
  
  // Si es Pampawagen, usar búsqueda amplia en toda la conversación
  if (empresa && empresa.toUpperCase() === 'PW') {
    return extractLocalidadPampawagen(conv, localidadesPampawagen);
  }
  
  // Para otras empresas, usar lógica original
  let localidadEncontrada = null;

  // PRIMERO: Buscar en toolInput de agendar_turno_v2 (fuente más confiable)
  if (conv.allTools && Array.isArray(conv.allTools)) {
    for (const toolsArray of conv.allTools) {
      if (toolsArray && Array.isArray(toolsArray)) {
        for (const tool of toolsArray) {
          if (tool && typeof tool === 'object' && tool.tool === 'agendar_turno_v2') {
            const toolInput = tool.toolInput;
            if (toolInput && typeof toolInput === 'object') {
              // Buscar campos comunes que podrían contener localidad (en orden de prioridad)
              const camposLocalidad = ['localidad', 'ciudad', 'taller', 'sucursal', 'ubicacion', 'location', 'city', 'localidad_nombre'];
              for (const campo of camposLocalidad) {
                if (toolInput[campo] && typeof toolInput[campo] === 'string' && toolInput[campo].trim()) {
                  const valor = toolInput[campo].trim();
                  // Si es un campo directo de localidad, usarlo directamente
                  if (campo === 'localidad' || campo === 'ciudad' || campo === 'localidad_nombre') {
                    return valor;
                  }
                  // Para otros campos, verificar si contiene una localidad conocida
                  const valorLower = valor.toLowerCase();
                  for (const loc of localidadesTalleres) {
                    if (valorLower === loc.toLowerCase() || 
                        valorLower.includes(loc.toLowerCase()) || 
                        loc.toLowerCase().includes(valorLower)) {
                      return loc;
                    }
                  }
                  // Si no coincide con ninguna localidad conocida, devolver el valor tal cual
                  if (!localidadEncontrada) {
                    localidadEncontrada = valor;
                  }
                }
              }
              // Si no se encontró en campos específicos, buscar en todos los valores string
              if (!localidadEncontrada) {
                for (const key in toolInput) {
                  if (typeof toolInput[key] === 'string' && toolInput[key].trim()) {
                    const valor = toolInput[key].trim();
                    const valorLower = valor.toLowerCase();
                    // Verificar si coincide con alguna localidad de talleres
                    for (const loc of localidadesTalleres) {
                      if (valorLower === loc.toLowerCase() || 
                          valorLower.includes(loc.toLowerCase()) || 
                          loc.toLowerCase().includes(valorLower)) {
                        return loc;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Si ya encontramos localidad en toolInput, retornarla
  if (localidadEncontrada) {
    return localidadEncontrada;
  }

  // SEGUNDO: Buscar la pregunta del bot sobre localidad y la respuesta siguiente del usuario
  // Esto es más preciso porque el bot siempre pregunta por la localidad con una lista numerada
  if (!localidadEncontrada && conv.allMessages && Array.isArray(conv.allMessages)) {
    // Ordenar mensajes por fecha para mantener el orden cronológico
    const mensajesOrdenados = conv.allMessages
      .filter(msg => msg && msg.createdDate && msg.content)
      .sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));

    // Buscar la pregunta del bot sobre localidad
    for (let i = 0; i < mensajesOrdenados.length; i++) {
      const mensaje = mensajesOrdenados[i];
      
      // Buscar mensaje del bot que pregunta por localidad
      // Criterio principal: mensaje del bot que contiene una lista numerada de localidades
      let contienePreguntaLocalidad = false;
      if (mensaje.role === 'apiMessage' && 
          mensaje.content && 
          typeof mensaje.content === 'string') {
        const contenido = mensaje.content;
        const contenidoLower = contenido.toLowerCase();
        
        // Criterio 1: Contiene lista numerada con localidades (ej: "1. Junín", "2. Pergamino")
        const tieneListaNumerada = /\d+\.\s*(junín|pergamino|san nicolás|chivilcoy|9 de julio|coronel suárez|olavarría|trenque lauquen)/i.test(contenido);
        
        // Criterio 2: Contiene múltiples localidades de nuestra lista (al menos 3 diferentes)
        const localidadesEncontradas = localidadesTalleres.filter(loc => 
          contenidoLower.includes(loc.toLowerCase())
        );
        const tieneListaLocalidades = localidadesEncontradas.length >= 3;
        
        // Criterio 3: Contiene palabra "localidad" Y alguna palabra relacionada con opciones
        const tienePalabraLocalidad = contenidoLower.includes('localidad');
        const tieneOpciones = contenidoLower.includes('opciones') || 
                              contenidoLower.includes('opción') ||
                              contenidoLower.includes('disponibles');
        
        // El mensaje es la pregunta si tiene lista numerada O (tiene múltiples localidades Y palabra localidad)
        if (tieneListaNumerada || (tieneListaLocalidades && tienePalabraLocalidad) || 
            (tienePalabraLocalidad && tieneOpciones && localidadesEncontradas.length >= 1)) {
          contienePreguntaLocalidad = true;
        }
      }
      
      if (contienePreguntaLocalidad) {
        
        // Buscar el siguiente mensaje del usuario (respuesta a la pregunta)
        // Solo tomar el primer mensaje del usuario después de la pregunta del bot
        for (let j = i + 1; j < mensajesOrdenados.length; j++) {
          const mensajeUsuario = mensajesOrdenados[j];
          
          // Si encontramos un mensaje del bot antes de la respuesta del usuario, 
          // significa que la respuesta no es para esta pregunta
          if (mensajeUsuario.role === 'apiMessage') {
            break;
          }
          
          if (mensajeUsuario.role === 'userMessage' && 
              mensajeUsuario.content && 
              typeof mensajeUsuario.content === 'string') {
            
            const respuestaUsuario = mensajeUsuario.content.trim();
            const respuestaLower = respuestaUsuario.toLowerCase();

            // Opción 1: El usuario respondió con un número (1-8)
            // Ejemplo: "1" corresponde a "Junín", "2" a "Pergamino", "6" a "Coronel Suárez", etc.
            // Buscar cualquier número de 1 o 2 dígitos en la respuesta (aceptar espacios antes/después)
            const numeroMatch = respuestaUsuario.match(/(\d{1,2})/);
            if (numeroMatch) {
              const numero = parseInt(numeroMatch[1]);
              if (numero >= 1 && numero <= localidadesTalleres.length) {
                // Mapear número a localidad (número - 1 porque el array es 0-indexed)
                // Ejemplo: número 6 → índice 5 → "Coronel Suárez"
                localidadEncontrada = localidadesTalleres[numero - 1];
                break;
              }
            }

            // Opción 2: El usuario respondió con el nombre de la localidad directamente
            for (const loc of localidadesTalleres) {
              const locLower = loc.toLowerCase();
              // Buscar coincidencia exacta o muy cercana
              if (respuestaLower === locLower ||
                  respuestaLower === locLower.replace(/\s+/g, '') ||
                  respuestaLower.includes(` ${locLower} `) ||
                  respuestaLower.startsWith(`${locLower} `) ||
                  respuestaLower.endsWith(` ${locLower}`) ||
                  new RegExp(`^\\s*${locLower.replace(/\s+/g, '\\s+')}\\s*$`, 'i').test(respuestaUsuario)) {
                localidadEncontrada = loc;
                break;
              }
            }

            // Si encontramos localidad en la respuesta del usuario, salir
            // (solo procesamos el primer mensaje del usuario después de la pregunta)
            if (localidadEncontrada) break;
            
            // Si no encontramos localidad en este mensaje, salir también
            // para evitar procesar mensajes posteriores del usuario
            break;
          }
        }

        // Si encontramos la pregunta y procesamos la respuesta, salir
        if (localidadEncontrada) break;
      }
    }
  }

  // TERCERO: Si aún no se encontró, buscar en todos los mensajes del usuario (método menos preciso)
  if (!localidadEncontrada && conv.userMessages && Array.isArray(conv.userMessages)) {
    const mensajesTexto = conv.userMessages
      .filter(msg => msg && typeof msg === 'string')
      .map(msg => msg.toLowerCase());

    // Buscar coincidencias exactas primero (más confiables)
    for (const mensaje of mensajesTexto) {
      for (const loc of localidadesTalleres) {
        const locLower = loc.toLowerCase();
        if (mensaje === locLower || 
            mensaje.trim() === locLower ||
            mensaje.includes(` ${locLower} `) ||
            mensaje.startsWith(`${locLower} `) ||
            mensaje.endsWith(` ${locLower}`) ||
            mensaje === locLower.replace(/\s+/g, '') ||
            new RegExp(`\\b${locLower.replace(/\s+/g, '\\s+')}\\b`).test(mensaje)) {
          localidadEncontrada = loc;
          break;
        }
      }
      if (localidadEncontrada) break;
    }
  }

  return localidadEncontrada || null;
}

/**
 * Lista todas las conversaciones agrupadas por sessionId
 * @param {string} empresa - FC, GV o PW
 * @param {Object} filters - Filtros opcionales (sessionId para búsqueda)
 * @returns {Promise<Array>} Array de conversaciones con metadata
 */
export async function getConversations(empresa, filters = {}) {
  try {
    await connectToFlowiseProd();
    const BotMessage = getBotMessageModel(empresa);
    const localidadSesionMapping = await fetchBotAnalyzerLocalidadMapping();

    const empresaUpper = (empresa || '').toUpperCase();
    const estadoFiltroParsed = parseBotAnalyzerEstadoQuery(filters.estado);
    const tieneFiltroEstado =
      estadoFiltroParsed === 'tratado' || estadoFiltroParsed === 'no_tratado';
    let estadoMongoPrefilter = false;

    // Construir filtro de match inicial
    const matchStage = {};
    
    // Si hay filtro por sessionId, buscar solo esa conversación
    if (filters.sessionId) {
      matchStage.sessionId = { $regex: filters.sessionId, $options: 'i' };
    }

    // Preparar filtro de keyword para aplicar después de agrupar
    // Esto permite obtener TODOS los mensajes de las conversaciones que contienen la keyword
    let keywordFilter = null;
    if (filters.keyword && filters.keyword.trim()) {
      const keyword = filters.keyword.trim();
      const keywordLower = keyword.toLowerCase();
      const keywordSinEspacios = keywordLower.replace(/\s+/g, '');
      
      console.log(`[BOT ANALYZER] Preparando filtro de keyword: "${keyword}"`);
      
      // Construir el filtro de keyword que se aplicará después de agrupar
      keywordFilter = {
        keyword: keyword,
        keywordLower: keywordLower,
        keywordSinEspacios: keywordSinEspacios
      };
      
      // También aplicar filtro inicial para optimizar (solo mensajes que podrían tener la keyword)
      // Esto reduce el número de documentos a procesar antes de agrupar
      matchStage.$or = matchStage.$or || [];
      matchStage.$or.push(
        { content: { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      );
      
      // Si la keyword tiene espacios, también buscar la versión sin espacios en el contenido
      if (keyword.includes(' ')) {
        matchStage.$or.push(
          { content: { $regex: keywordSinEspacios.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        );
      }
      
      // Si la keyword no tiene espacios pero puede estar con espacios en el contenido, buscar variantes
      // Ejemplo: "FRENOSFC" puede estar escrito como "FRENOS FC" o "FRENOS  FC"
      if (!keyword.includes(' ')) {
        // Escapar caracteres especiales para regex
        const keywordEscapada = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Buscar la keyword con posibles espacios entre palabras comunes
        // Para "FRENOSFC", buscar "FRENOS" seguido de espacios opcionales y "FC"
        // Esto es más específico que permitir espacios entre cada carácter
        if (keyword.length > 4) {
          // Intentar dividir en palabras comunes (últimas 2-3 letras pueden ser un código)
          const mitad = Math.floor(keyword.length / 2);
          const parte1 = keywordEscapada.substring(0, mitad);
          const parte2 = keywordEscapada.substring(mitad);
          matchStage.$or.push(
            { content: { $regex: `${parte1}\\s+${parte2}`, $options: 'i' } }
          );
        }
        // También buscar la keyword completa sin espacios (ya está en el primer $or)
      }
    }

    let tratadoVariantsMemo = null;
    if (tieneFiltroEstado && empresaUpper) {
      tratadoVariantsMemo = await fetchTratadoSessionIdVariants(empresaUpper);
    }

    // Nota: fechaDesde/fechaHasta se aplican después del $group, filtrando por lastMessageDate

    // Pipeline de agregación optimizado
    // Si hay filtro de keyword, necesitamos un enfoque diferente:
    // 1. Primero encontrar los sessionIds que tienen la keyword
    // 2. Luego obtener TODOS los mensajes de esos sessionIds
    // Esto asegura que allMessages contenga todos los mensajes de la conversación
    
    let sessionIdsConKeyword = null;
    if (keywordFilter) {
      if (
        tieneFiltroEstado &&
        estadoFiltroParsed === 'tratado' &&
        (!tratadoVariantsMemo || tratadoVariantsMemo.length === 0)
      ) {
        return {
          conversations: [],
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: 0
        };
      }

      console.log(`[BOT ANALYZER] Buscando sessionIds que contienen keyword: "${keywordFilter.keyword}"`);

      // Paso 1: Encontrar sessionIds que tienen al menos un mensaje con la keyword
      const keywordMatchStage = {};
      if (tratadoVariantsMemo?.length && estadoFiltroParsed === 'tratado') {
        keywordMatchStage.sessionId = { $in: tratadoVariantsMemo };
      } else if (tratadoVariantsMemo?.length && estadoFiltroParsed === 'no_tratado') {
        keywordMatchStage.sessionId = { $nin: tratadoVariantsMemo };
      }
      if (filters.sessionId) {
        mergeSessionIdConstraint(keywordMatchStage, {
          $regex: filters.sessionId,
          $options: 'i'
        });
      }

      if (isEmptySessionIdInMatch(keywordMatchStage)) {
        return {
          conversations: [],
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: 0
        };
      }
      
      // Aplicar el mismo filtro de keyword que antes
      keywordMatchStage.$or = [];
      keywordMatchStage.$or.push(
        { content: { $regex: keywordFilter.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      );
      
      if (keywordFilter.keyword.includes(' ')) {
        keywordMatchStage.$or.push(
          { content: { $regex: keywordFilter.keywordSinEspacios.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        );
      }
      
      if (!keywordFilter.keyword.includes(' ')) {
        const keywordEscapada = keywordFilter.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (keywordFilter.keyword.length > 4) {
          const mitad = Math.floor(keywordFilter.keyword.length / 2);
          const parte1 = keywordEscapada.substring(0, mitad);
          const parte2 = keywordEscapada.substring(mitad);
          keywordMatchStage.$or.push(
            { content: { $regex: `${parte1}\\s+${parte2}`, $options: 'i' } }
          );
        }
      }
      
      // BOT Analyzer: sin filtro de fecha en búsqueda de keyword - el filtro por lastMessageDate se aplica después del $group
      
      // Obtener sessionIds únicos que tienen la keyword
      const sessionIdsResult = await BotMessage.distinct('sessionId', keywordMatchStage);
      sessionIdsConKeyword = new Set(sessionIdsResult);
      console.log(`[BOT ANALYZER] Encontrados ${sessionIdsConKeyword.size} sessionIds con keyword`);
      
      // Si no hay sessionIds con la keyword, retornar resultado vacío
      if (sessionIdsConKeyword.size === 0) {
        return {
          conversations: [],
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: 0
        };
      }
      
      // Modificar matchStage para incluir solo esos sessionIds
      // Pero NO filtrar por keyword aquí, queremos TODOS los mensajes de esos sessionIds
      // NO aplicar filtro de fecha aquí porque se aplicará después de agrupar por lastMessageDate
      // Esto asegura que se obtengan TODOS los mensajes de las conversaciones que tienen la keyword
      matchStage.sessionId = { $in: Array.from(sessionIdsConKeyword) };
      // Eliminar el filtro de keyword del matchStage inicial ya que lo aplicamos después
      delete matchStage.$or;
      // Eliminar el filtro de fecha del matchStage inicial cuando hay keyword
      // porque queremos TODOS los mensajes de las conversaciones, y el filtro por lastMessageDate
      // se aplicará después de agrupar
      delete matchStage.createdDate;
    }

    // Filtro estado en Mongo: evita agregar y fusionar gestión sobre todas las sesiones.
    if (tieneFiltroEstado && empresaUpper) {
      const tratadoVariants = tratadoVariantsMemo;
      if (estadoFiltroParsed === 'tratado') {
        if (!tratadoVariants || tratadoVariants.length === 0) {
          return {
            conversations: [],
            total: 0,
            page: filters.page || 1,
            limit: filters.limit || 50,
            totalPages: 0
          };
        }
        mergeSessionIdConstraint(matchStage, { $in: tratadoVariants });
        estadoMongoPrefilter = true;
      } else {
        if (tratadoVariants.length > 0) {
          mergeSessionIdConstraint(matchStage, { $nin: tratadoVariants });
        }
        estadoMongoPrefilter = true;
      }
    }

    if (isEmptySessionIdInMatch(matchStage)) {
      return {
        conversations: [],
        total: 0,
        page: filters.page || 1,
        limit: filters.limit || 50,
        totalPages: 0
      };
    }

    // Paso 1: Agrupar conversaciones y detectar herramientas en una sola pasada
    const basePipeline = [
      // Filtro inicial si existe (ahora solo por sessionId y fechas, no por keyword)
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      
      // Agrupar por sessionId
      {
        $group: {
          _id: '$sessionId',
          firstMessageDate: { $min: '$createdDate' },
          lastMessageDate: { $max: '$createdDate' },
          messageCount: { $sum: 1 },
          flowName: { $first: '$flowName' },
          chatId: { $first: '$chatId' },
          chatType: { $first: '$chatType' },
          // Acumular usedTools para análisis junto con la fecha del mensaje
          allTools: {
            $push: {
              $cond: [
                { $and: [
                  { $ne: ['$usedTools', null] },
                  { $isArray: '$usedTools' }
                ]},
                {
                  tools: '$usedTools',
                  messageDate: '$createdDate'
                },
                null
              ]
            }
          },
          // Acumular contenido de mensajes del usuario para extraer localidad
          userMessages: {
            $push: {
              $cond: [
                { $eq: ['$role', 'userMessage'] },
                '$content',
                '$$REMOVE'
              ]
            }
          },
          // Acumular todos los mensajes con role y fecha para analizar secuencia
          allMessages: {
            $push: {
              role: '$role',
              content: '$content',
              createdDate: '$createdDate'
            }
          }
        }
      }
    ];

    // Paso 2: Proyectar estructura básica (herramientas se detectarán después)
    const projectStage = {
      $project: {
        _id: 0,
        sessionId: '$_id',
        firstMessageDate: 1,
        lastMessageDate: 1,
        messageCount: 1,
        flowName: { $ifNull: ['$flowName', 'N/A'] },
        chatId: { $ifNull: ['$chatId', '$_id'] },
        chatType: { $ifNull: ['$chatType', 'EXTERNAL'] },
        allTools: 1,
        userMessages: 1,
        allMessages: 1
      }
    };

    // Construir pipeline base
    const pipeline = [
      ...basePipeline,
      projectStage
    ];

    // Filtrar por fecha del último mensaje (lastMessageDate) si se especifica
    if (filters.fechaDesde || filters.fechaHasta) {
      const lastMsgMatch = {};
      if (filters.fechaDesde) {
        lastMsgMatch.$gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        const hasta = new Date(filters.fechaHasta);
        hasta.setHours(23, 59, 59, 999); // Incluir todo el día
        lastMsgMatch.$lte = hasta;
      }
      pipeline.push({ $match: { lastMessageDate: lastMsgMatch } });
    }

    // Obtener filtro de herramientas ANTES de usarlo
    const filtroHerramientas = filters.filtroHerramientas;
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    // Ordenar por fecha del último mensaje (más reciente primero)
    pipeline.push({ $sort: { lastMessageDate: -1 } });

    // Para FC, GV, PW: procesar TODAS las conversaciones (sin filtro de fecha) y paginar en memoria
    // Si hay filtro de herramientas, también necesitamos procesar TODAS las conversaciones
    // para aplicar el filtro correctamente. Si no hay filtro, podemos paginar antes.
    let allConversations = [];
    let total = 0;

    const tieneFiltroHerramientas = filtroHerramientas === 'sin' || filtroHerramientas === 'con' || filtroHerramientas === 'con_agendar';
    const tieneFiltroKeyword = filters.keyword && filters.keyword.trim();
    const tieneFiltroLocalidad = Boolean(filters.localidad && String(filters.localidad).trim());
    const tieneFiltroCitado =
      filters.citado === 'si' || filters.citado === 'no';
    const estadoEvitaCargaCompleta = tieneFiltroEstado && estadoMongoPrefilter;
    /** Solo entonces hay que traer todas las sesiones, filtrar en memoria y paginar después. */
    const necesitaCargaCompletaEnMemoria =
      tieneFiltroHerramientas ||
      tieneFiltroKeyword ||
      tieneFiltroLocalidad ||
      (tieneFiltroEstado && !estadoEvitaCargaCompleta) ||
      tieneFiltroCitado;

    if (necesitaCargaCompletaEnMemoria) {
      // Procesar todas las conversaciones que cumplan el $match cuando hace falta filtrar
      // por herramientas, localidad o verificar keyword en todos los mensajes de la sesión.
      console.log(`[${empresaUpper}] Ejecutando pipeline de agregación (carga completa en memoria)...`);
      if (tieneFiltroKeyword) {
        console.log(`[${empresaUpper}] Pipeline incluye filtro de keyword en MongoDB`);
      }
      allConversations = await BotMessage.aggregate(pipeline).allowDiskUse(true);
      total = allConversations.length;
      console.log(`[${empresaUpper}] Conversaciones obtenidas: ${total}`);
      
      // Si hay keyword, verificar si alguna conversación tiene el sessionId conocido
      if (tieneFiltroKeyword && allConversations.length > 0) {
        const sessionIdBuscado = '5491167053192'; // SessionId de la conversación del usuario
        const encontrado = allConversations.find(conv => conv.sessionId === sessionIdBuscado);
        if (encontrado) {
          console.log(`[${empresaUpper}] ✅ Conversación con sessionId ${sessionIdBuscado} encontrada después del pipeline`);
          console.log(`[${empresaUpper}]   - Mensajes: ${encontrado.messageCount}`);
          console.log(`[${empresaUpper}]   - Último mensaje: ${encontrado.lastMessageDate}`);
          console.log(`[${empresaUpper}]   - allMessages length: ${encontrado.allMessages?.length || 0}`);
        } else {
          console.log(`[${empresaUpper}] ⚠️ Conversación con sessionId ${sessionIdBuscado} NO encontrada después del pipeline`);
          console.log(`[${empresaUpper}]   Esto puede indicar que el filtro de fecha o keyword la está excluyendo`);
        }
      }
    } else {
      // Si no hay filtro, obtener el total primero (más eficiente)
      const countPipeline = [...pipeline, { $count: 'total' }];
      const [totalResult] = await BotMessage.aggregate(countPipeline).allowDiskUse(true);
      total = totalResult?.total || 0;

      // Aplicar paginación antes de procesar
      const skip = (page - 1) * limit;
      pipeline.push(
        { $skip: skip },
        { $limit: limit }
      );
      allConversations = await BotMessage.aggregate(pipeline).allowDiskUse(true);
    }

    // Procesar herramientas y localidad en memoria para todas las conversaciones obtenidas
    let conversations = allConversations.map(conv => {
      let tieneAgendarTurno = false;
      let tieneEnviarCorreo = false;
      let tieneVenta = false;

      // Obtener la fecha del último mensaje y normalizarla a día único
      const lastMessageDate = conv.lastMessageDate;
      const diaUltimoMensaje = normalizarFechaADia(lastMessageDate);

      // agendar_turno_v2 u otra variante en CUALQUIER día → no tratado, icono, citado, filtros
      if (conv.allTools && Array.isArray(conv.allTools)) {
        for (const toolsItem of conv.allTools) {
          let arr = null;
          if (toolsItem && typeof toolsItem === 'object' && toolsItem.tools) {
            arr = toolsItem.tools;
          } else if (toolsItem && Array.isArray(toolsItem)) {
            arr = toolsItem;
          }
          if (usedToolsArrayTieneAgendarTurno(arr)) {
            tieneAgendarTurno = true;
            break;
          }
        }
      }

      // Filtrar herramientas del mismo día que el último mensaje (correo, venta vía agendar ese día)
      let herramientasDelDia = [];
      if (conv.allTools && Array.isArray(conv.allTools)) {
        for (const toolsItem of conv.allTools) {
          if (toolsItem && typeof toolsItem === 'object' && toolsItem.tools && toolsItem.messageDate) {
            // Formato nuevo: objeto con tools y messageDate
            const diaMensaje = normalizarFechaADia(toolsItem.messageDate);
            if (diaMensaje === diaUltimoMensaje) {
              herramientasDelDia.push(toolsItem.tools);
            }
          } else if (toolsItem && Array.isArray(toolsItem)) {
            // Compatibilidad con formato anterior (sin fecha) - solo considerar si no hay herramientas con fecha
            // Esto puede ocurrir si hay datos antiguos que no tienen el nuevo formato
            if (herramientasDelDia.length === 0) {
              // Si no hay herramientas con fecha, considerar todas (comportamiento anterior)
              herramientasDelDia.push(toolsItem);
            }
          }
        }
      }

      for (const toolsArray of herramientasDelDia) {
        if (toolsArray && Array.isArray(toolsArray)) {
          for (const tool of toolsArray) {
            if (entradaUsedToolsEsAgendarTurno(tool)) {
              const extraLabel = tool?.toolInput?.extraLabel;
              if (extraLabel && typeof extraLabel === 'string' && extraLabel.trim() && extraLabel.trim().toLowerCase() !== 'ninguno') {
                tieneVenta = true;
              }
            } else if (tool && typeof tool === 'object' && tool.tool === 'enviarCorreo') {
              tieneEnviarCorreo = true;
            }
            if (tieneAgendarTurno && tieneEnviarCorreo) break;
          }
        }
        if (tieneAgendarTurno && tieneEnviarCorreo) break;
      }

      const localidad =
        mapLocalidadDesdeChatPorEmpresa(extractLocalidad(conv, empresa), empresa) ??
        resolveLocalidadFromSessionMapping(
          conv.sessionId,
          empresa,
          localidadSesionMapping
        );

      return {
        sessionId: conv.sessionId,
        firstMessageDate: conv.firstMessageDate,
        lastMessageDate: conv.lastMessageDate,
        messageCount: conv.messageCount,
        flowName: conv.flowName,
        chatId: conv.chatId || conv.sessionId,
        chatType: conv.chatType || 'EXTERNAL',
        localidad: localidad,
        herramientasUtilizadas: {
          tieneAgendarTurno,
          tieneEnviarCorreo,
          tieneVenta
        },
        // Incluir allMessages y userMessages para que la verificación de keyword funcione
        allMessages: conv.allMessages || [],
        userMessages: conv.userMessages || []
      };
    });

    // Aplicar filtro de herramientas si se especifica (después de procesar herramientas)
    if (filtroHerramientas === 'sin' || filtroHerramientas === 'con' || filtroHerramientas === 'con_agendar') {
      if (filtroHerramientas === 'sin') {
        // Sin herramientas: ninguna de las dos debe ser true
        conversations = conversations.filter(conv => 
          !conv.herramientasUtilizadas.tieneAgendarTurno && 
          !conv.herramientasUtilizadas.tieneEnviarCorreo
        );
      } else if (filtroHerramientas === 'con') {
        // Con herramientas: al menos una debe ser true
        conversations = conversations.filter(conv => 
          conv.herramientasUtilizadas.tieneAgendarTurno || 
          conv.herramientasUtilizadas.tieneEnviarCorreo
        );
      } else if (filtroHerramientas === 'con_agendar') {
        // Con agendar_turno_v2 únicamente
        conversations = conversations.filter(conv => 
          conv.herramientasUtilizadas.tieneAgendarTurno
        );
      }
    }

    // Aplicar filtro de localidad si se especifica
    if (filters.localidad) {
      const locParam = String(filters.localidad).trim();
      if (locParam === FILTRO_LOCALIDAD_SIN) {
        conversations = conversations.filter((conv) => esLocalidadVaciaParaFiltro(conv.localidad));
      } else {
        conversations = conversations.filter(
          (conv) => conv.localidad && conv.localidad === locParam
        );
      }
    }

    // Aplicar filtro de palabra clave en memoria como respaldo (ya se filtró en MongoDB, pero esto asegura que no se pierda nada)
    // Esto es útil para casos edge donde MongoDB regex no captura todas las variantes
    if (filters.keyword && filters.keyword.trim()) {
      const keyword = filters.keyword.trim();
      const keywordLower = keyword.toLowerCase();
      const keywordSinEspacios = keywordLower.replace(/\s+/g, '').trim();
      
      console.log(`[BOT ANALYZER] Verificación adicional en memoria para keyword: "${keyword}" (sin espacios: "${keywordSinEspacios}")`);
      console.log(`[BOT ANALYZER] Total conversaciones antes de verificación adicional: ${conversations.length}`);
      
      // Función helper para buscar en un texto
      const buscarEnTexto = (texto) => {
        if (!texto) return false;
        const contenido = typeof texto === 'string' ? texto : String(texto);
        const contenidoLower = contenido.toLowerCase();
        const contenidoSinEspacios = contenidoLower.replace(/\s+/g, '');
        
        const matchConEspacios = contenidoLower.includes(keywordLower);
        const matchSinEspacios = contenidoSinEspacios.includes(keywordSinEspacios);
        
        return matchConEspacios || matchSinEspacios;
      };
      
      // Contar conversaciones que ya tienen la keyword (filtradas por MongoDB)
      let yaTienenKeyword = 0;
      let noTienenKeyword = 0;
      
      // Verificar cada conversación y agregar logs detallados
      conversations.forEach((conv, index) => {
        let encontrado = false;
        let dondeSeEncontro = null;
        
        // Buscar en todos los mensajes
        if (conv.allMessages && Array.isArray(conv.allMessages) && conv.allMessages.length > 0) {
          conv.allMessages.forEach((msg, msgIndex) => {
            if (msg && msg.content) {
              const contenido = typeof msg.content === 'string' ? msg.content : String(msg.content);
              if (buscarEnTexto(contenido)) {
                encontrado = true;
                dondeSeEncontro = `allMessages[${msgIndex}]`;
                console.log(`[BOT ANALYZER] ✅ Keyword encontrada en ${dondeSeEncontro} de sessionId ${conv.sessionId}: "${contenido.substring(0, 100)}..."`);
              }
            }
          });
        }
        
        // Si no se encontró, buscar en userMessages
        if (!encontrado && conv.userMessages && Array.isArray(conv.userMessages) && conv.userMessages.length > 0) {
          conv.userMessages.forEach((msg, msgIndex) => {
            const contenido = typeof msg === 'string' ? msg : String(msg);
            if (buscarEnTexto(contenido)) {
              encontrado = true;
              dondeSeEncontro = `userMessages[${msgIndex}]`;
              console.log(`[BOT ANALYZER] ✅ Keyword encontrada en ${dondeSeEncontro} de sessionId ${conv.sessionId}: "${contenido.substring(0, 100)}..."`);
            }
          });
        }
        
        if (!encontrado) {
          // Log detallado de por qué no se encontró
          console.log(`[BOT ANALYZER] ⚠️ Conversación sin keyword pero pasó filtro MongoDB: sessionId=${conv.sessionId}, allMessages=${conv.allMessages?.length || 0}, userMessages=${conv.userMessages?.length || 0}`);
          if (conv.allMessages && conv.allMessages.length > 0) {
            conv.allMessages.forEach((msg, i) => {
              const contenido = msg?.content ? (typeof msg.content === 'string' ? msg.content : String(msg.content)) : 'null';
              console.log(`[BOT ANALYZER]   allMessages[${i}]: "${contenido.substring(0, 50)}..."`);
            });
          }
        }
        
        if (encontrado) {
          yaTienenKeyword++;
          // Log detallado para las primeras 3 conversaciones encontradas
          if (yaTienenKeyword <= 3) {
            console.log(`[BOT ANALYZER] Conversación ${yaTienenKeyword} con keyword "${keyword}": sessionId=${conv.sessionId}, mensajes=${conv.messageCount}, fecha=${conv.lastMessageDate}`);
          }
        } else {
          noTienenKeyword++;
          // Si no tiene la keyword pero pasó el filtro de MongoDB, puede ser un problema
          if (noTienenKeyword <= 3) {
            console.log(`[BOT ANALYZER] ⚠️ Conversación sin keyword pero pasó filtro MongoDB: sessionId=${conv.sessionId}`);
          }
        }
      });
      
      // Filtrar solo las que realmente tienen la keyword
      conversations = conversations.filter(conv => {
        let encontrado = false;
        
        if (conv.allMessages && Array.isArray(conv.allMessages) && conv.allMessages.length > 0) {
          encontrado = conv.allMessages.some(msg => {
            if (msg && msg.content) {
              return buscarEnTexto(msg.content);
            }
            return false;
          });
        }
        
        if (!encontrado && conv.userMessages && Array.isArray(conv.userMessages) && conv.userMessages.length > 0) {
          encontrado = conv.userMessages.some(msg => buscarEnTexto(msg));
        }
        
        return encontrado;
      });
      
      console.log(`[BOT ANALYZER] Conversaciones con keyword: ${yaTienenKeyword}, sin keyword: ${noTienenKeyword}`);
      console.log(`[BOT ANALYZER] Conversaciones finales después de verificación: ${conversations.length}`);
    }

    if (tieneFiltroEstado) {
      if (estadoMongoPrefilter) {
        for (const c of conversations) {
          c.estado = estadoFiltroParsed;
        }
      } else {
        await mergeEstadosGestionBotAnalyzer(conversations, empresaUpper);
      }
      aplicarEstadoPorReglaAgendarBotAnalyzer(conversations);
      const esperado = estadoFiltroParsed;
      conversations = conversations.filter((conv) => {
        const e = conv.estado || 'no_tratado';
        return e === esperado;
      });
    }

    if (tieneFiltroCitado) {
      conversations = await mergeCitadoEnConversaciones(conversations);
      const wantSi = filters.citado === 'si';
      conversations = conversations.filter((c) => (wantSi ? c.citado : !c.citado));
    }

    // Total: con carga completa en memoria, conversaciones ya están filtradas al completo.
    // Con paginación en Mongo ($skip/$limit), conversations es solo la página actual:
    // no usar conversations.length o el total queda ~50 y totalPages=1 (sin UI de páginas).
    if (necesitaCargaCompletaEnMemoria) {
      total = conversations.length;
      const filtrosAplicados = [];
      if (filtroHerramientas) filtrosAplicados.push(`herramientas=${filtroHerramientas}`);
      if (filters.localidad) filtrosAplicados.push(`localidad=${filters.localidad}`);
      if (filters.keyword) filtrosAplicados.push(`keyword=${filters.keyword}`);
      if (tieneFiltroEstado) filtrosAplicados.push(`estado=${estadoFiltroParsed}`);
      if (tieneFiltroCitado) filtrosAplicados.push(`citado=${filters.citado}`);
      console.log(
        `[${empresaUpper}] Total después de filtros (${filtrosAplicados.join(', ') || 'ninguno'}): ${total}, Página: ${page}, Límite: ${limit}`
      );
    }

    // Tras filtros en memoria: paginar aquí; si no hubo carga completa, ya vino paginado desde MongoDB
    if (necesitaCargaCompletaEnMemoria) {
      const skip = (page - 1) * limit;
      conversations = conversations.slice(skip, skip + limit);
      console.log(
        `[${empresaUpper}] Después de paginación en memoria: ${conversations.length} conversaciones (skip: ${skip}, limit: ${limit})`
      );
    }

    if (!tieneFiltroCitado) {
      conversations = await mergeCitadoEnConversaciones(conversations);
    }

    const totalPages = Math.ceil(total / limit);
    if (necesitaCargaCompletaEnMemoria) {
      console.log(`[${empresaUpper}] Total páginas: ${totalPages} (total: ${total}, limit: ${limit})`);
    }

    const conservarArraysMensajes = filters.retainMessageArraysForExport === true;
    const conversationsOut = conservarArraysMensajes
      ? conversations
      : conversations.map(({ allMessages, userMessages, ...rest }) => rest);

    return {
      conversations: conversationsOut,
      total,
      page,
      limit,
      totalPages
    };
  } catch (error) {
    console.error('[BOT ANALYZER] Error obteniendo conversaciones:', error);
    throw error;
  }
}

/**
 * Obtiene todos los mensajes de una conversación específica
 * @param {string} empresa - FC, GV o PW
 * @param {string} sessionId - ID de la conversación
 * @returns {Promise<Array>} Array de mensajes ordenados cronológicamente
 */
export async function getConversationMessages(empresa, sessionId) {
  try {
    await connectToFlowiseProd();
    const BotMessage = getBotMessageModel(empresa);
    const localidadSesionMapping = await fetchBotAnalyzerLocalidadMapping();

    const messages = await BotMessage.find({ sessionId })
      .sort({ createdDate: 1 })
      .lean();

    if (messages.length === 0) {
      throw new Error(`No se encontraron mensajes para sessionId: ${sessionId}`);
    }

    // Obtener información de herramientas utilizadas
    let tieneAgendarTurno = false;
    let tieneEnviarCorreo = false;
    let tieneVenta = false;

    // Obtener la fecha del último mensaje y normalizarla a día único
    const lastMessageDate = messages[messages.length - 1].createdDate;
    const diaUltimoMensaje = normalizarFechaADia(lastMessageDate);

    for (const msg of messages) {
      if (msg.usedTools && Array.isArray(msg.usedTools) && usedToolsArrayTieneAgendarTurno(msg.usedTools)) {
        tieneAgendarTurno = true;
        break;
      }
    }

    for (const msg of messages) {
      if (msg.usedTools && Array.isArray(msg.usedTools)) {
        const diaMensaje = normalizarFechaADia(msg.createdDate);
        if (diaMensaje === diaUltimoMensaje) {
          for (const tool of msg.usedTools) {
            if (entradaUsedToolsEsAgendarTurno(tool)) {
              const extraLabel = tool?.toolInput?.extraLabel;
              if (extraLabel && typeof extraLabel === 'string' && extraLabel.trim() && extraLabel.trim().toLowerCase() !== 'ninguno') {
                tieneVenta = true;
              }
            } else if (tool && typeof tool === 'object' && tool.tool === 'enviarCorreo') {
              tieneEnviarCorreo = true;
            }
            if (tieneAgendarTurno && tieneEnviarCorreo) break;
          }
        }
      }
      if (tieneAgendarTurno && tieneEnviarCorreo) break;
    }

    const conversationData = await BotMessage.aggregate([
      { $match: { sessionId } },
      {
        $group: {
          _id: '$sessionId',
          firstMessageDate: { $min: '$createdDate' },
          lastMessageDate: { $max: '$createdDate' },
          flowName: { $first: '$flowName' },
          allTools: { $push: { tools: '$tools', messageDate: '$createdDate' } }
        }
      }
    ]);

    let localidad =
      conversationData.length > 0
        ? mapLocalidadDesdeChatPorEmpresa(
            extractLocalidad(conversationData[0], empresa),
            empresa
          )
        : null;
    if (localidad == null) {
      localidad = resolveLocalidadFromSessionMapping(
        sessionId,
        empresa,
        localidadSesionMapping
      );
    }

    return {
      sessionId,
      flowName: messages[0].flowName || 'N/A',
      messages: messages.map(msg => ({
        _id: msg._id,
        content: msg.content,
        role: msg.role,
        createdDate: msg.createdDate,
        chatId: msg.chatId,
        flowId: msg.flowId
      })),
      totalMessages: messages.length,
      firstMessageDate: messages[0].createdDate,
      lastMessageDate: messages[messages.length - 1].createdDate,
      herramientasUtilizadas: {
        tieneAgendarTurno,
        tieneEnviarCorreo,
        tieneVenta
      },
      localidad: localidad
    };
  } catch (error) {
    console.error('[BOT ANALYZER] Error obteniendo mensajes:', error);
    throw error;
  }
}

/**
 * Busca conversaciones por sessionId
 * @param {string} empresa - FC, GV o PW
 * @param {string} sessionId - ID de la conversación a buscar
 * @returns {Promise<Array>} Array de conversaciones que coinciden
 */
export async function searchConversations(empresa, sessionId) {
  return getConversations(empresa, { sessionId });
}

/**
 * Valida que la empresa sea válida
 */
export function validateEmpresa(empresa) {
  const empresasValidas = ['FC', 'GV', 'PW'];
  return empresasValidas.includes(empresa.toUpperCase());
}

/**
 * Calcula interacciones mensuales del bot Martina
 * Una interacción = cada día único que un sessionId tiene mensajes
 * Incluye desglose por empresa y por taller (usando locación)
 * @returns {Promise<Array>} Array de meses con total de interacciones
 */
export async function getInteraccionesMensuales() {
  try {
    // Cargar resultados guardados (análisis incremental) - usar conexión principal de MongoDB
    console.log('[BOT ANALYZER] Cargando resultados guardados...');
    let resultadosGuardados = null;
    try {
      resultadosGuardados = await MartinaInteracciones.findOne({ singleton: true });
      console.log('[BOT ANALYZER] Resultados guardados encontrados:', resultadosGuardados ? 'Sí' : 'No');
    } catch (err) {
      console.error('[BOT ANALYZER] Error cargando resultados guardados:', err.message);
      // Continuar sin datos guardados (primera ejecución)
    }
    
    const ultimaFechaProcesada = resultadosGuardados?.ultimaFechaProcesada || null;
    
    // Convertir sessionIdsProcesados de objeto a Map
    const sessionIdsProcesados = new Map();
    if (resultadosGuardados?.sessionIdsProcesados) {
      const sessionIdsObj = resultadosGuardados.sessionIdsProcesados;
      if (sessionIdsObj instanceof Map) {
        // Ya es un Map
        sessionIdsObj.forEach((value, key) => sessionIdsProcesados.set(key, value));
      } else if (typeof sessionIdsObj === 'object') {
        // Es un objeto, convertirlo a Map
        Object.entries(sessionIdsObj).forEach(([key, value]) => {
          sessionIdsProcesados.set(key, value instanceof Date ? value : new Date(value));
        });
      }
    }
    
    console.log('[BOT ANALYZER] Análisis incremental - Última fecha procesada:', ultimaFechaProcesada);
    console.log('[BOT ANALYZER] SessionIds ya procesados:', sessionIdsProcesados.size);
    
    // Inicializar estructuras de datos desde resultados guardados
    const interaccionesPorMes = {};
    const interaccionesPorEmpresa = {
      'FC': {},
      'GV': {},
      'PW': {}
    };
    
    // Cargar datos guardados si existen
    if (resultadosGuardados && resultadosGuardados.meses && resultadosGuardados.meses.length > 0) {
      resultadosGuardados.meses.forEach(mes => {
        interaccionesPorMes[mes.mesKey] = {
          mes: mes.mes,
          mesKey: mes.mesKey,
          interacciones: mes.interacciones || 0
        };
        
        if (mes.porEmpresa) {
          interaccionesPorEmpresa['FC'][mes.mesKey] = mes.porEmpresa.FC || 0;
          interaccionesPorEmpresa['GV'][mes.mesKey] = mes.porEmpresa.GV || 0;
          interaccionesPorEmpresa['PW'][mes.mesKey] = mes.porEmpresa.PW || 0;
        }
        
      });
      console.log('[BOT ANALYZER] Datos guardados cargados:', Object.keys(interaccionesPorMes).length, 'meses');
    }

    // Función para normalizar fecha a día único (YYYY-MM-DD)
    const normalizarFechaADia = (fecha) => {
      if (!fecha) return null;
      try {
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return null;
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } catch (e) {
        return null;
      }
    };

    // Función para obtener mes key (YYYY-MM)
    const obtenerMesKey = (fecha) => {
      if (!fecha) return null;
      try {
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return null;
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } catch (e) {
        return null;
      }
    };

    // Función para obtener nombre del mes
    const obtenerNombreMes = (fecha) => {
      if (!fecha) return null;
      try {
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      } catch (e) {
        return null;
      }
    };

    // Si hay datos guardados y no hay nueva fecha para procesar, devolver datos guardados inmediatamente
    if (resultadosGuardados && resultadosGuardados.meses && resultadosGuardados.meses.length > 0) {
      // Verificar si hay mensajes nuevos (solo si hay última fecha procesada)
      if (ultimaFechaProcesada) {
        await connectToFlowiseProd();
        
        // Verificar rápidamente si hay mensajes nuevos
        const empresas = ['FC', 'GV', 'PW'];
        let hayMensajesNuevos = false;
        
        for (const empresa of empresas) {
          try {
            const BotMessage = getBotMessageModel(empresa);
            const count = await BotMessage.countDocuments({
              createdDate: { $gt: ultimaFechaProcesada }
            });
            if (count > 0) {
              hayMensajesNuevos = true;
              console.log(`[BOT ANALYZER] ${empresa} - ${count} mensajes nuevos encontrados`);
              break;
            }
          } catch (err) {
            console.warn(`[BOT ANALYZER] Error verificando mensajes nuevos para ${empresa}:`, err.message);
          }
        }
        
        if (!hayMensajesNuevos) {
          console.log('[BOT ANALYZER] No hay mensajes nuevos, devolviendo datos guardados');
          return resultadosGuardados.meses;
        }
      } else {
        // No hay última fecha procesada, necesitamos procesar todo
        console.log('[BOT ANALYZER] No hay última fecha procesada, procesando todo');
      }
    }
    
    // Conectar a flowiseProd solo para leer mensajes del bot
    await connectToFlowiseProd();
    
    // Procesar cada empresa usando agregaciones de MongoDB
    const empresas = ['FC', 'GV', 'PW'];
    
    for (const empresa of empresas) {
      try {
        const BotMessage = getBotMessageModel(empresa);
        
        // Pipeline de agregación optimizado para obtener sessionId, fechas
        // ANÁLISIS INCREMENTAL: Solo procesar mensajes nuevos desde la última fecha procesada
        const matchConditions = {
          sessionId: { $exists: true, $ne: null },
          createdDate: { $exists: true, $ne: null, $type: 'date' }
        };
        
        // Si hay última fecha procesada, solo procesar mensajes nuevos
        if (ultimaFechaProcesada) {
          matchConditions.createdDate = {
            ...matchConditions.createdDate,
            $gt: ultimaFechaProcesada
          };
        }
        
        const pipeline = [
          // Filtrar mensajes con sessionId y fecha válidos (solo nuevos si hay última fecha)
          {
            $match: matchConditions
          },
          // Agregar campos calculados incluyendo extracción de localidad
          {
            $addFields: {
              year: { $year: '$createdDate' },
              month: { $month: '$createdDate' },
              day: { $dayOfMonth: '$createdDate' },
              mesKey: {
                $concat: [
                  { $toString: { $year: '$createdDate' } },
                  '-',
                  {
                    $cond: [
                      { $lt: [{ $month: '$createdDate' }, 10] },
                      { $concat: ['0', { $toString: { $month: '$createdDate' } }] },
                      { $toString: { $month: '$createdDate' } }
                    ]
                  }
                ]
              },
              diaUnico: {
                $concat: [
                  { $toString: { $year: '$createdDate' } },
                  '-',
                  {
                    $cond: [
                      { $lt: [{ $month: '$createdDate' }, 10] },
                      { $concat: ['0', { $toString: { $month: '$createdDate' } }] },
                      { $toString: { $month: '$createdDate' } }
                    ]
                  },
                  '-',
                  {
                    $cond: [
                      { $lt: [{ $dayOfMonth: '$createdDate' }, 10] },
                      { $concat: ['0', { $toString: { $dayOfMonth: '$createdDate' } }] },
                      { $toString: { $dayOfMonth: '$createdDate' } }
                    ]
                  }
                ]
              }
            }
          },
          // Agrupar por sessionId y día único para contar interacciones
          // NOTA: La localidad se obtendrá después desde las conversaciones completas
          // NOTA: No extraemos localidad aquí porque puede no estar en mensajes individuales
          {
            $group: {
              _id: {
                sessionId: '$sessionId',
                diaUnico: '$diaUnico',
                mesKey: '$mesKey'
              },
              firstDate: { $min: '$createdDate' }
            }
          },
          // Agrupar por mes para contar interacciones únicas y obtener sessionIds
          {
            $group: {
              _id: '$_id.mesKey',
              interacciones: { $sum: 1 },
              sessionIds: { $push: '$_id.sessionId' }
            }
          },
          // Proyectar resultado
          {
            $project: {
              _id: 0,
              mesKey: '$_id',
              interacciones: 1,
              sessionIds: 1
            }
          }
        ];

        const resultados = await BotMessage.aggregate(pipeline);
        
        console.log(`[BOT ANALYZER] ${empresa} - Resultados de agregación:`, resultados.length, 'meses');
        if (resultados.length > 0) {
          console.log(`[BOT ANALYZER] ${empresa} - Primer resultado:`, {
            mesKey: resultados[0].mesKey,
            interacciones: resultados[0].interacciones,
            sessionIdsCount: resultados[0].sessionIds?.length || 0
          });
        }

        // Procesar resultados - SIMPLIFICADO: Solo contar interacciones, sin procesar talleres
        for (const result of resultados) {
          const mesKey = result.mesKey;
          
          // Inicializar mes en total si no existe
          if (!interaccionesPorMes[mesKey]) {
            // Crear fecha ejemplo para obtener nombre del mes
            const [year, month] = mesKey.split('-');
            const fechaEjemplo = new Date(parseInt(year), parseInt(month) - 1, 1);
            interaccionesPorMes[mesKey] = {
              mes: obtenerNombreMes(fechaEjemplo),
              mesKey: mesKey,
              interacciones: 0
            };
          }

          // Inicializar mes en empresa si no existe
          if (!interaccionesPorEmpresa[empresa][mesKey]) {
            interaccionesPorEmpresa[empresa][mesKey] = 0;
          }

          // Sumar interacciones totales
          interaccionesPorMes[mesKey].interacciones += result.interacciones;
          interaccionesPorEmpresa[empresa][mesKey] += result.interacciones;
          
          // Marcar sessionIds como procesados (para análisis incremental)
          const sessionIds = [...new Set(result.sessionIds)]; // Eliminar duplicados
          sessionIds.forEach(sessionId => {
            if (!sessionIdsProcesados.has(sessionId)) {
              sessionIdsProcesados.set(sessionId, new Date());
            }
          });
        }

        console.log(`[BOT ANALYZER] Procesadas interacciones de ${empresa}: ${resultados.length} meses`);
      } catch (error) {
        console.error(`[BOT ANALYZER] Error procesando empresa ${empresa}:`, error.message);
        // Continuar con las otras empresas aunque una falle
      }
    }

    // Convertir a array y ordenar por mesKey
    const meses = Object.values(interaccionesPorMes)
      .filter(mes => mes.mesKey !== '2025-06') // Excluir junio 2025
      .sort((a, b) => a.mesKey.localeCompare(b.mesKey));

    // Agregar interacciones por empresa y por taller a cada mes
    meses.forEach(mes => {
      mes.porEmpresa = {
        'FC': interaccionesPorEmpresa['FC'][mes.mesKey] || 0,
        'GV': interaccionesPorEmpresa['GV'][mes.mesKey] || 0,
        'PW': interaccionesPorEmpresa['PW'][mes.mesKey] || 0
      };
      
    });

    console.log(`[BOT ANALYZER] Total interacciones mensuales calculadas: ${meses.length} meses`);
    
    // Log de resumen para debug
    if (meses.length > 0) {
      const primerMes = meses[0];
      console.log(`[BOT ANALYZER] Ejemplo primer mes (${primerMes.mesKey}):`, {
        interacciones: primerMes.interacciones,
        porEmpresa: primerMes.porEmpresa
      });
    } else {
      console.warn('[BOT ANALYZER] ⚠️ No hay meses para devolver!');
    }
    
    // Guardar resultados de forma persistente - usar conexión principal de MongoDB
    const fechaActual = new Date();
    
    // Convertir Map a objeto para guardar en MongoDB
    const sessionIdsProcesadosObj = {};
    sessionIdsProcesados.forEach((value, key) => {
      sessionIdsProcesadosObj[key] = value;
    });
    
    const datosParaGuardar = {
      singleton: true,
      ultimaFechaProcesada: fechaActual,
      sessionIdsProcesados: sessionIdsProcesadosObj,
      meses: meses,
      ultimaActualizacion: fechaActual
    };
    
    try {
      await MartinaInteracciones.findOneAndUpdate(
        { singleton: true },
        datosParaGuardar,
        { upsert: true, new: true }
      );
      console.log('[BOT ANALYZER] Resultados guardados en MongoDB exitosamente');
    } catch (err) {
      console.error('[BOT ANALYZER] Error guardando resultados en MongoDB:', err.message);
      // Continuar aunque falle el guardado
    }

    return meses;
  } catch (error) {
    console.error('[BOT ANALYZER] Error calculando interacciones mensuales:', error);
    throw error;
  }
}

