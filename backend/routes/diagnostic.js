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

export default router;











