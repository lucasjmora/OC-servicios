import express from 'express';
import mongoose from 'mongoose';
import Configuracion from '../models/Configuracion.js';
import { restartScheduler } from '../services/schedulerService.js';
import configStorageService from '../services/configStorageService.js';
import { refreshORsPivot } from '../services/orsAbiertasService.js';
import {
  applyEnvConfigOverrides,
  buildClientSafeConfig,
  getEnvSourceFlags,
  stripEnvBackedFieldsFromUpdates
} from '../services/envConfig.js';

const router = express.Router();

/** Expone ruta Excel presup en filePaths si aún no está (retrocompat con presupCrm.excel.filePath). */
function enrichFilePathsWithPresupCrm(config) {
  if (!config || typeof config !== 'object') return config;
  const fp = { ...(config.filePaths || {}) };
  const ex = config.presupCrm?.excel || {};
  if (!('presupuestos' in fp)) {
    fp.presupuestos = ex.filePath != null ? String(ex.filePath) : '';
  }
  return { ...config, filePaths: fp };
}

// MongoDB restringe claves que comienzan con . o $ - se codifican para almacenamiento
const PREFIX_DOT = '__DOT__';
const PREFIX_DOLR = '__DOLR__';

function sanitizeMappingKey(key) {
  if (typeof key !== 'string') return key;
  if (key.startsWith('.')) return PREFIX_DOT + key.slice(1);
  if (key.startsWith('$')) return PREFIX_DOLR + key.slice(1);
  return key;
}

function desanitizeMappingKey(key) {
  if (typeof key !== 'string') return key;
  if (key.startsWith(PREFIX_DOT)) return '.' + key.slice(PREFIX_DOT.length);
  if (key.startsWith(PREFIX_DOLR)) return '$' + key.slice(PREFIX_DOLR.length);
  return key;
}

function sanitizeMappingsForMongo(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[sanitizeMappingKey(k)] = v;
  }
  return out;
}

function desanitizeMappingsFromMongo(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[desanitizeMappingKey(k)] = v;
  }
  return out;
}

const BOT_ANALYZER_LOCALIDAD_EMPRESAS = ['FC', 'GV', 'PW'];

function defaultBotAnalyzerLocalidadSesion() {
  return { FC: [], GV: [], PW: [] };
}

/** Normaliza payload guardado o GET para el front (siempre FC/GV/PW con arrays). */
function normalizeBotAnalyzerLocalidadSesion(raw) {
  const base = defaultBotAnalyzerLocalidadSesion();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  for (const emp of BOT_ANALYZER_LOCALIDAD_EMPRESAS) {
    const rows = raw[emp];
    if (!Array.isArray(rows)) continue;
    base[emp] = rows
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        secuencia: String(r.secuencia ?? '').replace(/\D/g, ''),
        localidad: String(r.localidad ?? '').trim()
      }))
      .filter((r) => r.secuencia && r.localidad);
  }
  return base;
}

/** Valida y normaliza body del PUT (objeto plano, no Map). */
function parseBotAnalyzerLocalidadSesionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('El cuerpo debe ser un objeto con claves FC, GV y PW');
  }
  const out = defaultBotAnalyzerLocalidadSesion();
  for (const emp of BOT_ANALYZER_LOCALIDAD_EMPRESAS) {
    const rows = body[emp];
    if (rows == null) continue;
    if (!Array.isArray(rows)) {
      throw new Error(`botAnalyzerLocalidadSesion.${emp} debe ser un array`);
    }
    out[emp] = rows
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        secuencia: String(r.secuencia ?? '').replace(/\D/g, ''),
        localidad: String(r.localidad ?? '').trim()
      }))
      .filter((r) => r.secuencia && r.localidad);
  }
  return out;
}

