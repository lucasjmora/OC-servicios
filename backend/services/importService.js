import xlsx from 'xlsx';
import fs from 'fs';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import { cleanObjectFields } from '../utils/fieldCleaner.js';
import { sincronizarBoletos } from './boletosService.js';
import { procesarVentas } from './ventasService.js';

// Buffer para almacenar logs recientes
const logBuffer = [];
const MAX_LOG_BUFFER = 500; // Máximo de líneas de log a mantener

// Interceptar console.log para capturar logs
const originalConsoleLog = console.log;
console.log = (...args) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
  };
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift(); // Eliminar el más antiguo
  }
  originalConsoleLog.apply(console, args);
};

// Función para obtener logs recientes
export function getRecentLogs(filter = null, limit = 100) {
  let logs = logBuffer;
  if (filter) {
    logs = logBuffer.filter(log => 
      log.message.toLowerCase().includes(filter.toLowerCase())
    );
  }
  return logs.slice(-limit);
}

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
    
    // Verificar si es archivo de ingresos o citas basándose en los campos
    // El campo de matrícula puede tener diferentes nombres: 'Matrícula vehí', 'Matrícula ve', 'PATENTE', etc.
    const isIngresos = data[0].hasOwnProperty('Fecaper') || 
                       data[0].hasOwnProperty('Matrícula vehí') || 
                       data[0].hasOwnProperty('Matrícula ve') ||
                       data[0].hasOwnProperty('Matricula vehí') ||
                       data[0].hasOwnProperty('Matricula ve') ||
                       data[0].hasOwnProperty('PATENTE') ||
                       data[0].hasOwnProperty('Patente') ||
                       data[0].hasOwnProperty('patente');
    const isCitas = data[0].hasOwnProperty('Fecha ci') || data[0].hasOwnProperty('Fecha cr');
    
    if (isIngresos) {
      console.log('📋 Archivo de INGRESOS detectado');
      // Mostrar campos relacionados con matrícula/patente disponibles en el Excel
      const camposMatricula = Object.keys(data[0] || {}).filter(k => 
        k.toLowerCase().includes('matrícula') || 
        k.toLowerCase().includes('matricula') || 
        k.toLowerCase().includes('patente')
      );
      console.log('Campos relacionados con matrícula/patente encontrados:', camposMatricula);
      
      console.log('Campos de ejemplo (primeras 10 filas):');
      data.slice(0, 10).forEach((row, index) => {
        // Buscar matrícula en diferentes variantes del nombre del campo
        const matricula = row['Matrícula vehí'] || row['Matricula vehí'] || row['Matrícula veh'] || 
                         row['Matrícula ve'] || row['Matricula ve'] || row['PATENTE'] || 
                         row['Patente'] || row['patente'] || row['Matrícula'] || row['Matricula'] || '';
        console.log(`  Fila ${index + 1}: Referencia=${row.Referencia}, Matrícula="${matricula}", Fecaper=${row.Fecaper}`);
      });
      
      // Contar filas con y sin matrícula
      const conMatricula = data.filter(row => {
        const mat = row['Matrícula vehí'] || row['Matricula vehí'] || row['Matrícula veh'] || 
                   row['Matrícula ve'] || row['Matricula ve'] || row['PATENTE'] || 
                   row['Patente'] || row['patente'] || row['Matrícula'] || row['Matricula'] || '';
        return mat && mat.toString().trim() !== '';
      }).length;
      console.log(`📊 Estadísticas: ${conMatricula} filas CON matrícula, ${data.length - conMatricula} filas SIN matrícula`);
    } else if (isCitas) {
      console.log('📋 Archivo de CITAS detectado');
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
    : ['Fecaper', 'F cierr', 'FEC OBS ', 'FMatric'];
  
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
 * Normaliza un valor para comparación (convierte tipos compatibles)
 * Maneja fechas, números, strings y valores nulos
 * CRÍTICO: Debe manejar fechas en cualquier formato (Date, ISO string, timestamp)
 * IMPORTANTE: Las fechas se normalizan a fecha local (solo año, mes, día) para ignorar diferencias de zona horaria
 */
function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return null;
  
  // Si es una fecha (Date object)
  if (value instanceof Date) {
    // Validar que sea una fecha razonable
    // Permitir 1899 (común en Excel para representar solo horas) y años entre 1900-2100
    const year = value.getFullYear();
    if ((year === 1899 || (year > 1900 && year < 2100)) && !isNaN(value.getTime())) {
      // Para fechas de 1899 (solo horas), normalizar a hora y minutos (HH:MM) ignorando segundos
      // Para otras fechas, normalizar a fecha local (solo año, mes, día)
      if (year === 1899) {
        const hours = value.getHours();
        const minutes = value.getMinutes();
        // Ignorar segundos para evitar diferencias por zona horaria
        return `1899-00-00 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      } else {
        const month = value.getMonth();
        const day = value.getDate();
        // Retornar como string YYYY-MM-DD para comparación consistente
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  }
  
  // Si es string, intentar parsear como fecha primero
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    
    // Intentar parsear como fecha ISO (formato MongoDB común)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        // Permitir 1899 (común en Excel para representar solo horas) y años entre 1900-2100
        if (year === 1899 || (year > 1900 && year < 2100)) {
          // Para fechas de 1899 (solo horas), normalizar a hora y minutos (HH:MM) ignorando segundos
          if (year === 1899) {
            const hours = date.getHours();
            const minutes = date.getMinutes();
            // Ignorar segundos para evitar diferencias por zona horaria
            return `1899-00-00 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          } else {
            // Normalizar a fecha local (solo año, mes, día)
            const month = date.getMonth();
            const day = date.getDate();
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }
      }
    }
    
    // Intentar parsear como fecha en formato de JavaScript Date.toString()
    // Ejemplo: "Wed Nov 19 2025 00:00:48 GMT-0300 (Argentina Standard Time)"
    // Solo intentar si el string tiene características de fecha (GMT, días de semana, meses, etc.)
    if (trimmed.includes('GMT') || 
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(trimmed) ||
        (/\d{4}/.test(trimmed) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(trimmed))) {
      // Para strings con formato Date.toString() que contienen año 1899, extraer hora directamente del string
      // Ejemplo: "Sat Dec 30 1899 08:26:00 GMT-0416 (Argentina Standard Time)"
      // Extraer directamente HH:MM del string para evitar problemas de conversión de zona horaria
      if (trimmed.includes('1899') && /\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        const timeMatch = trimmed.match(/(\d{2}):(\d{2}):\d{2}/);
        if (timeMatch) {
          const hours = timeMatch[1];
          const minutes = timeMatch[2];
          return `1899-00-00 ${hours}:${minutes}`;
        }
      }
      
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        // Permitir 1899 (común en Excel para representar solo horas) y años entre 1900-2100
        if (year === 1899 || (year > 1900 && year < 2100)) {
          // Para fechas de 1899 (solo horas), normalizar a hora y minutos (HH:MM) ignorando segundos
          if (year === 1899) {
            const hours = date.getHours();
            const minutes = date.getMinutes();
            // Ignorar segundos para evitar diferencias por zona horaria
            return `1899-00-00 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          } else {
            // Normalizar a fecha local (solo año, mes, día)
            const month = date.getMonth();
            const day = date.getDate();
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }
      }
    }
    
    // Intentar parsear como fecha (varios formatos)
    const dateFormats = [
      /^\d{4}-\d{2}-\d{2}/,  // YYYY-MM-DD
      /^\d{1,2}\/\d{1,2}\/\d{4}/,  // DD/MM/YYYY o MM/DD/YYYY
      /^\d{2}\/\d{2}\/\d{4}/  // DD/MM/YYYY
    ];
    
    for (const format of dateFormats) {
      if (format.test(trimmed)) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          // Permitir 1899 (común en Excel para representar solo horas) y años entre 1900-2100
          if (year === 1899 || (year > 1900 && year < 2100)) {
            // Para fechas de 1899 (solo horas), normalizar a hora completa (HH:MM:SS)
            if (year === 1899) {
              const hours = date.getHours();
              const minutes = date.getMinutes();
              const seconds = date.getSeconds();
              return `1899-00-00 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } else {
              // Normalizar a fecha local (solo año, mes, día)
              const month = date.getMonth();
              const day = date.getDate();
              return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
        }
      }
    }
    
    // NO convertir strings numéricos a números automáticamente
    // Esto puede causar problemas de comparación cuando un valor viene como string
    // y el otro como número desde MongoDB
    // En su lugar, mantener como string y comparar después
    
    // Si no es fecha, devolver el string tal cual
    return trimmed;
  }
  
  // Si es número, convertirlo a string para comparación consistente
  // Esto evita problemas cuando un valor viene como número de MongoDB
  // y el otro como string del Excel
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    // Convertir a string para comparación consistente con valores del Excel
    // Pero preservar la precisión para números decimales
    return value.toString();
  }
  
  // Para booleanos, mantener como están
  if (typeof value === 'boolean') {
    return value;
  }
  
  return value;
}

/**
 * Compara dos valores normalizados
 * IMPORTANTE: Ambos valores ya deberían estar normalizados como strings (excepto fechas y booleanos)
 * para comparación consistente
 */
