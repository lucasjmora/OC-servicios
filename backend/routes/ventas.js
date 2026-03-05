import express from 'express';
import mongoose from 'mongoose';
import { obtenerResumenVentas, obtenerMesesDisponibles, procesarVentas } from '../services/ventasService.js';

const router = express.Router();

/**
 * GET /api/ventas/resumen/:mesKey
 * Obtiene el resumen de ventas para un mes específico
 */
router.get('/resumen/:mesKey', async (req, res) => {
  try {
    const { mesKey } = req.params;
    
    // Validar formato de mesKey (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(mesKey)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de mesKey inválido. Debe ser YYYY-MM'
      });
    }

    const resumen = await obtenerResumenVentas(mesKey);

    res.json({
      success: true,
      data: resumen
    });

  } catch (error) {
    console.error('Error obteniendo resumen de ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/ventas/meses
 * Obtiene la lista de meses disponibles con datos de ventas
 */
router.get('/meses', async (req, res) => {
  try {
    const meses = await obtenerMesesDisponibles();

    res.json({
      success: true,
      data: meses
    });

  } catch (error) {
    console.error('Error obteniendo meses disponibles:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * POST /api/ventas/procesar
 * Ejecuta manualmente el procesamiento de ventas
 */
router.post('/procesar', async (req, res) => {
  try {
    console.log('🔄 Procesamiento manual de ventas iniciado...');
    const resultado = await procesarVentas();

    res.json({
      success: true,
      message: 'Procesamiento de ventas completado',
      data: resultado
    });

  } catch (error) {
    console.error('Error procesando ventas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;