// Obtener configuración actual
router.get('/', async (req, res) => {
  try {
    let config = null;
    
    // Intentar obtener desde almacenamiento local si está inicializado
    try {
      if (configStorageService.isInitialized) {
        config = configStorageService.getConfig();
      }
    } catch (localError) {
      console.log('ℹ️  Almacenamiento local no disponible, usando MongoDB');
    }
    
    // Si no hay config local o hay conexión a MongoDB, intentar desde la base de datos
    if (!config || mongoose.connection.readyState === 1) {
      try {
        const dbConfig = await Configuracion.findOne({ singleton: true });
        if (dbConfig) {
          // Objeto plano: evita pasar subdocumentos Mongoose a update* (spread + JSON a archivo puede romper o crear ciclos).
          const dbPlain = dbConfig.toObject({ flattenMaps: true });
          if (configStorageService.isInitialized) {
            await configStorageService.updateMongoConfig(dbPlain.mongodb || {});
            if (dbPlain.filePaths) {
              await configStorageService.updateFilePaths(dbPlain.filePaths);
            }
            if (dbPlain.scheduler) {
              await configStorageService.updateScheduler(dbPlain.scheduler);
            }
            if (dbPlain.mappings) {
              await configStorageService.updateMappings(dbPlain.mappings);
            }
            if (dbPlain.asistencia) {
              await configStorageService.updateAsistencia(dbPlain.asistencia);
            }
            if (dbPlain.oportunidades) {
              await configStorageService.updateOportunidades(dbPlain.oportunidades);
            }
            if (dbPlain.presupCrm) {
              await configStorageService.updatePresupCrm(dbPlain.presupCrm);
            }
            config = configStorageService.getConfig();
          } else {
            config = dbConfig;
          }
        } else if (!config) {
          // No hay config en ningún lado, crear una nueva
          config = await Configuracion.create({
            singleton: true,
            mongodb: {
              uri: '',
              database: 'oc_servicios',
              collections: { citas: 'citas', ingresos: 'ingresos' }
            },
            filePaths: {
              citas: '',
              ingresos: '',
              orsAbiertas: '',
              presupuestos: ''
            },
            scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
            mappings: {
              talleres: new Map(),
              usuarios: new Map(),
              campos: new Map(),
              orsAbiertasTalleres: new Map(),
              botAnalyzerLocalidadSesion: defaultBotAnalyzerLocalidadSesion()
            }
          });
        }
      } catch (dbError) {
        console.log('ℹ️  No se pudo acceder a base de datos');
        if (!config) {
          // Configuración por defecto si no hay nada disponible
          config = {
            mongodb: { uri: '', database: 'oc_servicios', collections: { citas: 'citas', ingresos: 'ingresos' } },
            filePaths: {
              citas: '',
              ingresos: '',
              orsAbiertas: '',
              presupuestos: ''
            },
            scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
            mappings: {
              talleres: [],
              usuarios: [],
              campos: {},
              orsAbiertasTalleres: {},
              botAnalyzerLocalidadSesion: defaultBotAnalyzerLocalidadSesion()
            }
          };
        }
      }
    }
    
    const plain =
      config && typeof config.toObject === 'function'
        ? config.toObject({ flattenMaps: true })
        : JSON.parse(JSON.stringify(config));
    const enriched = enrichFilePathsWithPresupCrm(plain);
    const merged = applyEnvConfigOverrides(enriched);
    const safe = buildClientSafeConfig(merged);
    res.json({ ...safe, envSourceHints: getEnvSourceFlags() });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: error.message });
  }
});

// Función para conectar a MongoDB si no está conectado
async function ensureMongoConnection(uri = null, database = null) {
  if (mongoose.connection.readyState === 1) {
    return true; // Ya conectado
  }
  
  try {
    let connectionUri = uri;
    
    // Si no se proporciona URI, intentar obtenerla de diferentes fuentes
    if (!connectionUri) {
      // Primero intentar con URI de .env
      if (process.env.MONGODB_URI) {
        connectionUri = process.env.MONGODB_URI;
        console.log('Usando URI de .env para conectar...');
      } else {
        console.log('No hay URI disponible para conectar');
        return false;
      }
    }
    
    // Construir URI completa con base de datos si se proporciona
    if (database && !connectionUri.includes('/' + database)) {
      if (connectionUri.endsWith('/')) {
        connectionUri = connectionUri + database;
      } else {
        connectionUri = connectionUri + '/' + database;
      }
      console.log('URI construida con base de datos:', connectionUri);
    }
    
    console.log('Conectando a MongoDB...');
    await mongoose.connect(connectionUri);
    console.log('✅ Conectado a MongoDB');
    return true;
    
  } catch (error) {
    console.error('Error conectando a MongoDB:', error.message);
    return false;
  }
}

