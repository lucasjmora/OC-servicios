import cron from 'node-cron';
import { executeImport } from './importService.js';
import { verificarAlarmas } from './alarmasService.js';
import Configuracion from '../models/Configuracion.js';

let scheduledTask = null;
let alarmasTask = null;

/**
 * Inicia el scheduler con la configuración actual
 */
export async function startScheduler() {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    
    if (!config || !config.scheduler.enabled) {
      console.log('Scheduler deshabilitado');
      return;
    }
    
    const { cronExpression } = config.scheduler;
    const { citas, ingresos } = config.filePaths;
    
    if (!citas || !ingresos) {
      console.log('Rutas de archivos no configuradas, scheduler no iniciado');
      return;
    }
    
    // Detener tarea existente si hay una
    stopScheduler();
    
    // Validar expresión cron
    if (!cron.validate(cronExpression)) {
      console.error('Expresión cron inválida:', cronExpression);
      return;
    }
    
    // Crear nueva tarea programada
    scheduledTask = cron.schedule(cronExpression, async () => {
      console.log('Ejecutando importación programada...');
      
      try {
        const resultado = await executeImport(citas, ingresos);
        console.log('Importación programada completada:', resultado);
      } catch (error) {
        console.error('Error en importación programada:', error);
      }
    });
    
    console.log(`Scheduler iniciado con expresión: ${cronExpression}`);
    
    // Iniciar también el scheduler de alarmas (cada 5 minutos)
    startAlarmasScheduler();
    
  } catch (error) {
    console.error('Error iniciando scheduler:', error);
  }
}

/**
 * Inicia el scheduler de alarmas (cada 5 minutos)
 */
export function startAlarmasScheduler() {
  // Detener tarea existente si hay una
  if (alarmasTask) {
    alarmasTask.stop();
  }
  
  // Crear nueva tarea para verificar alarmas cada 5 minutos
  alarmasTask = cron.schedule('*/5 * * * *', async () => {
    try {
      const resultado = await verificarAlarmas();
      if (resultado.procesadas > 0) {
        console.log(`[SCHEDULER] ${resultado.procesadas} alarmas procesadas`);
      }
    } catch (error) {
      console.error('[SCHEDULER] Error verificando alarmas:', error);
    }
  });
  
  console.log('Scheduler de alarmas iniciado (cada 5 minutos)');
}

/**
 * Detiene el scheduler
 */
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler detenido');
  }
  
  if (alarmasTask) {
    alarmasTask.stop();
    alarmasTask = null;
    console.log('Scheduler de alarmas detenido');
  }
}

/**
 * Reinicia el scheduler con la nueva configuración
 */
export async function restartScheduler() {
  stopScheduler();
  await startScheduler();
}

/**
 * Obtiene el estado del scheduler
 */
export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    active: scheduledTask ? true : false
  };
}




