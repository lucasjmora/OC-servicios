import express from 'express';
import mongoose from 'mongoose';
import UnidadParada from '../models/UnidadParada.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Función auxiliar para registrar logs
const registrarLog = async (unidadParada, accion, estadoAnterior, estadoNuevo, usuario, comentario = '', subEstadoAnterior = null, subEstadoNuevo = null) => {
  try {
    const log = {
      timestamp: new Date(),
      usuario,
      accion,
      estadoAnterior,
      estadoNuevo,
      comentario
    };

    // Solo incluir subEstadoAnterior si tiene un valor válido
    if (subEstadoAnterior && 
        typeof subEstadoAnterior === 'string' && 
        subEstadoAnterior.trim() !== '' && 
        (subEstadoAnterior === 'pendiente' || subEstadoAnterior === 'en_espera')) {
      log.subEstadoAnterior = subEstadoAnterior;
    }

    // Solo incluir subEstadoNuevo si tiene un valor válido Y el estado nuevo es "abierto"
    if (subEstadoNuevo && 
        typeof subEstadoNuevo === 'string' && 
        subEstadoNuevo.trim() !== '' && 
        (subEstadoNuevo === 'pendiente' || subEstadoNuevo === 'en_espera') && 
        estadoNuevo === 'abierto') {
      log.subEstadoNuevo = subEstadoNuevo;
    }

    unidadParada.logs.push(log);
    await unidadParada.save();

    return log;
  } catch (error) {
    console.error('[UNIDADES_PARADAS] Error registrando log:', error);
    throw error;
  }
};

