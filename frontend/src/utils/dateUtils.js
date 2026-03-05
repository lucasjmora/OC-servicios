import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Parsea fecha que puede venir como ISO (UTC) o string DD/MM/YYYY.
 * Usa componentes UTC para fechas ISO para que el día mostrado coincida con el almacenado.
 */
function toLocalCalendarDate(date) {
  if (!date) return null;
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date;
  }
  const str = String(date).trim();
  // Si es ISO (YYYY-MM-DD o con T), parsear y usar componentes UTC para evitar desfase por zona horaria
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }
  // Si es DD/MM/YYYY (formato español), parsear explícitamente para no interpretar como MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/').map(Number);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(date);
}

/**
 * Formatea una fecha de forma segura, manejando valores inválidos.
 * Fechas ISO (UTC) se muestran con el día correcto usando componentes UTC.
 */
export function safeFormatDate(date, formatString = 'dd/MM/yyyy', locale = es) {
  if (!date) return '-';

  try {
    const dateObj = toLocalCalendarDate(date);

    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'Fecha inválida';
    }

    return format(dateObj, formatString, { locale });
  } catch (error) {
    console.warn('Error formateando fecha:', error);
    try {
      const fallback = toLocalCalendarDate(date);
      return fallback && !isNaN(fallback.getTime()) ? format(fallback, formatString, { locale }) : 'Fecha inválida';
    } catch (fallbackError) {
      return 'Fecha inválida';
    }
  }
}

/**
 * Formatea una fecha con hora de forma segura
 */
export function safeFormatDateTime(date, formatString = 'dd/MM/yyyy HH:mm', locale = es) {
  if (!date) return '-';
  
  try {
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return 'Fecha inválida';
    }
    
    return format(dateObj, formatString, { locale });
  } catch (error) {
    console.warn('Error formateando fecha y hora:', error);
    try {
      return new Date(date).toLocaleString('es-ES');
    } catch (fallbackError) {
      return 'Fecha inválida';
    }
  }
}

/**
 * Formatea una hora decimal a formato HH:mm
 */
export function safeFormatTime(timeValue) {
  if (!timeValue && timeValue !== 0) return '-';
  
  try {
    // Si es el valor por defecto de Excel (1900-01-00), no mostrar nada
    if (timeValue === '1900-01-00' || timeValue === '1900-01-00T00:00:00.000Z') {
      return '-';
    }
    
    // Si es una fecha que representa una hora por defecto de Excel
    if (typeof timeValue === 'string' && timeValue.includes('1900-01-00')) {
      return '-';
    }
    
    // Si es un decimal (ej: 0.4166666666666667), convertir a hora
    if (typeof timeValue === 'number' && timeValue < 1) {
      const hours = Math.floor(timeValue * 24);
      const minutes = Math.floor((timeValue * 24 - hours) * 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Si ya es una hora en formato string
    if (typeof timeValue === 'string') {
      // Si es solo números, tratar como decimal
      if (/^\d+\.?\d*$/.test(timeValue)) {
        const numValue = parseFloat(timeValue);
        if (numValue < 1) {
          const hours = Math.floor(numValue * 24);
          const minutes = Math.floor((numValue * 24 - hours) * 60);
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
      
      // Si es una fecha válida, extraer solo la hora
      if (timeValue.includes('-') || timeValue.includes('/')) {
        const dateObj = new Date(timeValue);
        if (!isNaN(dateObj.getTime())) {
          // Si es una fecha válida pero sin hora específica (1900-01-01), mostrar guión
          if (dateObj.getFullYear() === 1900 && dateObj.getMonth() === 0 && dateObj.getDate() === 1) {
            return '-';
          }
          // Si tiene hora, mostrarla
          if (dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0) {
            return `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
          }
          return '-';
        }
      }
      
      return timeValue;
    }
    
    return timeValue.toString();
  } catch (error) {
    console.warn('Error formateando hora:', error);
    return timeValue.toString();
  }
}

/**
 * Verifica si una fecha es válida
 */
export function isValidDate(date) {
  if (!date) return false;
  
  try {
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  } catch (error) {
    return false;
  }
}

/**
 * Calcula los días abiertos entre dos fechas
 */
export function calcularDiasAbiertos(fechaApertura, fechaCierre) {
  if (!fechaApertura) return 0;
  
  try {
    const inicio = new Date(fechaApertura);
    const fin = fechaCierre ? new Date(fechaCierre) : new Date();
    
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      return 0;
    }
    
    const diffTime = Math.abs(fin - inicio);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays); // Asegurar que no sea negativo
  } catch (error) {
    console.warn('Error calculando días abiertos:', error);
    return 0;
  }
}

/**
 * Obtiene el color del badge según los días abiertos
 */
export function getColorDias(dias) {
  if (dias <= 7) return 'success';
  if (dias <= 15) return 'warning';
  if (dias <= 30) return 'orange';
  return 'danger';
}

/**
 * Obtiene la fecha/hora actual en formato datetime-local (hora local, no UTC)
 * Para usar en el atributo min de inputs datetime-local
 */
export function getNowAsDateTimeLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
