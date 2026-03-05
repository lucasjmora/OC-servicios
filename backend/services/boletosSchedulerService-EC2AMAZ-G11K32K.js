import cron from 'node-cron';
import { verificarEstadosBoletos, verificarAlarmasBoletos } from './boletosAlarmasService.js';
import { verificarAlarmasUnidadesParadas } from './unidadesParadasAlarmasService.js';
import { verificarAlarmasLegales } from './legalesAlarmasService.js';

let scheduledTask = null;
let alarmTask = null;

/**
 * Inicia el scheduler para verificar estados de boletos
 * Se ejecuta cada hora por defecto
 */
export function startBoletosScheduler() {
  try {
    // Detener tarea existente si hay una
    stopBoletosScheduler();
    
    // Ejecutar cada hora (cron: '0 * * * *')
    // También se puede configurar para ejecutar cada 30 minutos: '*/30 * * * *'
    scheduledTask = cron.schedule('0 * * * *', async () => {
      console.log('[BOLETOS-SCHEDULER] Ejecutando verificación de estados de boletos...');
      
      try {
        const resultado = await verificarEstadosBoletos();
        console.log('[BOLETOS-SCHEDULER] Verificación completada:', resultado);
      } catch (error) {
        console.error('[BOLETOS-SCHEDULER] Error en verificación:', error);
      }
    }, {
      scheduled: true,
      timezone: 'America/Argentina/Buenos_Aires'
    });
    
    // Ejecutar inmediatamente al iniciar
    console.log('[BOLETOS-SCHEDULER] Scheduler iniciado - ejecutando verificación inicial...');
    verificarEstadosBoletos().then(resultado => {
      console.log('[BOLETOS-SCHEDULER] Verificación inicial completada:', resultado);
    }).catch(error => {
      console.error('[BOLETOS-SCHEDULER] Error en verificación inicial:', error);
    });
    
    console.log('[BOLETOS-SCHEDULER] Scheduler iniciado - ejecutará verificación cada hora');
    
    // También ejecutar verificación de alarmas cada 15 minutos
    // Esto asegura que las alarmas vencidas se procesen rápidamente
    alarmTask = cron.schedule('*/15 * * * *', async () => {
      console.log('[BOLETOS-SCHEDULER] Ejecutando verificación de alarmas vencidas...');
      
      try {
        // Verificar alarmas de boletos
        const resultadoBoletos = await verificarAlarmasBoletos();
        console.log('[BOLETOS-SCHEDULER] Verificación de alarmas de boletos completada:', resultadoBoletos);
        
        // Verificar alarmas de unidades paradas
        const resultadoUnidadesParadas = await verificarAlarmasUnidadesParadas();
        console.log('[BOLETOS-SCHEDULER] Verificación de alarmas de unidades paradas completada:', resultadoUnidadesParadas);
        
        // Verificar alarmas de casos legales
        const resultadoLegales = await verificarAlarmasLegales();
        console.log('[BOLETOS-SCHEDULER] Verificación de alarmas de casos legales completada:', resultadoLegales);
      } catch (error) {
        console.error('[BOLETOS-SCHEDULER] Error en verificación de alarmas:', error);
      }
    }, {
      scheduled: true,
      timezone: 'America/Argentina/Buenos_Aires'
    });
    
    // Ejecutar verificación de alarmas inmediatamente al iniciar
    console.log('[BOLETOS-SCHEDULER] Ejecutando verificación inicial de alarmas...');
    Promise.all([
      verificarAlarmasBoletos(),
      verificarAlarmasUnidadesParadas(),
      verificarAlarmasLegales()
    ]).then(([resultadoBoletos, resultadoUnidadesParadas, resultadoLegales]) => {
      console.log('[BOLETOS-SCHEDULER] Verificación inicial de alarmas de boletos completada:', resultadoBoletos);
      console.log('[BOLETOS-SCHEDULER] Verificación inicial de alarmas de unidades paradas completada:', resultadoUnidadesParadas);
      console.log('[BOLETOS-SCHEDULER] Verificación inicial de alarmas de casos legales completada:', resultadoLegales);
    }).catch(error => {
      console.error('[BOLETOS-SCHEDULER] Error en verificación inicial de alarmas:', error);
    });
    
    console.log('[BOLETOS-SCHEDULER] Scheduler de alarmas iniciado - ejecutará verificación cada 15 minutos');
    
  } catch (error) {
    console.error('[BOLETOS-SCHEDULER] Error iniciando scheduler:', error);
  }
}

/**
 * Detiene el scheduler de boletos
 */
export function stopBoletosScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[BOLETOS-SCHEDULER] Scheduler de estados detenido');
  }
  if (alarmTask) {
    alarmTask.stop();
    alarmTask = null;
    console.log('[BOLETOS-SCHEDULER] Scheduler de alarmas detenido');
  }
}

/**
 * Obtiene el estado del scheduler de boletos
 */
export function getBoletosSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    active: scheduledTask ? true : false,
    alarmScheduler: {
      running: alarmTask !== null,
      active: alarmTask ? true : false
    }
  };
}

