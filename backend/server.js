import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Importar rutas
import configRoutes from './routes/config.js';
import importRoutes from './routes/import.js';
import citasRoutes from './routes/citas.js';
import ingresosRoutes from './routes/ingresos.js';
import diagnosticRoutes from './routes/diagnostic.js';
import asistenciaRoutes from './routes/asistencia.js';
import oportunidadesRoutes from './routes/oportunidades.js';

// Importar servicios
import { startScheduler } from './services/schedulerService.js';
import Configuracion from './models/Configuracion.js';
import configStorageService from './services/configStorageService.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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

// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'OC Servicios API funcionando correctamente',
    timestamp: new Date()
  });
});

// Manejo de rutas no encontradas
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
          
          // Iniciar scheduler si está habilitado
          await startScheduler();
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
    // Iniciar servidor HTTP primero
    app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════');
      console.log('   🚀 OC Servicios Backend');
      console.log('═══════════════════════════════════════════');
      console.log(`   Puerto: ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log('═══════════════════════════════════════════');
      console.log('');
    });
    
    // Intentar conectar a MongoDB después de iniciar el servidor
    await connectDB();
    
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

// Iniciar
startServer();


