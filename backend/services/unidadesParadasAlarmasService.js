import UnidadParada from '../models/UnidadParada.js';

/**
 * Registra un log de cambio de estado para unidad parada
 * Función auxiliar reutilizable
 */
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
    console.error('[UNIDADES_PARADAS-ALARMAS] Error registrando log:', error);
    throw error;
  }
};

/**
 * Verifica alarmas vencidas de unidades paradas y las procesa
 * Cambia el subEstado a "pendiente" si está en "en_espera" y desactiva la alarma
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarAlarmasUnidadesParadas = async () => {
  try {
    const ahora = new Date();
    
    // Buscar unidades paradas con alarma activa y vencida que estén en "abierto"
    const unidadesParadasConAlarmaVencida = await UnidadParada.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'abierto'
    });

    console.log(`[UNIDADES_PARADAS-ALARMAS] Verificando ${unidadesParadasConAlarmaVencida.length} alarmas vencidas`);

    let procesados = 0;
    let errores = 0;

    for (const unidadParada of unidadesParadasConAlarmaVencida) {
      try {
        const estadoAnterior = unidadParada.estado;
        const subEstadoAnterior = unidadParada.subEstado;
        
        // Si está en "en_espera", cambiar a "pendiente"
        // Si ya está en "pendiente", solo desactivar la alarma
        let cambioEstado = false;
        if (subEstadoAnterior === 'en_espera') {
          unidadParada.subEstado = 'pendiente';
          cambioEstado = true;
        }
        
        // Desactivar alarma
        unidadParada.alarma.activa = false;
        
        await unidadParada.save();

        // Registrar log solo si hubo cambio de estado
        if (cambioEstado) {
          await registrarLog(
            unidadParada,
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
            unidadParada,
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
        console.log(`[UNIDADES_PARADAS-ALARMAS] Alarma procesada para unidad parada ${unidadParada.ingresoReferencia} - ${cambioEstado ? 'Estado cambiado a pendiente' : 'Alarma desactivada'}`);
        
      } catch (error) {
        console.error(`[UNIDADES_PARADAS-ALARMAS] Error procesando alarma de unidad parada ${unidadParada.ingresoReferencia}:`, error.message);
        errores++;
      }
    }

    return {
      procesados,
      errores,
      total: unidadesParadasConAlarmaVencida.length,
      exito: errores === 0
    };
    
  } catch (error) {
    console.error('[UNIDADES_PARADAS-ALARMAS] Error verificando alarmas de unidades paradas:', error);
    return {
      procesados: 0,
      errores: 1,
      total: 0,
      exito: false,
      error: error.message
    };
  }
};





