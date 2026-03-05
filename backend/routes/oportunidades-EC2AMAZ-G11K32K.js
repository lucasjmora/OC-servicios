import express from 'express';
import Ingreso from '../models/Ingreso.js';
import Oportunidad from '../models/Oportunidad.js';
import Comentario from '../models/Comentario.js';
import Configuracion from '../models/Configuracion.js';
import { registrarLog, transicionEnGestion } from '../services/alarmasService.js';

const router = express.Router();

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
    
    // Filtro por taller
    if (taller) {
      filters.Taller = taller;
    }
    
    // Filtro por rango de fechas
    if (fechaDesde || fechaHasta) {
      filters['F cierr'] = filters['F cierr'] || {};
      if (fechaDesde) {
        filters['F cierr'].$gte = new Date(fechaDesde);
      }
      if (fechaHasta && !filters['F cierr'].$lte) {
        filters['F cierr'].$lte = new Date(fechaHasta);
      }
    }
    
    // PASO 1: Usar agregación para encontrar el último ingreso de cada vehículo
    // que cumpla con los filtros
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
        subEstado: oportunidad?.subEstado || null,
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
    const { estado, subEstado, usuario } = req.body;
    
    if (!estado || !usuario) {
      return res.status(400).json({ error: 'Estado y usuario son requeridos' });
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
    
    oportunidad.estado = estado;
    oportunidad.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await oportunidad.save();
    
    // Registrar log
    // Solo pasar subEstado si el estado nuevo es "abierto" y tiene valor válido
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    await registrarLog(
      oportunidad,
      'CAMBIO_ESTADO_MANUAL',
      estadoAnterior,
      estado,
      usuario,
      `Estado cambiado de ${estadoAnterior} a ${estado}`,
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
    
    if (oportunidad.estado !== 'abierto') {
      return res.status(400).json({ error: 'Solo se pueden configurar alarmas en oportunidades con estado "abierto"' });
    }
    
    // Guardar estado anterior para el log
    const estadoAnterior = oportunidad.estado;
    const subEstadoAnterior = oportunidad.subEstado;
    
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
      estadoNuevo: estadoAnterior, // El estado no cambia
      comentario: `Alarma configurada para ${fechaAlarma.toLocaleString('es-ES')}`
    };
    
    // Solo incluir subEstados si tienen valor válido
    if (subEstadoAnterior && (subEstadoAnterior === 'pendiente' || subEstadoAnterior === 'en_espera')) {
      log.subEstadoAnterior = subEstadoAnterior;
      log.subEstadoNuevo = subEstadoAnterior; // El subEstado no cambia
    }
    
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

