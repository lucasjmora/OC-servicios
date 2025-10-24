import XLSX from 'xlsx';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import { cleanObjectFields } from '../utils/fieldCleaner.js';
import AnalisisAsistenciaService from './analisisAsistenciaService.js';

/**
 * Servicio de importación con análisis de asistencia pre-calculado
 */
export class ImportServiceConAsistencia {
  constructor() {
    this.BATCH_SIZE = 100;
  }

  /**
   * Importar citas con análisis de asistencia
   */
  async importCitasConAsistencia(filePaths, diasTolerancia = 5) {
    try {
      console.log('📊 Iniciando importación con análisis de asistencia...');

      // 1. Analizar asistencia en Excel antes de importar
      console.log('🔍 Analizando asistencia en archivos Excel...');
      const analisisService = new AnalisisAsistenciaService(filePaths, diasTolerancia);
      await analisisService.analizarAsistencia();
      
      // 2. Obtener citas con estados calculados
      const citasConEstados = analisisService.getCitasConEstados();
      console.log(`📋 Citas con estados calculados: ${citasConEstados.length}`);

      // 3. Procesar datos para MongoDB
      const citasProcesadas = citasConEstados.map(cita => {
        const citaLimpia = cleanObjectFields(cita);
        return processDates(citaLimpia, 'citas');
      });

      // 4. Obtener referencias existentes
      const referenciasExistentes = await Cita.find({}, { Referencia: 1 }).lean();
      const setReferencias = new Set(referenciasExistentes.map(c => c.Referencia));

      console.log(`📊 Referencias existentes: ${setReferencias.size}`);

      // 5. Separar nuevas citas y actualizaciones
      const citasNuevas = [];
      const citasActualizar = [];

      citasProcesadas.forEach(cita => {
        if (setReferencias.has(cita.Referencia)) {
          citasActualizar.push(cita);
        } else {
          citasNuevas.push(cita);
        }
      });

      console.log(`📊 Citas nuevas: ${citasNuevas.length}`);
      console.log(`📊 Citas a actualizar: ${citasActualizar.length}`);

      let insertados = 0;
      let actualizados = 0;

      // 6. Insertar citas nuevas en lotes
      if (citasNuevas.length > 0) {
        for (let i = 0; i < citasNuevas.length; i += this.BATCH_SIZE) {
          const lote = citasNuevas.slice(i, i + this.BATCH_SIZE);
          await Cita.insertMany(lote, { ordered: false });
          insertados += lote.length;
          console.log(`✅ Lote insertado: ${insertados}/${citasNuevas.length}`);
        }
      }

      // 7. Actualizar citas existentes
      for (const cita of citasActualizar) {
        try {
          await Cita.findOneAndUpdate(
            { Referencia: cita.Referencia },
            { 
              ...cita,
              updatedAt: new Date()
            },
            { upsert: false }
          );
          actualizados++;
        } catch (error) {
          console.warn(`Error actualizando cita ${cita.Referencia}:`, error.message);
        }
      }

      console.log(`✅ Importación de citas completada:`);
      console.log(`   - Nuevas citas: ${insertados}`);
      console.log(`   - Citas actualizadas: ${actualizados}`);
      console.log(`   - Con estado de asistencia pre-calculado`);

      return {
        insertados,
        actualizados,
        total: insertados + actualizados,
        conAsistenciaCalculada: true
      };

    } catch (error) {
      console.error('Error en importación con asistencia:', error);
      throw error;
    }
  }

  /**
   * Importar ingresos (sin cambios)
   */
  async importIngresos(filePath) {
    try {
      console.log('📊 Importando ingresos...');
      
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: true });

      const ingresosProcesados = data.map(ingreso => {
        const ingresoLimpio = cleanObjectFields(ingreso);
        return processDates(ingresoLimpio, 'ingresos');
      });

      // Obtener referencias existentes
      const referenciasExistentes = await Ingreso.find({}, { Referencia: 1 }).lean();
      const setReferencias = new Set(referenciasExistentes.map(i => i.Referencia));

      const ingresosNuevos = [];
      const ingresosActualizar = [];

      ingresosProcesados.forEach(ingreso => {
        if (setReferencias.has(ingreso.Referencia)) {
          ingresosActualizar.push(ingreso);
        } else {
          ingresosNuevos.push(ingreso);
        }
      });

      let insertados = 0;
      let actualizados = 0;

      // Insertar en lotes
      if (ingresosNuevos.length > 0) {
        for (let i = 0; i < ingresosNuevos.length; i += this.BATCH_SIZE) {
          const lote = ingresosNuevos.slice(i, i + this.BATCH_SIZE);
          await Ingreso.insertMany(lote, { ordered: false });
          insertados += lote.length;
          console.log(`✅ Lote ingresos insertado: ${insertados}/${ingresosNuevos.length}`);
        }
      }

