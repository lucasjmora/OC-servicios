import xlsx from 'xlsx';
import fs from 'fs';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import { cleanObjectFields } from '../utils/fieldCleaner.js';

/**
 * Lee un archivo Excel y retorna los datos como array de objetos
 */
function readExcelFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }
  
  const workbook = xlsx.readFile(filePath, {
    cellDates: true, // Convertir fechas automáticamente
    cellNF: false,   // No formatear números
    cellText: false  // No convertir todo a texto
  });
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convertir a JSON manteniendo tipos de datos
  const data = xlsx.utils.sheet_to_json(worksheet, {
    raw: true,       // Usar valores raw para números y fechas
    dateNF: 'yyyy-mm-dd' // Formato de fecha
  });
  
  console.log(`Archivo leído: ${data.length} filas`);
  if (data.length > 0) {
    console.log('Primera fila de ejemplo:', Object.keys(data[0]));
    console.log('Fechas de ejemplo:', {
      'Fecha cr': data[0]['Fecha cr'],
      'Fecha ci': data[0]['Fecha ci'],
      'Hora ': data[0]['Hora ']
    });
    
    // Mostrar algunos ejemplos de horas para debugging
    const horaExamples = data.slice(0, 5).map((row, index) => ({
      fila: index + 1,
      hora: row['Hora '],
      tipo: typeof row['Hora ']
    }));
    console.log('Ejemplos de horas del Excel:', horaExamples);
  }
  
  return data;
}

/**
 * Convierte una fecha de Excel a Date válida
 */
function parseExcelDate(dateValue) {
  if (!dateValue) return null;
  
  try {
    // Si ya es una fecha válida
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return dateValue;
    }
    
    // Si es un número (días desde 1900-01-01 en Excel)
    if (typeof dateValue === 'number') {
      // Excel cuenta días desde 1900-01-01, pero tiene un bug: cuenta 1900 como año bisiesto
      const excelEpoch = new Date(1900, 0, 1);
      const daysSinceEpoch = dateValue - 2; // -2 para corregir el bug de Excel
      const result = new Date(excelEpoch.getTime() + daysSinceEpoch * 24 * 60 * 60 * 1000);
      
      // Verificar que sea una fecha válida y no esté en 1900 (probable error)
      if (!isNaN(result.getTime()) && result.getFullYear() > 1900 && result.getFullYear() < 2100) {
        return result;
      }
    }
    
    // Si es string, intentar parsear diferentes formatos
    if (typeof dateValue === 'string') {
      const trimmed = dateValue.trim();
      
      // Formato DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
        const [day, month, year] = trimmed.split('/');
        const parsed = new Date(year, month - 1, day);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
          return parsed;
        }
      }
      
      // Formato YYYY-MM-DD
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
          return parsed;
        }
      }
      
      // Formato general
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
        return parsed;
      }
    }
    
    console.warn('Fecha no válida o muy antigua:', dateValue);
    return null;
  } catch (error) {
    console.warn('Error parseando fecha:', dateValue, error.message);
    return null;
  }
}

/**
 * Convierte una hora de Excel a formato HH:mm
 */
