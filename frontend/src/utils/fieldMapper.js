/**
 * Utilidad para mapear nombres de campos según la configuración
 */

/**
 * Aplica el mapeo de campos a un nombre de campo
 * Si el mapeo está vacío o no existe, usa el nombre original
 * @param {string} originalField - Nombre original del campo
 * @param {Object} fieldMappings - Mapeo de campos desde la configuración
 * @returns {string} - Nombre del campo mapeado o original
 */
export function mapFieldName(originalField, fieldMappings = {}) {
  // Si hay un mapeo definido para este campo, usarlo
  if (fieldMappings[originalField] && fieldMappings[originalField].trim() !== '') {
    return fieldMappings[originalField];
  }
  
  // Si no hay mapeo o está vacío, usar el nombre original
  return originalField;
}

/**
 * Crea una función de mapeo de campos para usar en componentes
 * @param {Object} fieldMappings - Mapeo de campos desde la configuración
 * @returns {Function} - Función que mapea nombres de campos
 */
export function createFieldMapper(fieldMappings = {}) {
  return (originalField) => mapFieldName(originalField, fieldMappings);
}

/**
 * Mapea una lista de columnas aplicando el mapeo de campos
 * @param {Array} columns - Lista de columnas con propiedad 'key'
 * @param {Object} fieldMappings - Mapeo de campos desde la configuración
 * @returns {Array} - Lista de columnas con nombres mapeados
 */
export function mapColumnHeaders(columns, fieldMappings = {}) {
  return columns.map(column => ({
    ...column,
    header: mapFieldName(column.header, fieldMappings),
    // También mapear el key si es necesario
    key: column.key,
    displayKey: mapFieldName(column.key, fieldMappings)
  }));
}

/**
 * Obtiene el nombre de campo para mostrar en la UI
 * @param {string} fieldKey - Clave del campo en la base de datos
 * @param {Object} fieldMappings - Mapeo de campos desde la configuración
 * @returns {string} - Nombre para mostrar en la UI
 */
export function getDisplayFieldName(fieldKey, fieldMappings = {}) {
  return mapFieldName(fieldKey, fieldMappings);
}




