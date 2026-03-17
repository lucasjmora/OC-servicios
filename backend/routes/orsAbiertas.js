import express from 'express';
import { getORsPivot, refreshORsPivot } from '../services/orsAbiertasService.js';
import Configuracion from '../models/Configuracion.js';
import configStorageService from '../services/configStorageService.js';

const router = express.Router();

/**
 * POST /api/ors-abiertas/refresh
 * Fuerza la relectura del Excel y actualiza el pivot (útil para diagnosticar sin ejecutar importación completa)
 */
router.post('/refresh', async (req, res) => {
  try {
    let orsPath = null;
    try {
      const config = await Configuracion.findOne({ singleton: true });
      orsPath = config?.filePaths?.orsAbiertas;
    } catch {
      if (configStorageService.isInitialized) {
        orsPath = configStorageService.getConfig()?.filePaths?.orsAbiertas;
      }
    }
    if (!orsPath?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Ruta de archivo ORs Abiertas no configurada en Configuración → Actualización de datos'
      });
    }
    await refreshORsPivot(orsPath);
    const pivot = getORsPivot();
    res.json({
      success: true,
      data: pivot,
      message: `Pivot actualizado: ${pivot.talleres.length} talleres, ${pivot.tiposOrden.length} tipos de orden`
    });
  } catch (error) {
    console.error('Error refrescando pivot ORs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ors-abiertas/pivot
 * Devuelve el cuadro de doble entrada (talleres x tipo orden)
 */
router.get('/pivot', (req, res) => {
  try {
    const pivot = getORsPivot();

    if (!pivot.lastUpdated && pivot.error) {
      return res.json({
        success: true,
        data: pivot,
        message: pivot.error || 'Configure el archivo de ORs Abiertas y actualice los datos para cargar el cuadro.'
      });
    }

    if (pivot.talleres.length === 0 && pivot.tiposOrden.length === 0) {
      return res.json({
        success: true,
        data: pivot,
        message: 'No hay datos. Actualice los datos para cargar el cuadro de ORs Abiertas.'
      });
    }

    res.json({
      success: true,
      data: pivot
    });
  } catch (error) {
    console.error('Error obteniendo pivot ORs Abiertas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
