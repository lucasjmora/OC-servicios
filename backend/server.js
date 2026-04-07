import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Importar rutas
import configRoutes from './routes/config.js';
import importRoutes from './routes/import.js';
import citasRoutes from './routes/citas.js';
import ingresosRoutes from './routes/ingresos.js';
import diagnosticRoutes from './routes/diagnostic.js';
import asistenciaRoutes from './routes/asistencia.js';
import oportunidadesRoutes from './routes/oportunidades.js';
import unidadesParadasRoutes from './routes/unidadesParadas.js';
import configUnidadesParadasRoutes from './routes/configUnidadesParadas.js';
import legalesRoutes from './routes/legales.js';
import configLegalesRoutes from './routes/configLegales.js';
import dashboardRoutes from './routes/dashboard.js';
import boletosRoutes from './routes/boletos.js';
import botAnalyzerRoutes from './routes/botAnalyzer.js';
import ventasRoutes from './routes/ventas.js';
import orsAbiertasRoutes from './routes/orsAbiertas.js';
import presupCrmRoutes from './routes/presupCrm.js';

// Importar servicios
// // import { startScheduler } from './services/schedulerService.js';
import { startBoletosScheduler } from './services/boletosSchedulerService.js';
import Configuracion from './models/Configuracion.js';
import configStorageService from './services/configStorageService.js';

// Si el proceso ya trae PORT/HOST (cross-env, systemd, start_prod.ps1), no dejar que
// backend/.env con override: true los pise — si no, wait-on y el proxy apuntan a otro puerto.
const runtimePort = process.env.PORT;
const runtimeHost = process.env.HOST;

// Entorno en raíz: producción → `.env`; desarrollo → `.env_dev` si existe, si no `.env`.
// Jest (NODE_ENV=test) sigue usando `.env` para no mezclar con el perfil local.
const repoRoot = path.join(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';
const useDevFile =
  !isProduction &&
  process.env.NODE_ENV !== 'test' &&
  fs.existsSync(path.join(repoRoot, '.env_dev'));
const rootEnvPath = useDevFile
  ? path.join(repoRoot, '.env_dev')
  : path.join(repoRoot, '.env');

dotenv.config({ path: rootEnvPath });
if (useDevFile) {
  console.log('ℹ️  Variables de entorno: usando .env_dev (desarrollo)');
}
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const app = express();
// Puertos: desarrollo 5000 (Vite en 3000); producción 5001 (frontend en 3001).
const PORT =
  (runtimePort !== undefined && runtimePort !== ''
    ? runtimePort
    : process.env.PORT) ||
  (process.env.NODE_ENV === 'production' ? 5001 : 5000);

const HOST =
  (runtimeHost !== undefined && runtimeHost !== ''
    ? runtimeHost
    : process.env.HOST) || '0.0.0.0';

// Middleware: CORS abierto para acceso desde cualquier origen (red local / producción)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Rutas
app.use('/api/config', configRoutes);
app.use('/api/import', importRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/ingresos', ingresosRoutes);
app.use('/api/diagnostic', diagnosticRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/oportunidades', oportunidadesRoutes);
app.use('/api/unidades-paradas', unidadesParadasRoutes);
app.use('/api/config/unidades-paradas', configUnidadesParadasRoutes);
app.use('/api/legales', legalesRoutes);
app.use('/api/config/legales', configLegalesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/boletos', boletosRoutes);
app.use('/api/bot-analyzer', botAnalyzerRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/ors-abiertas', orsAbiertasRoutes);
app.use('/api/presup-crm', presupCrmRoutes);

// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'OC Servicios API funcionando correctamente',
    timestamp: new Date()
  });
});

// 404 para rutas API no encontradas
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  next();
});

// En produccion: servir frontend desde el mismo servidor (un solo puerto 5001, evita ERR_CONNECTION_RESET en 3001)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Fallback 404 para el resto
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message 
  });
});

// Función para conectar a MongoDB
async function connectDB() {
  try {
    // Inicializar servicio de configuración local
    await configStorageService.initialize();
    
    let mongoUri = process.env.MONGODB_URI;
    
    // Si hay una URI en .env, usarla primero
    if (mongoUri) {
      // Opciones optimizadas para conexión estable
      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false
      };
      
      await mongoose.connect(mongoUri, options);
      console.log('✅ Conectado a MongoDB usando configuración de .env');
      
      // Sincronizar configuración local con la base de datos
      try {
        const config = await Configuracion.findOne({ singleton: true });
        if (config && config.mongodb && config.mongodb.uri) {
          console.log('ℹ️  Configuración encontrada en base de datos, sincronizando con almacenamiento local...');
          
          // Actualizar configuración local con datos de MongoDB
          await configStorageService.updateMongoConfig(config.mongodb);
          if (config.filePaths) {
            await configStorageService.updateFilePaths(config.filePaths);
          }
          if (config.scheduler) {
            await configStorageService.updateScheduler(config.scheduler);
          }
          if (config.mappings) {
            await configStorageService.updateMappings(config.mappings);
          }
          if (config.asistencia) {
            await configStorageService.updateAsistencia(config.asistencia);
          }
          if (config.oportunidades) {
            await configStorageService.updateOportunidades(config.oportunidades);
          }
          if (config.presupCrm) {
            await configStorageService.updatePresupCrm(config.presupCrm);
          }
          
          // Iniciar scheduler si está habilitado
          // await startScheduler();
        } else {
          console.log('ℹ️  Configuración no encontrada en base de datos, usando configuración local');
        }
      } catch (configError) {
        console.log('ℹ️  Error accediendo a configuración de base de datos, usando configuración local');
      }
      
      return;
    }
    
    // Si no hay URI en .env, usar configuración local
    console.log('ℹ️  MongoDB URI no configurada en .env, usando configuración local');
    const localConfig = configStorageService.getConfig();
    if (localConfig.mongodb && localConfig.mongodb.uri) {
      try {
        // Opciones optimizadas para conexión estable
        const options = {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          bufferCommands: false
        };
        
        await mongoose.connect(localConfig.mongodb.uri, options);
        console.log('✅ Conectado a MongoDB usando configuración local');
      } catch (error) {
        console.log('❌ Error conectando con configuración local:', error.message);
      }
    } else {
      console.log('   Configure la conexión desde la interfaz web (/configuracion/actualizacion)');
    }
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    console.log('ℹ️  El servidor continuará ejecutándose. Configure la conexión desde la interfaz web.');
  }
}

// Configurar eventos de MongoDB
mongoose.connection.on('connected', () => {
  console.log('🔗 MongoDB conectado exitosamente');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Error de MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 MongoDB desconectado');
});

// Iniciar servidor
async function startServer() {
  try {
    // Obtener IP local para mostrar en logs
    const nets = os.networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIP = net.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('═══════════════════════════════════════════');
      console.log('   🚀 OC Servicios Backend');
      console.log('═══════════════════════════════════════════');
      console.log(`   Puerto: ${PORT}`);
      console.log(`   Local:  http://localhost:${PORT}/api`);
      console.log(`   Red:    http://${localIP}:${PORT}/api`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log('═══════════════════════════════════════════');
      console.log('');
    });
    
    // Intentar conectar a MongoDB después de iniciar el servidor
    await connectDB();
    
    // Iniciar scheduler de boletos para verificación automática de estados
    startBoletosScheduler();
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\n⏹️  Cerrando servidor...');
  
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('✅ Conexión a MongoDB cerrada');
  }
  
  process.exit(0);
});

// Iniciar con manejo de errores
startServer().catch((error) => {
  console.error('💥 Error fatal iniciando servidor:', error);
  process.exit(1);
});


