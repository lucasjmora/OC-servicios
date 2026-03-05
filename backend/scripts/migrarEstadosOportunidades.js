import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Oportunidad from '../models/Oportunidad.js';
import configStorageService from '../services/configStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para mapear estados antiguos a nuevos
const mapearEstado = (estadoAntiguo) => {
  const mapeo = {
    'pendiente': { estado: 'abierto', subEstado: 'pendiente' },
    'en_gestion': { estado: 'abierto', subEstado: 'en_espera' },
    'a_tratar': { estado: 'abierto', subEstado: 'pendiente' },
    'cerrado': { estado: 'cerrado', subEstado: null }
  };
  return mapeo[estadoAntiguo] || null;
};

async function migrarOportunidades() {
  try {
    console.log('🔄 Iniciando migración de estados de oportunidades...\n');

    // Conectar a MongoDB
    await configStorageService.initialize();
    let mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      const config = await configStorageService.getConfig();
      if (config?.mongodb?.uri) {
        mongoUri = config.mongodb.uri;
      } else {
        console.error('❌ MONGODB_URI no está definido');
        process.exit(1);
      }
    }

    const mongooseOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };

    await mongoose.connect(mongoUri, mongooseOptions);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las oportunidades con estados antiguos
    const oportunidadesAntiguas = await Oportunidad.find({
      estado: { $in: ['pendiente', 'en_gestion', 'a_tratar', 'cerrado'] }
    });

    console.log(`📊 Encontradas ${oportunidadesAntiguas.length} oportunidades con estados antiguos\n`);

    let actualizadas = 0;
    let logsActualizados = 0;

    for (const oportunidad of oportunidadesAntiguas) {
      const estadoAntiguo = oportunidad.estado;
      const estadoMapeado = mapearEstado(estadoAntiguo);

      if (!estadoMapeado) {
        console.warn(`⚠️  No se pudo mapear el estado "${estadoAntiguo}" para oportunidad ${oportunidad.ingresoReferencia}`);
        continue;
      }

      // Actualizar estado principal
      oportunidad.estado = estadoMapeado.estado;
      oportunidad.subEstado = estadoMapeado.subEstado;

      // Actualizar logs que tengan estados antiguos
      if (oportunidad.logs && Array.isArray(oportunidad.logs)) {
        let logsModificados = false;
        
        oportunidad.logs = oportunidad.logs.map(log => {
          const logObj = log.toObject ? log.toObject() : log;
          let logModificado = false;

          // Mapear estadoAnterior si es antiguo
          if (logObj.estadoAnterior && ['pendiente', 'en_gestion', 'a_tratar', 'cerrado'].includes(logObj.estadoAnterior)) {
            const estadoMapeadoAnterior = mapearEstado(logObj.estadoAnterior);
            if (estadoMapeadoAnterior) {
              logObj.estadoAnterior = estadoMapeadoAnterior.estado;
              if (!logObj.subEstadoAnterior && estadoMapeadoAnterior.subEstado) {
                logObj.subEstadoAnterior = estadoMapeadoAnterior.subEstado;
              }
              logModificado = true;
            }
          }

          // Mapear estadoNuevo si es antiguo
          if (logObj.estadoNuevo && ['pendiente', 'en_gestion', 'a_tratar', 'cerrado'].includes(logObj.estadoNuevo)) {
            const estadoMapeadoNuevo = mapearEstado(logObj.estadoNuevo);
            if (estadoMapeadoNuevo) {
              logObj.estadoNuevo = estadoMapeadoNuevo.estado;
              if (!logObj.subEstadoNuevo && estadoMapeadoNuevo.subEstado) {
                logObj.subEstadoNuevo = estadoMapeadoNuevo.subEstado;
              }
              logModificado = true;
            }
          }

          if (logModificado) {
            logsModificados = true;
            logsActualizados++;
          }

          return logObj;
        });

        if (logsModificados) {
          oportunidad.markModified('logs');
        }
      }

      await oportunidad.save();
      actualizadas++;

      console.log(`✅ ${oportunidad.ingresoReferencia}: "${estadoAntiguo}" → "${estadoMapeado.estado}"${estadoMapeado.subEstado ? ` (${estadoMapeado.subEstado})` : ''}`);
    }

    console.log(`\n✨ Migración completada:`);
    console.log(`   - Oportunidades actualizadas: ${actualizadas}`);
    console.log(`   - Logs actualizados: ${logsActualizados}`);

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Ejecutar migración
dotenv.config({ path: path.join(__dirname, '..', '.env') });
migrarOportunidades();



