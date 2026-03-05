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

// ===== BOLETOS =====

export const getBoletos = (params) => api.get('/boletos', { params });

export const getBoletoDetalle = (id) => api.get(`/boletos/${id}`);

export const getCiudadesBoletos = () => api.get('/boletos/ciudades');
export const getEstadosBoleto = () => api.get('/boletos/estados-boleto');

export const updateEstadoBoleto = (id, data) => 
  api.put(`/boletos/${id}/estado`, data);

export const setAlarmaBoleto = (id, data) => 
  api.put(`/boletos/${id}/alarma`, data);

export const getComentariosBoleto = (id) => 
  api.get(`/boletos/${id}/comentarios`);

export const addComentarioBoleto = (id, data) => 
  api.post(`/boletos/${id}/comentarios`, data);

export const sincronizarBoletos = (typeOfSale) => {
  const syncApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 300000 // 5 minutos para sincronización
  });
  
  return syncApi.post('/boletos/sincronizar', typeOfSale ? { typeOfSale } : {});
};

export const testBoletosConnection = () => 
  api.get('/boletos/test-connection');

// ===== OPORTUNIDADES =====

export const getOportunidades = (params) => api.get('/oportunidades', { params });

export const getOportunidadDetalle = (referencia) => api.get(`/oportunidades/${referencia}`);

export const updateEstadoOportunidad = (referencia, data) => 
  api.put(`/oportunidades/${referencia}/estado`, data);

export const setAlarmaOportunidad = (referencia, data) => 
  api.put(`/oportunidades/${referencia}/alarma`, data);

export const getComentariosOportunidad = (referencia) => 
  api.get(`/oportunidades/${referencia}/comentarios`);

export const addComentarioOportunidad = (referencia, data) => 
  api.post(`/oportunidades/${referencia}/comentarios`, data);

export const getConfigOportunidades = () => api.get('/config/oportunidades');

export const updateConfigOportunidades = (data) => api.put('/config/oportunidades', data);

export const getConfigAccesorios = () => api.get('/config/accesorios');

export const updateConfigAccesorios = (data) => api.put('/config/accesorios', data);

// ===== UNIDADES PARADAS =====

export const getUnidadesParadas = (params) => api.get('/unidades-paradas', { params });

export const getUnidadParadaDetalle = (referencia) => api.get(`/unidades-paradas/${referencia}`);

export const createUnidadParada = (data) => api.post('/unidades-paradas', data);

export const addComentarioUnidadParada = (referencia, data) => 
  api.post(`/unidades-paradas/${referencia}/comentarios`, data);

export const updateEstadoUnidadParada = (referencia, data) => 
  api.put(`/unidades-paradas/${referencia}/estado`, data);

export const setAlarmaUnidadParada = (referencia, data) => 
  api.put(`/unidades-paradas/${referencia}/alarma`, data);

export const getConfigUnidadesParadas = () => api.get('/config/unidades-paradas');

export const updateConfigUnidadesParadas = (data) => api.put('/config/unidades-paradas', data);

export const getIngresoByReferencia = (referencia) => 
  api.get(`/unidades-paradas/ingreso/${referencia}`);

// ===== LEGALES =====

export const getLegales = (params) => api.get('/legales', { params });

export const getLegalDetalle = (referencia) => api.get(`/legales/${referencia}`);

export const createLegal = (data) => api.post('/legales', data);

export const addComentarioLegal = (referencia, data) => 
  api.post(`/legales/${referencia}/comentarios`, data);

export const addAdjuntoLegal = (referencia, formData) => {
  const legalApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 60000 // 1 minuto para subida de archivos
  });
  return legalApi.post(`/legales/${referencia}/adjuntos`, formData);
};

export const uploadAdjuntoLegal = addAdjuntoLegal; // Alias para compatibilidad

export const deleteAdjuntoLegal = (referencia, adjuntoId) => 
  api.delete(`/legales/${referencia}/adjuntos/${adjuntoId}`);

export const updateEstadoLegal = (referencia, data) => 
  api.put(`/legales/${referencia}/estado`, data);

export const setAlarmaLegal = (referencia, data) => 
  api.put(`/legales/${referencia}/alarma`, data);

export const getConfigLegales = () => api.get('/config/legales');

export const updateConfigLegales = (data) => api.put('/config/legales', data);

export const getIngresoByReferenciaLegal = (referencia) => 
  api.get(`/legales/ingreso/${referencia}`);

export const getAdjuntoLegal = (referencia, adjuntoId) => 
  api.get(`/legales/${referencia}/adjuntos/${adjuntoId}`, { responseType: 'blob' });

export const deleteLegal = (id) => api.delete(`/legales/${id}`);

// ===== ESTADÍSTICAS =====

export const getMartinaMensualStats = () => api.get('/dashboard/stats/martina-mensual', { timeout: 30000 });

export const getMartinaTalleresStats = () => api.get('/dashboard/stats/martina-talleres', { timeout: 30000 });

export const getMartinaInteraccionesStats = () => api.get('/dashboard/stats/martina-interacciones', { timeout: 30000 }); // 30 segundos (debería ser rápido con análisis incremental)

// ===== BOT ANALYZER =====

export const getBotConversations = (empresa, filters = {}) => 
  api.get(`/bot-analyzer/${empresa}/conversations`, { params: filters });

export const getBotConversationMessages = (empresa, sessionId) => 
  api.get(`/bot-analyzer/${empresa}/conversations/${sessionId}`);

export const searchBotConversations = (empresa, sessionId, additionalParams = {}) => 
  api.get(`/bot-analyzer/${empresa}/search`, { params: { sessionId, ...additionalParams } });

// ===== VENTAS =====

export const getVentasResumen = (mesKey) => api.get(`/ventas/resumen/${mesKey}`);

export const getVentasMeses = () => api.get('/ventas/meses');

export const procesarVentas = () => api.post('/ventas/procesar');

export const getConfigVentas = () => api.get('/config/ventas');

export const updateConfigVentas = (data) => api.put('/config/ventas', data);

// ===== HEALTH CHECK =====

export const healthCheck = () => api.get('/health');

export default api;