function parseExcelTime(timeValue) {
  if (!timeValue && timeValue !== 0) return null;
  
  try {
    // Si es el valor por defecto de Excel (1900-01-00), retornar null
    if (timeValue === '1900-01-00' || 
        timeValue === '1900-01-00T00:00:00.000Z' ||
        (typeof timeValue === 'string' && timeValue.includes('1900-01-00'))) {
      return null;
    }
    
    // ✅ Si es un objeto Date (Excel con cellDates: true)
    if (timeValue instanceof Date) {
      const year = timeValue.getUTCFullYear();
      // Si es fecha de Excel de solo hora (1899 o 1900)
      if (year === 1899 || year === 1900) {
        // Para fechas de Excel de solo hora, usar la hora local (sin conversión UTC)
        // ya que Excel las guarda en la zona horaria local
        const hours = timeValue.getHours();
        const minutes = timeValue.getMinutes();
        // Si tiene hora válida (no es 00:00)
        if (hours !== 0 || minutes !== 0) {
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        return null;
      }
      // Si es una fecha normal con hora
      const hours = timeValue.getHours();
      const minutes = timeValue.getMinutes();
      if (hours !== 0 || minutes !== 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
      return null;
    }
    
    // Si es un número decimal (formato Excel de hora)
    if (typeof timeValue === 'number') {
      // Excel almacena las horas como fracciones de día
      if (timeValue >= 0 && timeValue < 1) {
        // Convertir a minutos totales y luego a horas:minutos para evitar problemas de redondeo
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }
    
    // Si es string, intentar parsear diferentes formatos
    if (typeof timeValue === 'string') {
      const trimmed = timeValue.trim();
      
      // Si es solo números, tratar como decimal
      if (/^\d+\.?\d*$/.test(trimmed)) {
        const numValue = parseFloat(trimmed);
        if (numValue >= 0 && numValue < 1) {
          const totalMinutes = Math.round(numValue * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
      
      // Si es una fecha/hora, extraer solo la hora
      if (trimmed.includes('-') || trimmed.includes('/') || trimmed.includes(':')) {
        const dateObj = new Date(trimmed);
        if (!isNaN(dateObj.getTime())) {
          // Si es una fecha válida pero sin hora específica (1900-01-01), retornar null
          if (dateObj.getFullYear() === 1900 && dateObj.getMonth() === 0 && dateObj.getDate() === 1) {
            return null;
          }
          // Si tiene hora válida, convertir a formato HH:mm
          if (dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0) {
            return `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
          }
          return null;
        }
      }
      
      // Si ya está en formato HH:mm o HH:mm:ss
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

/**
 * Procesa un objeto para convertir fechas de Excel
 */
function processDates(obj, type = 'citas') {
  const processed = { ...obj };
  
  // Campos de fecha según el tipo
  const dateFields = type === 'citas' 
    ? ['Fecha cr', 'Fecha ci']
    : ['Fecaper', 'F cierr', 'FEC OBS '];
  
  dateFields.forEach(field => {
    if (processed[field]) {
      processed[field] = parseExcelDate(processed[field]);
    }
  });
  
  // Procesar campo de hora para citas usando la función específica
  if (type === 'citas') {
    const horaOriginal = processed['Hora '];
    processed['Hora '] = parseExcelTime(processed['Hora ']);
    if (horaOriginal !== processed['Hora ']) {
      console.log(`Hora procesada: "${horaOriginal}" -> "${processed['Hora ']}"`);
    }
  }
  
  return processed;
}

/**
 * Compara dos objetos y retorna true si son diferentes
 */
function hasChanges(oldDoc, newData) {
  // Comparar campos relevantes (excluyendo _id, timestamps, etc.)
  const relevantFields = Object.keys(newData).filter(key => 
    !['_id', 'createdAt', 'updatedAt', '__v'].includes(key)
  );
  
  for (const field of relevantFields) {
    const oldValue = oldDoc[field];
    const newValue = newData[field];
    
    // Comparación básica (puede mejorarse para fechas, números, etc.)
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Importa datos de Citas desde archivo Excel (OPTIMIZADO)
 */
async function importCitas(filePath) {
  const stats = { nuevos: 0, actualizados: 0, sinCambios: 0, errores: 0 };
  const BATCH_SIZE = 100; // Procesar en lotes de 100
  
  try {
    console.log(`📊 Iniciando importación de citas desde: ${filePath}`);
    const data = readExcelFile(filePath);
    console.log(`📈 Total de registros a procesar: ${data.length}`);
    
    // Obtener todas las referencias existentes de una vez
    const existingRefs = await Cita.find({}, { Referencia: 1 }).lean();
    const existingMap = new Set(existingRefs.map(doc => doc.Referencia));
    console.log(`🔍 Referencias existentes encontradas: ${existingMap.size}`);
    
    // Procesar en lotes para mejor rendimiento
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      console.log(`⚡ Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(data.length/BATCH_SIZE)} (${batch.length} registros)`);
      
      const operations = [];
      const updates = [];
      
      for (const row of batch) {
        try {
          // Limpiar campos según convención
          const cleanedRow = cleanObjectFields(row);
          
          if (!cleanedRow.Referencia) {
            stats.errores++;
            continue;
          }
        
          // Procesar fechas de Excel
          const processedRow = processDates(cleanedRow, 'citas');
          
          if (existingMap.has(processedRow.Referencia)) {
            // Preparar actualización
            updates.push({
              referencia: processedRow.Referencia,
              data: processedRow
            });
          } else {
            // Preparar inserción
            operations.push(processedRow);
          }
        } catch (error) {
          console.error('Error procesando fila de citas:', error);
          stats.errores++;
        }
      }
      
      // Ejecutar operaciones en lote
      if (operations.length > 0) {
        try {
          await Cita.insertMany(operations, { ordered: false });
          stats.nuevos += operations.length;
          console.log(`✅ Insertados ${operations.length} registros nuevos`);
        } catch (error) {
          // Manejar errores de inserción (duplicados, etc.)
          if (error.code === 11000) {
            // Duplicados - procesar uno por uno
            for (const op of operations) {
              try {
                await Cita.create(op);
                stats.nuevos++;
              } catch (singleError) {
                stats.errores++;
              }
            }
          } else {
            console.error('Error en inserción en lote:', error);
            stats.errores += operations.length;
          }
        }
      }
      
      // Procesar actualizaciones una por una (necesario para verificar cambios)
      for (const update of updates) {
        try {
          const existing = await Cita.findOne({ Referencia: update.referencia });
          if (hasChanges(existing, update.data)) {
            await Cita.updateOne(
              { Referencia: update.referencia },
              { $set: update.data }
            );
            stats.actualizados++;
          } else {
            stats.sinCambios++;
          }
        } catch (error) {
          console.error('Error actualizando registro:', error);
          stats.errores++;
        }
      }
      
      if (updates.length > 0) {
        console.log(`🔄 Procesadas ${updates.length} actualizaciones`);
      }
    }
    
    console.log(`✅ Importación de citas completada:`, stats);
  } catch (error) {
    console.error('❌ Error importando citas:', error);
    throw new Error(`Error importando citas: ${error.message}`);
  }
  
  return stats;
}

/**
 * Importa datos de Ingresos desde archivo Excel (OPTIMIZADO)
 */
async function importIngresos(filePath) {
  const stats = { nuevos: 0, actualizados: 0, sinCambios: 0, errores: 0 };
  const BATCH_SIZE = 100; // Procesar en lotes de 100
  
  try {
    console.log(`📊 Iniciando importación de ingresos desde: ${filePath}`);
    const data = readExcelFile(filePath);
    console.log(`📈 Total de registros a procesar: ${data.length}`);
    
    // Obtener todas las referencias existentes de una vez
    const existingRefs = await Ingreso.find({}, { Referencia: 1 }).lean();
    const existingMap = new Set(existingRefs.map(doc => doc.Referencia));
    console.log(`🔍 Referencias existentes encontradas: ${existingMap.size}`);
    
    // Procesar en lotes para mejor rendimiento
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      console.log(`⚡ Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(data.length/BATCH_SIZE)} (${batch.length} registros)`);
      
      const operations = [];
      const updates = [];
      
      for (const row of batch) {
        try {
          // Limpiar campos según convención
          const cleanedRow = cleanObjectFields(row);
          
          if (!cleanedRow.Referencia) {
            stats.errores++;
            continue;
          }
        
          // Procesar fechas de Excel
          const processedRow = processDates(cleanedRow, 'ingresos');
          
          if (existingMap.has(processedRow.Referencia)) {
            // Preparar actualización
            updates.push({
              referencia: processedRow.Referencia,
              data: processedRow
            });
          } else {
            // Preparar inserción
            operations.push(processedRow);
          }
        } catch (error) {
          console.error('Error procesando fila de ingresos:', error);
          stats.errores++;
        }
      }
      
      // Ejecutar operaciones en lote
      if (operations.length > 0) {
        try {
          await Ingreso.insertMany(operations, { ordered: false });
          stats.nuevos += operations.length;
          console.log(`✅ Insertados ${operations.length} registros nuevos`);
        } catch (error) {
          // Manejar errores de inserción (duplicados, etc.)
          if (error.code === 11000) {
            // Duplicados - procesar uno por uno
            for (const op of operations) {
              try {
                await Ingreso.create(op);
                stats.nuevos++;
              } catch (singleError) {
                stats.errores++;
              }
            }
          } else {
            console.error('Error en inserción en lote:', error);
            stats.errores += operations.length;
          }
        }
      }
      
      // Procesar actualizaciones una por una (necesario para verificar cambios)
      for (const update of updates) {
        try {
          const existing = await Ingreso.findOne({ Referencia: update.referencia });
          if (hasChanges(existing, update.data)) {
            await Ingreso.updateOne(
              { Referencia: update.referencia },
              { $set: update.data }
            );
            stats.actualizados++;
          } else {
            stats.sinCambios++;
          }
        } catch (error) {
          console.error('Error actualizando registro:', error);
          stats.errores++;
        }
      }
      
      if (updates.length > 0) {
        console.log(`🔄 Procesadas ${updates.length} actualizaciones`);
      }
    }
    
    console.log(`✅ Importación de ingresos completada:`, stats);
  } catch (error) {
    console.error('❌ Error importando ingresos:', error);
    throw new Error(`Error importando ingresos: ${error.message}`);
  }
  
  return stats;
}

/**
 * Importa citas con estados de asistencia ya calculados
 */
async function importCitasConEstados(citasData) {
  const stats = {
    total: citasData.length,
    nuevos: 0,
    actualizados: 0,
    sinCambios: 0,
    errores: 0
  };
  
  try {
    console.log(`📋 Importando ${citasData.length} citas con estados calculados...`);
    
    // Obtener referencias existentes
    const referenciasExistentes = await Cita.find({}, { Referencia: 1 }).lean();
    const setReferencias = new Set(referenciasExistentes.map(c => c.Referencia));
    
    const citasNuevas = [];
    const citasActualizar = [];
    
    // Separar nuevas y existentes
    for (const cita of citasData) {
      if (setReferencias.has(cita.Referencia)) {
        citasActualizar.push(cita);
      } else {
        citasNuevas.push(cita);
      }
    }
    
    console.log(`📊 Nuevas: ${citasNuevas.length}, A actualizar: ${citasActualizar.length}`);
    
    // Insertar nuevas en lotes
    const BATCH_SIZE = 100;
    if (citasNuevas.length > 0) {
      for (let i = 0; i < citasNuevas.length; i += BATCH_SIZE) {
        const lote = citasNuevas.slice(i, i + BATCH_SIZE);
        try {
          await Cita.insertMany(lote, { ordered: false });
          stats.nuevos += lote.length;
          console.log(`✅ Lote insertado: ${stats.nuevos}/${citasNuevas.length}`);
        } catch (error) {
          if (error.code === 11000) {
            // Duplicados - intentar uno por uno
            for (const cita of lote) {
              try {
                await Cita.create(cita);
                stats.nuevos++;
              } catch (singleError) {
                stats.errores++;
              }
            }
          } else {
            console.error('Error en lote:', error);
            stats.errores += lote.length;
          }
        }
      }
    }
    
    // Actualizar existentes
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
        stats.actualizados++;
      } catch (error) {
        console.warn(`Error actualizando cita ${cita.Referencia}:`, error.message);
        stats.errores++;
      }
    }
    
    console.log(`✅ Importación de citas completada:`, stats);
  } catch (error) {
    console.error('❌ Error importando citas:', error);
    throw error;
  }
  
  return stats;
}

/**
 * Importa ingresos procesados
 */
async function importIngresosConEstados(ingresosData) {
  const stats = {
    total: ingresosData.length,
    nuevos: 0,
    actualizados: 0,
    sinCambios: 0,
    errores: 0
  };
  
  try {
    console.log(`💰 Importando ${ingresosData.length} ingresos...`);
    
    // Obtener referencias existentes
    const referenciasExistentes = await Ingreso.find({}, { Referencia: 1 }).lean();
    const setReferencias = new Set(referenciasExistentes.map(i => i.Referencia));
    
    const ingresosNuevos = [];
    const ingresosActualizar = [];
    
    // Separar nuevos y existentes
    for (const ingreso of ingresosData) {
      if (setReferencias.has(ingreso.Referencia)) {
        ingresosActualizar.push(ingreso);
      } else {
        ingresosNuevos.push(ingreso);
      }
    }
    
    console.log(`📊 Nuevos: ${ingresosNuevos.length}, A actualizar: ${ingresosActualizar.length}`);
    
    // Insertar nuevos en lotes
    const BATCH_SIZE = 100;
    if (ingresosNuevos.length > 0) {
      for (let i = 0; i < ingresosNuevos.length; i += BATCH_SIZE) {
        const lote = ingresosNuevos.slice(i, i + BATCH_SIZE);
        try {
          await Ingreso.insertMany(lote, { ordered: false });
          stats.nuevos += lote.length;
          console.log(`✅ Lote insertado: ${stats.nuevos}/${ingresosNuevos.length}`);
        } catch (error) {
          if (error.code === 11000) {
            for (const ingreso of lote) {
              try {
                await Ingreso.create(ingreso);
                stats.nuevos++;
              } catch (singleError) {
                stats.errores++;
              }
            }
          } else {
            console.error('Error en lote:', error);
            stats.errores += lote.length;
          }
        }
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
        stats.actualizados++;
      } catch (error) {
        console.warn(`Error actualizando ingreso ${ingreso.Referencia}:`, error.message);
        stats.errores++;
      }
    }
    
    console.log(`✅ Importación de ingresos completada:`, stats);
  } catch (error) {
    console.error('❌ Error importando ingresos:', error);
    throw error;
  }
  
  return stats;
}

/**
 * Analizar y calcular estados de asistencia en memoria
 */
async function calcularEstadosAsistencia(citasData, ingresosData, diasTolerancia = 5) {
  console.log('🔍 Calculando estados de asistencia...');
  
  const estadisticas = {
    procesadas: 0,
    conAsistencia: 0,
    sinAsistencia: 0
  };
  
  // Crear mapa de ingresos por matrícula para lookup rápido
  const ingresosMap = new Map();
  ingresosData.forEach(ingreso => {
    const matricula = ingreso['Matrícula vehí'];
    if (matricula) {
      if (!ingresosMap.has(matricula)) {
        ingresosMap.set(matricula, []);
      }
      ingresosMap.get(matricula).push(ingreso);
    }
  });
  
  console.log(`📊 Mapa de ingresos: ${ingresosMap.size} matrículas únicas`);
  
  // Procesar cada cita
  for (const cita of citasData) {
    estadisticas.procesadas++;
    
    let estadoAsistencia = 'No asistió';
    let ingresoReferencia = null;
    let fechaIngreso = null;
    
    // Verificar asistencia
    if (cita.Matricula && ingresosMap.has(cita.Matricula)) {
      const fechaCita = cita['Fecha ci'];
      
      if (fechaCita) {
        const fechaCitaObj = fechaCita instanceof Date ? fechaCita : new Date(fechaCita);
        
        if (!isNaN(fechaCitaObj.getTime())) {
          const fechaLimite = new Date(fechaCitaObj);
          fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
          
          // Buscar ingreso dentro del rango
          const ingresosCita = ingresosMap.get(cita.Matricula);
          const ingresoEncontrado = ingresosCita.find(ingreso => {
            const fechaIngresoObj = ingreso.Fecaper instanceof Date ? ingreso.Fecaper : new Date(ingreso.Fecaper);
            return !isNaN(fechaIngresoObj.getTime()) && 
                   fechaIngresoObj >= fechaCitaObj && 
                   fechaIngresoObj <= fechaLimite;
          });
          
          if (ingresoEncontrado) {
            estadoAsistencia = 'Asistió';
            ingresoReferencia = ingresoEncontrado.Referencia;
            fechaIngreso = ingresoEncontrado.Fecaper;
            estadisticas.conAsistencia++;
          } else {
            estadisticas.sinAsistencia++;
          }
        } else {
          estadisticas.sinAsistencia++;
        }
      } else {
        estadisticas.sinAsistencia++;
      }
    } else {
      estadisticas.sinAsistencia++;
    }
    
    // Agregar campos calculados
    cita.EstadoAsistencia = estadoAsistencia;
    cita.IngresoReferencia = ingresoReferencia;
    cita.FechaIngreso = fechaIngreso;
    cita.FechaCalculo = new Date();
  }
  
  console.log(`✅ Estados calculados:`, estadisticas);
  console.log(`   - Con asistencia: ${estadisticas.conAsistencia} (${(estadisticas.conAsistencia / estadisticas.procesadas * 100).toFixed(1)}%)`);
  console.log(`   - Sin asistencia: ${estadisticas.sinAsistencia} (${(estadisticas.sinAsistencia / estadisticas.procesadas * 100).toFixed(1)}%)`);
  
  return estadisticas;
}

// Variable global para el progreso de importación
let importProgress = {
  isRunning: false,
  currentStep: '',
  progress: 0,
  totalSteps: 6,
  details: '',
  startTime: null,
  estimatedTime: null
};

/**
 * Actualizar progreso de importación
 */
function updateProgress(step, progress, details = '') {
  importProgress.currentStep = step;
  importProgress.progress = progress;
  importProgress.details = details;
  
  const elapsed = importProgress.startTime ? Date.now() - importProgress.startTime : 0;
  const remaining = progress > 0 ? (elapsed / progress * 100) - elapsed : 0;
  importProgress.estimatedTime = Math.max(0, remaining);
  
  console.log(`📊 [${progress}/${importProgress.totalSteps}] ${step}: ${details}`);
}

/**
 * Ejecuta la importación completa de ambos archivos con análisis de asistencia (OPTIMIZADO)
 */
export async function executeImport(citasPath, ingresosPath) {
  const startTime = Date.now();
  importProgress.isRunning = true;
  importProgress.startTime = startTime;
  importProgress.progress = 0;
  
  const resultado = {
    timestamp: new Date(),
    status: 'in_progress',
    citas: null,
    ingresos: null,
    asistencia: null,
    error: null,
    duration: null,
    progress: importProgress
  };
  
  try {
    console.log('🚀 ========================================');
    console.log('🚀 INICIANDO IMPORTACIÓN OPTIMIZADA');
    console.log('🚀 ========================================');
    updateProgress('Iniciando', 1, 'Preparando importación...');
    
    // Obtener configuración de días de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 5;
    console.log(`📅 Días de tolerancia configurados: ${diasTolerancia}`);
    updateProgress('Configuración', 1, `Días de tolerancia: ${diasTolerancia}`);
    
    // PASO 1: Leer archivos Excel (sin importar aún)
    updateProgress('Leyendo archivos', 2, 'Accediendo a archivos Excel...');
    let citasData = [];
    let ingresosData = [];
    
    if (citasPath && fs.existsSync(citasPath)) {
      console.log(`📖 Leyendo archivo de citas: ${citasPath}`);
      citasData = readExcelFile(citasPath);
      console.log(`✅ ${citasData.length} citas leídas del Excel`);
      updateProgress('Leyendo archivos', 2, `✅ ${citasData.length} citas leídas`);
    } else {
      console.log('⚠️ Archivo de citas no encontrado:', citasPath);
      updateProgress('Leyendo archivos', 2, '⚠️ Archivo de citas no encontrado');
    }
    
    if (ingresosPath && fs.existsSync(ingresosPath)) {
      console.log(`📖 Leyendo archivo de ingresos: ${ingresosPath}`);
      ingresosData = readExcelFile(ingresosPath);
      console.log(`✅ ${ingresosData.length} ingresos leídos del Excel`);
      updateProgress('Leyendo archivos', 2, `✅ ${ingresosData.length} ingresos leídos`);
    } else {
      console.log('⚠️ Archivo de ingresos no encontrado:', ingresosPath);
      updateProgress('Leyendo archivos', 2, '⚠️ Archivo de ingresos no encontrado');
    }
    
    if (citasData.length === 0 && ingresosData.length === 0) {
      throw new Error('No se encontraron archivos válidos para importar');
    }
    
    // PASO 2: Procesar fechas y limpiar datos
    updateProgress('Procesando datos', 3, 'Limpiando y procesando fechas...');
    console.log('🧹 Procesando y limpiando datos...');
    
    console.log('📋 Procesando citas...');
    citasData = citasData.map((cita, index) => {
      if (index % 1000 === 0) {
        console.log(`   Procesando cita ${index + 1}/${citasData.length}...`);
      }
      const citaLimpia = cleanObjectFields(cita);
      return processDates(citaLimpia, 'citas');
    });
    console.log(`✅ ${citasData.length} citas procesadas`);
    
    console.log('💰 Procesando ingresos...');
    ingresosData = ingresosData.map((ingreso, index) => {
      if (index % 1000 === 0) {
        console.log(`   Procesando ingreso ${index + 1}/${ingresosData.length}...`);
      }
      const ingresoLimpio = cleanObjectFields(ingreso);
      return processDates(ingresoLimpio, 'ingresos');
    });
    console.log(`✅ ${ingresosData.length} ingresos procesados`);
    
    updateProgress('Procesando datos', 3, `✅ ${citasData.length} citas y ${ingresosData.length} ingresos procesados`);
    
    // PASO 3: Calcular estados de asistencia ANTES de importar
    updateProgress('Calculando asistencia', 4, 'Analizando estados de asistencia...');
    let estadisticasAsistencia = null;
    if (citasData.length > 0 && ingresosData.length > 0) {
      console.log('🔍 Iniciando cálculo de estados de asistencia...');
      estadisticasAsistencia = await calcularEstadosAsistencia(citasData, ingresosData, diasTolerancia);
      resultado.asistencia = estadisticasAsistencia;
      console.log('✅ Estados de asistencia calculados exitosamente');
      updateProgress('Calculando asistencia', 4, `✅ ${estadisticasAsistencia.conAsistencia} asistieron, ${estadisticasAsistencia.sinAsistencia} no asistieron`);
    } else {
      updateProgress('Calculando asistencia', 4, '⚠️ Sin datos suficientes para calcular asistencia');
    }
    
    // PASO 4: Importar en paralelo con estados pre-calculados
    updateProgress('Importando a MongoDB', 5, 'Guardando datos en la base de datos...');
    const promises = [];
    
    if (citasData.length > 0) {
      console.log('📋 Programando importación de citas con estados calculados...');
      promises.push(
        importCitasConEstados(citasData).then(stats => ({ type: 'citas', stats }))
      );
    }
    
    if (ingresosData.length > 0) {
      console.log('💰 Programando importación de ingresos...');
      promises.push(
        importIngresosConEstados(ingresosData).then(stats => ({ type: 'ingresos', stats }))
      );
    }
    
    // Ejecutar importaciones en paralelo
    console.log(`⚡ Ejecutando ${promises.length} importación(es) en paralelo...`);
    const results = await Promise.all(promises);
    
    // Procesar resultados
    for (const result of results) {
      if (result.type === 'citas') {
        resultado.citas = result.stats;
        console.log(`✅ Importación de citas: ${result.stats.nuevos} nuevos, ${result.stats.actualizados} actualizados`);
      } else if (result.type === 'ingresos') {
        resultado.ingresos = result.stats;
        console.log(`✅ Importación de ingresos: ${result.stats.nuevos} nuevos, ${result.stats.actualizados} actualizados`);
      }
    }
    
    updateProgress('Finalizando', 6, 'Completando importación...');
    resultado.status = 'success';
    resultado.duration = Date.now() - startTime;
    importProgress.isRunning = false;
    
    console.log('🚀 ========================================');
    console.log('✅ IMPORTACIÓN COMPLETADA EXITOSAMENTE');
    console.log('🚀 ========================================');
    console.log(`⏱️ Duración total: ${(resultado.duration / 1000).toFixed(2)} segundos`);
    console.log('📊 Resumen final:', {
      citas: resultado.citas,
      ingresos: resultado.ingresos,
      asistencia: resultado.asistencia,
      duracion: `${(resultado.duration / 1000).toFixed(2)}s`
    });
    
    updateProgress('Completado', 6, `✅ Importación exitosa en ${(resultado.duration / 1000).toFixed(2)}s`);
    
    // Actualizar configuración con resultado
    console.log('💾 Guardando registro de última actualización...');
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          'lastImport.timestamp': resultado.timestamp,
          'lastImport.status': 'success',
          'lastImport.duration': resultado.duration,
          'lastImport.summary': {
            citasNuevas: resultado.citas?.nuevos || 0,
            citasActualizadas: resultado.citas?.actualizados || 0,
            ingresosNuevos: resultado.ingresos?.nuevos || 0,
            ingresosActualizados: resultado.ingresos?.actualizados || 0,
            totalRegistros: (resultado.citas?.nuevos || 0) + (resultado.citas?.actualizados || 0) + 
                           (resultado.ingresos?.nuevos || 0) + (resultado.ingresos?.actualizados || 0),
            asistenciaCalculada: resultado.asistencia ? {
              procesadas: resultado.asistencia.procesadas,
              conAsistencia: resultado.asistencia.conAsistencia,
              sinAsistencia: resultado.asistencia.sinAsistencia
            } : null
          },
          'lastSuccessfulImport': {
            timestamp: resultado.timestamp,
            duration: resultado.duration,
            citas: resultado.citas,
            ingresos: resultado.ingresos,
            asistencia: resultado.asistencia
          }
        }
      },
      { upsert: true }
    );
    console.log('✅ Registro de última actualización guardado');
    
  } catch (error) {
    console.log('🚀 ========================================');
    console.log('❌ ERROR EN IMPORTACIÓN');
    console.log('🚀 ========================================');
    console.error('💥 Error:', error.message);
    console.error('📍 Stack:', error.stack);
    
    resultado.status = 'error';
    resultado.error = error.message;
    resultado.duration = Date.now() - startTime;
    importProgress.isRunning = false;
    updateProgress('Error', 0, `❌ Error: ${error.message}`);
    
    console.error('❌ Error en importación:', error);
    
    // Actualizar configuración con error
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          'lastImport.timestamp': resultado.timestamp,
          'lastImport.status': 'error',
          'lastImport.error': error.message,
          'lastImport.duration': resultado.duration
        }
      },
      { upsert: true }
    );
  }
  
  return resultado;
}

/**
 * Obtiene el estado de la última importación
 */
export async function getImportStatus() {
  const config = await Configuracion.findOne({ singleton: true });
  
  if (!config || !config.lastImport) {
    return {
      lastImport: null,
      message: 'No se ha ejecutado ninguna importación'
    };
  }
  
  return {
    lastImport: config.lastImport,
    filePaths: config.filePaths
  };
}

/**
 * Obtiene el progreso actual de la importación
 */
export function getImportProgress() {
  return {
    ...importProgress,
    elapsedTime: importProgress.startTime ? Date.now() - importProgress.startTime : 0,
    percentage: Math.round((importProgress.progress / importProgress.totalSteps) * 100)
  };
}

/**
 * Obtiene el registro de la última importación exitosa
 */
export async function getLastSuccessfulImport() {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    return config?.lastSuccessfulImport || null;
  } catch (error) {
    console.error('Error obteniendo última importación exitosa:', error);
    return null;
  }
}