      // Actualizar existentes
      for (const ingreso of ingresosActualizar) {
        try {
          await Ingreso.findOneAndUpdate(
            { Referencia: ingreso.Referencia },
            { 
              ...ingreso,
              updatedAt: new Date()
            },
            { upsert: false }
          );
          actualizados++;
        } catch (error) {
          console.warn(`Error actualizando ingreso ${ingreso.Referencia}:`, error.message);
        }
      }

      console.log(`✅ Importación de ingresos completada: ${insertados} nuevos, ${actualizados} actualizados`);
      
      return {
        insertados,
        actualizados,
        total: insertados + actualizados
      };

    } catch (error) {
      console.error('Error importando ingresos:', error);
      throw error;
    }
  }

  /**
   * Ejecutar importación completa con análisis de asistencia
   */
  async executeImportConAsistencia(filePaths, diasTolerancia = 5) {
    const startTime = Date.now();
    
    try {
      console.log('🚀 Iniciando importación completa con análisis de asistencia...');
      console.log(`📅 Días de tolerancia: ${diasTolerancia}`);

      // Importar citas con análisis de asistencia
      const resultadoCitas = await this.importCitasConAsistencia(filePaths, diasTolerancia);
      
      // Importar ingresos
      const resultadoIngresos = await this.importIngresos(filePaths.ingresos);

      const duration = Date.now() - startTime;
      
      const resultado = {
        citas: resultadoCitas,
        ingresos: resultadoIngresos,
        duracion: duration,
        conAsistenciaCalculada: true,
        diasTolerancia
      };

      console.log('✅ Importación completa finalizada:');
      console.log(`   - Citas: ${resultadoCitas.insertados} nuevos, ${resultadoCitas.actualizados} actualizados`);
      console.log(`   - Ingresos: ${resultadoIngresos.insertados} nuevos, ${resultadoIngresos.actualizados} actualizados`);
      console.log(`   - Duración: ${(duration / 1000).toFixed(2)} segundos`);
      console.log(`   - Estados de asistencia pre-calculados`);

      return resultado;

    } catch (error) {
      console.error('Error en importación completa:', error);
      throw error;
    }
  }
}

// Funciones auxiliares
function parseExcelDate(dateValue) {
  if (!dateValue && dateValue !== 0) return null;
  
  try {
    if (dateValue === '1900-01-00' || dateValue === '1900-01-00T00:00:00.000Z') {
      return null;
    }
    
    if (typeof dateValue === 'number') {
      if (dateValue === 0) return null;
      const date = new Date((dateValue - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }
    
    if (typeof dateValue === 'string') {
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? null : date;
    }
    
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? null : dateValue;
    }
    
    return null;
  } catch (error) {
    console.warn('Error parseando fecha:', dateValue, error.message);
    return null;
  }
}

function parseExcelTime(timeValue) {
  if (!timeValue && timeValue !== 0) return null;
  
  try {
    if (timeValue === '1900-01-00' || 
        timeValue === '1900-01-00T00:00:00.000Z' ||
        (typeof timeValue === 'string' && timeValue.includes('1900-01-00'))) {
      return null;
    }
    
    if (typeof timeValue === 'number') {
      if (timeValue >= 0 && timeValue < 1) {
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }
    
    if (typeof timeValue === 'string') {
      const trimmed = timeValue.trim();
      
      if (/^\d+\.?\d*$/.test(trimmed)) {
        const numValue = parseFloat(trimmed);
        if (numValue >= 0 && numValue < 1) {
          const totalMinutes = Math.round(numValue * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
      
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        const parts = trimmed.split(':');
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
      
      return trimmed;
    }
    
    return null;
  } catch (error) {
    console.warn('Error parseando hora:', timeValue, error.message);
    return null;
  }
}

function processDates(obj, type = 'citas') {
  const processed = { ...obj };
  
  const dateFields = type === 'citas' 
    ? ['Fecha cr', 'Fecha ci']
    : ['Fecaper', 'F cierr', 'FEC OBS '];
  
  dateFields.forEach(field => {
    if (processed[field]) {
      processed[field] = parseExcelDate(processed[field]);
    }
  });
  
  if (type === 'citas') {
    const horaOriginal = processed['Hora '];
    processed['Hora '] = parseExcelTime(processed['Hora ']);
    if (horaOriginal !== processed['Hora ']) {
      console.log(`Hora procesada: "${horaOriginal}" -> "${processed['Hora ']}"`);
    }
  }
  
  return processed;
}

export default ImportServiceConAsistencia;




