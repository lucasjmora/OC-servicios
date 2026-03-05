import axios from 'axios';
import Boleto from '../models/Boleto.js';
import Comentario from '../models/Comentario.js';
import Configuracion from '../models/Configuracion.js';

const FECHA_INICIO = '2024-01-01';

// Funciones helper para obtener variables de entorno
const getBoletosApiUrl = () => process.env.BOLETOS_API_URL || 'https://boleto-services.opencars.com.ar/pat/booking';
const getBoletosPat = () => process.env.BOLETOS_PAT;

/**
 * Obtiene boletos del endpoint externo
 * @param {Object} options - Opciones de consulta
 * @returns {Promise<Array>} Array de boletos
 */
export async function obtenerBoletosExternos(options = {}) {
  try {
    const BOLETOS_PAT = getBoletosPat();
    const BOLETOS_API_URL = getBoletosApiUrl();
    
    console.log('[BOLETOS] PAT configurado:', BOLETOS_PAT ? `${BOLETOS_PAT.substring(0, 20)}...` : 'NO CONFIGURADO');
    
    if (!BOLETOS_PAT) {
      throw new Error('BOLETOS_PAT no está configurado en las variables de entorno');
    }

    const params = {
      startDate: FECHA_INICIO,
      ...options
    };

    // Solo agregar typeOfSale si se especifica en options
    if (options.typeOfSale) {
      params.typeOfSale = options.typeOfSale;
    }

    // Si se especifica paginación, incluirla
    if (options.page) {
      params.page = options.page;
      params.limit = options.limit || 100;
    }
    
    // Agregar endDate si no está especificado
    if (!params.endDate) {
      params.endDate = new Date().toISOString().split('T')[0];
    }

    console.log(`[BOLETOS] Obteniendo boletos del endpoint externo...`);
    console.log(`[BOLETOS] URL: ${BOLETOS_API_URL}`);
    console.log(`[BOLETOS] Parámetros:`, params);

    const response = await axios.get(BOLETOS_API_URL, {
      params,
      headers: {
        'Authorization': `Bearer ${BOLETOS_PAT}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 segundos timeout
    });

    // El endpoint puede devolver un array directamente o un objeto con data/bookings
    let boletos = [];
    if (Array.isArray(response.data)) {
      boletos = response.data;
    } else if (response.data.bookings && Array.isArray(response.data.bookings)) {
      boletos = response.data.bookings;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      boletos = response.data.data;
    } else if (response.data) {
      // Si es un objeto único, convertirlo a array
      boletos = [response.data];
    }

    console.log(`[BOLETOS] Obtenidos ${boletos.length} boletos del endpoint externo`);
    
    // Log de muestra para debugging: mostrar estructura del primer boleto
    if (boletos.length > 0) {
      const primerBoleto = boletos[0];
      console.log(`[BOLETOS] Estructura del primer boleto:`, {
        tieneId: !!primerBoleto.id,
        tiene_id: !!primerBoleto._id,
        tieneBookingId: !!primerBoleto.bookingId,
        keys: Object.keys(primerBoleto).slice(0, 10),
        id: primerBoleto.id || primerBoleto._id || primerBoleto.bookingId || 'NO ENCONTRADO'
      });
    }

    return boletos;
  } catch (error) {
    console.error('[BOLETOS] Error obteniendo boletos externos:', error.message);
    if (error.response) {
      console.error('[BOLETOS] Status:', error.response.status);
      console.error('[BOLETOS] Data:', error.response.data);
      throw new Error(`Error del servidor externo: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Sincroniza boletos desde el endpoint externo a MongoDB
 * @param {Object} options - Opciones de sincronización (typeOfSale, etc.)
 * @returns {Promise<Object>} Estadísticas de sincronización
 */
export async function sincronizarBoletos(options = {}) {
  try {
    console.log('[BOLETOS] Iniciando sincronización de boletos...');
    const { typeOfSale } = options;

    // Obtener boletos del endpoint con paginación
    let hayMasBoletos = true;
    let page = 1;
    const limit = 100;
    const boletosExternos = [];
    
    while (hayMasBoletos) {
      const paramsConsulta = {
        startDate: FECHA_INICIO,
        endDate: new Date().toISOString().split('T')[0],
        page: page,
        limit: limit
      };
      
      // Agregar typeOfSale solo si se especifica
      if (typeOfSale) {
        paramsConsulta.typeOfSale = typeOfSale;
      }
      
      const boletosPagina = await obtenerBoletosExternos(paramsConsulta);
      
      if (boletosPagina && boletosPagina.length > 0) {
        boletosExternos.push(...boletosPagina);
        // Si obtenemos menos boletos que el límite, no hay más páginas
        if (boletosPagina.length < limit) {
          hayMasBoletos = false;
        } else {
          page++;
        }
      } else {
        hayMasBoletos = false;
      }
    }

    if (!boletosExternos || boletosExternos.length === 0) {
      console.log('[BOLETOS] No se encontraron boletos en el endpoint externo');
      return {
        total: 0,
        nuevos: 0,
        actualizados: 0,
        errores: 0,
        mensaje: 'No se encontraron boletos para sincronizar'
      };
    }

    const stats = {
      total: boletosExternos.length,
      nuevos: 0,
      actualizados: 0,
      errores: 0
    };

    // Procesar boletos en lotes para mejor rendimiento
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < boletosExternos.length; i += BATCH_SIZE) {
      const lote = boletosExternos.slice(i, i + BATCH_SIZE);
      
      await Promise.all(lote.map(async (boletoExterno) => {
        try {
          // Intentar obtener el ID de diferentes campos posibles
          let boletoId = boletoExterno.id || boletoExterno._id || boletoExterno.bookingId;
          
          // Si el ID es un objeto (MongoDB _id), convertirlo a string
          if (boletoId && typeof boletoId === 'object' && boletoId.toString) {
            boletoId = boletoId.toString();
          }
          
          if (!boletoId) {
            console.warn('[BOLETOS] Boleto sin ID, omitiendo. Estructura:', JSON.stringify(Object.keys(boletoExterno || {})).substring(0, 200));
            stats.errores++;
            return;
          }

          // Buscar si existe en la base de datos
          const boletoExistente = await Boleto.findOne({ id: boletoId });

          if (boletoExistente) {
            // Preservar estado, subEstado, alarma y logs locales
            const estadoLocal = boletoExistente.estado;
            const subEstadoLocal = boletoExistente.subEstado;
            const alarmaLocal = boletoExistente.alarma;
            const logsLocal = boletoExistente.logs;
            const fechaUltimoComentarioLocal = boletoExistente.fechaUltimoComentario;
            
            // Preservar campos anidados importantes de datosBoleto
            const datosBoletoExistente = boletoExistente.datosBoleto || {};
            const origenExistente = datosBoletoExistente.origen || {};
            const createdAtExistente = datosBoletoExistente.createdAt;
            
            // Actualizar datosBoleto preservando campos importantes
            const nuevoDatosBoleto = { ...boletoExterno };
            
            // Preservar origen si el nuevo tiene menos campos
            if (origenExistente.createdAt && (!nuevoDatosBoleto.origen || !nuevoDatosBoleto.origen.createdAt)) {
              nuevoDatosBoleto.origen = {
                ...nuevoDatosBoleto.origen,
                ...origenExistente
              };
            }
            
            // Preservar createdAt de datosBoleto si existe
            if (createdAtExistente && !nuevoDatosBoleto.createdAt) {
              nuevoDatosBoleto.createdAt = createdAtExistente;
            }
            
            boletoExistente.datosBoleto = nuevoDatosBoleto;
            boletoExistente.estado = estadoLocal;
            boletoExistente.subEstado = subEstadoLocal;
            boletoExistente.alarma = alarmaLocal;
            boletoExistente.logs = logsLocal;
            boletoExistente.fechaUltimoComentario = fechaUltimoComentarioLocal;
            
            await boletoExistente.save();
            stats.actualizados++;
          } else {
            // Crear nuevo boleto
            // Determinar el subEstado inicial basado en la fecha de creación y días configurados
            let subEstadoInicial = 'pendiente';
            
            try {
              // Obtener configuración de días de espera
              const config = await Configuracion.findOne({ singleton: true });
              const diasEspera = config?.accesorios?.diasEspera || 7;
              
              // Intentar obtener fecha de creación del boleto
              let fechaCreacion = null;
              if (boletoExterno.createdAt) {
                fechaCreacion = new Date(boletoExterno.createdAt);
              } else if (boletoExterno.origen?.createdAt) {
                fechaCreacion = new Date(boletoExterno.origen.createdAt);
              } else if (boletoExterno.created_at) {
                fechaCreacion = new Date(boletoExterno.created_at);
              }
              
              // Si tiene fecha de creación y es reciente (menos de X días), poner en "en_espera"
              if (fechaCreacion && !isNaN(fechaCreacion.getTime())) {
                const ahora = new Date();
                const diasDesdeCreacion = Math.floor((ahora - fechaCreacion) / (1000 * 60 * 60 * 24));
                
                if (diasDesdeCreacion < diasEspera) {
                  subEstadoInicial = 'en_espera';
                  console.log(`[BOLETOS] Boleto ${boletoId} creado hace ${diasDesdeCreacion} días - estado inicial: en_espera`);
                } else {
                  console.log(`[BOLETOS] Boleto ${boletoId} creado hace ${diasDesdeCreacion} días (>= ${diasEspera}) - estado inicial: pendiente`);
                }
              } else {
                // Si no tiene fecha de creación, asumir que es nuevo y poner en "en_espera"
                subEstadoInicial = 'en_espera';
                console.log(`[BOLETOS] Boleto ${boletoId} sin fecha de creación - estado inicial: en_espera`);
              }
            } catch (error) {
              console.warn(`[BOLETOS] Error determinando estado inicial para boleto ${boletoId}, usando "pendiente" por defecto:`, error.message);
            }
            
            const nuevoBoleto = new Boleto({
              id: boletoId,
              estado: 'abierto',
              subEstado: subEstadoInicial,
              datosBoleto: boletoExterno,
              logs: []
            });
            await nuevoBoleto.save();
            stats.nuevos++;
          }
        } catch (error) {
          console.error(`[BOLETOS] Error procesando boleto:`, error.message);
          stats.errores++;
        }
      }));

      console.log(`[BOLETOS] Procesados ${Math.min(i + BATCH_SIZE, boletosExternos.length)}/${boletosExternos.length} boletos`);
    }

    console.log('[BOLETOS] Sincronización completada:', stats);

    return {
      ...stats,
      mensaje: `Sincronización completada: ${stats.nuevos} nuevos, ${stats.actualizados} actualizados, ${stats.errores} errores`
    };
  } catch (error) {
    console.error('[BOLETOS] Error en sincronización:', error);
    throw error;
  }
}

/**
 * Registra un log de cambio de estado para un boleto
 */
export async function registrarLogBoleto(boleto, accion, estadoAnterior, estadoNuevo, usuario, comentario = '', subEstadoAnterior = null, subEstadoNuevo = null) {
  try {
    const log = {
      timestamp: new Date(),
      usuario,
      accion,
      estadoAnterior,
      estadoNuevo,
      comentario
    };

    // Solo incluir subEstadoAnterior si tiene un valor válido (no null, undefined, ni string vacío)
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

    boleto.logs.push(log);
    await boleto.save();

    // También agregar como comentario si no es vacío
    if (comentario.trim()) {
      await Comentario.create({
        referencia: boleto.id,
        tipo: 'boleto',
        usuario,
        comentario: `[LOG] ${comentario}`,
        esLog: true,
        timestamp: new Date()
      });
    }

    return log;
  } catch (error) {
    console.error('[BOLETOS] Error registrando log:', error);
    throw error;
  }
}