function compareValues(normalizedOld, normalizedNew) {
  // Si ambos son null/undefined, son iguales
  if (normalizedOld === null && normalizedNew === null) {
    return true;
  }
  
  // Si uno es null y el otro no, son diferentes
  if (normalizedOld === null || normalizedNew === null) {
    return false;
  }
  
  // Si ambos son strings, comparar directamente (ya normalizados)
  if (typeof normalizedOld === 'string' && typeof normalizedNew === 'string') {
    // Normalizar espacios en blanco y comparar
    const oldTrimmed = normalizedOld.trim();
    const newTrimmed = normalizedNew.trim();
    // Comparación case-insensitive para strings
    return oldTrimmed === newTrimmed || oldTrimmed.toLowerCase() === newTrimmed.toLowerCase();
  }
  
  // Si ambos son números (caso especial para campos numéricos que no se convirtieron a string)
  if (typeof normalizedOld === 'number' && typeof normalizedNew === 'number') {
    return Math.abs(normalizedOld - normalizedNew) <= 0.0001;
  }
  
  // Si uno es número y el otro es string numérico, convertir string a número y comparar
  if (typeof normalizedOld === 'number' && typeof normalizedNew === 'string') {
    const numNew = parseFloat(normalizedNew);
    if (!isNaN(numNew) && normalizedNew.trim() !== '') {
      return Math.abs(normalizedOld - numNew) <= 0.0001;
    }
    return false; // String no numérico vs número = diferentes
  }
  if (typeof normalizedOld === 'string' && typeof normalizedNew === 'number') {
    const numOld = parseFloat(normalizedOld);
    if (!isNaN(numOld) && normalizedOld.trim() !== '') {
      return Math.abs(numOld - normalizedNew) <= 0.0001;
    }
    return false; // String no numérico vs número = diferentes
  }
  
  // Comparar booleanos
  if (typeof normalizedOld === 'boolean' && typeof normalizedNew === 'boolean') {
    return normalizedOld === normalizedNew;
  }
  
  // Si los tipos son diferentes después de intentar conversión, son diferentes
  if (typeof normalizedOld !== typeof normalizedNew) {
    return false;
  }
  
  // Para otros tipos, comparación estricta
  return normalizedOld === normalizedNew;
}

// Contador para logging de debugging
let debugChangeCount = 0;
const MAX_DEBUG_LOGS = 10;

/**
 * Normaliza una referencia a string para comparación consistente
 * Maneja números, strings y valores nulos
 * ROBUSTO: Convierte números a string sin notación científica
 * CRÍTICO: Debe manejar todos los formatos posibles (número, string, null, undefined)
 */
function normalizeReferencia(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  
  // Si es número, convertir a string sin notación científica
  if (typeof ref === 'number') {
    // Para números enteros, usar String() directamente (evita notación científica)
    if (Number.isInteger(ref)) {
      return String(ref);
    } else {
      // Si tiene decimales, convertir normalmente pero sin notación científica
      const str = String(ref);
      // Si contiene 'e' o 'E', es notación científica, convertir manualmente
      if (str.includes('e') || str.includes('E')) {
        // Para números grandes con decimales, usar toFixed con suficientes decimales
        return ref.toFixed(20).replace(/\.?0+$/, ''); // Eliminar ceros finales
      }
      return str.trim();
    }
  }
  
  // Si es string, eliminar espacios y normalizar
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    
    // Si el string es numérico, normalizarlo para comparación consistente
    // Intentar convertir a número y luego a string para eliminar ceros a la izquierda
    const numMatch = trimmed.match(/^-?\d+(\.\d+)?$/);
    if (numMatch) {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        // Para números enteros, devolver sin decimales
        if (Number.isInteger(num)) {
          return String(num);
        }
        // Para números con decimales, devolver normalizado
        return String(num);
      }
    }
    
    // Si no es numérico, devolver el string trimmed
    return trimmed;
  }
  
  // Para otros tipos (Boolean, Object, etc.), convertir a string
  try {
    return String(ref).trim();
  } catch (e) {
    console.warn(`Error normalizando referencia:`, ref, e);
    return null;
  }
}

/**
 * Compara dos objetos y retorna true si son diferentes
 * Optimizado para comparar documentos .lean() con datos del Excel
 * SOLO compara campos que vienen del Excel, ignora campos calculados
 */
function hasChanges(oldDoc, newData, debugRef = null) {
  if (!oldDoc || !newData) return true;
  
  // Campos que NO deben compararse (campos calculados, timestamps, etc.)
  const excludedFields = new Set([
    '_id', 
    'createdAt', 
    'updatedAt', 
    '__v',
    'EstadoAsistencia',  // Campo calculado
    'IngresoReferencia', // Campo calculado
    'FechaIngreso',      // Campo calculado
    'FechaCalculo'       // Campo calculado
  ]);
  
  // Obtener solo los campos que vienen del Excel (los que están en newData)
  const relevantFields = Object.keys(newData).filter(key => !excludedFields.has(key));
  
  // Si no hay campos relevantes, no hay cambios
  if (relevantFields.length === 0) {
    return false;
  }
  
  // Comparar cada campo
  for (const field of relevantFields) {
    const oldValue = oldDoc[field];
    const newValue = newData[field];
    
    // Si ambos valores son undefined/null/vacío, considerarlos iguales
    const oldIsEmpty = oldValue === null || oldValue === undefined || oldValue === '';
    const newIsEmpty = newValue === null || newValue === undefined || newValue === '';
    
    // Caso especial: si el campo es matrícula y el nuevo valor tiene contenido pero el viejo está vacío, hay cambio
    if (field === 'Matrícula vehí' && oldIsEmpty && !newIsEmpty) {
      // Log para debugging
      if (debugRef) {
        console.log(`🔍 Cambio detectado en matrícula para ${debugRef}: vacío -> "${newValue}"`);
      }
      return true; // Hay cambio: de vacío a con valor
    }
    
    if (oldIsEmpty && newIsEmpty) {
      continue; // Ambos vacíos, no hay cambio
    }
    
    // Normalizar valores para comparación
    const normalizedOld = normalizeValue(oldValue);
    const normalizedNew = normalizeValue(newValue);
    
    // Comparar valores normalizados
    if (!compareValues(normalizedOld, normalizedNew)) {
      // Logging para debugging (solo los primeros casos)
      if (debugRef && debugChangeCount < MAX_DEBUG_LOGS) {
        debugChangeCount++;
        console.log(`🔍 [${debugChangeCount}/${MAX_DEBUG_LOGS}] Cambio detectado en ${debugRef}, campo "${field}":`, {
          oldValue: oldValue,
          newValue: newValue,
          normalizedOld: normalizedOld,
          normalizedNew: normalizedNew,
          oldType: typeof oldValue,
          newType: typeof newValue,
          oldIsDate: oldValue instanceof Date,
          newIsDate: newValue instanceof Date
        });
      }
      return true;
    }
  }
  
  return false;
}

/** Máx. filas de detalle por colección (evita documentos Mongo enormes). */
const MAX_DETALLE_POR_COLECCION = 100;

function serializeForLog(val) {
  if (val === null || val === undefined) return '(vacío)';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && !Array.isArray(val)) {
    try {
      const s = JSON.stringify(val);
      return s.length > 280 ? `${s.slice(0, 280)}…` : s;
    } catch {
      return String(val);
    }
  }
  if (Array.isArray(val)) {
    const s = JSON.stringify(val);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  }
  const str = String(val);
  return str.length > 400 ? `${str.slice(0, 400)}…` : str;
}

/**
 * Lista todos los campos que difieren entre el documento en BD y el Excel (misma lógica que hasChanges).
 */
function getFieldChanges(oldDoc, newData) {
  const cambios = [];
  if (!oldDoc || !newData) return cambios;

  const excludedFields = new Set([
    '_id',
    'createdAt',
    'updatedAt',
    '__v',
    'EstadoAsistencia',
    'IngresoReferencia',
    'FechaIngreso',
    'FechaCalculo'
  ]);

  const relevantFields = Object.keys(newData).filter(key => !excludedFields.has(key));
  if (relevantFields.length === 0) return cambios;

  for (const field of relevantFields) {
    const oldValue = oldDoc[field];
    const newValue = newData[field];
    const oldIsEmpty = oldValue === null || oldValue === undefined || oldValue === '';
    const newIsEmpty = newValue === null || newValue === undefined || newValue === '';

    if (field === 'Matrícula vehí' && oldIsEmpty && !newIsEmpty) {
      cambios.push({ campo: field, anterior: serializeForLog(oldValue), nuevo: serializeForLog(newValue) });
      continue;
    }
    if (oldIsEmpty && newIsEmpty) continue;

    const normalizedOld = normalizeValue(oldValue);
    const normalizedNew = normalizeValue(newValue);
    if (!compareValues(normalizedOld, normalizedNew)) {
      cambios.push({ campo: field, anterior: serializeForLog(oldValue), nuevo: serializeForLog(newValue) });
    }
  }
  return cambios;
}

