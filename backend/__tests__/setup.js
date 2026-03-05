// Setup global para tests
import dotenv from 'dotenv';

// Cargar variables de entorno de prueba
dotenv.config({ path: '.env.test' });

// Cargar también .env principal si existe
dotenv.config();

// Configurar variables de entorno por defecto para tests
// Si MONGODB_URI está disponible, usar la misma conexión pero con base de datos de test
if (process.env.MONGODB_URI && !process.env.MONGODB_URI_TEST) {
  // Reemplazar el nombre de la base de datos con _test
  const uri = process.env.MONGODB_URI;
  process.env.MONGODB_URI_TEST = uri.replace(/\/[^\/]+$/, '/oc_servicios_test');
}

process.env.MONGODB_URI_TEST = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/oc_servicios_test';
process.env.BOLETOS_PAT = process.env.BOLETOS_PAT || 'test-pat-token';
process.env.BOLETOS_API_URL = process.env.BOLETOS_API_URL || 'https://test-api.com/boletos';

// Timeout configurado en jest.config.js

