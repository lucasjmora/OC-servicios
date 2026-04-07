import express from 'express';
import Cita from '../models/Cita.js';
import CitaGestion from '../models/CitaGestion.js';
import Comentario from '../models/Comentario.js';
import { 
  getCitasConAsistencia, 
  getComentariosCita, 
  addComentarioCita,
  getEstadisticasAsistencia
} from '../services/asistenciaService.js';

const router = express.Router();

// Sistema de caché simple en memoria con TTL para estadísticas de asistencia
// Exportado para que pueda ser limpiado desde otros módulos
export const asistenciaCache = {
  data: new Map(),
  ttl: 5 * 60 * 1000, // 5 minutos en milisegundos (aumentado para mejorar rendimiento)
  
  get(key) {
    const item = this.data.get(key);
    if (!item) return null;
    
    // Verificar si el caché expiró
    if (Date.now() > item.expiresAt) {
      this.data.delete(key);
      return null;
    }
    
    return item.value;
  },
  
  set(key, value) {
    this.data.set(key, {
      value,
      expiresAt: Date.now() + this.ttl
    });
  },
  
  clear() {
    this.data.clear();
  },
  
  // Limpiar entradas expiradas periódicamente
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.data.entries()) {
      if (now > item.expiresAt) {
        this.data.delete(key);
      }
    }
  }
};

// Limpiar caché expirado cada minuto
setInterval(() => asistenciaCache.cleanup(), 60 * 1000);

// Función helper para registrar logs
const registrarLog = async (citaGestion, accion, estadoAnterior, estadoNuevo, usuario, comentario, subEstadoAnterior = null, subEstadoNuevo = null) => {
  const log = {
    timestamp: new Date(),
    usuario,
    accion,
    estadoAnterior,
    estadoNuevo,
    comentario
  };
  
  if (subEstadoAnterior) {
    log.subEstadoAnterior = subEstadoAnterior;
  }
  if (subEstadoNuevo) {
    log.subEstadoNuevo = subEstadoNuevo;
  }
  
  citaGestion.logs.push(log);
  await citaGestion.save();
};

/**
 * GET /api/asistencia
 * Obtiene citas sin asistencia con filtros y paginación
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 GET /api/asistencia - Iniciando consulta');
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

    console.log('📋 Parámetros recibidos:', {
      page,
      limit,
      search,
      fechaDesde,
      fechaHasta,
      taller,
      nombre,
      matricula,
      estadoAsistencia
    });

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

    console.log('🚀 Llamando a getCitasConAsistencia...');
    const result = await getCitasConAsistencia(filters, pagination);
    console.log(`✅ getCitasConAsistencia completado: ${result.data?.length || 0} citas devueltas`);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
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

    // Buscar o crear la gestión de la cita
    let citaGestion = await CitaGestion.findOne({ citaReferencia: referencia });
    if (!citaGestion) {
      citaGestion = new CitaGestion({
        citaReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await citaGestion.save();
    }

    // Verificar si hay una alarma vigente
    const ahora = new Date();
    const tieneAlarmaVigente = citaGestion.alarma?.activa && 
                                citaGestion.alarma?.fechaHora && 
                                new Date(citaGestion.alarma.fechaHora) > ahora;
    
    // Si hay una alarma vigente, el estado ya debe ser "abierto" con "en_espera", no cambiar
    if (tieneAlarmaVigente) {
      if (citaGestion.estado !== 'abierto' || citaGestion.subEstado !== 'en_espera') {
        citaGestion.estado = 'abierto';
        citaGestion.subEstado = 'en_espera';
        await citaGestion.save();
      }
    } else {
      // Si está en "abierto" con subEstado "pendiente", cambiar a "en_espera"
      if (citaGestion.estado === 'abierto' && citaGestion.subEstado === 'pendiente') {
        const estadoAnterior = citaGestion.estado;
        const subEstadoAnterior = citaGestion.subEstado;
        
        citaGestion.subEstado = 'en_espera';
        await citaGestion.save();
        
        await registrarLog(
          citaGestion,
          'COMENTARIO_AGREGADO',
          estadoAnterior,
          estadoAnterior,
          usuario.trim(),
          'Comentario agregado - SubEstado cambiado automáticamente a "en_espera"',
          subEstadoAnterior,
          'en_espera'
        );
      }
    }

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

/**
 * GET /api/asistencia/:referencia
 * Obtener detalle de una cita con gestión
 */