function snapshotResumenDoc(doc, maxKeys = 10) {
  if (!doc || typeof doc !== 'object') return {};
  const excluded = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
  const out = {};
  let n = 0;
  for (const k of Object.keys(doc)) {
    if (excluded.has(k)) continue;
    out[k] = serializeForLog(doc[k]);
    n++;
    if (n >= maxKeys) break;
  }
  return out;
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
    // Normalizar referencias a string para comparación consistente
    const existingMap = new Set(existingRefs.map(doc => normalizeReferencia(doc.Referencia)));
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
          
          // Normalizar referencia para comparación
          const refNormalizada = normalizeReferencia(processedRow.Referencia);
          
          if (existingMap.has(refNormalizada)) {
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
    // Normalizar referencias a string para comparación consistente
    const existingMap = new Set(existingRefs.map(doc => normalizeReferencia(doc.Referencia)));
    console.log(`🔍 Referencias existentes encontradas: ${existingMap.size}`);
    
    // Procesar en lotes para mejor rendimiento
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      console.log(`⚡ Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(data.length/BATCH_SIZE)} (${batch.length} registros)`);
      
      const operations = [];
      const updates = [];
      
      for (const row of batch) {
        try {
          // IMPORTANTE: Mapear campo de matrícula ANTES de limpiar campos
          // El Excel puede tener diferentes nombres: 'Matrícula ve', 'PATENTE', 'Patente', etc.
          // Necesitamos 'Matrícula vehí' en la BD
          const posiblesNombresMatricula = [
            'Matrícula ve',
            'Matricula ve',
            'Matrícula veh',
            'Matricula veh',
            'Matrícula vehí',
            'Matricula vehí',
            'PATENTE',
            'Patente',
            'patente',
            'Matrícula',
            'Matricula',
            'Matrícula vehículo',
            'Matricula vehiculo'
          ];
          
          // Buscar el campo de matrícula en cualquiera de sus variantes (en el row original)
          let matriculaEncontrada = null;
          let nombreCampoEncontrado = null;
          
          // Log para debugging: mostrar todos los campos del row para las primeras 3 filas
          if (batch.indexOf(row) < 3 && row.Referencia) {
            const todosLosCampos = Object.keys(row);
            const camposMatricula = todosLosCampos.filter(k => 
              k.toLowerCase().includes('matrícula') || 
              k.toLowerCase().includes('matricula') || 
              k.toLowerCase().includes('patente')
            );
            console.log(`🔍 DEBUG Row ${row.Referencia}: Campos relacionados con matrícula:`, camposMatricula);
            camposMatricula.forEach(campo => {
              console.log(`   - ${campo}: "${row[campo]}" (tipo: ${typeof row[campo]}, hasOwnProperty: ${row.hasOwnProperty(campo)})`);
            });
          }
          
          for (const nombreCampo of posiblesNombresMatricula) {
            // Verificar si el campo existe y tiene valor
            if (row.hasOwnProperty(nombreCampo) && row[nombreCampo] != null && row[nombreCampo] !== undefined) {
              const valorMatricula = row[nombreCampo].toString().trim();
              if (valorMatricula !== '') {
                matriculaEncontrada = valorMatricula;
                nombreCampoEncontrado = nombreCampo;
                console.log(`🔍 Campo de matrícula encontrado: "${nombreCampo}" = "${matriculaEncontrada}" para Referencia ${row.Referencia}`);
                break;
              }
            }
          }
          
          // Si no encontramos matrícula, log para debugging (solo para las primeras 10 filas)
          if (!matriculaEncontrada && row.Referencia && batch.indexOf(row) < 10) {
            const camposDisponibles = Object.keys(row).filter(k => 
              k.toLowerCase().includes('matrícula') || 
              k.toLowerCase().includes('matricula') || 
              k.toLowerCase().includes('patente')
            );
            if (camposDisponibles.length > 0) {
              console.log(`⚠️ No se encontró matrícula para ${row.Referencia}. Campos disponibles:`, camposDisponibles);
              camposDisponibles.forEach(campo => {
                console.log(`   - ${campo}: "${row[campo]}" (tipo: ${typeof row[campo]})`);
              });
            }
          }
          
          // Si encontramos una matrícula, asignarla a 'Matrícula vehí' en el row antes de limpiar
          if (matriculaEncontrada) {
            row['Matrícula vehí'] = matriculaEncontrada;
            // Eliminar el campo original si es diferente para evitar duplicados
            if (nombreCampoEncontrado !== 'Matrícula vehí') {
              delete row[nombreCampoEncontrado];
            }
            console.log(`✅ Matrícula mapeada desde "${nombreCampoEncontrado}" a "Matrícula vehí" para ${row.Referencia}: "${matriculaEncontrada}"`);
          }
          
          // Limpiar campos según convención (después del mapeo)
          const cleanedRow = cleanObjectFields(row);
          
          if (!cleanedRow.Referencia) {
            stats.errores++;
            continue;
          }
          
          // Verificar que la matrícula siga presente después de cleanObjectFields
          if (matriculaEncontrada && !cleanedRow['Matrícula vehí']) {
            console.warn(`⚠️ Matrícula perdida después de cleanObjectFields para ${cleanedRow.Referencia}. Restaurando...`);
            cleanedRow['Matrícula vehí'] = matriculaEncontrada;
          }
          
          // Log para debugging: verificar si el mapeo funcionó
          if (cleanedRow.Referencia && (cleanedRow['Matrícula ve'] || cleanedRow['Matricula ve']) && !cleanedRow['Matrícula vehí']) {
            console.warn(`⚠️ Matrícula no mapeada para Referencia ${cleanedRow.Referencia}. Campos disponibles:`, Object.keys(cleanedRow).filter(k => k.toLowerCase().includes('matrícula') || k.toLowerCase().includes('matricula')));
          }
          
          // Log para debugging: verificar si la matrícula está presente después del mapeo
          if (cleanedRow.Referencia && cleanedRow['Matrícula vehí']) {
            console.log(`✅ Matrícula mapeada para ${cleanedRow.Referencia}: "${cleanedRow['Matrícula vehí']}"`);
          }
        
          // Procesar fechas de Excel
          const processedRow = processDates(cleanedRow, 'ingresos');
          
          // Verificar que la matrícula siga presente después de processDates
          if (processedRow.Referencia && cleanedRow['Matrícula vehí'] && !processedRow['Matrícula vehí']) {
            console.warn(`⚠️ Matrícula perdida después de processDates para ${processedRow.Referencia}. Restaurando...`);
            processedRow['Matrícula vehí'] = cleanedRow['Matrícula vehí'];
          }
          
          // Normalizar referencia para comparación
          const refNormalizada = normalizeReferencia(processedRow.Referencia);
          
          if (existingMap.has(refNormalizada)) {
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
      
      // Actualizar existentes solo si hay cambios (OPTIMIZADO: carga en memoria y usa bulkWrite)
      if (updates.length > 0) {
        console.log(`🔄 Verificando cambios en ${updates.length} ingresos existentes...`);
        
        // Reiniciar contador de debug
        debugChangeCount = 0;
        
        // Cargar todos los registros existentes de una vez
        // Normalizar referencias antes de la consulta para asegurar consistencia
        const referenciasActualizar = updates.map(u => normalizeReferencia(u.referencia));
        const existingDocs = await Ingreso.find({ 
          Referencia: { $in: referenciasActualizar } 
        }).lean();
        
        // Crear un mapa para acceso rápido (usando referencias normalizadas como clave)
        const existingMap = new Map();
        existingDocs.forEach(doc => {
          existingMap.set(normalizeReferencia(doc.Referencia), doc);
        });
        
        // Preparar actualizaciones en lotes
        const bulkOps = [];
        let procesadas = 0;
        
        for (const update of updates) {
          try {
            const refNormalizada = normalizeReferencia(update.referencia);
            const existing = existingMap.get(refNormalizada);
            if (existing) {
              // Log para debugging: verificar si hay matrícula en update.data
              if (update.data['Matrícula vehí'] && !existing['Matrícula vehí']) {
                console.log(`🔍 Matrícula encontrada para ${update.referencia}: "${update.data['Matrícula vehí']}" (existente: "${existing['Matrícula vehí'] || 'vacío'}")`);
              }
              
              // Verificar si hay cambios reales antes de actualizar
              const hayCambios = hasChanges(existing, update.data, update.referencia);
              if (hayCambios) {
                bulkOps.push({
                  updateOne: {
                    filter: { Referencia: update.referencia },
                    update: {
                      $set: {
                        ...update.data,
                        updatedAt: new Date()
                      }
                    }
                  }
                });
                stats.actualizados++;
              } else {
                stats.sinCambios++;
              }
            } else {
              // Si no existe en el mapa, no debería pasar, pero por seguridad lo marcamos como sin cambios
              stats.sinCambios++;
            }
            procesadas++;
            
            // Ejecutar en lotes de 100 para evitar operaciones muy grandes
            if (bulkOps.length >= 100) {
              await Ingreso.bulkWrite(bulkOps, { ordered: false });
              console.log(`✅ Actualizados ${stats.actualizados} ingresos (${procesadas}/${updates.length} procesados)`);
              bulkOps.length = 0; // Limpiar array
            }
          } catch (error) {
            console.warn(`Error procesando ingreso ${update.referencia}:`, error.message);
            stats.errores++;
          }
        }
        
        // Ejecutar operaciones restantes
        if (bulkOps.length > 0) {
          await Ingreso.bulkWrite(bulkOps, { ordered: false });
          console.log(`✅ Actualizados ${stats.actualizados} ingresos (${procesadas}/${updates.length} procesados)`);
        }
        
        console.log(`📊 Resumen ingresos: ${stats.nuevos} nuevos, ${stats.actualizados} actualizados, ${stats.sinCambios} sin cambios`);
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
    errores: 0,
    detalle: [],
    detalleTruncado: false
  };

  const pushDetalle = (entry) => {
    if (stats.detalle.length >= MAX_DETALLE_POR_COLECCION) {
      stats.detalleTruncado = true;
      return;
    }
    stats.detalle.push(entry);
  };
  
  try {
    console.log(`📋 Importando ${citasData.length} citas con estados calculados...`);
    
    // Obtener referencias existentes
    const referenciasExistentes = await Cita.find({}, { Referencia: 1 }).lean();
    // Normalizar referencias a string para comparación consistente
    // IMPORTANTE: Normalizar todas las referencias (pueden venir como número o string de MongoDB)
    const setReferencias = new Set();
    const mapReferencias = new Map(); // Mapa para debugging
    
    referenciasExistentes.forEach(c => {
      const ref = c.Referencia;
      const refNormalizada = normalizeReferencia(ref);
      if (refNormalizada !== null) {
        setReferencias.add(refNormalizada);
        // Guardar también variantes (número y string) para comparación flexible
        if (typeof ref === 'number') {
          setReferencias.add(String(ref));
          // Agregar también la versión normalizada como número si es posible
          const numFromNormalized = Number(refNormalizada);
          if (!isNaN(numFromNormalized)) {
            setReferencias.add(String(numFromNormalized));
          }
        } else if (typeof ref === 'string') {
          // Agregar todas las variantes posibles
          const trimmed = ref.trim();
          if (trimmed) {
            setReferencias.add(trimmed);
            const numRef = Number(trimmed);
            if (!isNaN(numRef)) {
              setReferencias.add(String(numRef));
              // Agregar también sin espacios y con diferentes formatos
              setReferencias.add(String(Math.floor(numRef)));
            }
          }
        }
      }
    });
    
    console.log(`🔍 Referencias existentes en BD: ${setReferencias.size} (después de normalización)`);
    console.log(`📊 DEBUG: Total citas en Excel: ${citasData.length}`);
    console.log(`📊 DEBUG: Total referencias en MongoDB: ${referenciasExistentes.length}`);
    
    // Logging detallado: mostrar ejemplos de referencias del Set
    if (setReferencias.size > 0) {
      const ejemplosSet = Array.from(setReferencias).slice(0, 5);
      console.log(`📝 Ejemplos de referencias en Set: ${ejemplosSet.join(', ')}`);
    }
    
    // Logging de ejemplo para debugging
    if (referenciasExistentes.length > 0) {
      const ejemploRef = referenciasExistentes[0].Referencia;
      console.log(`📝 Ejemplo referencia BD: "${ejemploRef}" (tipo: ${typeof ejemploRef}, normalizada: "${normalizeReferencia(ejemploRef)}")`);
    }
    
    // Logging de ejemplo del Excel
    if (citasData.length > 0) {
      const ejemploExcel = citasData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel: "${ejemploExcel}" (tipo: ${typeof ejemploExcel}, normalizada: "${normalizeReferencia(ejemploExcel)}")`);
      console.log(`📝 ¿Existe en Set?: ${setReferencias.has(normalizeReferencia(ejemploExcel))}`);
    }
    
    const citasNuevas = [];
    const citasActualizar = [];
    
    // Separar nuevas y existentes con comparación robusta
    // ESTRATEGIA: Normalizar todas las referencias del Excel y comparar con el Set
    for (const cita of citasData) {
      const refOriginal = cita.Referencia;
      
      // Saltar referencias nulas, undefined o vacías
      if (refOriginal === null || refOriginal === undefined || refOriginal === '') {
        stats.errores++;
        continue;
      }
      
      const refNormalizada = normalizeReferencia(refOriginal);
      
      // Si la normalización devuelve null, saltar esta cita
      if (refNormalizada === null) {
        stats.errores++;
        continue;
      }
      
      // Intentar múltiples variantes de la referencia en el Set
      const variantes = [
        refNormalizada,
        String(refOriginal),
        typeof refOriginal === 'number' ? String(refOriginal) : null,
        typeof refOriginal === 'string' ? (isNaN(Number(refOriginal)) ? null : String(Number(refOriginal))) : null
      ].filter(v => v !== null);
      
      const existe = variantes.some(v => setReferencias.has(v));
      
      if (existe) {
        citasActualizar.push(cita);
      } else {
        citasNuevas.push(cita);
      }
    }
    
    // VERIFICACIÓN ADICIONAL: Verificar directamente en MongoDB para asegurarnos de que realmente no existen
    // Esta verificación es CRÍTICA porque MongoDB puede tener referencias como número o string
    console.log(`📊 DEBUG: citasNuevas.length=${citasNuevas.length}, citasData.length=${citasData.length}, porcentaje=${(citasNuevas.length / citasData.length * 100).toFixed(2)}%`);
    if (citasNuevas.length > 0) {
      console.log(`🔍 Verificando ${citasNuevas.length} referencias "nuevas" directamente en MongoDB...`);
      
      // Preparar referencias para búsqueda: incluir tanto string como número
      const referenciasParaBuscar = [];
      let referenciasOmitidas = 0;
      
      citasNuevas.forEach(c => {
        const ref = c.Referencia;
        // Saltar referencias nulas, undefined o vacías
        if (ref === null || ref === undefined || ref === '') {
          referenciasOmitidas++;
          return;
        }
        
        // Normalizar la referencia
        const refNormalizada = normalizeReferencia(ref);
        if (refNormalizada !== null && refNormalizada !== '') {
          referenciasParaBuscar.push(refNormalizada);
        } else {
          referenciasOmitidas++;
          // Logging para debugging: mostrar ejemplos de referencias que se normalizan a null
          if (referenciasOmitidas <= 5) {
            console.log(`⚠️ Referencia omitida (normalizada a null): "${ref}" (tipo: ${typeof ref})`);
          }
        }
        
        // Agregar también variantes para asegurar que encontramos la referencia
        if (typeof ref === 'string') {
          const trimmed = ref.trim();
          if (trimmed && trimmed !== '') {
            referenciasParaBuscar.push(trimmed);
            const numRef = Number(trimmed);
            if (!isNaN(numRef) && isFinite(numRef)) {
              referenciasParaBuscar.push(String(numRef));
            }
          }
        } else if (typeof ref === 'number' && isFinite(ref)) {
          referenciasParaBuscar.push(String(ref));
        }
      });
      
      if (referenciasOmitidas > 0) {
        console.log(`⚠️ Total referencias omitidas (null/vacías): ${referenciasOmitidas} de ${citasNuevas.length}`);
      }
      
      // Buscar en MongoDB: MongoDB tiene referencias como STRINGS, buscar solo como strings
      // Normalizar todas las referencias a string para la búsqueda, filtrando null/undefined
      const referenciasStringsUnicas = [...new Set(referenciasParaBuscar
        .filter(r => r !== null && r !== undefined && r !== '')
        .map(r => String(r).trim())
        .filter(r => r !== ''))];
      
      console.log(`🔍 Buscando ${referenciasStringsUnicas.length} referencias únicas en MongoDB (como strings)...`);
      console.log(`📝 Ejemplos de referencias a buscar: ${referenciasStringsUnicas.slice(0, 10).join(', ')}`);
      
      // Buscar en MongoDB solo como strings (MongoDB tiene todas las referencias como strings)
      const referenciasExistentesEnMongo = await Cita.find(
        { Referencia: { $in: referenciasStringsUnicas } },
        { Referencia: 1 }
      ).lean();
      
      console.log(`🔍 MongoDB retornó ${referenciasExistentesEnMongo.length} referencias existentes de ${citasNuevas.length} buscadas`);
      
      // Crear un Set con todas las variantes normalizadas de las referencias encontradas
      const setExistentesEnMongo = new Set();
      referenciasExistentesEnMongo.forEach(c => {
        const ref = c.Referencia;
        setExistentesEnMongo.add(normalizeReferencia(ref));
        // Agregar también variantes
        if (typeof ref === 'number') {
          setExistentesEnMongo.add(String(ref));
        } else if (typeof ref === 'string') {
          const numRef = Number(ref);
          if (!isNaN(numRef)) {
            setExistentesEnMongo.add(String(numRef));
          }
        }
      });
      
      // Reclasificar: mover de "nuevas" a "actualizar" las que realmente existen
      const realmenteNuevas = [];
      const realmenteActualizar = [];
      
      for (const cita of citasNuevas) {
        const refOriginal = cita.Referencia;
        const refNormalizada = normalizeReferencia(refOriginal);
        
        // Verificar todas las variantes posibles
        const variantes = [
          refNormalizada,
          String(refOriginal),
          typeof refOriginal === 'number' ? String(refOriginal) : null,
          typeof refOriginal === 'string' ? (isNaN(Number(refOriginal)) ? null : String(Number(refOriginal))) : null
        ].filter(v => v !== null);
        
        const existe = variantes.some(v => setExistentesEnMongo.has(v));
        
        if (existe) {
          realmenteActualizar.push(cita);
          // Agregar al Set para futuras comparaciones
          setReferencias.add(refNormalizada);
          // Agregar también variantes
          variantes.forEach(v => setReferencias.add(v));
        } else {
          realmenteNuevas.push(cita);
        }
      }
      
      if (realmenteActualizar.length > 0) {
        console.log(`⚠️ Se encontraron ${realmenteActualizar.length} referencias que se marcaron como "nuevas" pero realmente existen en MongoDB`);
        console.log(`📊 Reclasificando: ${realmenteNuevas.length} realmente nuevas, ${realmenteActualizar.length} para actualizar`);
        citasNuevas.length = 0;
        citasNuevas.push(...realmenteNuevas);
        citasActualizar.push(...realmenteActualizar);
      } else {
        console.log(`✅ Todas las ${citasNuevas.length} referencias marcadas como "nuevas" realmente no existen en MongoDB`);
      }
    }
    
    console.log(`📊 Nuevas: ${citasNuevas.length}, A actualizar: ${citasActualizar.length}`);
    
    // Logging de ejemplo para debugging
    if (citasData.length > 0 && citasNuevas.length > 0) {
      const ejemploNuevo = citasNuevas[0];
      const ejemploRef = ejemploNuevo.Referencia;
      console.log(`📝 Ejemplo referencia Excel (NUEVA): "${ejemploRef}" (tipo: ${typeof ejemploRef})`);
      console.log(`📝 Normalizada: "${normalizeReferencia(ejemploRef)}"`);
      console.log(`📝 ¿Existe en BD?: ${setReferencias.has(normalizeReferencia(ejemploRef))}`);
      
      // Verificar si realmente existe en MongoDB con consulta directa
      const existeEnMongo = await Cita.findOne({ 
        $or: [
          { Referencia: normalizeReferencia(ejemploRef) },
          { Referencia: String(ejemploRef) },
          { Referencia: Number(ejemploRef) }
        ]
      });
      console.log(`📝 Verificación directa en MongoDB: ${existeEnMongo ? 'EXISTE' : 'NO EXISTE'}`);
      if (existeEnMongo) {
        console.log(`📝 ⚠️ PROBLEMA DETECTADO: La referencia "${ejemploRef}" existe en MongoDB pero no se encontró en el Set`);
      }
    }
    
    // Insertar nuevas en lotes
    const BATCH_SIZE = 100;
    if (citasNuevas.length > 0) {
      for (let i = 0; i < citasNuevas.length; i += BATCH_SIZE) {
        const lote = citasNuevas.slice(i, i + BATCH_SIZE);
        try {
          await Cita.insertMany(lote, { ordered: false });
          stats.nuevos += lote.length;
          console.log(`✅ Lote insertado: ${stats.nuevos}/${citasNuevas.length}`);
          for (const c of lote) {
            pushDetalle({
              referencia: String(c.Referencia),
              accion: 'creado',
              estadoFinal: snapshotResumenDoc(c, 12)
            });
          }
        } catch (error) {
          if (error.code === 11000) {
            // Duplicados - verificar uno por uno si realmente son nuevos
            for (const cita of lote) {
              try {
                const refNormalizada = normalizeReferencia(cita.Referencia);
                // Verificar si realmente existe antes de intentar insertar
                // Buscar tanto como string como número para manejar inconsistencias en BD
                const existe = await Cita.findOne({ 
                  $or: [
                    { Referencia: refNormalizada },
                    { Referencia: Number(refNormalizada) },
                    { Referencia: String(Number(refNormalizada)) }
                  ]
                });
                if (!existe) {
                  // Realmente es nuevo, intentar insertar
                  try {
                    await Cita.create(cita);
                    stats.nuevos++;
                    pushDetalle({
                      referencia: String(cita.Referencia),
                      accion: 'creado',
                      estadoFinal: snapshotResumenDoc(cita, 12)
                    });
                  } catch (singleError) {
                    if (singleError.code === 11000) {
                      // Duplicado - ya existe (race condition)
                      console.warn(`⚠️ Referencia ${cita.Referencia} duplicada (race condition)`);
                    } else {
                      stats.errores++;
                    }
                  }
                } else {
                  // Ya existe - no contar como nuevo
                  console.warn(`⚠️ Referencia ${cita.Referencia} marcada como nueva pero ya existe en BD`);
                }
              } catch (checkError) {
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
    
    // Actualizar existentes solo si hay cambios (OPTIMIZADO: carga en memoria y usa bulkWrite)
    if (citasActualizar.length > 0) {
      console.log(`🔄 Verificando cambios en ${citasActualizar.length} citas existentes...`);
      
      // Reiniciar contador de debug
      debugChangeCount = 0;
      
      // Cargar todos los registros existentes de una vez
      // Normalizar referencias antes de la consulta para asegurar consistencia
      const referenciasActualizar = citasActualizar.map(c => normalizeReferencia(c.Referencia));
      const existingDocs = await Cita.find({ 
        Referencia: { $in: referenciasActualizar } 
      }).lean();
      
      // Crear un mapa para acceso rápido (usando referencias normalizadas como clave)
      const existingMap = new Map();
      existingDocs.forEach(doc => {
        existingMap.set(normalizeReferencia(doc.Referencia), doc);
      });
      
      // Preparar actualizaciones en lotes
      const bulkOps = [];
      let procesadas = 0;
      
      for (const cita of citasActualizar) {
        try {
          const refNormalizada = normalizeReferencia(cita.Referencia);
          const existing = existingMap.get(refNormalizada);
          if (existing && hasChanges(existing, cita, cita.Referencia)) {
            const cambios = getFieldChanges(existing, cita);
            const merged = { ...existing, ...cita, updatedAt: new Date() };
            pushDetalle({
              referencia: String(cita.Referencia),
              accion: 'actualizado',
              cambios,
              estadoFinal: snapshotResumenDoc(merged, 12)
            });
            bulkOps.push({
              updateOne: {
                filter: { Referencia: cita.Referencia },
                update: {
                  $set: {
                    ...cita,
                    updatedAt: new Date()
                  }
                }
              }
            });
            stats.actualizados++;
          } else {
            stats.sinCambios++;
          }
          procesadas++;
          
          // Ejecutar en lotes de 100 para evitar operaciones muy grandes
          if (bulkOps.length >= 100) {
            await Cita.bulkWrite(bulkOps, { ordered: false });
            console.log(`✅ Actualizadas ${stats.actualizados} citas (${procesadas}/${citasActualizar.length} procesadas)`);
            bulkOps.length = 0; // Limpiar array
          }
        } catch (error) {
          console.warn(`Error procesando cita ${cita.Referencia}:`, error.message);
          stats.errores++;
        }
      }
      
      // Ejecutar operaciones restantes
      if (bulkOps.length > 0) {
        await Cita.bulkWrite(bulkOps, { ordered: false });
        console.log(`✅ Actualizadas ${stats.actualizados} citas (${procesadas}/${citasActualizar.length} procesadas)`);
      }
      
      console.log(`📊 Resumen citas: ${stats.nuevos} nuevos, ${stats.actualizados} actualizados, ${stats.sinCambios} sin cambios`);
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
    errores: 0,
    detalle: [],
    detalleTruncado: false
  };

  const pushDetalle = (entry) => {
    if (stats.detalle.length >= MAX_DETALLE_POR_COLECCION) {
      stats.detalleTruncado = true;
      return;
    }
    stats.detalle.push(entry);
  };
  
  try {
    console.log(`💰 Importando ${ingresosData.length} ingresos...`);
    
    // Obtener referencias existentes
    const referenciasExistentes = await Ingreso.find({}, { Referencia: 1 }).lean();
    // Normalizar referencias a string para comparación consistente
    // IMPORTANTE: Normalizar todas las referencias (pueden venir como número o string de MongoDB)
    const setReferencias = new Set();
    
    referenciasExistentes.forEach(i => {
      const ref = i.Referencia;
      const refNormalizada = normalizeReferencia(ref);
      if (refNormalizada !== null) {
        setReferencias.add(refNormalizada);
        // Guardar también variantes (número y string) para comparación flexible
        if (typeof ref === 'number') {
          setReferencias.add(String(ref));
          // Agregar también la versión normalizada como número si es posible
          const numFromNormalized = Number(refNormalizada);
          if (!isNaN(numFromNormalized)) {
            setReferencias.add(String(numFromNormalized));
          }
        } else if (typeof ref === 'string') {
          // Agregar todas las variantes posibles
          const trimmed = ref.trim();
          if (trimmed) {
            setReferencias.add(trimmed);
            const numRef = Number(trimmed);
            if (!isNaN(numRef)) {
              setReferencias.add(String(numRef));
              // Agregar también sin espacios y con diferentes formatos
              setReferencias.add(String(Math.floor(numRef)));
            }
          }
        }
      }
    });
    
    console.log(`🔍 Referencias existentes en BD: ${setReferencias.size} (después de normalización)`);
    console.log(`📊 DEBUG: Total ingresos en Excel: ${ingresosData.length}`);
    console.log(`📊 DEBUG: Total referencias en MongoDB: ${referenciasExistentes.length}`);
    
    // Logging detallado: mostrar ejemplos de referencias del Set
    if (setReferencias.size > 0) {
      const ejemplosSet = Array.from(setReferencias).slice(0, 5);
      console.log(`📝 Ejemplos de referencias en Set: ${ejemplosSet.join(', ')}`);
    }
    
    // Logging de ejemplo para debugging
    if (referenciasExistentes.length > 0) {
      const ejemploRef = referenciasExistentes[0].Referencia;
      console.log(`📝 Ejemplo referencia BD: "${ejemploRef}" (tipo: ${typeof ejemploRef}, normalizada: "${normalizeReferencia(ejemploRef)}")`);
    }
    
    // Logging de ejemplo del Excel
    if (ingresosData.length > 0) {
      const ejemploExcel = ingresosData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel: "${ejemploExcel}" (tipo: ${typeof ejemploExcel}, normalizada: "${normalizeReferencia(ejemploExcel)}")`);
      console.log(`📝 ¿Existe en Set?: ${setReferencias.has(normalizeReferencia(ejemploExcel))}`);
    }
    
    const ingresosNuevos = [];
    const ingresosActualizar = [];
    
    // IMPORTANTE: Mapear campo de matrícula ANTES de procesar
    // El Excel puede tener diferentes nombres: 'Matrícula ve', 'PATENTE', 'Patente', etc.
    // Necesitamos 'Matrícula vehí' en la BD
    const posiblesNombresMatricula = [
      'Matrícula ve',
      'Matricula ve',
      'Matrícula veh',
      'Matricula veh',
      'Matrícula vehí',
      'Matricula vehí',
      'PATENTE',
      'Patente',
      'patente',
      'Matrícula',
      'Matricula',
      'Matrícula vehículo',
      'Matricula vehiculo'
    ];
    
    // Mapear matrículas en todos los ingresos antes de procesar
    for (const ingreso of ingresosData) {
      // Buscar el campo de matrícula en cualquiera de sus variantes
      let matriculaEncontrada = null;
      let nombreCampoEncontrado = null;
      
      for (const nombreCampo of posiblesNombresMatricula) {
        if (ingreso.hasOwnProperty(nombreCampo) && ingreso[nombreCampo] != null && ingreso[nombreCampo] !== undefined) {
          const valorMatricula = ingreso[nombreCampo].toString().trim();
          if (valorMatricula !== '') {
            matriculaEncontrada = valorMatricula;
            nombreCampoEncontrado = nombreCampo;
            break;
          }
        }
      }
      
      // Si encontramos una matrícula, asignarla a 'Matrícula vehí'
      if (matriculaEncontrada) {
        ingreso['Matrícula vehí'] = matriculaEncontrada;
        // Eliminar el campo original si es diferente para evitar duplicados
        if (nombreCampoEncontrado !== 'Matrícula vehí') {
          delete ingreso[nombreCampoEncontrado];
        }
      }
      
      // Limpiar campos según convención (después del mapeo)
      const cleanedIngreso = cleanObjectFields(ingreso);
      
      // Verificar que la matrícula siga presente después de cleanObjectFields
      if (matriculaEncontrada && !cleanedIngreso['Matrícula vehí']) {
        cleanedIngreso['Matrícula vehí'] = matriculaEncontrada;
      }
      
      // Reemplazar el ingreso original con el limpiado
      Object.keys(ingreso).forEach(key => delete ingreso[key]);
      Object.assign(ingreso, cleanedIngreso);
    }
    
    // Separar nuevos y existentes con comparación robusta
    // ESTRATEGIA: Normalizar todas las referencias del Excel y comparar con el Set
    for (const ingreso of ingresosData) {
      const refOriginal = ingreso.Referencia;
      
      // Saltar referencias nulas, undefined o vacías
      if (refOriginal === null || refOriginal === undefined || refOriginal === '') {
        stats.errores++;
        continue;
      }
      
      const refNormalizada = normalizeReferencia(refOriginal);
      
      // Si la normalización devuelve null, saltar este ingreso
      if (refNormalizada === null) {
        stats.errores++;
        continue;
      }
      
      // Intentar múltiples variantes de la referencia en el Set
      const variantes = [
        refNormalizada,
        String(refOriginal),
        typeof refOriginal === 'number' ? String(refOriginal) : null,
        typeof refOriginal === 'string' ? (isNaN(Number(refOriginal)) ? null : String(Number(refOriginal))) : null
      ].filter(v => v !== null);
      
      const existe = variantes.some(v => setReferencias.has(v));
      
      if (existe) {
        ingresosActualizar.push(ingreso);
      } else {
        ingresosNuevos.push(ingreso);
      }
    }
    
    // VERIFICACIÓN ADICIONAL: Verificar directamente en MongoDB para asegurarnos de que realmente no existen
    // Esta verificación es CRÍTICA porque MongoDB puede tener referencias como número o string
    console.log(`📊 DEBUG: ingresosNuevos.length=${ingresosNuevos.length}, ingresosData.length=${ingresosData.length}, porcentaje=${(ingresosNuevos.length / ingresosData.length * 100).toFixed(2)}%`);
    if (ingresosNuevos.length > 0) {
      console.log(`🔍 Verificando ${ingresosNuevos.length} referencias "nuevas" directamente en MongoDB...`);
      
      // Preparar referencias para búsqueda: incluir tanto string como número
      const referenciasParaBuscar = [];
      let referenciasOmitidas = 0;
      
      ingresosNuevos.forEach(i => {
        const ref = i.Referencia;
        // Saltar referencias nulas, undefined o vacías
        if (ref === null || ref === undefined || ref === '') {
          referenciasOmitidas++;
          return;
        }
        
        // Normalizar la referencia
        const refNormalizada = normalizeReferencia(ref);
        if (refNormalizada !== null && refNormalizada !== '') {
          referenciasParaBuscar.push(refNormalizada);
        } else {
          referenciasOmitidas++;
          // Logging para debugging: mostrar ejemplos de referencias que se normalizan a null
          if (referenciasOmitidas <= 5) {
            console.log(`⚠️ Referencia omitida (normalizada a null): "${ref}" (tipo: ${typeof ref})`);
          }
        }
        
        // Agregar también variantes para asegurar que encontramos la referencia
        if (typeof ref === 'string') {
          const trimmed = ref.trim();
          if (trimmed && trimmed !== '') {
            referenciasParaBuscar.push(trimmed);
            const numRef = Number(trimmed);
            if (!isNaN(numRef) && isFinite(numRef)) {
              referenciasParaBuscar.push(String(numRef));
            }
          }
        } else if (typeof ref === 'number' && isFinite(ref)) {
          referenciasParaBuscar.push(String(ref));
        }
      });
      
      if (referenciasOmitidas > 0) {
        console.log(`⚠️ Total referencias omitidas (null/vacías): ${referenciasOmitidas} de ${ingresosNuevos.length}`);
      }
      
      // Buscar en MongoDB: MongoDB tiene referencias como STRINGS, buscar solo como strings
      // Normalizar todas las referencias a string para la búsqueda, filtrando null/undefined
      const referenciasStringsUnicas = [...new Set(referenciasParaBuscar
        .filter(r => r !== null && r !== undefined && r !== '')
        .map(r => String(r).trim())
        .filter(r => r !== ''))];
      
      console.log(`🔍 Buscando ${referenciasStringsUnicas.length} referencias únicas en MongoDB (como strings)...`);
      console.log(`📝 Ejemplos de referencias a buscar: ${referenciasStringsUnicas.slice(0, 10).join(', ')}`);
      
      // Buscar en MongoDB solo como strings (MongoDB tiene todas las referencias como strings)
      const referenciasExistentesEnMongo = await Ingreso.find(
        { Referencia: { $in: referenciasStringsUnicas } },
        { Referencia: 1 }
      ).lean();
      
      console.log(`🔍 MongoDB retornó ${referenciasExistentesEnMongo.length} referencias existentes de ${ingresosNuevos.length} buscadas`);
      
      // Crear un Set con todas las variantes normalizadas de las referencias encontradas
      const setExistentesEnMongo = new Set();
      referenciasExistentesEnMongo.forEach(i => {
        const ref = i.Referencia;
        setExistentesEnMongo.add(normalizeReferencia(ref));
        // Agregar también variantes
        if (typeof ref === 'number') {
          setExistentesEnMongo.add(String(ref));
        } else if (typeof ref === 'string') {
          const numRef = Number(ref);
          if (!isNaN(numRef)) {
            setExistentesEnMongo.add(String(numRef));
          }
        }
      });
      
      // Reclasificar: mover de "nuevos" a "actualizar" las que realmente existen
      const realmenteNuevos = [];
      const realmenteActualizar = [];
      
      for (const ingreso of ingresosNuevos) {
        const refOriginal = ingreso.Referencia;
        const refNormalizada = normalizeReferencia(refOriginal);
        
        // Verificar todas las variantes posibles
        const variantes = [
          refNormalizada,
          String(refOriginal),
          typeof refOriginal === 'number' ? String(refOriginal) : null,
          typeof refOriginal === 'string' ? (isNaN(Number(refOriginal)) ? null : String(Number(refOriginal))) : null
        ].filter(v => v !== null);
        
        const existe = variantes.some(v => setExistentesEnMongo.has(v));
        
        if (existe) {
          realmenteActualizar.push(ingreso);
          // Agregar al Set para futuras comparaciones
          setReferencias.add(refNormalizada);
          // Agregar también variantes
          variantes.forEach(v => setReferencias.add(v));
        } else {
          realmenteNuevos.push(ingreso);
        }
      }
      
      if (realmenteActualizar.length > 0) {
        console.log(`⚠️ Se encontraron ${realmenteActualizar.length} referencias que se marcaron como "nuevas" pero realmente existen en MongoDB`);
        console.log(`📊 Reclasificando: ${realmenteNuevos.length} realmente nuevos, ${realmenteActualizar.length} para actualizar`);
        ingresosNuevos.length = 0;
        ingresosNuevos.push(...realmenteNuevos);
        ingresosActualizar.push(...realmenteActualizar);
      } else {
        console.log(`✅ Todas las ${ingresosNuevos.length} referencias marcadas como "nuevas" realmente no existen en MongoDB`);
      }
    }
    
    console.log(`📊 Nuevos: ${ingresosNuevos.length}, A actualizar: ${ingresosActualizar.length}`);
    
    // Logging de ejemplo para debugging
    if (ingresosData.length > 0 && ingresosNuevos.length > 0) {
      const ejemploNuevo = ingresosNuevos[0];
      const ejemploRef = ejemploNuevo.Referencia;
      console.log(`📝 Ejemplo referencia Excel (NUEVO): "${ejemploRef}" (tipo: ${typeof ejemploRef})`);
      console.log(`📝 Normalizada: "${normalizeReferencia(ejemploRef)}"`);
      console.log(`📝 ¿Existe en BD?: ${setReferencias.has(normalizeReferencia(ejemploRef))}`);
      
      // Verificar si realmente existe en MongoDB con consulta directa
      const existeEnMongo = await Ingreso.findOne({ 
        $or: [
          { Referencia: normalizeReferencia(ejemploRef) },
          { Referencia: String(ejemploRef) },
          { Referencia: Number(ejemploRef) }
        ]
      });
      console.log(`📝 Verificación directa en MongoDB: ${existeEnMongo ? 'EXISTE' : 'NO EXISTE'}`);
      if (existeEnMongo) {
        console.log(`📝 ⚠️ PROBLEMA DETECTADO: La referencia "${ejemploRef}" existe en MongoDB pero no se encontró en el Set`);
      }
    }
    
    // Insertar nuevos en lotes
    const BATCH_SIZE = 100;
    if (ingresosNuevos.length > 0) {
      for (let i = 0; i < ingresosNuevos.length; i += BATCH_SIZE) {
        const lote = ingresosNuevos.slice(i, i + BATCH_SIZE);
        try {
          await Ingreso.insertMany(lote, { ordered: false });
          stats.nuevos += lote.length;
          console.log(`✅ Lote insertado: ${stats.nuevos}/${ingresosNuevos.length}`);
          for (const row of lote) {
            pushDetalle({
              referencia: String(row.Referencia),
              accion: 'creado',
              estadoFinal: snapshotResumenDoc(row, 12)
            });
          }
        } catch (error) {
          if (error.code === 11000) {
            // Duplicados - verificar uno por uno si realmente son nuevos
            for (const ingreso of lote) {
              try {
                const refNormalizada = normalizeReferencia(ingreso.Referencia);
                // Verificar si realmente existe antes de intentar insertar
                // Buscar tanto como string como número para manejar inconsistencias en BD
                const existe = await Ingreso.findOne({ 
                  $or: [
                    { Referencia: refNormalizada },
                    { Referencia: Number(refNormalizada) },
                    { Referencia: String(Number(refNormalizada)) }
                  ]
                });
                if (!existe) {
                  // Realmente es nuevo, intentar insertar
                  try {
                    await Ingreso.create(ingreso);
                    stats.nuevos++;
                    pushDetalle({
                      referencia: String(ingreso.Referencia),
                      accion: 'creado',
                      estadoFinal: snapshotResumenDoc(ingreso, 12)
                    });
                  } catch (singleError) {
                    if (singleError.code === 11000) {
                      // Duplicado - ya existe (race condition)
                      console.warn(`⚠️ Referencia ${ingreso.Referencia} duplicada (race condition)`);
                    } else {
                      stats.errores++;
                    }
                  }
                } else {
                  // Ya existe - no contar como nuevo
                  console.warn(`⚠️ Referencia ${ingreso.Referencia} marcada como nueva pero ya existe en BD`);
                }
              } catch (checkError) {
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
    
      // Actualizar existentes solo si hay cambios (OPTIMIZADO: carga en memoria y usa bulkWrite)
      if (ingresosActualizar.length > 0) {
        console.log(`🔄 Verificando cambios en ${ingresosActualizar.length} ingresos existentes...`);
        
        // Reiniciar contador de debug
        debugChangeCount = 0;
        
        // Cargar todos los registros existentes de una vez
        // Normalizar referencias antes de la consulta para asegurar consistencia
        const referenciasActualizar = ingresosActualizar.map(i => normalizeReferencia(i.Referencia));
        const existingDocs = await Ingreso.find({ 
          Referencia: { $in: referenciasActualizar } 
        }).lean();
        
        // Crear un mapa para acceso rápido (usando referencias normalizadas como clave)
        const existingMap = new Map();
        existingDocs.forEach(doc => {
          existingMap.set(normalizeReferencia(doc.Referencia), doc);
        });
      
      // Preparar actualizaciones en lotes
      const bulkOps = [];
      let procesadas = 0;
      
      for (const ingreso of ingresosActualizar) {
        try {
          const refNormalizada = normalizeReferencia(ingreso.Referencia);
          const existing = existingMap.get(refNormalizada);
          if (existing && hasChanges(existing, ingreso, ingreso.Referencia)) {
            const cambios = getFieldChanges(existing, ingreso);
            const merged = { ...existing, ...ingreso, updatedAt: new Date() };
            pushDetalle({
              referencia: String(ingreso.Referencia),
              accion: 'actualizado',
              cambios,
              estadoFinal: snapshotResumenDoc(merged, 12)
            });
            bulkOps.push({
              updateOne: {
                filter: { Referencia: ingreso.Referencia },
                update: {
                  $set: {
                    ...ingreso,
                    updatedAt: new Date()
                  }
                }
              }
            });
            stats.actualizados++;
          } else {
            stats.sinCambios++;
          }
          procesadas++;
          
          // Ejecutar en lotes de 100 para evitar operaciones muy grandes
          if (bulkOps.length >= 100) {
            await Ingreso.bulkWrite(bulkOps, { ordered: false });
            console.log(`✅ Actualizados ${stats.actualizados} ingresos (${procesadas}/${ingresosActualizar.length} procesados)`);
            bulkOps.length = 0; // Limpiar array
          }
        } catch (error) {
          console.warn(`Error procesando ingreso ${ingreso.Referencia}:`, error.message);
          stats.errores++;
        }
      }
      
      // Ejecutar operaciones restantes
      if (bulkOps.length > 0) {
        await Ingreso.bulkWrite(bulkOps, { ordered: false });
        console.log(`✅ Actualizados ${stats.actualizados} ingresos (${procesadas}/${ingresosActualizar.length} procesados)`);
      }
      
      console.log(`📊 Resumen ingresos: ${stats.nuevos} nuevos, ${stats.actualizados} actualizados, ${stats.sinCambios} sin cambios`);
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
 * Ejecuta importación de citas/ingresos.
 * @param {object} [options]
 * @param {'full'|'citas-only'|'ingresos-only'} [options.scope='full'] — en parcial no se ejecutan boletos, ventas ni persistencia global lastImport.
 */
export async function executeImport(citasPath, ingresosPath, options = {}) {
  const scope = options.scope || 'full';
  const startTime = Date.now();
  importProgress.isRunning = true;
  importProgress.startTime = startTime;
  importProgress.progress = 0;
  
  const resultado = {
    timestamp: new Date(),
    status: 'in_progress',
    citas: null,
    ingresos: null,
    boletos: null,
    asistencia: null,
    ventas: null, // Inicializar ventas como null
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
    
    if (scope === 'full') {
      if (citasData.length === 0 && ingresosData.length === 0) {
        throw new Error('No se encontraron archivos válidos para importar');
      }
    } else if (scope === 'citas-only') {
      if (citasData.length === 0) {
        throw new Error('No hay datos de citas en el Excel');
      }
    } else if (scope === 'ingresos-only') {
      if (ingresosData.length === 0) {
        throw new Error('No hay datos de ingresos en el Excel');
      }
    }
    
    // PASO 2: Procesar fechas y limpiar datos
    updateProgress('Procesando datos', 3, 'Limpiando y procesando fechas...');
    console.log('🧹 Procesando y limpiando datos...');
    
    console.log('📋 Procesando citas...');
    
    // Logging de ejemplo ANTES de procesar
    if (citasData.length > 0) {
      const ejemploAntes = citasData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel ANTES de procesar: "${ejemploAntes}" (tipo: ${typeof ejemploAntes})`);
    }
    
    citasData = citasData.map((cita, index) => {
      if (index % 1000 === 0) {
        console.log(`   Procesando cita ${index + 1}/${citasData.length}...`);
      }
      const citaLimpia = cleanObjectFields(cita);
      const citaProcesada = processDates(citaLimpia, 'citas');
      // CRÍTICO: Normalizar Referencia usando la función normalizeReferencia para consistencia
      // NO convertir directamente a String() porque puede perder información o cambiar el formato
      // La normalización se hará durante la comparación, pero aquí mantenemos el tipo original
      // para que la normalización sea consistente
      if (citaProcesada.Referencia !== undefined && citaProcesada.Referencia !== null) {
        // Mantener el tipo original, pero asegurar que no sea null/undefined
        // La normalización se hará en el momento de la comparación
        const ref = citaProcesada.Referencia;
        if (typeof ref === 'string') {
          citaProcesada.Referencia = ref.trim();
        } else if (typeof ref === 'number') {
          // Mantener como número si es número (MongoDB puede tener números)
          citaProcesada.Referencia = ref;
        } else {
          // Para otros tipos, convertir a string
          citaProcesada.Referencia = String(ref).trim();
        }
      }
      return citaProcesada;
    });
    
    // Logging de ejemplo DESPUÉS de procesar
    if (citasData.length > 0) {
      const ejemploDespues = citasData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel DESPUÉS de procesar: "${ejemploDespues}" (tipo: ${typeof ejemploDespues})`);
    }
    
    console.log(`✅ ${citasData.length} citas procesadas`);
    
    console.log('💰 Procesando ingresos...');
    
    // Logging de ejemplo ANTES de procesar
    if (ingresosData.length > 0) {
      const ejemploAntes = ingresosData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel ANTES de procesar: "${ejemploAntes}" (tipo: ${typeof ejemploAntes})`);
    }
    
    ingresosData = ingresosData.map((ingreso, index) => {
      if (index % 1000 === 0) {
        console.log(`   Procesando ingreso ${index + 1}/${ingresosData.length}...`);
      }
      const ingresoLimpio = cleanObjectFields(ingreso);
      const ingresoProcesado = processDates(ingresoLimpio, 'ingresos');
      // CRÍTICO: Normalizar Referencia usando la función normalizeReferencia para consistencia
      // NO convertir directamente a String() porque puede perder información o cambiar el formato
      // La normalización se hará durante la comparación, pero aquí mantenemos el tipo original
      // para que la normalización sea consistente
      if (ingresoProcesado.Referencia !== undefined && ingresoProcesado.Referencia !== null) {
        // Mantener el tipo original, pero asegurar que no sea null/undefined
        // La normalización se hará en el momento de la comparación
        const ref = ingresoProcesado.Referencia;
        if (typeof ref === 'string') {
          ingresoProcesado.Referencia = ref.trim();
        } else if (typeof ref === 'number') {
          // Mantener como número si es número (MongoDB puede tener números)
          ingresoProcesado.Referencia = ref;
        } else {
          // Para otros tipos, convertir a string
          ingresoProcesado.Referencia = String(ref).trim();
        }
      }
      return ingresoProcesado;
    });
    
    // Logging de ejemplo DESPUÉS de procesar
    if (ingresosData.length > 0) {
      const ejemploDespues = ingresosData[0].Referencia;
      console.log(`📝 Ejemplo referencia Excel DESPUÉS de procesar: "${ejemploDespues}" (tipo: ${typeof ejemploDespues}, normalizada: "${normalizeReferencia(ejemploDespues)}")`);
    }
    
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

    if (scope !== 'full') {
      resultado.status = 'success';
      resultado.duration = Date.now() - startTime;
      importProgress.isRunning = false;
      updateProgress(
        'Completado',
        6,
        `✅ Importación ${scope} en ${((resultado.duration || 0) / 1000).toFixed(2)}s`
      );
      console.log(`✅ Importación parcial (${scope}) completada en ${((resultado.duration || 0) / 1000).toFixed(2)}s`);
      return resultado;
    }

    // PASO 5: Sincronizar boletos (opcional, puede fallar si no hay configuración)
    try {
      updateProgress('Sincronizando boletos', 5, 'Sincronizando boletos desde API externa...');
      console.log('🎫 Iniciando sincronización de boletos...');
      const boletosStats = await sincronizarBoletos({});
      resultado.boletos = {
        nuevos: boletosStats.nuevos || 0,
        actualizados: boletosStats.actualizados || 0,
        errores: boletosStats.errores || 0,
        total: boletosStats.total || 0
      };
      console.log(`✅ Sincronización de boletos: ${boletosStats.nuevos} nuevos, ${boletosStats.actualizados} actualizados`);
      updateProgress('Sincronizando boletos', 5, `✅ ${boletosStats.nuevos} nuevos, ${boletosStats.actualizados} actualizados`);
    } catch (error) {
      console.warn('⚠️ Error sincronizando boletos (continuando):', error.message);
      resultado.boletos = {
        nuevos: 0,
        actualizados: 0,
        errores: 0,
        total: 0
      };
      updateProgress('Sincronizando boletos', 5, '⚠️ Sincronización de boletos omitida');
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
      boletos: resultado.boletos,
      asistencia: resultado.asistencia,
      duracion: `${(resultado.duration / 1000).toFixed(2)}s`
    });
    
    updateProgress('Completado', 6, `✅ Importación exitosa en ${(resultado.duration / 1000).toFixed(2)}s`);
    
    // Procesar ventas si está configurado
    try {
      console.log('💰 Procesando datos de ventas...');
      updateProgress('Procesando ventas', 7, 'Procesando archivos de ventas...');
      const ventasResult = await procesarVentas();
      console.log(`✅ Ventas procesadas: ${ventasResult?.procesados || 0} meses, ${ventasResult?.errores || 0} errores`);
      // Siempre guardar el resultado, incluso si es undefined o null
      resultado.ventas = ventasResult || { procesados: 0, errores: 0 };
    } catch (ventasError) {
      console.error('⚠️ Error procesando ventas (no crítico):', ventasError.message);
      console.error('⚠️ Stack trace:', ventasError.stack);
      // No fallar la importación completa si falla el procesamiento de ventas
      resultado.ventas = { error: ventasError.message, procesados: 0, errores: 1 };
    }
    
    // Log para debugging
    console.log('📊 Resultado ventas antes de guardar:', JSON.stringify(resultado.ventas, null, 2));
    
    // Actualizar configuración con resultado
    console.log('💾 Guardando registro de última actualización...');
    
    // Construir el objeto lastImport completo para evitar errores cuando lastImport es null
    const lastImportSuccess = {
      timestamp: resultado.timestamp,
      status: 'success',
      duration: resultado.duration,
      error: null, // Limpiar error anterior
      summary: {
        citasNuevas: resultado.citas?.nuevos || 0,
        citasActualizadas: resultado.citas?.actualizados || 0,
        ingresosNuevos: resultado.ingresos?.nuevos || 0,
        ingresosActualizados: resultado.ingresos?.actualizados || 0,
        boletosNuevos: resultado.boletos?.nuevos || 0,
        boletosActualizados: resultado.boletos?.actualizados || 0,
        totalRegistros: (resultado.citas?.nuevos || 0) + (resultado.citas?.actualizados || 0) + 
                       (resultado.ingresos?.nuevos || 0) + (resultado.ingresos?.actualizados || 0) +
                       (resultado.boletos?.nuevos || 0) + (resultado.boletos?.actualizados || 0),
        asistenciaCalculada: resultado.asistencia ? {
          procesadas: resultado.asistencia.procesadas,
          conAsistencia: resultado.asistencia.conAsistencia,
          sinAsistencia: resultado.asistencia.sinAsistencia
        } : null,
        ventasProcesadas: {
          mesesProcesados: resultado.ventas?.procesados || 0,
          errores: resultado.ventas?.errores || 0,
          error: resultado.ventas?.error || null
        },
        detalleCitas: resultado.citas?.detalle || [],
        detalleIngresos: resultado.ingresos?.detalle || [],
        detalleCitasTruncado: !!resultado.citas?.detalleTruncado,
        detalleIngresosTruncado: !!resultado.ingresos?.detalleTruncado
      }
    };
    
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          lastImport: lastImportSuccess,
          lastSuccessfulImport: {
            timestamp: resultado.timestamp,
            duration: resultado.duration,
            citas: resultado.citas,
            ingresos: resultado.ingresos,
            boletos: resultado.boletos,
            asistencia: resultado.asistencia,
            ventas: resultado.ventas
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

    if (scope !== 'full') {
      throw error;
    }

    // Actualizar configuración con error
    // Construir el objeto lastImport completo para evitar errores cuando lastImport es null
    const lastImportError = {
      timestamp: resultado.timestamp,
      status: 'error',
      error: error.message,
      duration: resultado.duration
    };
    
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      {
        $set: {
          lastImport: lastImportError
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

  const lastImportByModule = config?.lastImportByModule
    ? typeof config.lastImportByModule.toObject === 'function'
      ? config.lastImportByModule.toObject()
      : { ...config.lastImportByModule }
    : {};

  if (!config || !config.lastImport) {
    return {
      lastImport: null,
      message: 'No se ha ejecutado ninguna importación',
      lastImportByModule
    };
  }

  return {
    lastImport: config.lastImport,
    filePaths: config.filePaths,
    lastImportByModule
  };
}

/** True si hay una importación executeImport en curso (excluye otros procesos). */
export function isImportRunning() {
  return importProgress.isRunning === true;
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


