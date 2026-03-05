import express from 'express';
import Boleto from '../models/Boleto.js';
import Comentario from '../models/Comentario.js';
import Configuracion from '../models/Configuracion.js';
import { sincronizarBoletos, obtenerBoletosExternos, registrarLogBoleto } from '../services/boletosService.js';
import axios from 'axios';

const router = express.Router();

// Obtener lista de boletos con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      estado = '',
      subEstado = '',
      tipoVenta = '',
      ciudad = '',
      estadoBoleto = '',
      fechaDesde = '',
      fechaHasta = ''
    } = req.query;
    
    const filters = {};
    
    if (estado) { filters.estado = estado; }
    if (subEstado && estado === 'abierto') { filters.subEstado = subEstado; }
    
    // Filtro por tipo de venta (múltiple selección)
    if (tipoVenta) {
      const tiposArray = tipoVenta.split(',').map(t => t.trim()).filter(t => t);
      if (tiposArray.length > 0) {
        filters['datosBoleto.typeOfSale'] = { $in: tiposArray };
      }
    }
    
    // Filtro por ciudad (múltiple selección)
    if (ciudad) {
      const ciudadesArray = ciudad.split(',').map(c => c.trim()).filter(c => c);
      if (ciudadesArray.length > 0) {
        const ciudadConditions = ciudadesArray.flatMap(ciudadNombre => [
          { 'datosBoleto.origen.city': { $regex: ciudadNombre, $options: 'i' } },
          { 'datosBoleto.origen.ciudad': { $regex: ciudadNombre, $options: 'i' } }
        ]);
        
        if (filters.$or && Array.isArray(filters.$or) && filters.$or.length > 0) {
          const existingOr = filters.$or;
          filters.$and = filters.$and || [];
          filters.$and.push({ $or: existingOr });
          filters.$or = ciudadConditions;
        } else {
          filters.$or = ciudadConditions;
        }
      }
    }
    
    // Filtro por estado de boleto (múltiple selección)
    if (estadoBoleto) {
      const estadosArray = estadoBoleto.split(',').map(e => e.trim()).filter(e => e);
      if (estadosArray.length > 0) {
        filters['datosBoleto.status'] = { $in: estadosArray };
      }
    }
    
    // Búsqueda de texto en id y datosBoleto
    if (search) {
      const searchConditions = [
        { id: { $regex: search, $options: 'i' } },
        { 'datosBoleto.cliente': { $regex: search, $options: 'i' } },
        { 'datosBoleto.matricula': { $regex: search, $options: 'i' } },
        { 'datosBoleto.modelo': { $regex: search, $options: 'i' } }
      ];
      
      if (filters.$or) {
        filters.$and = filters.$and || [];
        filters.$and.push({ $or: filters.$or });
        filters.$and.push({ $or: searchConditions });
        delete filters.$or;
      } else {
        filters.$or = searchConditions;
      }
    }
    
    // Filtro por rango de fechas usando datosBoleto.createdAt (string a Date)
    if (fechaDesde || fechaHasta) {
      const exprConditions = [];
      if (fechaDesde) {
        const fechaDesdeDate = new Date(fechaDesde);
        fechaDesdeDate.setHours(0, 0, 0, 0);
        exprConditions.push({
          $gte: [ { $dateFromString: { dateString: '$datosBoleto.createdAt', onError: null } }, fechaDesdeDate ]
        });
      }
      if (fechaHasta) {
        const fechaHastaDate = new Date(fechaHasta);
        fechaHastaDate.setHours(23, 59, 59, 999);
        exprConditions.push({
          $lte: [ { $dateFromString: { dateString: '$datosBoleto.createdAt', onError: null } }, fechaHastaDate ]
        });
      }
      if (exprConditions.length > 0) {
        filters.$expr = exprConditions.length === 1 ? exprConditions[0] : { $and: exprConditions };
      }
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    // Ordenamiento: del más nuevo al más antiguo por datosBoleto.createdAt usando agregación
    const total = await Boleto.countDocuments(filters);
    
    const pipeline = [
      { $match: filters },
      {
        $addFields: {
          fechaCreacionBoleto: {
            $dateFromString: { dateString: '$datosBoleto.createdAt', onError: null, onNull: new Date(0) }
          }
        }
      },
      { $sort: { fechaCreacionBoleto: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      { $project: { fechaCreacionBoleto: 0 } }
    ];
    
    const boletos = await Boleto.aggregate(pipeline);
    
    // Obtener conteo de comentarios para todos los boletos
    const boletoIds = boletos.map(b => b.id);
    const comentarios = await Comentario.find({
      referencia: { $in: boletoIds },
      tipo: 'boleto'
    });
    
    // Crear mapa de conteo de comentarios por boleto
    const comentariosCountMap = {};
    comentarios.forEach(com => {
      if (!comentariosCountMap[com.referencia]) {
        comentariosCountMap[com.referencia] = 0;
      }
      comentariosCountMap[com.referencia]++;
    });
    
    const boletosCompletos = boletos.map(boleto => {
      const datos = boleto.datosBoleto || {};
      const ownerIds = datos.ownerIds ? JSON.parse(JSON.stringify(datos.ownerIds)) : [];
      const vehicleId = datos.vehicleId ? JSON.parse(JSON.stringify(datos.vehicleId)) : {};
      const origen = datos.origen ? JSON.parse(JSON.stringify(datos.origen)) : {};
      const status = datos.status || '';
      const typeOfSale = datos.typeOfSale || '';
      const createdAtBoleto = datos.createdAt;
      const { ownerIds: _, vehicleId: __, origen: ___, status: ____, typeOfSale: _____, createdAt: ______, ...datosSinAnidados } = datos;
      
      return {
        ...datosSinAnidados,
        id: boleto.id,
        estado: boleto.estado,
        subEstado: boleto.subEstado,
        alarma: boleto.alarma,
        fechaUltimoComentario: boleto.fechaUltimoComentario,
        logs: boleto.logs || [],
        comentariosCount: comentariosCountMap[boleto.id] || 0,
        createdAt: createdAtBoleto || boleto.createdAt,
        updatedAt: boleto.updatedAt,
        ownerIds: ownerIds,
        vehicleId: vehicleId,
        origen: origen,
        status: status,
        typeOfSale: typeOfSale
      };
    });
    
    res.json({
      data: boletosCompletos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo boletos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verificar conexión al endpoint de boletos (DEBE IR ANTES DE /:id)
router.get('/test-connection', async (req, res) => {
  try {
    const BOLETOS_PAT = process.env.BOLETOS_PAT;
    const BOLETOS_API_URL = process.env.BOLETOS_API_URL || 'https://boleto-services.opencars.com.ar/pat/booking';
    
    if (!BOLETOS_PAT) {
      return res.status(400).json({
        success: false,
        error: 'BOLETOS_PAT no está configurado en las variables de entorno',
        configuracion: {
          url: BOLETOS_API_URL,
          patConfigurado: false
        }
      });
    }
    
    console.log('[BOLETOS] Verificando conexión al endpoint...');
    
    const testParams = {
      page: 1,
      limit: 1,
      typeOfSale: 'VN'
    };
    
    const startTime = Date.now();
    
    try {
      const response = await axios.get(BOLETOS_API_URL, {
        params: testParams,
        headers: {
          'Authorization': `Bearer ${BOLETOS_PAT}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      const responseTime = Date.now() - startTime;
      
      let boletosEncontrados = 0;
      let estructuraRespuesta = 'desconocida';
      
      if (Array.isArray(response.data)) {
        boletosEncontrados = response.data.length;
        estructuraRespuesta = 'array directo';
      } else if (response.data.bookings && Array.isArray(response.data.bookings)) {
        boletosEncontrados = response.data.bookings.length;
        estructuraRespuesta = 'objeto con propiedad bookings';
      } else if (response.data.data && Array.isArray(response.data.data)) {
        boletosEncontrados = response.data.data.length;
        estructuraRespuesta = 'objeto con propiedad data';
      }
      
      res.json({
        success: true,
        mensaje: 'Conexión exitosa al endpoint de boletos',
        detalles: {
          status: response.status,
          statusText: response.statusText,
          tiempoRespuesta: `${responseTime}ms`,
          boletosEncontrados,
          estructuraRespuesta
        }
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      res.status(500).json({
        success: false,
        error: 'Error de conexión',
        detalles: {
          mensaje: error.message,
          tiempoRespuesta: `${responseTime}ms`,
          status: error.response?.status,
          statusText: error.response?.statusText
        }
      });
    }
  } catch (error) {
    console.error('[BOLETOS] Error en verificación de conexión:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener ciudades únicas de boletos (debe ir antes de /:id)
router.get('/ciudades', async (req, res) => {
  try {
    const ciudades = await Boleto.aggregate([
      {
        $project: {
          ciudad: {
            $ifNull: ['$datosBoleto.origen.city', '$datosBoleto.origen.ciudad']
          }
        }
      },
      {
        $match: {
          ciudad: { $exists: true, $ne: null, $ne: '', $not: /^\s*$/ }
        }
      },
      {
        $group: {
          _id: '$ciudad'
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const ciudadesList = ciudades
      .map(c => c._id)
      .filter(c => c && c.trim() !== '')
      .sort();
    res.json({ ciudades: ciudadesList });
  } catch (error) {
    console.error('Error obteniendo ciudades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estados de boleto únicos (debe ir antes de /:id)
router.get('/estados-boleto', async (req, res) => {
  try {
    const estados = await Boleto.aggregate([
      {
        $project: {
          estadoBoleto: '$datosBoleto.status'
        }
      },
      {
        $match: {
          estadoBoleto: { $exists: true, $ne: null, $ne: '', $not: /^\s*$/ }
        }
      },
      {
        $group: {
          _id: '$estadoBoleto'
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const estadosList = estados
      .map(e => e._id)
      .filter(e => e && e.trim() !== '') // Filtrar estados vacíos o solo espacios
      .sort();
    res.json({ estados: estadosList });
  } catch (error) {
    console.error('Error obteniendo estados de boleto:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener detalle de un boleto específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const boleto = await Boleto.findOne({ id });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado' });
    }
    
    // Obtener comentarios del boleto
    const comentarios = await Comentario.find({
      referencia: id,
      tipo: 'boleto'
    }).sort({ timestamp: -1 });
    
    res.json({
      boleto: {
        ...boleto.toObject(),
        comentarios: comentarios
      }
    });
  } catch (error) {
    console.error('Error obteniendo boleto:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar estado de un boleto
router.put('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
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
    
    const boleto = await Boleto.findOne({ id });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado' });
    }
    
    const estadoAnterior = boleto.estado;
    const subEstadoAnterior = boleto.subEstado;
    
    boleto.estado = estado;
    boleto.subEstado = estado === 'abierto' ? subEstadoNormalizado : null;
    
    await boleto.save();
    
    // Registrar log
    // Solo pasar subEstado si el estado nuevo es "abierto" y tiene valor válido
    const subEstadoParaLog = (estado === 'abierto' && subEstadoNormalizado) ? subEstadoNormalizado : null;
    await registrarLogBoleto(
      boleto,
      'CAMBIO_ESTADO_MANUAL',
      estadoAnterior,
      estado,
      usuario,
      `Estado cambiado de ${estadoAnterior} a ${estado}`,
      subEstadoAnterior,
      subEstadoParaLog
    );
    
    res.json({ success: true, boleto });
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({ error: error.message });
  }
});

// Configurar alarma para un boleto
router.put('/:id/alarma', async (req, res) => {
  try {
    const { id } = req.params;
    const { fechaHora, usuario } = req.body;
    
    if (!fechaHora || !usuario) {
      return res.status(400).json({ error: 'Fecha/hora y usuario son requeridos' });
    }
    
    const boleto = await Boleto.findOne({ id });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado' });
    }
    
    if (boleto.estado !== 'abierto') {
      return res.status(400).json({ error: 'Solo se pueden configurar alarmas en boletos con estado "abierto"' });
    }
    
    boleto.alarma = {
      fechaHora: new Date(fechaHora),
      activa: true,
      usuario: usuario
    };
    
    await boleto.save();
    
    // Registrar log
    await registrarLogBoleto(
      boleto,
      'ALARMA_CONFIGURADA',
      boleto.estado,
      boleto.estado,
      usuario,
      `Alarma configurada para ${fechaHora}`
    );
    
    res.json({ success: true, boleto });
  } catch (error) {
    console.error('Error configurando alarma:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener comentarios de un boleto
router.get('/:id/comentarios', async (req, res) => {
  try {
    const { id } = req.params;
    
    const comentarios = await Comentario.find({
      referencia: id,
      tipo: 'boleto'
    }).sort({ timestamp: -1 });
    
    res.json({ data: comentarios });
  } catch (error) {
    console.error('Error obteniendo comentarios:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agregar comentario a un boleto
router.post('/:id/comentarios', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, comentario } = req.body;
    
    if (!usuario || !comentario) {
      return res.status(400).json({ error: 'Usuario y comentario son requeridos' });
    }
    
    const boleto = await Boleto.findOne({ id });
    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado' });
    }
    
    // Crear comentario
    const nuevoComentario = await Comentario.create({
      referencia: id,
      tipo: 'boleto',
      usuario: usuario.trim(),
      comentario: comentario.trim(),
      timestamp: new Date()
    });
    
    // Actualizar fecha del último comentario
    boleto.fechaUltimoComentario = new Date();
    
    // Si el estado es "abierto" y el subEstado es "pendiente", cambiar a "en_espera"
    if (boleto.estado === 'abierto' && boleto.subEstado === 'pendiente') {
      const subEstadoAnterior = boleto.subEstado;
      boleto.subEstado = 'en_espera';
      await boleto.save();
      
      // Registrar log de transición automática
      await registrarLogBoleto(
        boleto,
        'TRANSICION_AUTOMATICA_COMENTARIO',
        boleto.estado,
        boleto.estado,
        usuario,
        'SubEstado cambiado automáticamente a "en_espera" por nuevo comentario',
        subEstadoAnterior,
        'en_espera'
      );
    } else {
      await boleto.save();
    }
    
    res.json({ success: true, comentario: nuevoComentario });
  } catch (error) {
    console.error('Error agregando comentario:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sincronizar boletos desde el endpoint externo
router.post('/sincronizar', async (req, res) => {
  try {
    console.log('[BOLETOS] Sincronización manual iniciada');
    
    const { typeOfSale } = req.body;
    const resultado = await sincronizarBoletos({ typeOfSale });
    
    res.json({ success: true, ...resultado });
  } catch (error) {
    console.error('[BOLETOS] Error en sincronización manual:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ejecutar verificación manual de estados de boletos
router.post('/verificar-estados', async (req, res) => {
  try {
    console.log('[BOLETOS] Verificación manual de estados iniciada');
    
    const { verificarEstadosBoletos } = await import('../services/boletosAlarmasService.js');
    const resultado = await verificarEstadosBoletos();
    
    res.json({ 
      success: true, 
      mensaje: `Verificación completada: ${resultado.procesados} boletos procesados, ${resultado.errores} errores`,
      ...resultado 
    });
  } catch (error) {
    console.error('[BOLETOS] Error en verificación manual de estados:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Verificar alarmas vencidas manualmente
router.post('/verificar-alarmas', async (req, res) => {
  try {
    console.log('[BOLETOS] Verificación manual de alarmas iniciada');
    
    const { verificarAlarmasBoletos } = await import('../services/boletosAlarmasService.js');
    const resultado = await verificarAlarmasBoletos();
    
    res.json({ 
      success: true, 
      mensaje: `Verificación de alarmas completada: ${resultado.procesados} alarmas procesadas, ${resultado.errores} errores`,
      ...resultado 
    });
  } catch (error) {
    console.error('[BOLETOS] Error en verificación manual de alarmas:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint de diagnóstico para revisar boletos en "pendiente"
router.get('/diagnostico/pendientes', async (req, res) => {
  try {
    const { limit = 10, recientes = false } = req.query;
    const config = await Configuracion.findOne({ singleton: true });
    const diasEspera = config?.accesorios?.diasEspera || 7;
    
    // Obtener algunos boletos en "pendiente"
    // Si recientes=true, ordenar por fecha de creación descendente para ver los más nuevos
    let query = Boleto.find({
      estado: 'abierto',
      subEstado: 'pendiente'
    });
    
    if (recientes === 'true') {
      query = query.sort({ createdAt: -1 });
    }
    
    const boletosPendientes = await query.limit(Number(limit));
    
    const ahora = new Date();
    const diagnosticos = [];
    
    for (const boleto of boletosPendientes) {
      // Obtener fecha de creación del boleto
      let fechaCreacion = null;
      let fuenteFecha = 'no encontrada';
      
      if (boleto.datosBoleto) {
        if (boleto.datosBoleto.createdAt) {
          fechaCreacion = new Date(boleto.datosBoleto.createdAt);
          fuenteFecha = 'datosBoleto.createdAt';
        } else if (boleto.datosBoleto.origen?.createdAt) {
          fechaCreacion = new Date(boleto.datosBoleto.origen.createdAt);
          fuenteFecha = 'datosBoleto.origen.createdAt';
        }
      }
      
      if (!fechaCreacion || isNaN(fechaCreacion.getTime())) {
        fechaCreacion = boleto.createdAt;
        fuenteFecha = 'boleto.createdAt (Mongoose)';
      }
      
      let diasDesdeCreacion = null;
      let deberiaEstarEnEspera = false;
      
      if (fechaCreacion && !isNaN(fechaCreacion.getTime())) {
        diasDesdeCreacion = Math.floor((ahora - fechaCreacion) / (1000 * 60 * 60 * 24));
        deberiaEstarEnEspera = diasDesdeCreacion < diasEspera;
      }
      
      diagnosticos.push({
        id: boleto.id,
        estado: boleto.estado,
        subEstado: boleto.subEstado,
        fechaCreacion: fechaCreacion ? fechaCreacion.toISOString() : null,
        fuenteFecha,
        diasDesdeCreacion,
        diasEsperaConfigurados: diasEspera,
        deberiaEstarEnEspera,
        fechaUltimoComentario: boleto.fechaUltimoComentario ? boleto.fechaUltimoComentario.toISOString() : null,
        tieneAlarma: boleto.alarma?.activa || false,
        datosBoletoCreatedAt: boleto.datosBoleto?.createdAt || null,
        datosBoletoOrigenCreatedAt: boleto.datosBoleto?.origen?.createdAt || null,
        boletoCreatedAt: boleto.createdAt ? boleto.createdAt.toISOString() : null
      });
    }
    
    res.json({
      success: true,
      configuracion: {
        diasEspera
      },
      totalRevisados: boletosPendientes.length,
      ahora: ahora.toISOString(),
      diagnosticos
    });
    
  } catch (error) {
    console.error('[BOLETOS] Error en diagnóstico:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
