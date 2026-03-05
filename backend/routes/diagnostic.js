import express from 'express';
import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Diagnóstico completo del sistema
router.get('/', async (req, res) => {
  try {
    console.log('=== DIAGNÓSTICO DEL SISTEMA ===');
    
    const diagnostic = {
      timestamp: new Date(),
      mongodb: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      },
      collections: {},
      config: null,
      errors: []
    };
    
    // Verificar conexión
    if (mongoose.connection.readyState !== 1) {
      diagnostic.errors.push('MongoDB no está conectado');
      return res.json(diagnostic);
    }
    
    console.log('MongoDB conectado:', diagnostic.mongodb);
    
    // Verificar colecciones
    try {
      const citasCount = await Cita.countDocuments();
      const ingresosCount = await Ingreso.countDocuments();
      const configCount = await Configuracion.countDocuments();
      
      diagnostic.collections = {
        citas: {
          count: citasCount,
          model: 'Cita',
          sample: citasCount > 0 ? await Cita.findOne().lean() : null
        },
        ingresos: {
          count: ingresosCount,
          model: 'Ingreso',
          sample: ingresosCount > 0 ? await Ingreso.findOne().lean() : null
        },
        configuracion: {
          count: configCount,
          model: 'Configuracion'
        }
      };
      
      console.log('Conteos de colecciones:', {
        citas: citasCount,
        ingresos: ingresosCount,
        configuracion: configCount
      });
      
    } catch (error) {
      console.error('Error verificando colecciones:', error);
      diagnostic.errors.push(`Error verificando colecciones: ${error.message}`);
    }
    
    // Verificar configuración
    try {
      const config = await Configuracion.findOne({ singleton: true });
      diagnostic.config = config;
      console.log('Configuración encontrada:', config ? 'Sí' : 'No');
    } catch (error) {
      console.error('Error verificando configuración:', error);
      diagnostic.errors.push(`Error verificando configuración: ${error.message}`);
    }
    
    console.log('=== FIN DIAGNÓSTICO ===');
    
    res.json(diagnostic);
  } catch (error) {
    console.error('Error en diagnóstico:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Verificar archivos Excel
router.get('/files', async (req, res) => {
  try {
    const fs = (await import('fs')).default;
    const path = (await import('path')).default;
    
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config || !config.filePaths) {
      return res.json({
        error: 'No hay configuración de archivos',
        files: {}
      });
    }
    
    const files = {};
    
    // Verificar archivo de citas
    if (config.filePaths.citas) {
      try {
        const exists = fs.existsSync(config.filePaths.citas);
        const stats = exists ? fs.statSync(config.filePaths.citas) : null;
        
        files.citas = {
          path: config.filePaths.citas,
          exists,
          size: stats ? stats.size : 0,
          lastModified: stats ? stats.mtime : null
        };
      } catch (error) {
        files.citas = {
          path: config.filePaths.citas,
          error: error.message
        };
      }
    }
    
    // Verificar archivo de ingresos
    if (config.filePaths.ingresos) {
      try {
        const exists = fs.existsSync(config.filePaths.ingresos);
        const stats = exists ? fs.statSync(config.filePaths.ingresos) : null;
        
        files.ingresos = {
          path: config.filePaths.ingresos,
          exists,
          size: stats ? stats.size : 0,
          lastModified: stats ? stats.mtime : null
        };
      } catch (error) {
        files.ingresos = {
          path: config.filePaths.ingresos,
          error: error.message
        };
      }
    }
    
    res.json({ files });
  } catch (error) {
    console.error('Error verificando archivos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verificar formato de referencias en MongoDB
router.get('/referencias', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: 'MongoDB no está conectado' });
    }

    const result = {
      timestamp: new Date(),
      citas: {
        total: await Cita.countDocuments(),
        samples: [],
        tipos: { numeros: 0, strings: 0, otros: 0 }
      },
      ingresos: {
        total: await Ingreso.countDocuments(),
        samples: [],
        tipos: { numeros: 0, strings: 0, otros: 0 }
      }
    };

    // Obtener muestras de citas
    const citas = await Cita.find({}).limit(10).lean();
    const todasCitas = await Cita.find({}, { Referencia: 1 }).lean();
    
    citas.forEach(cita => {
      const ref = cita.Referencia;
      result.citas.samples.push({
        referencia: ref,
        tipo: typeof ref,
        valorRaw: JSON.stringify(ref),
        esNumero: typeof ref === 'number',
        esString: typeof ref === 'string'
      });
    });

    todasCitas.forEach(cita => {
      const tipo = typeof cita.Referencia;
      if (tipo === 'number') result.citas.tipos.numeros++;
      else if (tipo === 'string') result.citas.tipos.strings++;
      else result.citas.tipos.otros++;
    });

    // Obtener muestras de ingresos
    const ingresos = await Ingreso.find({}).limit(10).lean();
    const todasIngresos = await Ingreso.find({}, { Referencia: 1 }).lean();
    
    ingresos.forEach(ingreso => {
      const ref = ingreso.Referencia;
      result.ingresos.samples.push({
        referencia: ref,
        tipo: typeof ref,
        valorRaw: JSON.stringify(ref),
        esNumero: typeof ref === 'number',
        esString: typeof ref === 'string'
      });
    });

    todasIngresos.forEach(ingreso => {
      const tipo = typeof ingreso.Referencia;
      if (tipo === 'number') result.ingresos.tipos.numeros++;
      else if (tipo === 'string') result.ingresos.tipos.strings++;
      else result.ingresos.tipos.otros++;
    });

    // Verificar directamente en MongoDB (raw)
    const citasRaw = await mongoose.connection.db.collection('citas').find({}).limit(5).toArray();
    const ingresosRaw = await mongoose.connection.db.collection('ingresos').find({}).limit(5).toArray();
    
    result.citas.rawSamples = citasRaw.map(c => ({
      referencia: c.Referencia,
      tipoMongoDB: c.Referencia?.constructor?.name || typeof c.Referencia,
      valorRaw: JSON.stringify(c.Referencia)
    }));

    result.ingresos.rawSamples = ingresosRaw.map(i => ({
      referencia: i.Referencia,
      tipoMongoDB: i.Referencia?.constructor?.name || typeof i.Referencia,
      valorRaw: JSON.stringify(i.Referencia)
    }));

    res.json(result);
  } catch (error) {
    console.error('Error verificando referencias:', error);
    res.status(500).json({ error: error.message });
  }
});

// Comparar referencias del Excel con MongoDB
router.get('/comparar-referencias', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: 'MongoDB no está conectado' });
    }

    const xlsx = (await import('xlsx')).default;
    const fs = (await import('fs')).default;
    const config = await Configuracion.findOne({ singleton: true });

    if (!config || !config.filePaths) {
      return res.status(400).json({ error: 'No hay configuración de archivos' });
    }

    const result = {
      citas: {
        excel: [],
        mongo: [],
        comparacion: []
      },
      ingresos: {
        excel: [],
        mongo: [],
        comparacion: []
      }
    };

    // Leer referencias del Excel de citas
    if (config.filePaths.citas && fs.existsSync(config.filePaths.citas)) {
      const workbook = xlsx.readFile(config.filePaths.citas, { raw: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { raw: true });
      
      const referenciasExcel = data.slice(0, 20).map(row => ({
        referencia: row.Referencia,
        tipo: typeof row.Referencia,
        normalizada: String(row.Referencia || '').trim()
      }));
      
      result.citas.excel = referenciasExcel;

      // Obtener referencias de MongoDB
      const referenciasMongo = await Cita.find({}, { Referencia: 1 }).limit(20).lean();
      result.citas.mongo = referenciasMongo.map(c => ({
        referencia: c.Referencia,
        tipo: typeof c.Referencia,
        normalizada: String(c.Referencia || '').trim()
      }));

      // Comparar
      const setMongo = new Set(referenciasMongo.map(c => String(c.Referencia).trim()));
      result.citas.comparacion = referenciasExcel.map(excel => {
        const existe = setMongo.has(excel.normalizada);
        return {
          excel: excel.referencia,
          excelTipo: excel.tipo,
          excelNormalizada: excel.normalizada,
          existeEnMongo: existe,
          match: existe
        };
      });
    }

    // Leer referencias del Excel de ingresos
    if (config.filePaths.ingresos && fs.existsSync(config.filePaths.ingresos)) {
      const workbook = xlsx.readFile(config.filePaths.ingresos, { raw: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { raw: true });
      
      const referenciasExcel = data.slice(0, 20).map(row => ({
        referencia: row.Referencia,
        tipo: typeof row.Referencia,
        normalizada: String(row.Referencia || '').trim()
      }));
      
      result.ingresos.excel = referenciasExcel;

      // Obtener referencias de MongoDB
      const referenciasMongo = await Ingreso.find({}, { Referencia: 1 }).limit(20).lean();
      result.ingresos.mongo = referenciasMongo.map(i => ({
        referencia: i.Referencia,
        tipo: typeof i.Referencia,
        normalizada: String(i.Referencia || '').trim()
      }));

      // Comparar
      const setMongo = new Set(referenciasMongo.map(i => String(i.Referencia).trim()));
      result.ingresos.comparacion = referenciasExcel.map(excel => {
        const existe = setMongo.has(excel.normalizada);
        return {
          excel: excel.referencia,
          excelTipo: excel.tipo,
          excelNormalizada: excel.normalizada,
          existeEnMongo: existe,
          match: existe
        };
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error comparando referencias:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener logs de la última importación
router.get('/import-logs', async (req, res) => {
  try {
    // Este endpoint capturará información de la última importación
    // Por ahora, retornamos información básica
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      return res.json({ error: 'No hay configuración disponible' });
    }
    
    res.json({
      lastImport: config.lastImport,
      summary: config.lastImport?.summary,
      timestamp: config.lastImport?.timestamp,
      status: config.lastImport?.status,
      error: config.lastImport?.error
    });
  } catch (error) {
    console.error('Error obteniendo logs de importación:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

































