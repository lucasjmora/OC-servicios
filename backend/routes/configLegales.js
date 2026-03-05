import express from 'express';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Actualizar configuración de legales
router.put('/', async (req, res) => {
  try {
    const { diasSinComentarios, rutaAdjuntos } = req.body;

    // Validar datos
    if (!diasSinComentarios || diasSinComentarios < 1 || diasSinComentarios > 365) {
      return res.status(400).json({ 
        error: 'Los días sin comentarios deben estar entre 1 y 365' 
      });
    }

    if (!rutaAdjuntos || typeof rutaAdjuntos !== 'string' || rutaAdjuntos.trim() === '') {
      return res.status(400).json({ 
        error: 'La ruta de adjuntos es requerida' 
      });
    }

    // Buscar o crear configuración
    let config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      config = new Configuracion({ singleton: true });
    }

    // Actualizar configuración de legales
    config.legales = {
      diasSinComentarios: parseInt(diasSinComentarios),
      rutaAdjuntos: rutaAdjuntos.trim()
    };

    await config.save();

    res.json({ 
      message: 'Configuración de legales actualizada exitosamente',
      config: config.legales
    });

  } catch (error) {
    console.error('Error actualizando configuración de legales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener configuración de legales
router.get('/', async (req, res) => {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config || !config.legales) {
      return res.json({ 
        diasSinComentarios: 7, // Valor por defecto
        rutaAdjuntos: 'C:\\legales\\adjuntos' // Valor por defecto
      });
    }

    res.json({ 
      diasSinComentarios: config.legales.diasSinComentarios || 7,
      rutaAdjuntos: config.legales.rutaAdjuntos || 'C:\\legales\\adjuntos'
    });

  } catch (error) {
    console.error('Error obteniendo configuración de legales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;




