// Obtener unidades paradas con filtros y paginación
router.get('/', async (req, res) => {
  try {
    // Verificar conexión a MongoDB
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Base de datos no disponible' });
    }

    const {
      page = 1,
      limit = 50,
      search = '',
      taller = '',
      patente = '',
      cliente = '',
      referencia = '',
      estado = '',
      subEstado = ''
    } = req.query;

    // Obtener configuración para el nombre de la colección y parámetros
    const config = await Configuracion.findOne({ singleton: true });
    const collectionName = config?.mongodb?.collections?.unidadesParadas || 'unidades_paradas';
    const diasSinComentarios = config?.unidadesParadas?.diasSinComentarios || 7;

    // Construir pipeline de agregación
    const pipeline = [
      // Lookup con la colección de ingresos
      {
        $lookup: {
          from: 'ingresos',
          localField: 'ingresoReferencia',
          foreignField: 'Referencia',
          as: 'ingreso'
        }
      },
      {
        $unwind: {
          path: '$ingreso',
          preserveNullAndEmptyArrays: false // Solo incluir documentos que tengan ingreso
        }
      },
      // Agregar campos calculados
      {
        $addFields: {
          diasAbiertos: {
            $cond: {
              if: { $ne: ['$ingreso.F cierr', null] },
              then: {
                $ceil: {
                  $divide: [
                    { $subtract: ['$ingreso.F cierr', '$ingreso.Fecaper'] },
                    1000 * 60 * 60 * 24
                  ]
                }
              },
              else: {
                $ceil: {
                  $divide: [
                    { $subtract: [new Date(), '$ingreso.Fecaper'] },
                    1000 * 60 * 60 * 24
                  ]
                }
              }
            }
          },
          // Usar el estado real del modelo, con fallback al calculado si no existe
          estadoReal: {
            $ifNull: ['$estado', {
              $cond: {
                if: { $ne: ['$ingreso.F cierr', null] },
                then: 'cerrado',
                else: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: [{ $size: '$comentarios' }, 0] },
                        {
                          $and: [
                            { $gt: [{ $size: '$comentarios' }, 0] },
                            {
                              $gt: [
                                {
                                  $divide: [
                                    { $subtract: [new Date(), { $arrayElemAt: ['$comentarios.fecha', -1] }] },
                                    1000 * 60 * 60 * 24
                                  ]
                                },
                                diasSinComentarios
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    then: 'pendiente',
                    else: 'abierto'
                  }
                }
              }
            }]
          }
        }
      },
      // Aplicar filtros
      {
        $match: {
          // Filtro de búsqueda general (mantener para compatibilidad)
          ...(search && {
            $or: [
              { ingresoReferencia: { $regex: search, $options: 'i' } },
              { 'ingreso.CLIENTE': { $regex: search, $options: 'i' } },
              { 'ingreso.Matrícula vehí': { $regex: search, $options: 'i' } }
            ]
          }),
          // Filtros específicos
          ...(referencia && { ingresoReferencia: { $regex: referencia, $options: 'i' } }),
          ...(cliente && { 'ingreso.CLIENTE': { $regex: cliente, $options: 'i' } }),
          ...(patente && { 'ingreso.Matrícula vehí': { $regex: patente, $options: 'i' } }),
          ...(taller && { 'ingreso.Taller': taller }),
          ...(estado && { estado: estado }),
          ...(subEstado && estado === 'abierto' && { subEstado: subEstado })
        }
      },
      // Ordenar por fecha de creación descendente
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Ejecutar agregación con paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [data, totalCount] = await Promise.all([
      UnidadParada.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]),
      UnidadParada.aggregate([
        ...pipeline,
        { $count: 'total' }
      ])
    ]);

    const total = totalCount[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error obteniendo unidades paradas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nueva unidad parada
router.post('/', async (req, res) => {
  try {
    const { ingresoReferencia } = req.body;

    if (!ingresoReferencia) {
      return res.status(400).json({ error: 'La referencia de ingreso es requerida' });
    }

    // Verificar que la referencia exista en ingresos
    const ingreso = await Ingreso.findOne({ Referencia: ingresoReferencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'No se encontró un ingreso con esa referencia' });
    }

    // Verificar que no exista ya una unidad parada con esa referencia
    const unidadExistente = await UnidadParada.findOne({ ingresoReferencia });
    if (unidadExistente) {
      return res.status(409).json({ error: 'Ya existe una unidad parada con esa referencia' });
    }

    // Crear nueva unidad parada con estado inicial
    const nuevaUnidadParada = new UnidadParada({
      ingresoReferencia,
      estado: ingreso['F cierr'] ? 'cerrado' : 'abierto',
      subEstado: ingreso['F cierr'] ? null : 'pendiente'
    });

    await nuevaUnidadParada.save();

    res.status(201).json({
      message: 'Unidad parada creada exitosamente',
      data: nuevaUnidadParada
    });

  } catch (error) {
    console.error('Error creando unidad parada:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Agregar comentario a una unidad parada
router.post('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { usuario, texto } = req.body;

    if (!usuario || !texto) {
      return res.status(400).json({ error: 'Usuario y texto son requeridos' });
    }

    // Buscar o crear la unidad parada
    let unidadParada = await UnidadParada.findOne({ ingresoReferencia: referencia });
    if (!unidadParada) {
      const ingreso = await Ingreso.findOne({ Referencia: referencia });
      if (!ingreso) {
        return res.status(404).json({ error: 'Unidad parada no encontrada' });
      }
      unidadParada = new UnidadParada({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }

    // Transición automática a "en_espera" si está en "pendiente"
    const estadoAnterior = unidadParada.estado;
    const subEstadoAnterior = unidadParada.subEstado;
    let subEstadoNuevo = unidadParada.subEstado;
    
    // Verificar si hay una alarma vigente (activa y no vencida)
    const ahora = new Date();
    const tieneAlarmaVigente = unidadParada.alarma?.activa && 
                                unidadParada.alarma?.fechaHora && 
                                new Date(unidadParada.alarma.fechaHora) > ahora;
    
    // Si hay una alarma vigente, el estado ya debe ser "abierto" con "en_espera", no cambiar
    if (tieneAlarmaVigente) {
      // Asegurar que el estado sea correcto
      if (unidadParada.estado !== 'abierto' || unidadParada.subEstado !== 'en_espera') {
        unidadParada.estado = 'abierto';
        unidadParada.subEstado = 'en_espera';
        subEstadoNuevo = 'en_espera';
      }
    } else if (unidadParada.estado === 'abierto' && unidadParada.subEstado === 'pendiente') {
      // Solo cambiar a "en_espera" si no hay alarma vigente
      unidadParada.subEstado = 'en_espera';
      subEstadoNuevo = 'en_espera';
    }

    // Agregar comentario
    unidadParada.comentarios.push({
      usuario,
      texto,
      fecha: new Date()
    });

    await unidadParada.save();

    // Registrar log si hubo cambio de subEstado
    if (subEstadoAnterior !== subEstadoNuevo) {
      await registrarLog(
        unidadParada,
        'COMENTARIO_AGREGADO',
        estadoAnterior,
        estadoAnterior,
        usuario,
        'Primer comentario agregado - SubEstado cambiado automáticamente a "en_espera"',
        subEstadoAnterior,
        subEstadoNuevo
      );
    }

    res.json({
      success: true,
      message: 'Comentario agregado exitosamente',
      data: unidadParada
    });

  } catch (error) {
    console.error('Error agregando comentario:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Eliminar unidad parada
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const unidadParada = await UnidadParada.findByIdAndDelete(id);
    if (!unidadParada) {
      return res.status(404).json({ error: 'Unidad parada no encontrada' });
    }

    res.json({
      message: 'Unidad parada eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando unidad parada:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener detalle de una unidad parada específica
router.get('/:referencia', async (req, res) => {
  try {
    const { referencia } = req.params;
    
    // Buscar el ingreso
    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'Unidad parada no encontrada' });
    }
    
    // Buscar o crear la unidad parada
    let unidadParada = await UnidadParada.findOne({ ingresoReferencia: referencia });
    if (!unidadParada) {
      unidadParada = new UnidadParada({
        ingresoReferencia: referencia,
        estado: ingreso['F cierr'] ? 'cerrado' : 'abierto',
        subEstado: ingreso['F cierr'] ? null : 'pendiente'
      });
      await unidadParada.save();
    }
    
    res.json({
      ingreso,
      unidadParada,
      comentarios: unidadParada.comentarios || []
    });
  } catch (error) {
    console.error('Error obteniendo unidad parada:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Cambiar estado de una unidad parada
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
        return res.status(400).json({ error: 'Un comentario es obligatorio para cerrar la unidad parada' });
      }
    }
    
    // Normalizar subEstado: si es string vacío, convertir a null/undefined
    const subEstadoNormalizado = subEstado && typeof subEstado === 'string' && subEstado.trim() !== '' 
      ? subEstado.trim() 
      : (estado === 'abierto' ? null : undefined);
    
    if (estado === 'abierto' && !subEstadoNormalizado) {
      return res.status(400).json({ error: 'SubEstado es requerido cuando el estado es "abierto"' });
    }
    
    // Buscar o crear la unidad parada
    let unidadParada = await UnidadParada.findOne({ ingresoReferencia: referencia });
    if (!unidadParada) {
      const ingreso = await Ingreso.findOne({ Referencia: referencia });
      if (!ingreso) {
        return res.status(404).json({ error: 'Unidad parada no encontrada' });
      }
      unidadParada = new UnidadParada({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }
    
    const estadoAnterior = unidadParada.estado;
    const subEstadoAnterior = unidadParada.subEstado;
    const teniaAlarmaActiva = unidadParada.alarma?.activa || false;
    
    // Si hay una alarma activa, desactivarla al cambiar el estado manualmente
    if (unidadParada.alarma?.activa) {
      unidadParada.alarma.activa = false;
    }
    
    unidadParada.estado = estado;
    unidadParada.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await unidadParada.save();
    
    // Si el estado es "cerrado" y se proporcionó un comentario, agregarlo automáticamente
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      unidadParada.comentarios.push({
        usuario: usuario.trim(),
        texto: comentario.trim(),
        fecha: new Date()
      });
      await unidadParada.save();
    }
    
    // Registrar log
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    let mensajeLog = teniaAlarmaActiva 
      ? `Estado cambiado de ${estadoAnterior} a ${estado} - Alarma desactivada automáticamente`
      : `Estado cambiado de ${estadoAnterior} a ${estado}`;
    
    // Si es cerrado y hay comentario, incluirlo en el log
    if (estado === 'cerrado' && comentario && comentario.trim()) {
      mensajeLog += ` - Comentario: ${comentario.trim()}`;
    }
    
    await registrarLog(
      unidadParada,
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
      unidadParada,
      mensaje: `Estado cambiado de "${estadoAnterior}" a "${estado}"`
    });
  } catch (error) {
    console.error('Error cambiando estado:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
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
      return res.status(404).json({ error: 'Unidad parada no encontrada' });
    }
    
    // Buscar o crear la unidad parada
    let unidadParada = await UnidadParada.findOne({ ingresoReferencia: referencia });
    if (!unidadParada) {
      unidadParada = new UnidadParada({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await unidadParada.save();
    }
    
    // Guardar estado anterior para el log
    const estadoAnterior = unidadParada.estado;
    const subEstadoAnterior = unidadParada.subEstado;
    
    // Cambiar estado a "abierto" y subEstado a "en_espera" cuando se configura una alarma
    unidadParada.estado = 'abierto';
    unidadParada.subEstado = 'en_espera';
    
    // Configurar la alarma
    unidadParada.alarma = {
      fechaHora: fechaAlarma,
      activa: true
    };
    
    await unidadParada.save();
    
    // Registrar log con el cambio de estado
    await registrarLog(
      unidadParada,
      'ALARMA_CONFIGURADA',
      estadoAnterior,
      'abierto', // El estado cambia a "abierto"
      usuario,
      `Alarma configurada para el ${fechaAlarma.toLocaleString('es-ES')} - Estado cambiado a "abierto" con subEstado "en_espera"`,
      subEstadoAnterior,
      'en_espera'
    );
    
    res.json({
      success: true,
      unidadParada,
      mensaje: 'Alarma configurada exitosamente'
    });
  } catch (error) {
    console.error('Error configurando alarma:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Obtener ingreso por referencia (para validación en frontend)
router.get('/ingreso/:referencia', async (req, res) => {
  try {
    const { referencia } = req.params;

    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    
    if (!ingreso) {
      return res.status(404).json({ error: 'No se encontró un ingreso con esa referencia' });
    }

    res.json({ data: ingreso });

  } catch (error) {
    console.error('Error obteniendo ingreso:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para verificar alarmas manualmente (útil para pruebas)
router.post('/verificar-alarmas', async (req, res) => {
  try {
    const { verificarAlarmasUnidadesParadas } = await import('../services/unidadesParadasAlarmasService.js');
    const resultado = await verificarAlarmasUnidadesParadas();
    
    res.json({
      success: true,
      resultado
    });
  } catch (error) {
    console.error('Error verificando alarmas:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
