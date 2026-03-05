import express from 'express';
import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
import Configuracion from '../models/Configuracion.js';
import { getInteraccionesMensuales } from '../services/botAnalyzerService.js';

const router = express.Router();

// Sistema de caché simple en memoria con TTL (Time To Live)
const cache = {
  data: new Map(),
  ttl: 5 * 60 * 1000, // 5 minutos en milisegundos
  
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
setInterval(() => cache.cleanup(), 60 * 1000);

/**
 * GET /api/dashboard/stats/martina-talleres
 * Obtiene el porcentaje de citas generadas por Martina en cada taller
 * OPTIMIZADO: Usa agregaciones de MongoDB y caché
 */
router.get('/stats/martina-talleres', async (req, res) => {
  try {
    // Verificar caché
    const cacheKey = 'martina-talleres';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }
    // Verificar conexión a MongoDB
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB no está conectado',
        data: {
          totalCitas: 0,
          porTaller: [],
          porcentajes: []
        }
      });
    }

    // Obtener mapeo de usuarios y talleres
    const config = await Configuracion.findOne({ singleton: true }).lean();
    
    // Obtener mapeo de usuarios
    let usuariosMap = {};
    if (config?.mappings?.usuarios) {
      if (Array.isArray(config.mappings.usuarios)) {
        usuariosMap = Object.fromEntries(config.mappings.usuarios);
      } else if (config.mappings.usuarios instanceof Map) {
        usuariosMap = Object.fromEntries(config.mappings.usuarios);
      } else if (typeof config.mappings.usuarios === 'object' && config.mappings.usuarios !== null) {
        usuariosMap = config.mappings.usuarios;
      }
    }
    
    // Encontrar todos los usuarios que están mapeados a "Martina"
    const usuariosMapeadosAMartina = Object.entries(usuariosMap)
      .filter(([usuario, nombreMapeado]) => 
        nombreMapeado && nombreMapeado.toString().toLowerCase() === 'martina'
      )
      .map(([usuario]) => usuario);
    
    // Construir condiciones de búsqueda: solo usuarios mapeados explícitamente a Martina
    // NO usar regex amplio para evitar falsos positivos
    const condicionesUsuario = [];
    
    // Agregar usuarios mapeados a Martina
    if (usuariosMapeadosAMartina.length > 0) {
      condicionesUsuario.push({ Usuario: { $in: usuariosMapeadosAMartina } });
    }
    
    // Solo agregar regex si no hay usuarios mapeados (fallback)
    // Y hacer el regex más estricto: debe ser valor exacto
    if (usuariosMapeadosAMartina.length === 0) {
      condicionesUsuario.push(
        { Usuario: { $regex: /^martina$/i } }, // Valor exacto "martina"
        { Usuario: { $regex: /^martinez$/i } } // Valor exacto "martinez"
      );
    }

    // Usar agregación de MongoDB para procesar todo en la base de datos
    const pipeline = [
      // Filtrar solo citas de Martina
      {
        $match: {
          $or: condicionesUsuario
        }
      },
      // Agrupar por taller
      {
        $group: {
          _id: { $ifNull: ['$Taller', 'Sin taller'] },
          cantidad: { $sum: 1 }
        }
      },
      // Calcular total
      {
        $group: {
          _id: null,
          totalCitas: { $sum: '$cantidad' },
          talleres: {
            $push: {
              taller: '$_id',
              cantidad: '$cantidad'
            }
          }
        }
      },
      // Desenrollar talleres
      {
        $unwind: '$talleres'
      },
      // Calcular porcentajes
      {
        $project: {
          _id: 0,
          taller: '$talleres.taller',
          cantidad: '$talleres.cantidad',
          totalCitas: 1,
          porcentaje: {
            $multiply: [
              { $divide: ['$talleres.cantidad', '$totalCitas'] },
              100
            ]
          }
        }
      },
      // Ordenar por taller
      {
        $sort: {
          taller: 1
        }
      }
    ];

    const resultados = await Cita.aggregate(pipeline);

    if (resultados.length === 0) {
      return res.json({
        success: true,
        data: {
          totalCitas: 0,
          porTaller: [],
          porcentajes: []
        }
      });
    }

    const totalCitasMartina = resultados[0].totalCitas;

    // Obtener mapeo de talleres si existe
    let talleresMap = {};
    
    if (config?.mappings?.talleres) {
      if (Array.isArray(config.mappings.talleres)) {
        talleresMap = Object.fromEntries(config.mappings.talleres);
      } else if (config.mappings.talleres instanceof Map) {
        talleresMap = Object.fromEntries(config.mappings.talleres);
      } else if (typeof config.mappings.talleres === 'object' && config.mappings.talleres !== null) {
        talleresMap = config.mappings.talleres;
      }
    }

    // Formatear resultados
    const porTaller = resultados.map(item => ({
      taller: typeof item.taller === 'number' ? item.taller : (Number(item.taller) || item.taller),
      nombreTaller: talleresMap[item.taller] || `Taller ${item.taller}`,
      cantidad: item.cantidad,
      porcentaje: item.porcentaje.toFixed(2)
    }));

    const result = {
      totalCitas: totalCitasMartina,
      porTaller,
      porcentajes: porTaller.map(item => parseFloat(item.porcentaje))
    };

    // Guardar en caché
    cache.set(cacheKey, result);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de Martina por taller:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/stats/martina-mensual
 * Obtiene estadísticas mensuales: Total de citas y citas de Martina (BOT) por mes
 * OPTIMIZADO: Usa agregaciones de MongoDB y caché
 */
