import express from 'express';
import {
  getConversations,
  getConversationMessages,
  searchConversations,
  validateEmpresa
} from '../services/botAnalyzerService.js';
import BotConversacionGestion from '../models/BotConversacionGestion.js';

const router = express.Router();

/**
 * Escapa un valor para CSV (maneja comillas, separadores y saltos de línea)
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';') || str.includes(',')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Extrae texto de contenido que puede ser string, objeto o array (formato Flowise)
 */
function extractMessageText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map(item => {
      if (typeof item === 'string') return item;
      if (item?.text) return item.text;
      if (item?.content) return extractMessageText(item.content);
      return typeof item === 'object' ? JSON.stringify(item) : String(item);
    }).filter(Boolean).join(' ');
  }
  if (typeof val === 'object') {
    if (val.text) return val.text;
    if (val.content) return extractMessageText(val.content);
    if (val.message) return extractMessageText(val.message);
  }
  return String(val);
}

/**
 * Normaliza y escapa el contenido de mensaje para CSV.
 * Reemplaza saltos de línea por espacio para que cada mensaje ocupe una sola fila.
 */
function escapeCsvContent(val) {
  let str = extractMessageText(val);
  str = str.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ').trim();
  str = str.replace(/\s+/g, ' ');
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * GET /api/bot-analyzer/:empresa/export
 * Exporta conversaciones a CSV (resumen o con mensajes)
 */
router.get('/:empresa/export', async (req, res) => {
  try {
    const { empresa } = req.params;
    const { includeMessages, page, limit, sessionId, fechaDesde, fechaHasta, filtroHerramientas, localidad, keyword } = req.query;

    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    const exportLimit = Math.min(parseInt(limit) || 10000, 10000);
    const filters = {
      page: 1,
      limit: exportLimit,
      sessionId: sessionId || null,
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null,
      filtroHerramientas: ['sin', 'con', 'con_agendar'].includes(filtroHerramientas) ? filtroHerramientas : null,
      localidad: localidad || null,
      keyword: keyword || null
    };

    const result = await getConversations(empresa.toUpperCase(), filters);

    const conversacionesElegibles = result.conversations.filter(conv =>
      !conv.herramientasUtilizadas?.tieneAgendarTurno
    );

    if (conversacionesElegibles.length > 0) {
      const sessionIds = conversacionesElegibles.map(conv => conv.sessionId);
      const estadosMap = await BotConversacionGestion.find({
        sessionId: { $in: sessionIds },
        empresa: empresa.toUpperCase()
      }).lean();

      const estadosPorSessionId = {};
      estadosMap.forEach(estado => { estadosPorSessionId[estado.sessionId] = estado.estado; });

      result.conversations = result.conversations.map(conv => {
        const esElegible = !conv.herramientasUtilizadas?.tieneAgendarTurno;
        if (esElegible) {
          return { ...conv, estado: estadosPorSessionId[conv.sessionId] || 'no_tratado' };
        }
        return conv;
      });
    }

    const withMessages = includeMessages === '1' || includeMessages === 'true';

    if (withMessages) {
      // Esquema: Chat ID, Fecha Último Mensaje, Total Mensajes, Mensaje ID, Rol, Fecha Mensaje, Contenido Herramientas Usadas (sin Session ID, Tipo Chat, Flow Name)
      const rows = ['Chat ID;Fecha Último Mensaje;Total Mensajes;Mensaje ID;Rol;Fecha Mensaje;Contenido Herramientas Usadas'];
      const formatDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        return dt.toLocaleString('es-AR', { day: '2-digit', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      };

      for (const conv of result.conversations) {
        const chatId = escapeCsvValue(conv.chatId || conv.sessionId);
        const lastMsgDate = formatDate(conv.lastMessageDate);
        const totalMsgs = String(conv.messageCount || 0);

        const msgs = conv.allMessages || [];
        const sorted = [...msgs].sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));

        // Primera fila: resumen de la sesión (Fecha Último Mensaje y Total Mensajes solo aquí)
        rows.push(`${chatId};${lastMsgDate};${totalMsgs};;;;`);

        // Filas siguientes: cada mensaje (Mensaje ID desde 0, Rol, Fecha Mensaje, Contenido)
        sorted.forEach((msg, i) => {
          const rol = msg.role === 'userMessage' ? 'Usuario' : (msg.role === 'apiMessage' ? 'Bot' : String(msg.role || ''));
          const contenido = escapeCsvContent(msg.content);
          const fechaMsg = formatDate(msg.createdDate);
          rows.push(`${chatId};;;${i};${escapeCsvValue(rol)};${fechaMsg};${contenido}`);
        });
      }

      const csv = '\uFEFFsep=;\n' + rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="conversaciones_${empresa.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } else {
      const rows = ['Session ID;Primer Mensaje;Último Mensaje;Cantidad Mensajes;Agendar Turno;Enviar Correo;Venta;Localidad;Estado'];
      const formatDate = (d) => {
        if (!d) return '';
        return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      };

      for (const conv of result.conversations) {
        const estado = conv.herramientasUtilizadas?.tieneAgendarTurno ? '-' : (conv.estado || 'no_tratado');
        const agendar = conv.herramientasUtilizadas?.tieneAgendarTurno ? 'Sí' : 'No';
        const correo = conv.herramientasUtilizadas?.tieneEnviarCorreo ? 'Sí' : 'No';
        const venta = conv.herramientasUtilizadas?.tieneAgendarTurno
          ? (conv.herramientasUtilizadas?.tieneVenta ? 'Sí' : 'No')
          : '-';
        rows.push(
          `${escapeCsvValue(conv.sessionId)};${formatDate(conv.firstMessageDate)};${formatDate(conv.lastMessageDate)};${conv.messageCount};${agendar};${correo};${venta};${escapeCsvValue(conv.localidad || '')};${estado}`
        );
      }

      const csv = '\uFEFF' + rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="conversaciones_${empresa.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/export:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/:empresa/conversations
 * Lista todas las conversaciones de una empresa
 */
router.get('/:empresa/conversations', async (req, res) => {
  try {
    const { empresa } = req.params;
    const { page, limit, sessionId, fechaDesde, fechaHasta, filtroHerramientas, localidad, keyword } = req.query;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    const filters = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      sessionId,
      fechaDesde,
      fechaHasta,
      filtroHerramientas: ['sin', 'con', 'con_agendar'].includes(filtroHerramientas) ? filtroHerramientas : null,
      localidad: localidad || null,
      keyword: keyword || null
    };

    const result = await getConversations(empresa.toUpperCase(), filters);

    // Obtener estados desde BotConversacionGestion para conversaciones elegibles
    // Elegibles: todas las que NO ejecutaron agendar_turno (cualquier versión)
    const conversacionesElegibles = result.conversations.filter(conv => 
      !conv.herramientasUtilizadas?.tieneAgendarTurno
    );

    if (conversacionesElegibles.length > 0) {
      const sessionIds = conversacionesElegibles.map(conv => conv.sessionId);
      const estadosMap = await BotConversacionGestion.find({
        sessionId: { $in: sessionIds },
        empresa: empresa.toUpperCase()
      }).lean();

      // Crear mapa para acceso rápido
      const estadosPorSessionId = {};
      estadosMap.forEach(estado => {
        estadosPorSessionId[estado.sessionId] = estado.estado;
      });

      // Agregar estado a cada conversación elegible
      result.conversations = result.conversations.map(conv => {
        const esElegible = !conv.herramientasUtilizadas?.tieneAgendarTurno;
        if (esElegible) {
          return {
            ...conv,
            estado: estadosPorSessionId[conv.sessionId] || 'no_tratado'
          };
        }
        return conv;
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/:empresa/conversations/:sessionId
 * Obtiene todos los mensajes de una conversación específica
 */
router.get('/:empresa/conversations/:sessionId', async (req, res) => {
  try {
    const { empresa, sessionId } = req.params;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    const result = await getConversationMessages(empresa.toUpperCase(), sessionId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/conversations/:sessionId:', error);
    
    if (error.message.includes('No se encontraron mensajes')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/:empresa/search
 * Busca conversaciones por sessionId
 */
router.get('/:empresa/search', async (req, res) => {
  try {
    const { empresa } = req.params;
    const { sessionId, filtroHerramientas, localidad, fechaDesde, fechaHasta, page, limit } = req.query;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId es requerido'
      });
    }

    // Llamar a getConversations directamente con los filtros
    const filters = {
      sessionId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      filtroHerramientas: ['sin', 'con', 'con_agendar'].includes(filtroHerramientas) ? filtroHerramientas : null,
      localidad: localidad || null,
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null
    };
    const result = await getConversations(empresa.toUpperCase(), filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/search:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/:empresa/conversations/:sessionId/estado
 * Obtener estado de una conversación
 */
router.get('/:empresa/conversations/:sessionId/estado', async (req, res) => {
  try {
    const { empresa, sessionId } = req.params;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    const gestion = await BotConversacionGestion.findOne({
      sessionId,
      empresa: empresa.toUpperCase()
    });

    if (!gestion) {
      // Si no existe, retornar estado por defecto
      return res.json({
        success: true,
        data: {
          estado: 'no_tratado',
          logs: []
        }
      });
    }

    res.json({
      success: true,
      data: {
        estado: gestion.estado,
        logs: gestion.logs || []
      }
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/conversations/:sessionId/estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * PUT /api/bot-analyzer/:empresa/conversations/:sessionId/estado
 * Cambiar estado de una conversación
 */
router.put('/:empresa/conversations/:sessionId/estado', async (req, res) => {
  try {
    const { empresa, sessionId } = req.params;
    const { estado, usuario, comentario } = req.body;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    // Validar campos requeridos
    if (!estado || !usuario || !comentario || !comentario.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Estado, usuario y comentario son requeridos'
      });
    }

    // Validar estado
    if (estado !== 'tratado' && estado !== 'no_tratado') {
      return res.status(400).json({
        success: false,
        error: 'Estado debe ser "tratado" o "no_tratado"'
      });
    }

    // Buscar o crear registro de gestión
    let gestion = await BotConversacionGestion.findOne({
      sessionId,
      empresa: empresa.toUpperCase()
    });

    const estadoAnterior = gestion?.estado || 'no_tratado';

    if (!gestion) {
      gestion = new BotConversacionGestion({
        sessionId,
        empresa: empresa.toUpperCase(),
        estado: estado,
        logs: []
      });
    } else {
      gestion.estado = estado;
    }

    // Agregar log
    gestion.logs.push({
      timestamp: new Date(),
      usuario,
      accion: 'CAMBIO_ESTADO',
      estadoAnterior,
      estadoNuevo: estado,
      comentario: comentario.trim()
    });

    await gestion.save();

    res.json({
      success: true,
      data: {
        estado: gestion.estado,
        logs: gestion.logs
      }
    });
  } catch (error) {
    console.error('Error en PUT /api/bot-analyzer/:empresa/conversations/:sessionId/estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/:empresa/conversations/:sessionId/comentarios
 * Obtener comentarios/logs de una conversación
 */
router.get('/:empresa/conversations/:sessionId/comentarios', async (req, res) => {
  try {
    const { empresa, sessionId } = req.params;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    const gestion = await BotConversacionGestion.findOne({
      sessionId,
      empresa: empresa.toUpperCase()
    });

    res.json({
      success: true,
      data: {
        comentarios: gestion?.logs || []
      }
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/:empresa/conversations/:sessionId/comentarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * POST /api/bot-analyzer/:empresa/conversations/:sessionId/comentarios
 * Agregar comentario a una conversación
 */
router.post('/:empresa/conversations/:sessionId/comentarios', async (req, res) => {
  try {
    const { empresa, sessionId } = req.params;
    const { usuario, comentario } = req.body;

    // Validar empresa
    if (!validateEmpresa(empresa)) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no válida. Debe ser FC, GV o PW'
      });
    }

    // Validar campos requeridos
    if (!usuario || !comentario || !comentario.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y comentario son requeridos'
      });
    }

    // Buscar o crear registro de gestión
    let gestion = await BotConversacionGestion.findOne({
      sessionId,
      empresa: empresa.toUpperCase()
    });

    if (!gestion) {
      gestion = new BotConversacionGestion({
        sessionId,
        empresa: empresa.toUpperCase(),
        estado: 'no_tratado',
        logs: []
      });
    }

    // Agregar log de comentario
    gestion.logs.push({
      timestamp: new Date(),
      usuario,
      accion: 'COMENTARIO',
      comentario: comentario.trim()
    });

    await gestion.save();

    res.json({
      success: true,
      data: {
        comentarios: gestion.logs
      }
    });
  } catch (error) {
    console.error('Error en POST /api/bot-analyzer/:empresa/conversations/:sessionId/comentarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/bot-analyzer/stats/no-tratados
 * Obtiene el conteo de casos "No tratados" por empresa en los últimos 7 días
 */
router.get('/stats/no-tratados', async (req, res) => {
  try {
    const empresas = ['FC', 'GV', 'PW'];
    const stats = {};

    // Calcular fecha de hace 7 días
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - 7);
    fechaLimite.setHours(0, 0, 0, 0);

    for (const empresa of empresas) {
      try {
        // Obtener conversaciones de los últimos 7 días
        const filters = {
          page: 1,
          limit: 10000, // Número alto para obtener todas
          fechaDesde: fechaLimite.toISOString()
        };

        const result = await getConversations(empresa, filters);
        
        // Filtrar conversaciones elegibles (sin agendar_turno)
        const conversacionesElegibles = result.conversations.filter(conv => 
          !conv.herramientasUtilizadas?.tieneAgendarTurno
        );

        if (conversacionesElegibles.length > 0) {
          const sessionIds = conversacionesElegibles.map(conv => conv.sessionId);
          
          // Obtener estados desde BotConversacionGestion
          const estadosMap = await BotConversacionGestion.find({
            sessionId: { $in: sessionIds },
            empresa: empresa
          }).lean();

          // Crear mapa para acceso rápido
          const estadosPorSessionId = {};
          estadosMap.forEach(estado => {
            estadosPorSessionId[estado.sessionId] = estado.estado;
          });

          // Contar casos "no_tratado" agrupados por localidad
          const porLocalidad = {};
          let total = 0;

          conversacionesElegibles.forEach(conv => {
            const estado = estadosPorSessionId[conv.sessionId];
            // Si no tiene registro o tiene estado "no_tratado", cuenta como no tratado
            if (!estado || estado === 'no_tratado') {
              total++;
              const localidad = conv.localidad || 'Sin localidad';
              porLocalidad[localidad] = (porLocalidad[localidad] || 0) + 1;
            }
          });

          stats[empresa] = {
            total,
            porLocalidad
          };
        } else {
          stats[empresa] = {
            total: 0,
            porLocalidad: {}
          };
        }
      } catch (error) {
        console.error(`Error obteniendo stats para ${empresa}:`, error);
        stats[empresa] = {
          total: 0,
          porLocalidad: {}
        };
      }
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error en GET /api/bot-analyzer/stats/no-tratados:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;






