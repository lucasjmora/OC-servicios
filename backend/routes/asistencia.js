import express from 'express';
import { 
  getCitasConAsistencia, 
  getComentariosCita, 
  addComentarioCita
} from '../services/asistenciaServiceOptimizado.js'; // ✅ Usar servicio optimizado con datos pre-calculados

const router = express.Router();

/**
 * GET /api/asistencia
 * Obtiene citas sin asistencia con filtros y paginación
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      fechaDesde = '',
      fechaHasta = '',
      taller = '',
      nombre = '',
      matricula = '',
      estadoAsistencia = 'todos'
    } = req.query;

    const filters = {
      search,
      fechaDesde,
      fechaHasta,
      taller,
      nombre,
      matricula,
      estadoAsistencia
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await getCitasConAsistencia(filters, pagination);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      config: result.config
    });

  } catch (error) {
    console.error('Error en GET /api/asistencia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/asistencia/estadisticas
 * Obtiene estadísticas de asistencia
 */
router.get('/estadisticas', async (req, res) => {
  try {
    const estadisticas = await getEstadisticasAsistencia();

    res.json({
      success: true,
      data: estadisticas
    });

  } catch (error) {
    console.error('Error en GET /api/asistencia/estadisticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/asistencia/:referencia/comentarios
 * Obtiene comentarios de una cita específica
 */
router.get('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;

    if (!referencia) {
      return res.status(400).json({
        success: false,
        error: 'Referencia de cita requerida'
      });
    }

    const comentarios = await getComentariosCita(referencia);

    res.json({
      success: true,
      data: comentarios
    });

  } catch (error) {
    console.error('Error en GET /api/asistencia/:referencia/comentarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * POST /api/asistencia/:referencia/comentarios
 * Agrega un comentario a una cita específica
 */
router.post('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { usuario, comentario } = req.body;

    // Validaciones
    if (!referencia) {
      return res.status(400).json({
        success: false,
        error: 'Referencia de cita requerida'
      });
    }

    if (!usuario || !usuario.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Usuario requerido'
      });
    }

    if (!comentario || !comentario.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Comentario requerido'
      });
    }

    const comentarioGuardado = await addComentarioCita(referencia, { usuario: usuario.trim(), comentario: comentario.trim() });

    res.status(201).json({
      success: true,
      data: comentarioGuardado
    });

  } catch (error) {
    console.error('Error en POST /api/asistencia/:referencia/comentarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;