// Actualizar configuración
router.put('/', async (req, res) => {
  try {
    console.log('PUT /api/config - Iniciando actualización');
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const updates = stripEnvBackedFieldsFromUpdates(req.body);
    
    // Si hay una URI en la petición, usarla para conectar
    let connectionUri = null;
    let databaseName = null;
    if (updates.mongodb && updates.mongodb.uri) {
      connectionUri = updates.mongodb.uri;
      databaseName = updates.mongodb.database || 'oc_servicios';
      console.log('URI encontrada en la petición, conectando...');
      console.log('Base de datos:', databaseName);
    }
    
    // Asegurar conexión a MongoDB
    const connected = await ensureMongoConnection(connectionUri, databaseName);
    if (!connected) {
      console.log('No se pudo conectar a MongoDB');
      return res.status(500).json({ error: 'No se pudo conectar a MongoDB. Verifique la URI de conexión.' });
    }
    
    console.log('MongoDB conectado, procediendo con actualización');
    
    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: updates },
      { new: true, upsert: true }
    );
    
    console.log('Configuración actualizada exitosamente en MongoDB');

    /** Ruta Excel presupuestos: sincronizar presupCrm.excel.filePath (la hoja usada es siempre la primera, como Citas/Ingresos/ORs). */
    if (updates.filePaths && updates.filePaths.presupuestos !== undefined) {
      await Configuracion.findOneAndUpdate(
        { singleton: true },
        { $set: { 'presupCrm.excel.filePath': updates.filePaths.presupuestos } },
        { new: true }
      );
      if (configStorageService.isInitialized) {
        const fresh = await Configuracion.findOne({ singleton: true }).lean();
        if (fresh?.presupCrm) {
          await configStorageService.updatePresupCrm(fresh.presupCrm);
        }
      }
    }
    
    // SINCRONIZAR CON ALMACENAMIENTO LOCAL
    try {
      if (configStorageService.isInitialized) {
        console.log('Sincronizando configuración con almacenamiento local...');
        
        if (updates.mongodb) {
          await configStorageService.updateMongoConfig(updates.mongodb);
        }
        if (updates.filePaths) {
          await configStorageService.updateFilePaths(updates.filePaths);
        }
        if (updates.scheduler) {
          await configStorageService.updateScheduler(updates.scheduler);
        }
        if (updates.mappings) {
          await configStorageService.updateMappings(updates.mappings);
        }
        if (updates.asistencia) {
          await configStorageService.updateAsistencia(updates.asistencia);
        }
        if (updates.oportunidades) {
          await configStorageService.updateOportunidades(updates.oportunidades);
        }
        if (updates.presupCrm) {
          await configStorageService.updatePresupCrm(updates.presupCrm);
        }
        
        console.log('✅ Configuración sincronizada con almacenamiento local');
      }
    } catch (localError) {
      console.error('⚠️  Error sincronizando con almacenamiento local:', localError);
      // No fallar la petición si solo falla el almacenamiento local
    }
    
    // Si se modificó el scheduler, reiniciarlo
    if (updates.scheduler) {
      console.log('Reiniciando scheduler...');
      await restartScheduler();
    }
    
    const finalDoc = await Configuracion.findOne({ singleton: true });
    const plain =
      finalDoc && typeof finalDoc.toObject === 'function'
        ? finalDoc.toObject({ flattenMaps: true })
        : JSON.parse(JSON.stringify(finalDoc));
    const enriched = enrichFilePathsWithPresupCrm(plain);
    const merged = applyEnvConfigOverrides(enriched);
    const safe = buildClientSafeConfig(merged);
    res.json({ ...safe, envSourceHints: getEnvSourceFlags() });
  } catch (error) {
    console.error('Error en PUT /api/config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener mapeos específicos
router.get('/mappings/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'talleres', 'usuarios', 'campos'

    const config = await Configuracion.findOne({ singleton: true });

    if (!config) {
      if (type === 'botAnalyzerLocalidadSesion') {
        return res.json(defaultBotAnalyzerLocalidadSesion());
      }
      if (type === 'talleresOcultos') {
        return res.json({ ocultos: [] });
      }
      return res.json({});
    }

    if (type === 'botAnalyzerLocalidadSesion') {
      const raw = config.mappings?.botAnalyzerLocalidadSesion;
      const plain =
        raw && typeof raw.toObject === 'function'
          ? raw.toObject()
          : raw && typeof raw === 'object'
            ? { ...raw }
            : {};
      return res.json(normalizeBotAnalyzerLocalidadSesion(plain));
    }

    if (type === 'talleresOcultos') {
      const raw = config.mappings?.talleresOcultos;
      const ocultos = Array.isArray(raw)
        ? raw.map((c) => String(c))
        : [];
      return res.json({ ocultos });
    }

    const mappings = config.mappings[type];

    // Convertir Map a objeto y restaurar claves originales (MongoDB no permite . o $ al inicio)
    const mappingsObj = mappings ? desanitizeMappingsFromMongo(Object.fromEntries(mappings)) : {};

    res.json(mappingsObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar mapeos específicos
router.put('/mappings/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const mappings = req.body;

    if (type === 'botAnalyzerLocalidadSesion') {
      const parsed = parseBotAnalyzerLocalidadSesionBody(mappings);
      const config = await Configuracion.findOneAndUpdate(
        { singleton: true },
        { $set: { 'mappings.botAnalyzerLocalidadSesion': parsed } },
        { new: true, upsert: true }
      );
      try {
        if (configStorageService.isInitialized) {
          const currentMappings = configStorageService.getMappings();
          currentMappings.botAnalyzerLocalidadSesion = parsed;
          await configStorageService.updateMappings(currentMappings);
          console.log('✅ Mapeos botAnalyzerLocalidadSesion sincronizados con almacenamiento local');
        }
      } catch (localError) {
        console.error('⚠️  Error sincronizando mapeos con almacenamiento local:', localError);
      }
      return res.json(normalizeBotAnalyzerLocalidadSesion(config?.mappings?.botAnalyzerLocalidadSesion || parsed));
    }

    if (type === 'talleresOcultos') {
      const raw = mappings?.ocultos ?? mappings;
      const ocultos = Array.isArray(raw)
        ? [...new Set(raw.map((c) => String(c).trim()).filter(Boolean))]
        : [];
      const config = await Configuracion.findOneAndUpdate(
        { singleton: true },
        { $set: { 'mappings.talleresOcultos': ocultos } },
        { new: true, upsert: true }
      );
      try {
        if (configStorageService.isInitialized) {
          const currentMappings = configStorageService.getMappings();
          currentMappings.talleresOcultos = ocultos;
          await configStorageService.updateMappings(currentMappings);
        }
      } catch (localError) {
        console.error('⚠️  Error sincronizando talleresOcultos:', localError);
      }
      return res.json({ ocultos: config?.mappings?.talleresOcultos || ocultos });
    }

    // Sanitizar claves para MongoDB (no permite . o $ al inicio)
    const mappingsSafe = sanitizeMappingsForMongo(mappings);
    const mappingsMap = new Map(Object.entries(mappingsSafe));

    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: { [`mappings.${type}`]: mappingsMap } },
      { new: true, upsert: true }
    );

    // Sincronizar con almacenamiento local
    try {
      if (configStorageService.isInitialized) {
        const currentMappings = configStorageService.getMappings();
        currentMappings[type] = mappings;
        await configStorageService.updateMappings(currentMappings);
        console.log(`✅ Mapeos de ${type} sincronizados con almacenamiento local`);
      }
    } catch (localError) {
      console.error('⚠️  Error sincronizando mapeos con almacenamiento local:', localError);
    }

    // Si se actualizaron mapeos de talleres ORs Abiertas, refrescar el pivot para aplicar cambios
    if (type === 'orsAbiertasTalleres') {
      try {
        const orsPath =
          config?.filePaths?.orsAbiertas ||
          (configStorageService.isInitialized
            ? configStorageService.getEffectiveConfig()?.filePaths?.orsAbiertas
            : undefined);
        if (orsPath?.trim()) {
          await refreshORsPivot(orsPath);
          console.log('✅ Pivot de ORs Abiertas actualizado con nuevos mapeos');
        }
      } catch (orsError) {
        console.warn('⚠️  No se pudo refrescar pivot ORs Abiertas:', orsError.message);
      }
    }

    // Devolver con claves originales (desanitizar)
    const result = config.mappings[type] ? desanitizeMappingsFromMongo(Object.fromEntries(config.mappings[type])) : {};
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener códigos únicos de talleres o usuarios desde la base de datos
router.get('/unique-values/:collection/:field', async (req, res) => {
  try {
    const { collection, field } = req.params;
    
    let Model;
    if (collection === 'citas') {
      const Cita = (await import('../models/Cita.js')).default;
      Model = Cita;
    } else if (collection === 'ingresos') {
      const Ingreso = (await import('../models/Ingreso.js')).default;
      Model = Ingreso;
    } else {
      return res.status(400).json({ error: 'Colección inválida' });
    }
    
    const values = await Model.distinct(field);
    
    // Filtrar valores nulos/undefined, normalizar tipos y ordenar
    const cleanValues = values
      .filter(v => v !== null && v !== undefined && v !== '')
      .map(v => {
        // Normalizar números y strings numéricos
        const num = Number(v);
        return isNaN(num) ? v : num;
      })
      .sort((a, b) => {
        // Ordenar números primero, luego strings
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        if (typeof a === 'number') return -1;
        if (typeof b === 'number') return 1;
        return String(a).localeCompare(String(b));
      });
    
    res.json(cleanValues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener información del almacenamiento local
router.get('/local-storage', async (req, res) => {
  try {
    const configInfo = configStorageService.getConfigInfo();
    const config = configStorageService.getConfig();
    
    res.json({
      configInfo,
      config: {
        mongodb: config.mongodb,
        filePaths: config.filePaths,
        scheduler: config.scheduler,
        mappings: config.mappings,
        lastImport: config.lastImport,
        lastUpdated: config.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error obteniendo información de almacenamiento local:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crear respaldo de configuración
router.post('/backup', async (req, res) => {
  try {
    const backup = await configStorageService.createBackup();
    res.json({ 
      message: 'Respaldo creado exitosamente',
      backup 
    });
  } catch (error) {
    console.error('Error creando respaldo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar configuración de asistencia
router.put('/asistencia', async (req, res) => {
  try {
    const { diasTolerancia } = req.body;

    // Validaciones
    if (diasTolerancia === undefined || diasTolerancia === null) {
      return res.status(400).json({
        success: false,
        error: 'Días de tolerancia requerido'
      });
    }

    if (!Number.isInteger(diasTolerancia) || diasTolerancia < 0 || diasTolerancia > 30) {
      return res.status(400).json({
        success: false,
        error: 'Días de tolerancia debe ser un número entero entre 0 y 30'
      });
    }

    // Conectar a MongoDB si no está conectado
    await ensureMongoConnection();

    // Actualizar configuración
    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          'asistencia.diasTolerancia': diasTolerancia,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // Actualizar configuración local
    await configStorageService.updateAsistencia({ diasTolerancia });

    res.json({
      success: true,
      message: 'Configuración de asistencia actualizada exitosamente',
      data: {
        diasTolerancia: config.asistencia.diasTolerancia
      }
    });

  } catch (error) {
    console.error('Error actualizando configuración de asistencia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Obtener configuración de oportunidades
router.get('/oportunidades', async (req, res) => {
  try {
    // Conectar a MongoDB si no está conectado
    await ensureMongoConnection();

    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      return res.json({
        palabrasClave: '',
        mesesDesdeCierre: 3
      });
    }

    res.json({
      palabrasClave: config.oportunidades?.palabrasClave || '',
      mesesDesdeCierre: config.oportunidades?.mesesDesdeCierre || 3
    });

  } catch (error) {
    console.error('Error obteniendo configuración de oportunidades:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Actualizar configuración de oportunidades
router.put('/oportunidades', async (req, res) => {
  try {
    const { palabrasClave, mesesDesdeCierre } = req.body;

    // Validaciones
    if (palabrasClave === undefined || palabrasClave === null) {
      return res.status(400).json({
        success: false,
        error: 'Palabras clave requeridas'
      });
    }

    if (mesesDesdeCierre === undefined || mesesDesdeCierre === null) {
      return res.status(400).json({
        success: false,
        error: 'Meses desde cierre requerido'
      });
    }

    if (!Number.isInteger(mesesDesdeCierre) || mesesDesdeCierre < 0 || mesesDesdeCierre > 120) {
      return res.status(400).json({
        success: false,
        error: 'Meses desde cierre debe ser un número entero entre 0 y 120'
      });
    }

    // Conectar a MongoDB si no está conectado
    await ensureMongoConnection();

    // Actualizar configuración en MongoDB
    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          'oportunidades.palabrasClave': palabrasClave.trim(),
          'oportunidades.mesesDesdeCierre': mesesDesdeCierre,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // Sincronizar con almacenamiento local
    try {
      if (configStorageService.isInitialized) {
        await configStorageService.updateOportunidades({
          palabrasClave: palabrasClave.trim(),
          mesesDesdeCierre
        });
        console.log('✅ Configuración de oportunidades sincronizada con almacenamiento local');
      }
    } catch (localError) {
      console.error('⚠️  Error sincronizando con almacenamiento local:', localError);
      // No fallar la petición si solo falla el almacenamiento local
    }

    res.json({
      success: true,
      message: 'Configuración de oportunidades actualizada exitosamente',
      data: {
        palabrasClave: config.oportunidades.palabrasClave,
        mesesDesdeCierre: config.oportunidades.mesesDesdeCierre
      }
    });

  } catch (error) {
    console.error('Error actualizando configuración de oportunidades:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Obtener configuración de accesorios
router.get('/accesorios', async (req, res) => {
  try {
    // Conectar a MongoDB si no está conectado
    const connected = await ensureMongoConnection();
    if (!connected) {
      return res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo conectar a MongoDB'
      });
    }

    const config = await Configuracion.findOne({ singleton: true });

    res.json({
      success: true,
      data: {
        diasEspera: config?.accesorios?.diasEspera || 7,
        ciudadEmpresa: config?.accesorios?.ciudadEmpresa || {},
        marcaEmpresa: config?.accesorios?.marcaEmpresa || {},
        ciudadMarcaEmpresa: config?.accesorios?.ciudadMarcaEmpresa || {}
      }
    });

  } catch (error) {
    console.error('Error obteniendo configuración de accesorios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Obtener configuración de ventas
router.get('/ventas', async (req, res) => {
  try {
    // Conectar a MongoDB si no está conectado
    await ensureMongoConnection();

    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      return res.json({
        success: true,
        rutaCtasPV: '',
        rutaBalances: ''
      });
    }

    res.json({
      success: true,
      rutaCtasPV: config.ventas?.rutaCtasPV || '',
      rutaBalances: config.ventas?.rutaBalances || ''
    });

  } catch (error) {
    console.error('Error obteniendo configuración de ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Actualizar configuración de ventas
router.put('/ventas', async (req, res) => {
  try {
    const { rutaCtasPV, rutaBalances } = req.body;

    // Validaciones
    if (rutaCtasPV === undefined || rutaCtasPV === null) {
      return res.status(400).json({
        success: false,
        error: 'Ruta de archivo Ctas_PV requerida'
      });
    }

    if (rutaBalances === undefined || rutaBalances === null) {
      return res.status(400).json({
        success: false,
        error: 'Ruta de carpeta de balances requerida'
      });
    }

    // Conectar a MongoDB si no está conectado
    await ensureMongoConnection();

    // Actualizar configuración
    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          'ventas.rutaCtasPV': rutaCtasPV.trim(),
          'ventas.rutaBalances': rutaBalances.trim(),
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Configuración de ventas actualizada exitosamente',
      data: {
        rutaCtasPV: config.ventas.rutaCtasPV,
        rutaBalances: config.ventas.rutaBalances
      }
    });

  } catch (error) {
    console.error('Error actualizando configuración de ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Actualizar configuración de accesorios
router.put('/accesorios', async (req, res) => {
  try {
    const { diasEspera, ciudadEmpresa, marcaEmpresa, ciudadMarcaEmpresa } = req.body;

    const updates = { updatedAt: new Date() };

    if (diasEspera !== undefined && diasEspera !== null) {
      if (!Number.isInteger(diasEspera) || diasEspera < 1 || diasEspera > 365) {
        return res.status(400).json({
          success: false,
          error: 'Días de espera debe ser un número entero entre 1 y 365'
        });
      }
      updates['accesorios.diasEspera'] = diasEspera;
    }

    if (ciudadEmpresa !== undefined) {
      const valid = typeof ciudadEmpresa === 'object' && ciudadEmpresa !== null && !Array.isArray(ciudadEmpresa);
      if (!valid) {
        return res.status(400).json({
          success: false,
          error: 'ciudadEmpresa debe ser un objeto (ciudad -> texto empresa)'
        });
      }
      const sanitized = {};
      for (const [ciudad, emp] of Object.entries(ciudadEmpresa)) {
        if (ciudad && typeof ciudad === 'string') {
          const valor = String(emp).trim();
          if (valor) sanitized[ciudad.trim()] = valor;
        }
      }
      updates['accesorios.ciudadEmpresa'] = sanitized;
    }

    if (marcaEmpresa !== undefined) {
      const valid = typeof marcaEmpresa === 'object' && marcaEmpresa !== null && !Array.isArray(marcaEmpresa);
      if (!valid) {
        return res.status(400).json({
          success: false,
          error: 'marcaEmpresa debe ser un objeto (marca -> texto empresa)'
        });
      }
      const sanitized = {};
      for (const [marca, emp] of Object.entries(marcaEmpresa)) {
        if (marca && typeof marca === 'string') {
          const valor = String(emp).trim();
          if (valor) sanitized[marca.trim()] = valor;
        }
      }
      updates['accesorios.marcaEmpresa'] = sanitized;
    }

    if (ciudadMarcaEmpresa !== undefined) {
      const valid = typeof ciudadMarcaEmpresa === 'object' && ciudadMarcaEmpresa !== null && !Array.isArray(ciudadMarcaEmpresa);
      if (!valid) {
        return res.status(400).json({
          success: false,
          error: 'ciudadMarcaEmpresa debe ser un objeto ("Ciudad|Marca" -> texto empresa)'
        });
      }
      const sanitized = {};
      for (const [key, emp] of Object.entries(ciudadMarcaEmpresa)) {
        if (key && typeof key === 'string') {
          const k = String(key).trim();
          const valor = String(emp).trim();
          if (k && valor) sanitized[k] = valor;
        }
      }
      updates['accesorios.ciudadMarcaEmpresa'] = sanitized;
    }

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos diasEspera, ciudadEmpresa o marcaEmpresa'
      });
    }

    const connected = await ensureMongoConnection();
    if (!connected) {
      return res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo conectar a MongoDB'
      });
    }

    const config = await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: updates },
      { upsert: true, new: true }
    );

    try {
      if (configStorageService.isInitialized) {
        const toUpdate = {};
        if (updates['accesorios.diasEspera'] !== undefined) toUpdate.diasEspera = config.accesorios.diasEspera;
        if (updates['accesorios.ciudadEmpresa'] !== undefined) toUpdate.ciudadEmpresa = config.accesorios.ciudadEmpresa || {};
        if (updates['accesorios.marcaEmpresa'] !== undefined) toUpdate.marcaEmpresa = config.accesorios.marcaEmpresa || {};
        if (updates['accesorios.ciudadMarcaEmpresa'] !== undefined) toUpdate.ciudadMarcaEmpresa = config.accesorios.ciudadMarcaEmpresa || {};
        if (Object.keys(toUpdate).length) await configStorageService.updateAccesorios(toUpdate);
        console.log('✅ Configuración de accesorios sincronizada con almacenamiento local');
      }
    } catch (localError) {
      console.error('⚠️  Error sincronizando con almacenamiento local:', localError);
    }

    if (
      updates['accesorios.ciudadEmpresa'] !== undefined ||
      updates['accesorios.marcaEmpresa'] !== undefined ||
      updates['accesorios.ciudadMarcaEmpresa'] !== undefined
    ) {
      try {
        const { accesoriosStatsCache } = await import('./boletos.js');
        if (accesoriosStatsCache?.clear) accesoriosStatsCache.clear();
      } catch (_) {}
    }

    const data = {
      diasEspera: config.accesorios.diasEspera,
      ciudadEmpresa: config.accesorios.ciudadEmpresa || {},
      marcaEmpresa: config.accesorios.marcaEmpresa || {},
      ciudadMarcaEmpresa: config.accesorios.ciudadMarcaEmpresa || {}
    };
    res.json({
      success: true,
      message: 'Configuración de accesorios actualizada exitosamente',
      data
    });

  } catch (error) {
    console.error('Error actualizando configuración de accesorios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;


