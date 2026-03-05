import express from 'express';
import Ingreso from '../models/Ingreso.js';
import Oportunidad from '../models/Oportunidad.js';
import Comentario from '../models/Comentario.js';
import Configuracion from '../models/Configuracion.js';
import { registrarLog, transicionEnGestion } from '../services/alarmasService.js';

const router = express.Router();

// Sistema de caché simple en memoria con TTL para estadísticas de oportunidades 10k
export const oportunidades10kCache = {
  data: new Map(),
  ttl: 2 * 60 * 1000, // 2 minutos en milisegundos
  
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
setInterval(() => oportunidades10kCache.cleanup(), 60 * 1000);

// Obtener oportunidades con filtros parametrizados
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      taller = '',
      fechaDesde = '',
      fechaHasta = ''
    } = req.query;
    
    // Obtener parámetros de configuración
    const config = await Configuracion.findOne({ singleton: true });
    const palabrasClave = config?.oportunidades?.palabrasClave || '';
    const mesesDesdeCierre = config?.oportunidades?.mesesDesdeCierre || 3;
    
    // Construir filtros
    const filters = {};
    
    // Filtro 1: Desaveria debe contener alguna palabra clave
    if (palabrasClave && palabrasClave.trim()) {
      const palabras = palabrasClave.split(',').map(p => p.trim()).filter(p => p);
      if (palabras.length > 0) {
        // Buscar si contiene CUALQUIERA de las palabras
        filters.$and = filters.$and || [];
        filters.$and.push({
          $or: palabras.map(palabra => ({
            'Desaveria': { $regex: palabra, $options: 'i' }
          }))
        });
      }
    }
    
    // Filtro 2: F cierr debe ser anterior a X meses
    if (mesesDesdeCierre > 0) {
      const fechaLimite = new Date();
      fechaLimite.setMonth(fechaLimite.getMonth() - mesesDesdeCierre);
      
      filters.$and = filters.$and || [];
      filters.$and.push({
        'F cierr': { $lte: fechaLimite, $ne: null }
      });
    }
    
    // Búsqueda adicional de texto
    if (search) {
      filters.$and = filters.$and || [];
      filters.$and.push({
        $or: [
          { CLIENTE: { $regex: search, $options: 'i' } },
          { 'Matrícula vehí': { $regex: search, $options: 'i' } },
          { Referencia: { $regex: search, $options: 'i' } }
        ]
      });
    }
    
    // Filtro por taller - puede ser un código único o múltiples códigos separados por coma
    // Nota: El campo Taller en Ingreso es String, pero puede contener valores numéricos como strings ("1", "2", etc.)
    if (taller) {
      const codigos = taller.split(',').map(c => c.trim()).filter(c => c !== '' && c !== null && c !== undefined);
      
      if (codigos.length > 0) {
        // Como Taller es String en el modelo, mantener los códigos como strings
        // Pero también incluir versiones numéricas por si acaso hay inconsistencias en los datos
        const codigosCombinados = [];
        codigos.forEach(codigo => {
          codigosCombinados.push(codigo); // String original
          const numCodigo = Number(codigo);
          if (!isNaN(numCodigo)) {
            // Agregar versión numérica también para compatibilidad
            codigosCombinados.push(numCodigo);
          }
        });
        
        // Eliminar duplicados
        const codigosUnicos = [...new Set(codigosCombinados)];
        
        const filtroTaller = codigosUnicos.length === 1 
          ? { Taller: codigosUnicos[0] }
          : { Taller: { $in: codigosUnicos } };
        
        // Si ya hay filtros $and, agregar el filtro de taller dentro de $and
        // Si no hay $and, agregarlo como filtro de nivel superior
        if (filters.$and && filters.$and.length > 0) {
          filters.$and.push(filtroTaller);
        } else {
          filters.Taller = filtroTaller.Taller;
        }
        
        console.log(`[OPORTUNIDADES] Filtro de taller aplicado: ${taller} -> ${JSON.stringify(filtroTaller)}`);
      }
    }
    
    // Filtro por rango de fechas
    if (fechaDesde || fechaHasta) {
      const filtroFecha = {};
      if (fechaDesde) {
        filtroFecha.$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        filtroFecha.$lte = new Date(fechaHasta);
      }
      
      // Combinar con el filtro existente de F cierr si existe
      if (filters['F cierr']) {
        Object.assign(filters['F cierr'], filtroFecha);
      } else {
        filters['F cierr'] = filtroFecha;
      }
    }
    
    // PASO 1: Usar agregación para encontrar el último ingreso de cada vehículo
    // que cumpla con los filtros
    console.log('[OPORTUNIDADES] Filtros aplicados:', JSON.stringify(filters, null, 2));
    const pipeline = [
      // Filtrar por los criterios básicos
      { $match: filters },
      
      // Agregar campo identificador (priorizar Bastidor, luego Matrícula)
      {
        $addFields: {
          identificadorVehiculo: {
            $cond: {
              if: { $and: [{ $ne: ['$Bastidor', null] }, { $ne: ['$Bastidor', ''] }] },
              then: '$Bastidor',
              else: {
                $cond: {
                  if: { $and: [{ $ne: ['$Matrícula vehí', null] }, { $ne: ['$Matrícula vehí', ''] }] },
                  then: '$Matrícula vehí',
                  else: null
                }
              }
            }
          }
        }
      },
      
      // Excluir ingresos sin identificador
      { $match: { identificadorVehiculo: { $ne: null } } },
      
      // Ordenar por identificador y fecha de cierre descendente
      { $sort: { identificadorVehiculo: 1, 'F cierr': -1 } },
      
      // Agrupar por identificador y tomar solo el más reciente
      {
        $group: {
          _id: '$identificadorVehiculo',
          ultimoIngreso: { $first: '$$ROOT' }
        }
      },
      
      // Reemplazar el documento raíz con el último ingreso
      { $replaceRoot: { newRoot: '$ultimoIngreso' } },
      
      // Ordenar por fecha de cierre descendente
      { $sort: { 'F cierr': -1 } }
    ];
    
    // Ejecutar agregación
    const oportunidadesReales = await Ingreso.aggregate(pipeline);
    
    // PASO 2: Obtener datos de oportunidades (estado, comentarios, alarma)
    const referencias = oportunidadesReales.map(op => op.Referencia);
    const oportunidades = await Oportunidad.find({ ingresoReferencia: { $in: referencias } });
    const comentarios = await Comentario.find({ 
      referencia: { $in: referencias }, 
      tipo: 'oportunidad' 
    });
    
    // Crear mapas para acceso rápido
    const oportunidadesMap = {};
    oportunidades.forEach(op => {
      oportunidadesMap[op.ingresoReferencia] = op;
    });
    
    // Crear automáticamente oportunidades para ingresos que no tienen una oportunidad asociada
    const referenciasSinOportunidad = referencias.filter(ref => !oportunidadesMap[ref]);
    if (referenciasSinOportunidad.length > 0) {
      const nuevasOportunidades = referenciasSinOportunidad.map(ref => ({
        ingresoReferencia: ref,
        estado: 'abierto',
        subEstado: 'pendiente'
      }));
      
      try {
        const oportunidadesCreadas = await Oportunidad.insertMany(nuevasOportunidades, { ordered: false });
        oportunidadesCreadas.forEach(op => {
          oportunidadesMap[op.ingresoReferencia] = op;
        });
        console.log(`[OPORTUNIDADES] Creadas ${oportunidadesCreadas.length} nuevas oportunidades automáticamente`);
      } catch (error) {
        // Algunas oportunidades pueden ya existir (race condition), ignorar errores de duplicados
        if (error.code !== 11000) {
          console.error('[OPORTUNIDADES] Error creando oportunidades automáticamente:', error);
        }
        // Intentar obtener las que se crearon exitosamente
        const oportunidadesExistentes = await Oportunidad.find({ 
          ingresoReferencia: { $in: referenciasSinOportunidad } 
        });
        oportunidadesExistentes.forEach(op => {
          oportunidadesMap[op.ingresoReferencia] = op;
        });
      }
    }
    
    const comentariosMap = {};
    comentarios.forEach(com => {
      if (!comentariosMap[com.referencia]) {
        comentariosMap[com.referencia] = [];
      }
      comentariosMap[com.referencia].push(com);
    });
    
    // PASO 3: Combinar datos y aplicar paginación
    const oportunidadesCompletas = oportunidadesReales.map(ingreso => {
      const oportunidad = oportunidadesMap[ingreso.Referencia];
      const comentariosOportunidad = comentariosMap[ingreso.Referencia] || [];
      
      return {
        ...ingreso,
        estado: oportunidad?.estado || 'abierto',
        subEstado: oportunidad?.subEstado || 'pendiente',
        alarma: oportunidad?.alarma || { activa: false },
        comentariosCount: comentariosOportunidad.length,
        logs: oportunidad?.logs || []
      };
    });
    
    // Aplicar filtros de estado y subEstado si existen
    const estadoFiltro = req.query.estado;
    const subEstadoFiltro = req.query.subEstado;
    
    let oportunidadesFiltradas = oportunidadesCompletas;
    if (estadoFiltro) {
      oportunidadesFiltradas = oportunidadesFiltradas.filter(op => op.estado === estadoFiltro);
      if (subEstadoFiltro && estadoFiltro === 'abierto') {
        oportunidadesFiltradas = oportunidadesFiltradas.filter(op => op.subEstado === subEstadoFiltro);
      }
    }
    
    // Ordenar por prioridad: "abierto pendiente" primero, luego por fecha
    oportunidadesFiltradas.sort((a, b) => {
      if (a.estado === 'abierto' && a.subEstado === 'pendiente' && 
          (b.estado !== 'abierto' || b.subEstado !== 'pendiente')) return -1;
      if (b.estado === 'abierto' && b.subEstado === 'pendiente' && 
          (a.estado !== 'abierto' || a.subEstado !== 'pendiente')) return 1;
      return new Date(b['F cierr']) - new Date(a['F cierr']);
    });
    
    // Aplicar paginación
    const total = oportunidadesFiltradas.length;
    const skip = (Number(page) - 1) * Number(limit);
    const ingresosPaginados = oportunidadesFiltradas.slice(skip, skip + Number(limit));
    
    // Obtener mapeos para aplicarlos
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};
    
    // Aplicar mapeos
    const ingresosConMapeos = ingresosPaginados.map(ingreso => ({
      ...ingreso,
      TallerNombre: talleresMap[ingreso.Taller] || ingreso['Nombre taller'] || ingreso.Taller
    }));
    
    res.json({
      data: ingresosConMapeos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      },
      parametros: {
        palabrasClave,
        mesesDesdeCierre
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/oportunidades/stats/dashboard
 * Obtiene estadísticas de Oportunidades 10k agrupadas por empresa y taller
 * Filtra por últimos 7 días desde la fecha límite (hoy - mesesDesdeCierre)
 * Solo incluye oportunidades con estado abierto y subEstado pendiente
 */
router.get('/stats/dashboard', async (req, res) => {
  try {
    // Verificar caché
    const cacheKey = 'oportunidades10k-dashboard';
    const cached = oportunidades10kCache.get(cacheKey);
    if (cached) {
      // Calcular fechas para incluir en la respuesta incluso si viene del caché
      const config = await Configuracion.findOne({ singleton: true });
      const mesesDesdeCierre = config?.oportunidades?.mesesDesdeCierre || 3;
      const fechaLimite = new Date();
      fechaLimite.setMonth(fechaLimite.getMonth() - mesesDesdeCierre);
      fechaLimite.setHours(23, 59, 59, 999);
      const fechaDesde = new Date(fechaLimite);
      fechaDesde.setDate(fechaDesde.getDate() - 7);
      fechaDesde.setHours(0, 0, 0, 0);
      
      return res.json({
        success: true,
        data: cached,
        cached: true,
        fechaLimite: fechaLimite.toISOString(),
        fechaDesde: fechaDesde.toISOString()
      });
    }

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const palabrasClave = config?.oportunidades?.palabrasClave || '';
    const mesesDesdeCierre = config?.oportunidades?.mesesDesdeCierre || 3;
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};

    // Calcular fecha límite (hoy - X meses)
    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() - mesesDesdeCierre);
    fechaLimite.setHours(23, 59, 59, 999); // Fin del día

    // Calcular rango de últimos 7 días desde la fecha límite
    const fechaDesde = new Date(fechaLimite);
    fechaDesde.setDate(fechaDesde.getDate() - 7);
    fechaDesde.setHours(0, 0, 0, 0); // Inicio del día

    console.log(`[OPORTUNIDADES 10K STATS] Fecha límite: ${fechaLimite.toISOString()}`);
    console.log(`[OPORTUNIDADES 10K STATS] Rango: ${fechaDesde.toISOString()} a ${fechaLimite.toISOString()}`);

    // Construir filtros base
    const filters = {
      'F cierr': {
        $gte: fechaDesde,
        $lte: fechaLimite,
        $ne: null
      }
    };

    // Filtro de palabras clave en Desaveria
    if (palabrasClave && palabrasClave.trim()) {
      const palabras = palabrasClave.split(',').map(p => p.trim()).filter(p => p);
      if (palabras.length > 0) {
        filters.$and = filters.$and || [];
        filters.$and.push({
          $or: palabras.map(palabra => ({
            'Desaveria': { $regex: palabra, $options: 'i' }
          }))
        });
      }
    }

    // PASO 1: Usar agregación para encontrar el último ingreso de cada vehículo
    const pipeline = [
      // Filtrar por los criterios básicos
      { $match: filters },
      
      // Agregar campo identificador (priorizar Bastidor, luego Matrícula)
      {
        $addFields: {
          identificadorVehiculo: {
            $cond: {
              if: { $and: [{ $ne: ['$Bastidor', null] }, { $ne: ['$Bastidor', ''] }] },
              then: '$Bastidor',
              else: {
                $cond: {
                  if: { $and: [{ $ne: ['$Matrícula vehí', null] }, { $ne: ['$Matrícula vehí', ''] }] },
                  then: '$Matrícula vehí',
                  else: null
                }
              }
            }
          }
        }
      },
      
      // Excluir ingresos sin identificador
      { $match: { identificadorVehiculo: { $ne: null } } },
      
      // Ordenar por identificador y fecha de cierre descendente
      { $sort: { identificadorVehiculo: 1, 'F cierr': -1 } },
      
      // Agrupar por identificador y tomar solo el más reciente
      {
        $group: {
          _id: '$identificadorVehiculo',
          ultimoIngreso: { $first: '$$ROOT' }
        }
      },
      
      // Reemplazar el documento raíz con el último ingreso
      { $replaceRoot: { newRoot: '$ultimoIngreso' } }
    ];

    // Ejecutar agregación
    const ingresosReales = await Ingreso.aggregate(pipeline);

    // PASO 2: Obtener o crear oportunidades asociadas con estado abierto y pendiente
    const referencias = ingresosReales.map(ing => ing.Referencia);
    let oportunidades = await Oportunidad.find({
      ingresoReferencia: { $in: referencias }
    });

    // Crear automáticamente oportunidades para ingresos que no tienen una oportunidad asociada
    const referenciasSinOportunidad = referencias.filter(ref => 
      !oportunidades.find(op => op.ingresoReferencia === ref)
    );
    
    if (referenciasSinOportunidad.length > 0) {
      const nuevasOportunidades = referenciasSinOportunidad.map(ref => ({
        ingresoReferencia: ref,
        estado: 'abierto',
        subEstado: 'pendiente'
      }));
      
      try {
        const oportunidadesCreadas = await Oportunidad.insertMany(nuevasOportunidades, { ordered: false });
        oportunidades = [...oportunidades, ...oportunidadesCreadas];
        console.log(`[OPORTUNIDADES 10K STATS] Creadas ${oportunidadesCreadas.length} nuevas oportunidades automáticamente`);
      } catch (error) {
        // Algunas oportunidades pueden ya existir (race condition), ignorar errores de duplicados
        if (error.code !== 11000) {
          console.error('[OPORTUNIDADES 10K STATS] Error creando oportunidades automáticamente:', error);
        }
        // Intentar obtener las que se crearon exitosamente
        const oportunidadesExistentes = await Oportunidad.find({ 
          ingresoReferencia: { $in: referenciasSinOportunidad } 
        });
        oportunidades = [...oportunidades, ...oportunidadesExistentes];
      }
    }

    // Filtrar solo oportunidades con estado abierto y pendiente
    const oportunidadesAbiertasPendientes = oportunidades.filter(op => 
      op.estado === 'abierto' && op.subEstado === 'pendiente'
    );

    // Crear mapa de oportunidades válidas
    const oportunidadesValidas = new Set();
    oportunidadesAbiertasPendientes.forEach(op => {
      oportunidadesValidas.add(op.ingresoReferencia);
    });

    // Filtrar solo ingresos que tienen oportunidad abierta y pendiente
    const ingresosFiltrados = ingresosReales.filter(ing => 
      oportunidadesValidas.has(ing.Referencia)
    );

    console.log(`[OPORTUNIDADES 10K STATS] Ingresos encontrados: ${ingresosReales.length}`);
    console.log(`[OPORTUNIDADES 10K STATS] Oportunidades totales: ${oportunidades.length}`);
    console.log(`[OPORTUNIDADES 10K STATS] Oportunidades abiertas/pendientes: ${oportunidadesAbiertasPendientes.length}`);
    console.log(`[OPORTUNIDADES 10K STATS] Ingresos filtrados: ${ingresosFiltrados.length}`);

    // PASO 3: Agrupar por empresa y taller
    const stats = {
      FC: { total: 0, porTaller: {} },
      GV: { total: 0, porTaller: {} },
      PW: { total: 0, porTaller: {} }
    };

    ingresosFiltrados.forEach(ingreso => {
      const tallerCodigo = ingreso.Taller;
      if (tallerCodigo !== undefined && tallerCodigo !== null) {
        const tallerCodigoStr = String(tallerCodigo);
        const tallerNombre = talleresMap[tallerCodigoStr] || `Taller ${tallerCodigo}`;
        
        // Extraer empresa (primeras 2 letras del nombre del taller)
        const partes = tallerNombre.trim().split(/\s+/).filter(p => p.length > 0);
        let empresa = null;
        
        if (partes.length >= 1) {
          empresa = partes[0].toUpperCase();
        } else if (tallerNombre.length >= 2) {
          empresa = tallerNombre.substring(0, 2).toUpperCase();
        }
        
        // Validar que la empresa sea FC, GV o PW
        if (empresa && ['FC', 'GV', 'PW'].includes(empresa)) {
          stats[empresa].total++;
          stats[empresa].porTaller[tallerNombre] = (stats[empresa].porTaller[tallerNombre] || 0) + 1;
        }
      }
    });

    console.log(`[OPORTUNIDADES 10K STATS] Resultado final:`, JSON.stringify(stats, null, 2));

    // Guardar en caché
    oportunidades10kCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false,
      fechaLimite: fechaLimite.toISOString(),
      fechaDesde: fechaDesde.toISOString()
    });
  } catch (error) {
    console.error('Error en GET /api/oportunidades/stats/dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Obtener detalle de una oportunidad específica
router.get('/:referencia', async (req, res) => {
  try {
    const { referencia } = req.params;
    
    // Buscar el ingreso
    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }
    
    // Buscar o crear la oportunidad
    let oportunidad = await Oportunidad.findOne({ ingresoReferencia: referencia });
    if (!oportunidad) {
      oportunidad = new Oportunidad({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await oportunidad.save();
    }
    
    // Obtener comentarios
    const comentarios = await Comentario.find({ 
      referencia, 
      tipo: 'oportunidad' 
    }).sort({ timestamp: -1 });
    
    res.json({
      ingreso,
      oportunidad,
      comentarios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cambiar estado de una oportunidad
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
        return res.status(400).json({ error: 'Un comentario es obligatorio para cerrar la oportunidad' });
      }
    }
    
    // Normalizar subEstado: si es string vacío, convertir a null/undefined
    const subEstadoNormalizado = subEstado && typeof subEstado === 'string' && subEstado.trim() !== '' 
      ? subEstado.trim() 
      : (estado === 'abierto' ? null : undefined);
    
    if (estado === 'abierto' && !subEstadoNormalizado) {
      return res.status(400).json({ error: 'SubEstado es requerido cuando el estado es "abierto"' });
    }
    
    // Buscar o crear la oportunidad
    let oportunidad = await Oportunidad.findOne({ ingresoReferencia: referencia });
    if (!oportunidad) {
      oportunidad = new Oportunidad({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }
    
    const estadoAnterior = oportunidad.estado;
    const subEstadoAnterior = oportunidad.subEstado;
    const teniaAlarmaActiva = oportunidad.alarma?.activa || false;
    
    // Si hay una alarma activa, desactivarla al cambiar el estado manualmente
    if (oportunidad.alarma?.activa) {
      oportunidad.alarma.activa = false;
    }
    
    oportunidad.estado = estado;
    oportunidad.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await oportunidad.save();
    
    // Si el estado es "cerrado" y se proporcionó un comentario, agregarlo automáticamente
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      await Comentario.create({
        referencia: referencia,
        tipo: 'oportunidad',
        usuario: usuario.trim(),
        comentario: comentario.trim(),
        timestamp: new Date()
      });
    }
    
    // Registrar log
    // Solo pasar subEstado si el estado nuevo es "abierto" y tiene valor válido
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    let mensajeLog = teniaAlarmaActiva 
      ? `Estado cambiado de ${estadoAnterior} a ${estado} - Alarma desactivada automáticamente`
      : `Estado cambiado de ${estadoAnterior} a ${estado}`;
    
    // Si es cerrado y hay comentario, incluirlo en el log
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      mensajeLog += ` - Comentario: ${comentario.trim()}`;
    }
    
    await registrarLog(
      oportunidad,
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
      oportunidad,
      mensaje: `Estado cambiado de "${estadoAnterior}" a "${estado}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configurar alarma
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
    
    // Verificar que existe el ingreso
    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }
    
    // Buscar o crear la oportunidad
    let oportunidad = await Oportunidad.findOne({ ingresoReferencia: referencia });
    if (!oportunidad) {
      oportunidad = new Oportunidad({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await oportunidad.save();
    }
    
    // Guardar estado anterior para el log
    const estadoAnterior = oportunidad.estado;
    const subEstadoAnterior = oportunidad.subEstado;
    
    // Cambiar estado a "abierto" y subEstado a "en_espera" cuando se configura una alarma
    oportunidad.estado = 'abierto';
    oportunidad.subEstado = 'en_espera';
    
    // Configurar la alarma
    oportunidad.alarma = {
      fechaHora: fechaAlarma,
      activa: true
    };
    
    // Registrar log antes de guardar (el log se guardará junto con la alarma)
    const log = {
      timestamp: new Date(),
      usuario,
      accion: 'ALARMA_CONFIGURADA',
      estadoAnterior: estadoAnterior,
      estadoNuevo: 'abierto', // El estado cambia a "abierto"
      comentario: `Alarma configurada para ${fechaAlarma.toLocaleString('es-ES')} - Estado cambiado a "abierto" con subEstado "en_espera"`
    };
    
    // Incluir subEstados en el log
    if (subEstadoAnterior && (subEstadoAnterior === 'pendiente' || subEstadoAnterior === 'en_espera')) {
      log.subEstadoAnterior = subEstadoAnterior;
    }
    log.subEstadoNuevo = 'en_espera'; // El subEstado cambia a "en_espera"
    
    oportunidad.logs.push(log);
    
    // Guardar todo junto (alarma + log)
    await oportunidad.save();
    
    res.json({ 
      success: true, 
      oportunidad,
      mensaje: `Alarma configurada para ${fechaAlarma.toLocaleString('es-ES')}`
    });
  } catch (error) {
    console.error('[OPORTUNIDADES] Error configurando alarma:', error);
    res.status(500).json({ error: error.message || 'Error configurando alarma' });
  }
});

// Obtener comentarios de una oportunidad
router.get('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;
    
    const comentarios = await Comentario.find({ 
      referencia, 
      tipo: 'oportunidad' 
    }).sort({ timestamp: -1 });
    
    res.json({
      success: true,
      data: comentarios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agregar comentario a una oportunidad
router.post('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { usuario, comentario } = req.body;
    
    if (!usuario || !comentario) {
      return res.status(400).json({ error: 'Usuario y comentario son requeridos' });
    }
    
    // Verificar que la oportunidad existe
    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }
    
    // Crear comentario
    const nuevoComentario = new Comentario({
      referencia,
      tipo: 'oportunidad',
      usuario,
      comentario,
      esLog: false
    });
    
    await nuevoComentario.save();
    
    // Transición automática a "en_espera" si está en "pendiente"
    await transicionEnGestion(referencia, usuario);
    
    res.json({
      success: true,
      comentario: nuevoComentario,
      mensaje: 'Comentario agregado exitosamente'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