router.get('/stats/martina-mensual', async (req, res) => {
  try {
    // Verificar caché
    const cacheKey = 'martina-mensual';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: { meses: cached },
        cached: true
      });
    }
    // Verificar conexión a MongoDB
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB no está conectado',
        data: {
          meses: []
        }
      });
    }

    // Obtener mapeo de usuarios y talleres
    const config = await Configuracion.findOne({ singleton: true }).lean();
    
    let usuariosMap = {};
    if (config?.mappings?.usuarios) {
      if (Array.isArray(config.mappings.usuarios)) {
        usuariosMap = Object.fromEntries(config.mappings.usuarios);
      } else if (config.mappings.usuarios instanceof Map) {
        usuariosMap = Object.fromEntries(config.mappings.usuarios);
      } else if (typeof config.mappings.usuarios === 'object' && config.mappings.usuarios !== null) {
        usuariosMap = config.mappings.usuarios;
      }
    }
    
    // Obtener mapeo de talleres para determinar empresa
    let talleresMap = {};
    if (config?.mappings?.talleres) {
      if (config.mappings.talleres instanceof Map) {
        talleresMap = Object.fromEntries(config.mappings.talleres);
      } else if (typeof config.mappings.talleres === 'object' && config.mappings.talleres !== null) {
        talleresMap = config.mappings.talleres;
      }
    }
    
    // Función para extraer empresa del nombre del taller (ej: "GV PE" -> "GV", "FC JU" -> "FC")
    const extraerEmpresa = (tallerNombre) => {
      if (!tallerNombre || typeof tallerNombre !== 'string') return null;
      const match = tallerNombre.trim().match(/^([A-Z]{2})/);
      return match ? match[1] : null;
    };
    
    // Crear mapeo de número de taller -> empresa
    const tallerAEmpresaMap = {};
    Object.entries(talleresMap).forEach(([tallerNum, tallerNombre]) => {
      const empresa = extraerEmpresa(tallerNombre);
      if (empresa) {
        tallerAEmpresaMap[tallerNum] = empresa;
      }
    });
    
    // Encontrar todos los usuarios que están mapeados a "Martina"
    const usuariosMapeadosAMartina = Object.entries(usuariosMap)
      .filter(([usuario, nombreMapeado]) => 
        nombreMapeado && nombreMapeado.toString().toLowerCase() === 'martina'
      )
      .map(([usuario]) => usuario);
    
    // Log para depuración
    console.log(`[MARTINA STATS MENSUAL] Usuarios mapeados a Martina: ${usuariosMapeadosAMartina.length}`, usuariosMapeadosAMartina);
    
    // Construir condiciones de búsqueda para Martina
    // Solo considerar usuarios mapeados explícitamente a Martina
    // NO usar regex amplio para evitar falsos positivos
    const condicionesUsuario = [];
    if (usuariosMapeadosAMartina.length > 0) {
      condicionesUsuario.push({ Usuario: { $in: usuariosMapeadosAMartina } });
    }
    // Solo agregar regex si no hay usuarios mapeados (fallback)
    // Y hacer el regex más estricto: debe ser palabra completa o valor exacto
    if (usuariosMapeadosAMartina.length === 0) {
      condicionesUsuario.push(
        { Usuario: { $regex: /^martina$/i } }, // Valor exacto "martina"
        { Usuario: { $regex: /^martinez$/i } } // Valor exacto "martinez"
      );
    }

    // Construir condiciones para Martina en formato de agregación
    const condicionesMartina = [];
    if (usuariosMapeadosAMartina.length > 0) {
      condicionesMartina.push({ $in: ['$Usuario', usuariosMapeadosAMartina] });
    }
    // Solo agregar regex si no hay usuarios mapeados (fallback)
    // Y hacer el regex más estricto: debe ser palabra completa o valor exacto
    if (usuariosMapeadosAMartina.length === 0) {
      condicionesMartina.push(
        { $regexMatch: { input: { $ifNull: ['$Usuario', ''] }, regex: /^martina$/i } },
        { $regexMatch: { input: { $ifNull: ['$Usuario', ''] }, regex: /^martinez$/i } }
      );
    }

    // Usar agregación de MongoDB para procesar todo en la base de datos
    const pipeline = [
      // Filtrar solo citas con fecha válida
      {
        $match: {
          'Fecha cr': { $exists: true, $ne: null, $type: 'date' }
        }
      },
      // Agregar campos calculados para mes
      {
        $addFields: {
          year: { $year: '$Fecha cr' },
          month: { $month: '$Fecha cr' },
          mesKey: {
            $concat: [
              { $toString: { $year: '$Fecha cr' } },
              '-',
              {
                $cond: [
                  { $lt: [{ $month: '$Fecha cr' }, 10] },
                  { $concat: ['0', { $toString: { $month: '$Fecha cr' } }] },
                  { $toString: { $month: '$Fecha cr' } }
                ]
              }
            ]
          },
          esMartina: {
            $or: condicionesMartina
          }
        }
      },
      // Agrupar por mes
      {
        $group: {
          _id: '$mesKey',
          mesKey: { $first: '$mesKey' },
          year: { $first: '$year' },
          month: { $first: '$month' },
          total: { $sum: 1 },
          bot: {
            $sum: {
              $cond: ['$esMartina', 1, 0]
            }
          },
          botExtra: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$esMartina',
                    { $regexMatch: { input: { $ifNull: ['$Observaciones', ''] }, regex: /extra/i } }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      // Filtrar junio 2025
      {
        $match: {
          mesKey: { $ne: '2025-06' }
        }
      },
      // Ordenar por mesKey
      {
        $sort: { mesKey: 1 }
      },
      // Formatear resultado
      {
        $project: {
          _id: 0,
          mesKey: 1,
          total: 1,
          bot: 1,
          botExtra: 1,
          year: 1,
          month: 1
        }
      }
    ];

    const resultados = await Cita.aggregate(pipeline);

    // Pipeline adicional para obtener desglose por empresa y taller
    // Nota: MongoDB no permite pasar objetos JavaScript directamente en el pipeline,
    // así que procesamos el mapeo después de la agregación
    const resultadosDetalle = await Cita.aggregate([
      {
        $match: {
          'Fecha cr': { $exists: true, $ne: null, $type: 'date' },
          Taller: { $exists: true, $ne: null }
        }
      },
      {
        $addFields: {
          year: { $year: '$Fecha cr' },
          month: { $month: '$Fecha cr' },
          mesKey: {
            $concat: [
              { $toString: { $year: '$Fecha cr' } },
              '-',
              {
                $cond: [
                  { $lt: [{ $month: '$Fecha cr' }, 10] },
                  { $concat: ['0', { $toString: { $month: '$Fecha cr' } }] },
                  { $toString: { $month: '$Fecha cr' } }
                ]
              }
            ]
          },
          esMartina: {
            $or: condicionesMartina
          }
        }
      },
      {
        $match: {
          mesKey: { $ne: '2025-06' }
        }
      },
      {
        $group: {
          _id: {
            mesKey: '$mesKey',
            taller: '$Taller'
          },
          year: { $first: '$year' },
          month: { $first: '$month' },
          total: { $sum: 1 },
          bot: {
            $sum: {
              $cond: ['$esMartina', 1, 0]
            }
          },
          botExtra: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$esMartina',
                    { $regexMatch: { input: { $ifNull: ['$Observaciones', ''] }, regex: /extra/i } }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { '_id.mesKey': 1, '_id.taller': 1 }
      }
    ]);

    // Procesar resultados de detalle y agrupar por empresa y taller
    const detallePorMes = {};
    resultadosDetalle.forEach(item => {
      const mesKey = item._id.mesKey;
      const taller = item._id.taller;
      const tallerStr = String(taller);
      
      const empresa = tallerAEmpresaMap[tallerStr] || 'DESCONOCIDA';
      const tallerNombre = talleresMap[tallerStr] || `Taller ${taller}`;
      
      if (!detallePorMes[mesKey]) {
        detallePorMes[mesKey] = {};
      }
      if (!detallePorMes[mesKey][empresa]) {
        detallePorMes[mesKey][empresa] = {};
      }
      
      detallePorMes[mesKey][empresa][taller] = {
        taller: taller,
        tallerNombre: tallerNombre,
        total: item.total,
        bot: item.bot,
        botExtra: item.botExtra || 0,
        porcentaje: item.total > 0 ? ((item.bot / item.total) * 100).toFixed(1) : '0.0',
        porcentajeExtra: item.bot > 0 ? (((item.botExtra || 0) / item.bot) * 100).toFixed(1) : '0.0'
      };
    });

    // Crear estructura completa de todas las empresas y talleres según el mapeo
    const todasLasEmpresas = new Set();
    const talleresPorEmpresa = {};
    Object.entries(talleresMap).forEach(([tallerNum, tallerNombre]) => {
      const empresa = extraerEmpresa(tallerNombre);
      if (empresa) {
        todasLasEmpresas.add(empresa);
        if (!talleresPorEmpresa[empresa]) {
          talleresPorEmpresa[empresa] = [];
        }
        talleresPorEmpresa[empresa].push({
          taller: parseInt(tallerNum),
          tallerNombre: tallerNombre.trim()
        });
      }
    });

    // Ordenar talleres por número dentro de cada empresa
    Object.keys(talleresPorEmpresa).forEach(emp => {
      talleresPorEmpresa[emp].sort((a, b) => a.taller - b.taller);
    });

    // Determinar rango de meses: desde el primer mes con datos hasta el mes actual
    let primerMes = null;
    let ultimoMes = null;
    if (resultados.length > 0) {
      primerMes = resultados[0].mesKey;
      ultimoMes = resultados[resultados.length - 1].mesKey;
    } else {
      // Si no hay datos, usar el mes actual
      const ahora = new Date();
      primerMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
      ultimoMes = primerMes;
    }

    // Generar todos los meses desde el primero hasta el mes actual (o hasta diciembre 2025)
    const [primerAno, primerMesNum] = primerMes.split('-').map(Number);
    const ahora = new Date();
    const anoActual = ahora.getFullYear();
    const mesActual = ahora.getMonth() + 1;
    
    // Determinar hasta qué mes generar (mes actual o diciembre 2025, lo que sea mayor)
    const anoFinal = Math.max(anoActual, 2025);
    const mesFinal = anoFinal === anoActual ? mesActual : 12;

    const todosLosMeses = [];
    for (let ano = primerAno; ano <= anoFinal; ano++) {
      const mesInicio = ano === primerAno ? primerMesNum : 1;
      const mesFin = ano === anoFinal ? mesFinal : 12;
      
      for (let mes = mesInicio; mes <= mesFin; mes++) {
        const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
        // Excluir junio 2025 si existe
        if (mesKey !== '2025-06') {
          todosLosMeses.push({
            mesKey,
            year: ano,
            month: mes
          });
        }
      }
    }

    // Crear un mapa de resultados por mesKey para acceso rápido
    const resultadosMap = {};
    resultados.forEach(item => {
      resultadosMap[item.mesKey] = item;
    });

    // Formatear todos los meses con nombres y porcentajes, incluyendo desglose completo
    const meses = todosLosMeses.map(mesInfo => {
      const fecha = new Date(mesInfo.year, mesInfo.month - 1, 1);
      const mesNombre = fecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      
      // Obtener datos del mes si existen, sino usar ceros
      const datosMes = resultadosMap[mesInfo.mesKey] || {
        total: 0,
        bot: 0,
        botExtra: 0
      };
      
      // Crear desglose completo para todas las empresas y talleres
      const empresasConTalleres = Array.from(todasLasEmpresas).sort().map(emp => {
        const talleres = talleresPorEmpresa[emp] || [];
        const talleresConDatos = talleres.map(t => {
          const datosTaller = detallePorMes[mesInfo.mesKey]?.[emp]?.[t.taller] || {
            total: 0,
            bot: 0,
            botExtra: 0,
            porcentaje: '0.0',
            porcentajeExtra: '0.0'
          };
          
          return {
            taller: t.taller,
            tallerNombre: t.tallerNombre,
            total: datosTaller.total,
            bot: datosTaller.bot,
            botExtra: datosTaller.botExtra,
            porcentaje: datosTaller.porcentaje,
            porcentajeExtra: datosTaller.porcentajeExtra
          };
        });
        
        return {
          empresa: emp,
          talleres: talleresConDatos
        };
      });
      
      return {
        mes: mesNombre,
        mesKey: mesInfo.mesKey,
        total: datosMes.total,
        bot: datosMes.bot,
        botExtra: datosMes.botExtra || 0,
        porcentaje: datosMes.total > 0 ? ((datosMes.bot / datosMes.total) * 100).toFixed(1) : '0.0',
        porcentajeExtra: datosMes.bot > 0 ? (((datosMes.botExtra || 0) / datosMes.bot) * 100).toFixed(1) : '0.0',
        desglose: empresasConTalleres
      };
    });

    // Guardar en caché
    cache.set(cacheKey, meses);

    res.json({
      success: true,
      data: {
        meses
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas mensuales de Martina:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/stats/martina-interacciones
 * Obtiene estadísticas de interacciones mensuales del bot Martina
 * Una interacción = cada día único que un sessionId tiene mensajes
 * OPTIMIZADO: Usa agregaciones de MongoDB y caché
 */
router.get('/stats/martina-interacciones', async (req, res) => {
  try {
    // Verificar que la URI de BOT Analyzer esté configurada
    if (!process.env.BOT_ANALYZER_MONGODB_URI) {
      return res.json({
        success: true,
        data: {
          meses: []
        }
      });
    }

    // Verificar caché (permitir forzar recarga con ?refresh=true)
    const cacheKey = 'martina-interacciones';
    const forceRefresh = req.query.refresh === 'true';
    
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: { meses: cached },
          cached: true
        });
      }
    } else {
      // Limpiar caché si se fuerza refresh
      cache.data.delete(cacheKey);
    }

    console.log('[DASHBOARD] Calculando interacciones de Martina (sin caché)...');
    const meses = await getInteraccionesMensuales();
    console.log('[DASHBOARD] Interacciones calculadas:', meses.length, 'meses');

    // Guardar en caché
    cache.set(cacheKey, meses);

    res.json({
      success: true,
      data: {
        meses
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de interacciones de Martina:', error);
    // Retornar array vacío en caso de error para no romper la UI
    res.json({
      success: true,
      data: {
        meses: []
      }
    });
  }
});

/**
 * POST /api/dashboard/stats/clear-cache
 * Limpia el caché de estadísticas (útil después de importaciones)
 */
router.post('/stats/clear-cache', async (req, res) => {
  try {
    cache.clear();
    // También limpiar caché de asistencia
    try {
      const { asistenciaCache } = await import('./asistencia.js');
      if (asistenciaCache && asistenciaCache.clear) {
        asistenciaCache.clear();
      }
    } catch (importError) {
      console.warn('No se pudo limpiar caché de asistencia:', importError.message);
    }
    // También limpiar caché de oportunidades 10k
    try {
      const { oportunidades10kCache } = await import('./oportunidades.js');
      if (oportunidades10kCache && oportunidades10kCache.clear) {
        oportunidades10kCache.clear();
      }
    } catch (importError) {
      console.warn('No se pudo limpiar caché de oportunidades 10k:', importError.message);
    }
    res.json({
      success: true,
      message: 'Caché de estadísticas limpiado correctamente'
    });
  } catch (error) {
    console.error('Error limpiando caché:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;

