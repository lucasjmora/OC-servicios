import express from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Legal from '../models/Legal.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import createUploadMiddleware from '../utils/uploadMiddleware.js';

const router = express.Router();

// Función auxiliar para registrar logs
const registrarLog = async (casoLegal, accion, estadoAnterior, estadoNuevo, usuario, comentario = '', subEstadoAnterior = null, subEstadoNuevo = null) => {
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

    casoLegal.logs.push(log);
    await casoLegal.save();

    return log;
  } catch (error) {
    console.error('[LEGALES] Error registrando log:', error);
    throw error;
  }
};

// Obtener legales con filtros y paginación
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
    const collectionName = config?.mongodb?.collections?.legales || 'legales';
    const diasSinComentarios = config?.legales?.diasSinComentarios || 7;

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
      Legal.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]),
      Legal.aggregate([
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
    console.error('Error obteniendo legales:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo caso legal
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

    // Verificar que no exista ya un caso legal con esa referencia
    const legalExistente = await Legal.findOne({ ingresoReferencia });
    if (legalExistente) {
      return res.status(409).json({ error: 'Ya existe un caso legal con esa referencia' });
    }

    // Crear nuevo caso legal con estado inicial
    const nuevoLegal = new Legal({
      ingresoReferencia,
      estado: ingreso['F cierr'] ? 'cerrado' : 'abierto',
      subEstado: ingreso['F cierr'] ? null : 'pendiente'
    });

    await nuevoLegal.save();

    res.status(201).json({
      message: 'Caso legal creado exitosamente',
      data: nuevoLegal
    });

  } catch (error) {
    console.error('Error creando caso legal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener detalle de un caso legal específico
router.get('/:referencia', async (req, res) => {
  try {
    const { referencia } = req.params;
    
    // Buscar el ingreso
    const ingreso = await Ingreso.findOne({ Referencia: referencia });
    if (!ingreso) {
      return res.status(404).json({ error: 'Caso legal no encontrado' });
    }
    
    // Buscar o crear el caso legal
    let casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      casoLegal = new Legal({
        ingresoReferencia: referencia,
        estado: ingreso['F cierr'] ? 'cerrado' : 'abierto',
        subEstado: ingreso['F cierr'] ? null : 'pendiente'
      });
      await casoLegal.save();
    }
    
    res.json({
      ingreso,
      casoLegal,
      comentarios: casoLegal.comentarios || []
    });
  } catch (error) {
    console.error('Error obteniendo caso legal:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Cambiar estado de un caso legal
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
    
    // Buscar o crear el caso legal
    let casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      const ingreso = await Ingreso.findOne({ Referencia: referencia });
      if (!ingreso) {
        return res.status(404).json({ error: 'Caso legal no encontrado' });
      }
      casoLegal = new Legal({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }
    
    const estadoAnterior = casoLegal.estado;
    const subEstadoAnterior = casoLegal.subEstado;
    
    casoLegal.estado = estado;
    casoLegal.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await casoLegal.save();
    
    // Registrar log
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    await registrarLog(
      casoLegal,
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
      casoLegal,
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
      return res.status(404).json({ error: 'Caso legal no encontrado' });
    }
    
    // Buscar o crear el caso legal
    let casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      casoLegal = new Legal({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await casoLegal.save();
    }
    
    if (casoLegal.estado !== 'abierto') {
      return res.status(400).json({ error: 'Solo se pueden configurar alarmas para casos legales con estado "abierto"' });
    }
    
    // Guardar estado anterior para el log
    const estadoAnterior = casoLegal.estado;
    const subEstadoAnterior = casoLegal.subEstado;
    
    // Configurar la alarma
    casoLegal.alarma = {
      fechaHora: fechaAlarma,
      activa: true
    };
    
    // Cambiar subEstado a "en_espera" cuando se configura una alarma
    casoLegal.subEstado = 'en_espera';
    
    await casoLegal.save();
    
    // Registrar log con el cambio de subEstado
    await registrarLog(
      casoLegal,
      'ALARMA_CONFIGURADA',
      estadoAnterior,
      estadoAnterior, // El estado principal no cambia
      usuario,
      `Alarma configurada para el ${fechaAlarma.toLocaleString('es-ES')} - SubEstado cambiado a "en_espera"`,
      subEstadoAnterior,
      'en_espera'
    );
    
    res.json({
      success: true,
      casoLegal,
      mensaje: 'Alarma configurada exitosamente'
    });
  } catch (error) {
    console.error('Error configurando alarma:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Agregar comentario a un caso legal
router.post('/:referencia/comentarios', async (req, res) => {
  try {
    const { referencia } = req.params;
    const { usuario, texto } = req.body;

    if (!usuario || !texto) {
      return res.status(400).json({ error: 'Usuario y texto son requeridos' });
    }

    // Buscar o crear el caso legal
    let casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      const ingreso = await Ingreso.findOne({ Referencia: referencia });
      if (!ingreso) {
        return res.status(404).json({ error: 'Caso legal no encontrado' });
      }
      casoLegal = new Legal({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
    }

    // Transición automática a "en_espera" si está en "pendiente"
    const estadoAnterior = casoLegal.estado;
    const subEstadoAnterior = casoLegal.subEstado;
    let subEstadoNuevo = casoLegal.subEstado;
    
    if (casoLegal.estado === 'abierto' && casoLegal.subEstado === 'pendiente') {
      casoLegal.subEstado = 'en_espera';
      subEstadoNuevo = 'en_espera';
    }

    // Agregar comentario
    casoLegal.comentarios.push({
      usuario,
      texto,
      fecha: new Date()
    });

    await casoLegal.save();

    // Registrar log si hubo cambio de subEstado
    if (subEstadoAnterior !== subEstadoNuevo) {
      await registrarLog(
        casoLegal,
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
      data: casoLegal
    });

  } catch (error) {
    console.error('Error agregando comentario:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Subir archivo adjunto
router.post('/:referencia/adjuntos', async (req, res) => {
  try {
    const { referencia } = req.params;

    // Buscar o crear el caso legal
    let casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      const ingreso = await Ingreso.findOne({ Referencia: referencia });
      if (!ingreso) {
        return res.status(404).json({ error: 'Caso legal no encontrado' });
      }
      casoLegal = new Legal({
        ingresoReferencia: referencia,
        estado: 'abierto',
        subEstado: 'pendiente'
      });
      await casoLegal.save();
    }

    // Crear middleware de multer
    const upload = await createUploadMiddleware();
    const uploadSingle = upload.single('archivo');

    uploadSingle(req, res, async (err) => {
      if (err) {
        console.error('Error subiendo archivo:', err);
        return res.status(500).json({ error: 'Error al subir el archivo' });
      }

      const { usuario } = req.body;

      if (!usuario) {
        return res.status(400).json({ error: 'Usuario es requerido' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
      }

      // Agregar adjunto al caso legal
      casoLegal.adjuntos.push({
        nombre: req.file.originalname,
        rutaArchivo: req.file.path,
        fechaSubida: new Date(),
        usuario
      });

      await casoLegal.save();

      res.json({
        message: 'Archivo adjunto agregado exitosamente',
        data: casoLegal
      });
    });

  } catch (error) {
    console.error('Error agregando adjunto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Descargar archivo adjunto
router.get('/:referencia/adjuntos/:adjuntoId', async (req, res) => {
  try {
    const { referencia, adjuntoId } = req.params;

    const casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      return res.status(404).json({ error: 'Caso legal no encontrado' });
    }

    const adjunto = casoLegal.adjuntos.id(adjuntoId);
    if (!adjunto) {
      return res.status(404).json({ error: 'Adjunto no encontrado' });
    }

    // Verificar que el archivo exista
    if (!fs.existsSync(adjunto.rutaArchivo)) {
      return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
    }

    // Enviar archivo
    res.download(adjunto.rutaArchivo, adjunto.nombre);

  } catch (error) {
    console.error('Error descargando adjunto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar archivo adjunto
router.delete('/:referencia/adjuntos/:adjuntoId', async (req, res) => {
  try {
    const { referencia, adjuntoId } = req.params;

    const casoLegal = await Legal.findOne({ ingresoReferencia: referencia });
    if (!casoLegal) {
      return res.status(404).json({ error: 'Caso legal no encontrado' });
    }

    const adjunto = casoLegal.adjuntos.id(adjuntoId);
    if (!adjunto) {
      return res.status(404).json({ error: 'Adjunto no encontrado' });
    }

    // Eliminar archivo del sistema de archivos
    if (fs.existsSync(adjunto.rutaArchivo)) {
      fs.unlinkSync(adjunto.rutaArchivo);
    }

    // Eliminar adjunto de la base de datos
    adjunto.remove();
    await casoLegal.save();

    res.json({
      message: 'Adjunto eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando adjunto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar caso legal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const casoLegal = await Legal.findByIdAndDelete(id);
    if (!casoLegal) {
      return res.status(404).json({ error: 'Caso legal no encontrado' });
    }

    // Eliminar todos los archivos adjuntos
    for (const adjunto of casoLegal.adjuntos) {
      if (fs.existsSync(adjunto.rutaArchivo)) {
        fs.unlinkSync(adjunto.rutaArchivo);
      }
    }

    res.json({
      message: 'Caso legal eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando caso legal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    const { verificarAlarmasLegales } = await import('../services/legalesAlarmasService.js');
    const resultado = await verificarAlarmasLegales();
    
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

