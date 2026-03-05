import cron from 'node-cron';
import { executeImport } from './importService.js';
import Configuracion from '../models/Configuracion.js';

let scheduledTask = null;

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
    
  } catch (error) {
    console.error('Error iniciando scheduler:', error);
  }
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




