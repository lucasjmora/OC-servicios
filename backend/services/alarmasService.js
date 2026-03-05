import Oportunidad from '../models/Oportunidad.js';
import CitaGestion from '../models/CitaGestion.js';
import Comentario from '../models/Comentario.js';

/**
 * Verifica alarmas vencidas y cambia subEstado a "pendiente"
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarAlarmas = async () => {
  try {
    const ahora = new Date();
    let totalProcesadas = 0;
    
    // Buscar oportunidades con alarma activa y vencida que estén en "abierto" con subEstado "en_espera"
    const oportunidadesVencidas = await Oportunidad.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'abierto',
      subEstado: 'en_espera'
    });

    console.log(`[ALARMAS] Verificando ${oportunidadesVencidas.length} alarmas vencidas de oportunidades`);

    for (const oportunidad of oportunidadesVencidas) {
      const estadoAnterior = oportunidad.estado;
      const subEstadoAnterior = oportunidad.subEstado;
      
      // Cambiar subEstado a "pendiente" para indicar que requiere atención
      oportunidad.subEstado = 'pendiente';
      oportunidad.alarma.activa = false; // Desactivar alarma
      
      await oportunidad.save();

      // Registrar log con los nuevos estados
      await registrarLog(
        oportunidad,
        'ALARMA_DISPARADA',
        estadoAnterior,
        estadoAnterior, // El estado principal no cambia, solo el subEstado
        'SISTEMA',
        `Alarma disparada automáticamente el ${ahora.toLocaleString('es-ES')}`,
        subEstadoAnterior,
        'pendiente'
      );

      // Agregar comentario automático
      await Comentario.create({
        referencia: oportunidad.ingresoReferencia,
        tipo: 'oportunidad',
        usuario: 'SISTEMA',
        comentario: `[LOG AUTOMÁTICO] Alarma disparada - SubEstado cambiado de "en_espera" a "pendiente"`,
        esLog: true,
        timestamp: new Date()
      });

      console.log(`[ALARMAS] Oportunidad ${oportunidad.ingresoReferencia} cambiada a "pendiente"`);
      totalProcesadas++;
    }

    // Buscar citas con alarma activa y vencida que estén en "abierto" con subEstado "en_espera"
    const citasVencidas = await CitaGestion.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'abierto',
      subEstado: 'en_espera'
    });

    console.log(`[ALARMAS] Verificando ${citasVencidas.length} alarmas vencidas de citas`);

    for (const citaGestion of citasVencidas) {
      const estadoAnterior = citaGestion.estado;
      const subEstadoAnterior = citaGestion.subEstado;
      
      // Cambiar subEstado a "pendiente" para indicar que requiere atención
      citaGestion.subEstado = 'pendiente';
      citaGestion.alarma.activa = false; // Desactivar alarma

      // Registrar log
      const log = {
        timestamp: new Date(),
        usuario: 'SISTEMA',
        accion: 'ALARMA_DISPARADA',
        estadoAnterior: estadoAnterior,
        estadoNuevo: estadoAnterior, // El estado principal no cambia, solo el subEstado
        comentario: `Alarma disparada automáticamente el ${ahora.toLocaleString('es-ES')}`,
        subEstadoAnterior: subEstadoAnterior,
        subEstadoNuevo: 'pendiente'
      };
      
      citaGestion.logs.push(log);
      await citaGestion.save();

      // Agregar comentario automático
      await Comentario.create({
        referencia: citaGestion.citaReferencia,
        tipo: 'cita',
        usuario: 'SISTEMA',
        comentario: `[LOG AUTOMÁTICO] Alarma disparada - SubEstado cambiado de "en_espera" a "pendiente"`,
        esLog: true,
        timestamp: new Date()
      });

      console.log(`[ALARMAS] Cita ${citaGestion.citaReferencia} cambiada a "pendiente"`);
      totalProcesadas++;
    }

    return {
      procesadas: totalProcesadas,
      oportunidades: oportunidadesVencidas.length,
      citas: citasVencidas.length,
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
export const registrarLog = async (oportunidad, accion, estadoAnterior, estadoNuevo, usuario, comentario = '', subEstadoAnterior = null, subEstadoNuevo = null) => {
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
 * Transición automática a "en_espera" al agregar primer comentario
 * Respeta las alarmas vigentes (no cambia el estado si hay una alarma activa y no vencida)
 */
export const transicionEnGestion = async (referencia, usuario) => {
  try {
    const oportunidad = await Oportunidad.findOne({ ingresoReferencia: referencia });
    
    if (!oportunidad) {
      throw new Error('Oportunidad no encontrada');
    }

    // Verificar si hay una alarma vigente (activa y no vencida)
    const ahora = new Date();
    const tieneAlarmaVigente = oportunidad.alarma?.activa && 
                                oportunidad.alarma?.fechaHora && 
                                new Date(oportunidad.alarma.fechaHora) > ahora;
    
    // Si hay una alarma vigente, el estado ya debe ser "abierto" con "en_espera", no cambiar
    if (tieneAlarmaVigente) {
      // Asegurar que el estado sea correcto
      if (oportunidad.estado !== 'abierto' || oportunidad.subEstado !== 'en_espera') {
        oportunidad.estado = 'abierto';
        oportunidad.subEstado = 'en_espera';
        await oportunidad.save();
      }
      return oportunidad;
    }

    // Si está en "abierto" con subEstado "pendiente", cambiar a "en_espera"
    if (oportunidad.estado === 'abierto' && oportunidad.subEstado === 'pendiente') {
      const estadoAnterior = oportunidad.estado;
      const subEstadoAnterior = oportunidad.subEstado;
      
      oportunidad.subEstado = 'en_espera';
      await oportunidad.save();
      
      await registrarLog(
        oportunidad,
        'COMENTARIO_AGREGADO',
        estadoAnterior,
        estadoAnterior, // El estado principal no cambia
        usuario,
        'Primer comentario agregado - SubEstado cambiado automáticamente a "en_espera"',
        subEstadoAnterior,
        'en_espera'
      );

      console.log(`[ALARMAS] Oportunidad ${referencia} cambiada automáticamente a "en_espera"`);
    }

    return oportunidad;
  } catch (error) {
    console.error('[ALARMAS] Error en transición automática:', error);
    throw error;
  }
};




