router.get('/:referencia', async (req, res) => {
  try {
    const { referencia } = req.params;
    
    // Buscar la cita
    const cita = await Cita.findOne({ Referencia: referencia });
    if (!cita) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Buscar o crear la gestión de la cita
    let citaGestion = await CitaGestion.findOne({ citaReferencia: referencia });
    if (!citaGestion) {
      citaGestion = new CitaGestion({
        citaReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await citaGestion.save();
    }
    
    // Obtener comentarios
    const comentarios = await Comentario.find({ 
      referencia, 
      tipo: 'cita' 
    }).sort({ timestamp: -1 });
    
    res.json({
      cita,
      citaGestion,
      comentarios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/asistencia/:referencia/estado
 * Cambiar estado de una cita
 */
router.put('/:referencia/estado', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { estado, subEstado, usuario, comentario } = req.body;
    
    if (!estado || !usuario) {
      return res.status(400).json({ error: 'Estado y usuario son requeridos' });
    }
    
    // Si el estado es "cerrado", el comentario es obligatorio
    if (estado === 'cerrado') {
      if (!comentario || typeof comentario !== 'string' || comentario.trim() === '') {
        return res.status(400).json({ error: 'Un comentario es obligatorio para cerrar la cita' });
      }
    }
    
    // Normalizar subEstado
    const subEstadoNormalizado = subEstado && typeof subEstado === 'string' && subEstado.trim() !== '' 
      ? subEstado.trim() 
      : (estado === 'abierto' ? null : undefined);
    
    if (estado === 'abierto' && !subEstadoNormalizado) {
      return res.status(400).json({ error: 'SubEstado es requerido cuando el estado es "abierto"' });
    }
    
    // Verificar que existe la cita
    const cita = await Cita.findOne({ Referencia: referencia });
    if (!cita) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Buscar o crear la gestión de la cita
    let citaGestion = await CitaGestion.findOne({ citaReferencia: referencia });
    if (!citaGestion) {
      citaGestion = new CitaGestion({
        citaReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }
    
    const estadoAnterior = citaGestion.estado;
    const subEstadoAnterior = citaGestion.subEstado;
    const teniaAlarmaActiva = citaGestion.alarma?.activa || false;
    
    // Si hay una alarma activa, desactivarla al cambiar el estado manualmente
    if (citaGestion.alarma?.activa) {
      citaGestion.alarma.activa = false;
    }
    
    citaGestion.estado = estado;
    citaGestion.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await citaGestion.save();
    
    // Si el estado es "cerrado" y se proporcionó un comentario, agregarlo automáticamente
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      await Comentario.create({
        referencia: referencia,
        tipo: 'cita',
        usuario: usuario.trim(),
        comentario: comentario.trim(),
        timestamp: new Date()
      });
    }
    
    // Registrar log
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    let mensajeLog = teniaAlarmaActiva 
      ? `Estado cambiado de ${estadoAnterior} a ${estado} - Alarma desactivada automáticamente`
      : `Estado cambiado de ${estadoAnterior} a ${estado}`;
    
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      mensajeLog += ` - Comentario: ${comentario.trim()}`;
    }
    
    await registrarLog(
      citaGestion,
      'CAMBIO_ESTADO_MANUAL',
      estadoAnterior,
      estado,
      usuario,
      mensajeLog,
      subEstadoAnterior,
      subEstadoParaLog
    );
    
    res.json({ 
      success: true, 
      citaGestion,
      mensaje: `Estado cambiado de "${estadoAnterior}" a "${estado}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/asistencia/:referencia/alarma
 * Configurar alarma para una cita
 */
router.put('/:referencia/alarma', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { fechaHora, usuario } = req.body;
    
    if (!fechaHora || !usuario) {
      return res.status(400).json({ error: 'Fecha/hora y usuario son requeridos' });
    }
    
    // Validar formato de fecha
    const fechaAlarma = new Date(fechaHora);
    if (isNaN(fechaAlarma.getTime())) {
      return res.status(400).json({ error: 'Formato de fecha/hora inválido' });
    }
    
    const ahora = new Date();
    if (fechaAlarma <= ahora) {
      return res.status(400).json({ error: 'La alarma debe ser en el futuro' });
    }
    
    // Verificar que existe la cita
    const cita = await Cita.findOne({ Referencia: referencia });
    if (!cita) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Buscar o crear la gestión de la cita
    let citaGestion = await CitaGestion.findOne({ citaReferencia: referencia });
    if (!citaGestion) {
      citaGestion = new CitaGestion({
        citaReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await citaGestion.save();
    }
    
    // Guardar estado anterior para el log
    const estadoAnterior = citaGestion.estado;
    const subEstadoAnterior = citaGestion.subEstado;
    
    // Cambiar estado a "abierto" y subEstado a "en_espera" cuando se configura una alarma
    citaGestion.estado = 'abierto';
    citaGestion.subEstado = 'en_espera';
    
    // Configurar la alarma
    citaGestion.alarma = {
      fechaHora: fechaAlarma,
      activa: true
    };
    
    // Registrar log
    const log = {
      timestamp: new Date(),
      usuario,
      accion: 'ALARMA_CONFIGURADA',
      estadoAnterior: estadoAnterior,
      estadoNuevo: 'abierto',
      comentario: `Alarma configurada para ${fechaAlarma.toLocaleString('es-ES')} - Estado cambiado a "abierto" con subEstado "en_espera"`
    };
    
    if (subEstadoAnterior && (subEstadoAnterior === 'pendiente' || subEstadoAnterior === 'en_espera')) {
      log.subEstadoAnterior = subEstadoAnterior;
    }
    log.subEstadoNuevo = 'en_espera';
    
    citaGestion.logs.push(log);
    
    // Guardar todo junto
    await citaGestion.save();
    
    res.json({ 
      success: true, 
      citaGestion,
      mensaje: `Alarma configurada para ${fechaAlarma.toLocaleString('es-ES')}`
    });
  } catch (error) {
    console.error('[ASISTENCIA] Error configurando alarma:', error);
    res.status(500).json({ error: error.message || 'Error configurando alarma' });
  }
});

/**
 * POST /api/asistencia/verificar-alarmas
 * Ejecuta manualmente la verificación de alarmas vencidas
 */
router.post('/verificar-alarmas', async (req, res) => {
  try {
    const { verificarAlarmas } = await import('../services/alarmasService.js');
    const resultado = await verificarAlarmas();
    
    res.json({
      success: true,
      resultado
    });
  } catch (error) {
    console.error('[ASISTENCIA] Error verificando alarmas:', error);
    res.status(500).json({
      success: false,
      error: 'Error verificando alarmas',
      message: error.message
    });
  }
});

/**
 * GET /api/asistencia/stats/abiertos-pendientes
 * Obtiene el conteo de casos "No asistió" que están abiertos y pendientes, agrupados por empresa y taller
 * Las dos primeras letras del taller definen la empresa (FC, GV, PW)
 * Por defecto considera casos de los últimos 7 días, pero acepta parámetros fechaDesde y fechaHasta
 */
router.get('/stats/abiertos-pendientes', async (req, res) => {
  try {
    const Configuracion = (await import('../models/Configuracion.js')).default;
    
    // Obtener parámetros de fecha (opcionales)
    const { fechaDesde, fechaHasta: fechaHastaParam, taller: tallerFilter } = req.query;
    
    // Crear clave de caché basada en los parámetros
    const cacheKey = `asistencia-stats-${fechaDesde || 'default'}-${fechaHastaParam || 'default'}-${tallerFilter || 'all'}`;
    const cached = asistenciaCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }
    
    let fechaLimite, fechaHasta;
    
    if (fechaDesde && fechaHastaParam) {
      // Usar fechas proporcionadas en el query
      // Parsear fechas en formato YYYY-MM-DD
      // IMPORTANTE: Usar la misma lógica que asistenciaService.js para mantener consistencia
      // Las fechas están almacenadas como medianoche local (UTC-3), que es 03:00 UTC
      const [yearDesde, monthDesde, dayDesde] = fechaDesde.split('-').map(Number);
      const [yearHasta, monthHasta, dayHasta] = fechaHastaParam.split('-').map(Number);
      
      // Para fechaDesde: usar el día anterior a las 20:00 UTC (para incluir todas las citas del día solicitado)
      fechaLimite = new Date(Date.UTC(yearDesde, monthDesde - 1, dayDesde - 1, 20, 0, 0, 0));
      // Para fechaHasta: usar el día siguiente a las 02:59:59.999 UTC (para incluir todas las citas del día hasta 23:59:59 hora local)
      fechaHasta = new Date(Date.UTC(yearHasta, monthHasta - 1, dayHasta + 1, 2, 59, 59, 999));
    } else {
      // Calcular fecha de hace 7 días hasta ayer (sin incluir la fecha actual) - comportamiento por defecto
      // IMPORTANTE: Usar la misma lógica que asistenciaService.js considerando zona horaria Argentina (UTC-3)
      // Las fechas en MongoDB están almacenadas como medianoche del día en hora local Argentina (UTC-3)
      // Ejemplo: 17/12/2025 00:00:00 hora local = 2025-12-17T03:00:00.000Z en UTC
      const ahora = new Date();
      const ayer = new Date(ahora);
      ayer.setUTCDate(ayer.getUTCDate() - 1); // Ayer
      
      const hace7Dias = new Date(ahora);
      hace7Dias.setUTCDate(hace7Dias.getUTCDate() - 7); // Hace 7 días
      
      // Para fechaDesde: usar el día anterior a las 20:00 UTC (para incluir todas las citas del día)
      // Esto corresponde a medianoche local del día solicitado (03:00 UTC del día siguiente)
      fechaLimite = new Date(Date.UTC(
        hace7Dias.getUTCFullYear(),
        hace7Dias.getUTCMonth(),
        hace7Dias.getUTCDate() - 1,
        20, 0, 0, 0
      ));
      
      // Para fechaHasta: usar el día siguiente a las 02:59:59.999 UTC (para incluir todas las citas del día hasta 23:59:59 hora local)
      // Esto corresponde a 23:59:59 hora local del día solicitado
      fechaHasta = new Date(Date.UTC(
        ayer.getUTCFullYear(),
        ayer.getUTCMonth(),
        ayer.getUTCDate() + 1,
        2, 59, 59, 999
      ));
    }
    
    console.log(`[ASISTENCIA STATS] Fecha límite (UTC): ${fechaLimite.toISOString()}`);
    console.log(`[ASISTENCIA STATS] Fecha hasta (UTC): ${fechaHasta.toISOString()}`);
    console.log(`[ASISTENCIA STATS] Fecha límite (local): ${fechaLimite.toLocaleString('es-AR')}`);
    console.log(`[ASISTENCIA STATS] Fecha hasta (local): ${fechaHasta.toLocaleString('es-AR')}`);

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};

    // OPTIMIZACIÓN: Usar agregación de MongoDB para procesar todo en la base de datos
    // Esto es mucho más rápido que procesar en memoria
    const Ingreso = (await import('../models/Ingreso.js')).default;
    
    // Construir filtro base de citas
    const citasFilter = {
      'Fecha ci': { 
        $gte: fechaLimite, 
        $lte: fechaHasta 
      }
    };
    
    // Si hay filtro de taller en query params, aplicarlo
    if (tallerFilter) {
      if (tallerFilter.includes(',')) {
        const codigos = tallerFilter.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
        if (codigos.length > 0) {
          citasFilter.Taller = { $in: codigos };
        }
      } else {
        citasFilter.Taller = parseInt(tallerFilter);
      }
      console.log(`[ASISTENCIA STATS] Filtro de taller aplicado: ${tallerFilter}`);
    }
    
    console.log(`[ASISTENCIA STATS] Filtro de citas aplicado:`, JSON.stringify(citasFilter, null, 2));
    
    const inicioConsulta = Date.now();
    
    // OPTIMIZACIÓN: Obtener solo los campos necesarios y usar agregación para procesar más rápido
    // OPTIMIZACIÓN: Usar índices si están disponibles
    const citas = await Cita.find(citasFilter)
      .select({
        Referencia: 1,
        Taller: 1,
        Matricula: 1,
        'Fecha ci': 1
      })
      .lean()
      .maxTimeMS(10000); // Timeout de 10 segundos para la consulta de citas
    
    const tiempoConsulta = Date.now() - inicioConsulta;
    console.log(`[ASISTENCIA STATS] Citas encontradas: ${citas.length} (${tiempoConsulta}ms)`);
    
    // Si no hay citas, retornar estadísticas vacías inmediatamente
    if (citas.length === 0) {
      const statsVacios = {
        FC: { total: 0, porTaller: {} },
        GV: { total: 0, porTaller: {} },
        PW: { total: 0, porTaller: {} }
      };
      asistenciaCache.set(cacheKey, statsVacios);
      return res.json({
        success: true,
        data: statsVacios,
        cached: false
      });
    }
    
    // Obtener configuración de días de tolerancia
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;
    
    // Normalizar matrículas y buscar ingresos (misma lógica que asistenciaService)
    const normalizarMatricula = (matricula) => {
      if (!matricula) return '';
      return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    };
    
    const normalizarFecha = (fecha) => {
      if (!fecha) return null;
      const fechaDate = fecha instanceof Date ? new Date(fecha) : new Date(fecha);
      if (isNaN(fechaDate.getTime())) return null;
      return Date.UTC(
        fechaDate.getUTCFullYear(),
        fechaDate.getUTCMonth(),
        fechaDate.getUTCDate()
      );
    };
    
    const estaDentroDeTolerancia = (fechaCita, fechaIngreso, diasToleranciaParam = diasTolerancia) => {
      const fechaCitaNormalizada = normalizarFecha(fechaCita);
      const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);
      if (!fechaCitaNormalizada || !fechaIngresoNormalizada) return false;
      const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
      const diffDias = diffMs / (1000 * 60 * 60 * 24);
      
      // Aceptar ingresos hasta X días después de la cita (no antes)
      // El ingreso debe ser posterior o igual a la fecha de la cita
      if (diffMs < 0) {
        return false; // El ingreso es anterior a la cita, no cuenta como asistencia
      }
      
      return diffDias <= diasToleranciaParam;
    };
    
    // OPTIMIZACIÓN: Obtener todas las matrículas normalizadas de una vez y buscar todos los ingresos en una sola consulta
    const inicioMatriculas = Date.now();
    const matriculasNormalizadasSet = new Set();
    const matriculaPorCita = new Map(); // Mapa para asociar matrícula normalizada con citas
    
    citas.forEach(cita => {
      if (cita['Fecha ci'] && cita.Matricula) {
        const matriculaNormalizada = normalizarMatricula(cita.Matricula);
        if (matriculaNormalizada) {
          matriculasNormalizadasSet.add(matriculaNormalizada);
          if (!matriculaPorCita.has(matriculaNormalizada)) {
            matriculaPorCita.set(matriculaNormalizada, []);
          }
          matriculaPorCita.get(matriculaNormalizada).push(cita);
        }
      }
    });
    
    const tiempoMatriculas = Date.now() - inicioMatriculas;
    console.log(`[ASISTENCIA STATS] Matrículas normalizadas: ${matriculasNormalizadasSet.size} (${tiempoMatriculas}ms)`);
    
    // OPTIMIZACIÓN CRÍTICA: Enfoque completamente diferente
    // En lugar de buscar ingresos por matrícula (lento con regex), obtener TODOS los ingresos
    // del rango de fechas relevante y filtrar en memoria (mucho más rápido)
    const inicioIngresos = Date.now();
    let ingresosMap = new Map();
    
    if (matriculasNormalizadasSet.size > 0) {
      // Calcular rango de fechas para ingresos: desde fechaLimite hasta fechaHasta + días de tolerancia
      const fechaIngresosDesde = fechaLimite;
      const fechaIngresosHasta = new Date(fechaHasta);
      fechaIngresosHasta.setUTCDate(fechaIngresosHasta.getUTCDate() + diasTolerancia + 1); // Agregar días de tolerancia + margen
      
      console.log(`[ASISTENCIA STATS] Buscando ingresos desde ${fechaIngresosDesde.toISOString()} hasta ${fechaIngresosHasta.toISOString()}`);
      
      // OPTIMIZACIÓN: Obtener TODOS los ingresos del rango de fechas (usa índice de fecha, muy rápido)
      // Luego filtrar en memoria por matrícula (más rápido que múltiples consultas con regex)
      const ingresos = await Ingreso.find({
        Fecaper: {
          $gte: fechaIngresosDesde,
          $lte: fechaIngresosHasta
        }
      })
        .select({ Referencia: 1, Fecaper: 1, 'Matrícula vehí': 1 })
        .lean()
        .maxTimeMS(15000)
        .limit(50000); // Límite razonable para evitar sobrecarga
      
      console.log(`[ASISTENCIA STATS] Ingresos obtenidos del rango de fechas: ${ingresos.length}`);
      
      // Filtrar ingresos en memoria por matrícula (muy rápido)
      let ingresosFiltrados = 0;
      ingresos.forEach(ingreso => {
        const matriculaValue = ingreso['Matrícula vehí'];
        if (!matriculaValue) return;
        
        const matriculaNormalizadaIngreso = normalizarMatricula(matriculaValue);
        if (!matriculaNormalizadaIngreso) return;
        
        // Solo agregar si la matrícula está en nuestro set de citas
        if (matriculasNormalizadasSet.has(matriculaNormalizadaIngreso)) {
          if (!ingresosMap.has(matriculaNormalizadaIngreso)) {
            ingresosMap.set(matriculaNormalizadaIngreso, []);
          }
          ingresosMap.get(matriculaNormalizadaIngreso).push(ingreso);
          ingresosFiltrados++;
        }
      });
      
      console.log(`[ASISTENCIA STATS] Ingresos filtrados en memoria: ${ingresosFiltrados}, Matrículas únicas con ingresos: ${ingresosMap.size}`);
    }
    
    const tiempoIngresos = Date.now() - inicioIngresos;
    console.log(`[ASISTENCIA STATS] Ingresos procesados: ${ingresosMap.size} matrículas únicas (${tiempoIngresos}ms)`);

    // OPTIMIZACIÓN: Identificar citas que "no asistieron" con logging de tiempo
    const inicioNoAsistio = Date.now();
    const citasNoAsistio = [];
    
    for (const cita of citas) {
      let tieneAsistencia = false;
      const matriculaNormalizada = normalizarMatricula(cita.Matricula);

      // Verificar asistencia usando el mapa de ingresos (igual que asistenciaService.js)
      if (cita['Fecha ci'] && matriculaNormalizada && ingresosMap.has(matriculaNormalizada)) {
        try {
          const fechaCita = cita['Fecha ci'];
          const ingresosCita = ingresosMap.get(matriculaNormalizada);
          const ingresoEncontrado = ingresosCita?.find(ingreso => {
            return estaDentroDeTolerancia(fechaCita, ingreso.Fecaper, diasTolerancia);
          });
          if (ingresoEncontrado) {
            tieneAsistencia = true;
          }
        } catch (error) {
          console.warn(`Error verificando asistencia para cita ${cita.Referencia}:`, error.message);
        }
      }

      if (!tieneAsistencia) {
        citasNoAsistio.push(cita);
      }
    }
    
    const tiempoNoAsistio = Date.now() - inicioNoAsistio;
    console.log(`[ASISTENCIA STATS] Citas sin asistencia: ${citasNoAsistio.length} (${tiempoNoAsistio}ms)`);
    
    // OPTIMIZACIÓN: Obtener CitaGestion en paralelo mientras se procesan las citas
    // Usar Promise.all para ejecutar ambas consultas en paralelo
    const referenciasCitasNoAsistio = citasNoAsistio.map(c => c.Referencia);
    
    // OPTIMIZACIÓN: Obtener CitaGestion en una sola consulta optimizada con timeout
    const inicioGestion = Date.now();
    const todasCitasGestion = referenciasCitasNoAsistio.length > 0 
      ? await CitaGestion.find({
          citaReferencia: { $in: referenciasCitasNoAsistio }
        })
        .select({
          citaReferencia: 1,
          estado: 1,
          subEstado: 1
        })
        .lean()
        .maxTimeMS(10000) // Timeout de 10 segundos
      : [];
    
    const tiempoGestion = Date.now() - inicioGestion;
    console.log(`[ASISTENCIA STATS] CitaGestion encontradas: ${todasCitasGestion.length} (${tiempoGestion}ms)`);

    // Crear mapa de referencia -> CitaGestion para búsqueda rápida O(1)
    const gestionPorReferencia = new Map();
    todasCitasGestion.forEach(cg => {
      gestionPorReferencia.set(cg.citaReferencia, cg);
    });

    // Filtrar citas que cumplen las condiciones:
    // 1. "No asistió" (ya filtrado)
    // 2. Estado cita: "abierto (pendiente)" - esto incluye:
    //    - Citas SIN CitaGestion (se consideran abierto pendiente por defecto)
    //    - Citas CON CitaGestion que tienen estado='abierto' y subEstado='pendiente'
    // OPTIMIZACIÓN: Usar filter con early return para mejor rendimiento
    const citasFinales = citasNoAsistio.filter(cita => {
      const gestion = gestionPorReferencia.get(cita.Referencia);
      
      // Si no tiene CitaGestion, se considera abierto pendiente por defecto
      if (!gestion) {
        return true;
      }
      
      // Si tiene CitaGestion, debe estar abierto y pendiente
      return gestion.estado === 'abierto' && gestion.subEstado === 'pendiente';
    });


    // Agrupar por empresa y taller
    // Las dos primeras letras del nombre del taller definen la empresa
    const stats = {
      FC: { total: 0, porTaller: {} },
      GV: { total: 0, porTaller: {} },
      PW: { total: 0, porTaller: {} }
    };

    // OPTIMIZACIÓN: Agrupar por empresa y taller de manera más eficiente
    // Pre-calcular el mapeo de taller -> empresa para evitar procesamiento repetido
    const tallerAEmpresaMap = new Map();
    Object.entries(talleresMap).forEach(([codigo, nombre]) => {
      const partes = nombre.trim().split(/\s+/).filter(p => p.length > 0);
      let empresa = null;
      
      if (partes.length >= 1) {
        empresa = partes[0].toUpperCase();
      } else if (nombre.length >= 2) {
        empresa = nombre.substring(0, 2).toUpperCase();
      }
      
      if (empresa && ['FC', 'GV', 'PW'].includes(empresa)) {
        tallerAEmpresaMap.set(String(codigo), { empresa, nombre });
      }
    });
    
    // Agrupar por empresa y taller usando las citas finales
    let citasProcesadas = 0;
    let citasSinTaller = 0;
    let citasEmpresaNoReconocida = 0;
    
    // OPTIMIZACIÓN: Usar un solo loop y evitar múltiples lookups
    for (const cita of citasFinales) {
      const tallerCodigo = cita.Taller;
      if (tallerCodigo !== undefined && tallerCodigo !== null) {
        const tallerCodigoStr = String(tallerCodigo);
        const tallerInfo = tallerAEmpresaMap.get(tallerCodigoStr);
        
        if (tallerInfo) {
          const { empresa, nombre: tallerNombre } = tallerInfo;
          stats[empresa].total++;
          stats[empresa].porTaller[tallerNombre] = (stats[empresa].porTaller[tallerNombre] || 0) + 1;
          citasProcesadas++;
        } else {
          // Fallback: intentar extraer empresa del código si no está en el mapa
          const tallerNombre = talleresMap[tallerCodigoStr] || `Taller ${tallerCodigo}`;
          const partes = tallerNombre.trim().split(/\s+/).filter(p => p.length > 0);
          let empresa = null;
          
          if (partes.length >= 1) {
            empresa = partes[0].toUpperCase();
          } else if (tallerNombre.length >= 2) {
            empresa = tallerNombre.substring(0, 2).toUpperCase();
          }
          
          if (empresa && ['FC', 'GV', 'PW'].includes(empresa)) {
            stats[empresa].total++;
            stats[empresa].porTaller[tallerNombre] = (stats[empresa].porTaller[tallerNombre] || 0) + 1;
            citasProcesadas++;
          } else {
            citasEmpresaNoReconocida++;
            if (citasEmpresaNoReconocida <= 5) { // Limitar logs para no saturar
              console.log(`[ASISTENCIA STATS] Empresa no reconocida: ${empresa || 'N/A'} para taller ${tallerNombre} (código ${tallerCodigoStr})`);
            }
          }
        }
      } else {
        citasSinTaller++;
        if (citasSinTaller <= 5) { // Limitar logs para no saturar
          console.log(`[ASISTENCIA STATS] No se encontró taller para cita ${cita.Referencia}`);
        }
      }
    }
    
    const tiempoTotal = Date.now() - inicioConsulta;
    console.log(`[ASISTENCIA STATS] Citas finales: ${citasFinales.length} (Tiempo total: ${tiempoTotal}ms)`);

    // Guardar en caché
    asistenciaCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error) {
    console.error('Error en GET /api/asistencia/stats/abiertos-pendientes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * POST /api/asistencia/stats/clear-cache
 * Limpia el caché de estadísticas de asistencia
 */
router.post('/stats/clear-cache', async (req, res) => {
  try {
    asistenciaCache.clear();
    res.json({
      success: true,
      message: 'Caché de estadísticas de asistencia limpiado correctamente'
    });
  } catch (error) {
    console.error('Error limpiando caché de asistencia:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;
