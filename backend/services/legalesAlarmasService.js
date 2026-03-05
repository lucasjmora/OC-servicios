import Legal from '../models/Legal.js';

/**
 * Registra un log de cambio de estado para caso legal
 * Función auxiliar reutilizable
 */
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
    console.error('[LEGALES-ALARMAS] Error registrando log:', error);
    throw error;
  }
};

/**
 * Verifica alarmas vencidas de casos legales y las procesa
 * Cambia el subEstado a "pendiente" si está en "en_espera" y desactiva la alarma
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarAlarmasLegales = async () => {
  try {
    const ahora = new Date();
    
    // Buscar casos legales con alarma activa y vencida que estén en "abierto"
    const legalesConAlarmaVencida = await Legal.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'abierto'
    });

    console.log(`[LEGALES-ALARMAS] Verificando ${legalesConAlarmaVencida.length} alarmas vencidas`);

    let procesados = 0;
    let errores = 0;

    for (const casoLegal of legalesConAlarmaVencida) {
      try {
        const estadoAnterior = casoLegal.estado;
        const subEstadoAnterior = casoLegal.subEstado;
        
        // Si está en "en_espera", cambiar a "pendiente"
        // Si ya está en "pendiente", solo desactivar la alarma
        let cambioEstado = false;
        if (subEstadoAnterior === 'en_espera') {
          casoLegal.subEstado = 'pendiente';
          cambioEstado = true;
        }
        
        // Desactivar alarma
        casoLegal.alarma.activa = false;
        
        await casoLegal.save();

        // Registrar log solo si hubo cambio de estado
        if (cambioEstado) {
          await registrarLog(
            casoLegal,
            'ALARMA_DISPARADA',
            estadoAnterior,
            estadoAnterior, // El estado principal no cambia, solo el subEstado
            'SISTEMA',
            `Alarma disparada automáticamente el ${ahora.toLocaleString('es-ES')} - SubEstado cambiado de "en_espera" a "pendiente"`,
            subEstadoAnterior,
            'pendiente'
          );
        } else {
          // Solo registrar que la alarma fue desactivada
          await registrarLog(
            casoLegal,
            'ALARMA_DESACTIVADA',
            estadoAnterior,
            estadoAnterior,
            'SISTEMA',
            `Alarma vencida desactivada automáticamente el ${ahora.toLocaleString('es-ES')}`,
            subEstadoAnterior,
            subEstadoAnterior
          );
        }

        procesados++;
        console.log(`[LEGALES-ALARMAS] Alarma procesada para caso legal ${casoLegal.ingresoReferencia} - ${cambioEstado ? 'Estado cambiado a pendiente' : 'Alarma desactivada'}`);
        
      } catch (error) {
        console.error(`[LEGALES-ALARMAS] Error procesando alarma de caso legal ${casoLegal.ingresoReferencia}:`, error.message);
        errores++;
      }
    }

    return {
      procesados,
      errores,
      total: legalesConAlarmaVencida.length,
      exito: errores === 0
    };
    
  } catch (error) {
    console.error('[LEGALES-ALARMAS] Error verificando alarmas de casos legales:', error);
    return {
      procesados: 0,
      errores: 1,
      total: 0,
      exito: false,
      error: error.message
    };
  }
};





