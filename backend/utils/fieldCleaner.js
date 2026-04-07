/**
 * Limpia nombres de campos según las convenciones del proyecto
 * Elimina puntos de los nombres de campos de la base de datos
 */
export function cleanFieldName(fieldName) {
  if (typeof fieldName !== 'string') return fieldName;
  
  // Eliminar puntos según convención del proyecto
  return fieldName.replace(/\./g, '');
}

/**
 * Limpia todos los campos de un objeto
 */
export function cleanObjectFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const cleanedObj = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const cleanedKey = cleanFieldName(key);
    cleanedObj[cleanedKey] = value;
  }
  
  return cleanedObj;
}

/**
 * Formatea número de teléfono para Argentina
 * Agrega prefijo +54 y '9' entre código país y área
 */
export function formatPhoneArgentina(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  
  // Limpiar el teléfono de espacios y caracteres especiales
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Si ya tiene +54, retornar
  if (cleaned.startsWith('+54')) return phone;
  
  // Si empieza con 54, agregar +
  if (cleaned.startsWith('54')) {
    cleaned = '+' + cleaned;
  }
  
  // Si no tiene prefijo internacional, agregarlo
  if (!cleaned.startsWith('+')) {
    // Formato: +54 9 área código
    // Ej: 2477220331 -> +54 9 2477220331
    cleaned = '+54 9 ' + cleaned;
  }
  
  return cleaned;
}

/**
 * Teléfono de citas: solo dígitos, prefijo móvil AR 549 (54 + 9).
 */
export function normalizeTelefonoCita549(raw) {
  if (raw == null || raw === '') return '';
  const s =
    typeof raw === 'number' && Number.isFinite(raw)
      ? String(Math.trunc(raw))
      : String(raw);
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54')) return '549' + digits.slice(2);
  if (digits.startsWith('9')) return '54' + digits;
  return '549' + digits;
}

