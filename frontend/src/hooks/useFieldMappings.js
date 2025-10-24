import { useState, useEffect } from 'react';
import { getMappings } from '../services/api';

/**
 * Hook personalizado para manejar el mapeo de campos
 * @returns {Object} - Objeto con mappings y funciones de mapeo
 */
export function useFieldMappings() {
  const [fieldMappings, setFieldMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFieldMappings();
  }, []);

  const loadFieldMappings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Cargando mapeos de campos...');
      const response = await getMappings('campos');
      console.log('Respuesta de mapeos:', response.data);
      setFieldMappings(response.data || {});
    } catch (err) {
      console.error('Error cargando mapeo de campos:', err);
      setError(err.message);
      setFieldMappings({}); // Usar objeto vacío si hay error
    } finally {
      setLoading(false);
    }
  };

  /**
   * Mapea un nombre de campo
   * @param {string} originalField - Nombre original del campo
   * @returns {string} - Nombre mapeado o original
   */
  const mapField = (originalField) => {
    if (fieldMappings[originalField] && fieldMappings[originalField].trim() !== '') {
      console.log(`Mapeando campo: ${originalField} -> ${fieldMappings[originalField]}`);
      return fieldMappings[originalField];
    }
    return originalField;
  };

  /**
   * Mapea una lista de columnas
   * @param {Array} columns - Lista de columnas
   * @returns {Array} - Lista de columnas con headers mapeados
   */
  const mapColumns = (columns) => {
    console.log('Mapeando columnas con mappings:', fieldMappings);
    return columns.map(column => ({
      ...column,
      header: mapField(column.header)
    }));
  };

  return {
    fieldMappings,
    loading,
    error,
    mapField,
    mapColumns,
    reloadMappings: loadFieldMappings
  };
}
