import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formatea una fecha de forma segura, manejando valores inválidos
 */
export function safeFormatDate(date, formatString = 'dd/MM/yyyy', locale = es) {
  if (!date) return '-';
  
  try {
    const dateObj = new Date(date);
    
    // Verificar si la fecha es válida
    if (isNaN(dateObj.getTime())) {
      return 'Fecha inválida';
    }
    
    return format(dateObj, formatString, { locale });
  } catch (error) {
    console.warn('Error formateando fecha:', error);
    try {
      return new Date(date).toLocaleDateString('es-ES');
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
