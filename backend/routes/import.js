import express from 'express';
import mongoose from 'mongoose';
import { executeImport, getImportStatus, getImportProgress, getLastSuccessfulImport } from '../services/importService.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Importación manual
router.post('/manual', async (req, res) => {
  try {
    // Obtener rutas de archivos desde configuración
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      return res.status(400).json({ 
        error: 'Configuración no encontrada. Configure las rutas de archivos primero.' 
      });
    }
    
    const { citas, ingresos } = config.filePaths;
    
    if (!citas && !ingresos) {
      return res.status(400).json({ 
        error: 'No se han configurado rutas de archivos' 
      });
    }
    
    // Ejecutar importación
    const resultado = await executeImport(citas, ingresos);
    
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test de conexión a MongoDB
router.post('/test-connection', async (req, res) => {
  try {
    const { uri } = req.body;
    
    if (!uri) {
      return res.status(400).json({ error: 'URI de MongoDB requerida' });
    }
    
    console.log('Probando conexión a MongoDB...');
    
    // Intentar conectar
    const testConnection = await mongoose.createConnection(uri).asPromise();
    
    console.log('✅ Conexión exitosa a MongoDB');
    
    await testConnection.close();
    
    res.json({ 
      success: true, 
      message: 'Conexión exitosa a MongoDB' 
    });
  } catch (error) {
    console.error('❌ Error en conexión a MongoDB:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Obtener estado de última importación
router.get('/status', async (req, res) => {
  try {
    const status = await getImportStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener progreso actual de importación
router.get('/progress', async (req, res) => {
  try {
    const progress = getImportProgress();
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Obtener registro de última importación exitosa
router.get('/last-successful', async (req, res) => {
  try {
    const lastSuccessful = await getLastSuccessfulImport();
    res.json({
      success: true,
      data: lastSuccessful
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;


