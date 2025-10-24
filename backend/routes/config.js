import express from 'express';
import mongoose from 'mongoose';
import Configuracion from '../models/Configuracion.js';
import { restartScheduler } from '../services/schedulerService.js';
import configStorageService from '../services/configStorageService.js';

const router = express.Router();

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
          // Si hay almacenamiento local, sincronizar
          if (configStorageService.isInitialized) {
            await configStorageService.updateMongoConfig(dbConfig.mongodb);
            if (dbConfig.filePaths) {
              await configStorageService.updateFilePaths(dbConfig.filePaths);
            }
            if (dbConfig.scheduler) {
              await configStorageService.updateScheduler(dbConfig.scheduler);
            }
            if (dbConfig.mappings) {
              await configStorageService.updateMappings(dbConfig.mappings);
            }
            if (dbConfig.asistencia) {
              await configStorageService.updateAsistencia(dbConfig.asistencia);
            }
            if (dbConfig.oportunidades) {
              await configStorageService.updateOportunidades(dbConfig.oportunidades);
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
            filePaths: { citas: '', ingresos: '' },
            scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
            mappings: { talleres: new Map(), usuarios: new Map(), campos: new Map() }
          });
        }
      } catch (dbError) {
        console.log('ℹ️  No se pudo acceder a base de datos');
        if (!config) {
          // Configuración por defecto si no hay nada disponible
          config = {
            mongodb: { uri: '', database: 'oc_servicios', collections: { citas: 'citas', ingresos: 'ingresos' } },
            filePaths: { citas: '', ingresos: '' },
            scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
            mappings: { talleres: [], usuarios: [], campos: {} }
          };
        }
      }
    }
    
    res.json(config);
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
    
    const updates = req.body;
    
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
    
    res.json(config);
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
      return res.json({});
    }
    
    const mappings = config.mappings[type];
    
    // Convertir Map a objeto para JSON
    const mappingsObj = mappings ? Object.fromEntries(mappings) : {};
    
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
    
    // Convertir objeto a Map
    const mappingsMap = new Map(Object.entries(mappings));
    
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
    
    res.json(config.mappings[type]);
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

export default router;


