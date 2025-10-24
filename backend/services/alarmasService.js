import Oportunidad from '../models/Oportunidad.js';
import Comentario from '../models/Comentario.js';

/**
 * Verifica alarmas vencidas y cambia estado a "a_tratar"
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarAlarmas = async () => {
  try {
    const ahora = new Date();
    
    // Buscar oportunidades con alarma activa y vencida
    const oportunidadesVencidas = await Oportunidad.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'en_gestion'
    });

    console.log(`[ALARMAS] Verificando ${oportunidadesVencidas.length} alarmas vencidas`);

    for (const oportunidad of oportunidadesVencidas) {
      const estadoAnterior = oportunidad.estado;
      
      // Cambiar estado a "a_tratar"
      oportunidad.estado = 'a_tratar';
      oportunidad.alarma.activa = false; // Desactivar alarma
      
      // Agregar log automático
      const log = {
        timestamp: new Date(),
        usuario: 'SISTEMA',
        accion: 'ALARMA_DISPARADA',
        estadoAnterior,
        estadoNuevo: 'a_tratar',
        comentario: `Alarma disparada automáticamente el ${ahora.toLocaleString('es-ES')}`
      };
      
      oportunidad.logs.push(log);
      await oportunidad.save();

      // Agregar comentario automático
      await Comentario.create({
        referencia: oportunidad.ingresoReferencia,
        tipo: 'oportunidad',
        usuario: 'SISTEMA',
        comentario: `[LOG AUTOMÁTICO] Alarma disparada - Estado cambiado de "${estadoAnterior}" a "a_tratar"`,
        esLog: true,
        timestamp: new Date()
      });

      console.log(`[ALARMAS] Oportunidad ${oportunidad.ingresoReferencia} cambiada a "a_tratar"`);
    }

    return {
      procesadas: oportunidadesVencidas.length,
      exito: true
    };

  } catch (error) {
    console.error('[ALARMAS] Error verificando alarmas:', error);
    return {
      procesadas: 0,
      exito: false,
      error: error.message
    };
  }
};

/**
 * Registra un log de cambio de estado
 */
export const registrarLog = async (oportunidad, accion, estadoAnterior, estadoNuevo, usuario, comentario = '') => {
  try {
    const log = {
      timestamp: new Date(),
      usuario,
      accion,
      estadoAnterior,
      estadoNuevo,
      comentario
    };

    oportunidad.logs.push(log);
    await oportunidad.save();

    // También agregar como comentario si no es vacío
    if (comentario.trim()) {
      await Comentario.create({
        referencia: oportunidad.ingresoReferencia,
        tipo: 'oportunidad',
        usuario,
        comentario: `[LOG] ${comentario}`,
        esLog: true,
        timestamp: new Date()
      });
    }

    return log;
  } catch (error) {
    console.error('[ALARMAS] Error registrando log:', error);
    throw error;
  }
};

/**
 * Transición automática a "en_gestion" al agregar primer comentario
 */
export const transicionEnGestion = async (referencia, usuario) => {
  try {
    const oportunidad = await Oportunidad.findOne({ ingresoReferencia: referencia });
    
    if (!oportunidad) {
      throw new Error('Oportunidad no encontrada');
    }

    if (oportunidad.estado === 'pendiente') {
      const estadoAnterior = oportunidad.estado;
      oportunidad.estado = 'en_gestion';
      
      await registrarLog(
        oportunidad,
        'COMENTARIO_AGREGADO',
        estadoAnterior,
        'en_gestion',
        usuario,
        'Primer comentario agregado - Transición automática a "en gestión"'
      );

      console.log(`[ALARMAS] Oportunidad ${referencia} cambiada automáticamente a "en_gestion"`);
    }

    return oportunidad;
  } catch (error) {
    console.error('[ALARMAS] Error en transición automática:', error);
    throw error;
  }
};



