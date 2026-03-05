import express from 'express';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Actualizar configuración de unidades paradas
router.put('/', async (req, res) => {
  try {
    const { diasSinComentarios } = req.body;

    // Validar datos
    if (!diasSinComentarios || diasSinComentarios < 1 || diasSinComentarios > 365) {
      return res.status(400).json({ 
        error: 'Los días sin comentarios deben estar entre 1 y 365' 
      });
    }

    // Buscar o crear configuración
    let config = await Configuracion.findOne({ singleton: true });
    
    if (!config) {
      config = new Configuracion({ singleton: true });
    }

    // Actualizar configuración de unidades paradas
    config.unidadesParadas = {
      diasSinComentarios: parseInt(diasSinComentarios)
    };

    await config.save();

    res.json({ 
      message: 'Configuración de unidades paradas actualizada exitosamente',
      config: config.unidadesParadas
    });

  } catch (error) {
    console.error('Error actualizando configuración de unidades paradas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener configuración de unidades paradas
router.get('/', async (req, res) => {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config || !config.unidadesParadas) {
      return res.json({ 
        diasSinComentarios: 7 // Valor por defecto
      });
    }

    res.json({ 
      diasSinComentarios: config.unidadesParadas.diasSinComentarios || 7
    });

  } catch (error) {
    console.error('Error obteniendo configuración de unidades paradas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
