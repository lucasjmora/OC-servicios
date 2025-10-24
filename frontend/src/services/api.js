import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 segundos timeout
});

// Interceptor para logging de errores
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ===== CONFIGURACIÓN =====

export const getConfig = () => api.get('/config');

export const updateConfig = (config) => api.put('/config', config);

export const getMappings = (type) => api.get(`/config/mappings/${type}`);

export const updateMappings = (type, mappings) => 
  api.put(`/config/mappings/${type}`, mappings);

export const getUniqueValues = (collection, field) =>
  api.get(`/config/unique-values/${collection}/${field}`);

// ===== ASISTENCIA =====

export const getAsistencia = (params) => api.get('/asistencia', { 
  params,
  timeout: 30000 // 30 segundos para asistencia
});
export const getComentariosCita = (referencia) => api.get(`/asistencia/${referencia}/comentarios`);
export const addComentarioCita = (referencia, data) => api.post(`/asistencia/${referencia}/comentarios`, data);
export const updateConfigAsistencia = (data) => api.put('/config/asistencia', data);

// ===== IMPORTACIÓN =====

export const executeManualImport = () => {
  const importApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 600000 // 10 minutos para importación optimizada
  });
  
  return importApi.post('/import/manual');
};

export const testConnection = (uri) => 
  api.post('/import/test-connection', { uri });

export const getImportStatus = () => api.get('/import/status');

export const getImportProgress = () => api.get('/import/progress');

export const getLastSuccessfulImport = () => api.get('/import/last-successful');

// ===== CITAS =====

export const getCitas = (params) => api.get('/citas', { params });

export const getCitaById = (id) => api.get(`/citas/${id}`);

// ===== INGRESOS =====

export const getIngresos = (params) => api.get('/ingresos', { params });

export const getIngresoById = (id) => api.get(`/ingresos/${id}`);

// ===== OPORTUNIDADES =====

export const getOportunidades = (params) => api.get('/oportunidades', { params });

export const getConfigOportunidades = () => api.get('/config/oportunidades');

export const updateConfigOportunidades = (data) => api.put('/config/oportunidades', data);

// Gestión de oportunidades
export const getOportunidadDetalle = (referencia) => api.get(`/oportunidades/${referencia}`);

export const updateEstadoOportunidad = (referencia, data) => 
  api.put(`/oportunidades/${referencia}/estado`, data);

export const setAlarmaOportunidad = (referencia, data) => 
  api.put(`/oportunidades/${referencia}/alarma`, data);

export const getComentariosOportunidad = (referencia) => 
  api.get(`/oportunidades/${referencia}/comentarios`);

export const addComentarioOportunidad = (referencia, data) => 
  api.post(`/oportunidades/${referencia}/comentarios`, data);

// ===== HEALTH CHECK =====

export const healthCheck = () => api.get('/health');

export default api;


