import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import { executeImport } from '../services/importService.js';
import configStorageService from '../services/configStorageService.js';
import Configuracion from '../models/Configuracion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function obtenerRutasArchivos() {
  // Prioridad: configuración persistida en MongoDB -> almacenamiento local -> variables de entorno
  await configStorageService.initialize();

  let rutas = configStorageService.getConfig()?.filePaths || {};

  try {
    const configDB = await Configuracion.findOne({ singleton: true }).lean();
    if (configDB?.filePaths) {
      rutas = { ...rutas, ...configDB.filePaths };
    }
  } catch (error) {
    console.warn('⚠️ No se pudo obtener configuracion de MongoDB:', error.message);
  }

  const citasPath =
    process.env.CITAS_PATH ||
    rutas?.citas ||
    'C:\\Users\\Lucas\\OneDrive - Grupo Opencars\\uipath\\PV_report_PBI\\source\\Citas\\citas.xlsx';
  const ingresosPath =
    process.env.INGRESOS_PATH ||
    rutas?.ingresos ||
    'C:\\Users\\Lucas\\OneDrive - Grupo Opencars\\uipath\\PV_report_PBI\\source\\Citas\\u124.xlsx';

  return { citasPath, ingresosPath };
}

async function main() {
  try {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI no está definido en backend/.env');
      process.exit(1);
    }

    const mongooseOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    };

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    console.log('✅ Conexión exitosa');

    const { citasPath, ingresosPath } = await obtenerRutasArchivos();
    console.log('📂 Archivo de citas:', citasPath);
    console.log('📂 Archivo de ingresos:', ingresosPath);

    const resultado = await executeImport(citasPath, ingresosPath);

    console.log('\n📈 Resultado de la importación manual:');
    console.log(JSON.stringify(resultado, null, 2));
  } catch (error) {
    console.error('❌ Error ejecutando importación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Conexión a MongoDB cerrada');
    process.exit(0);
  }
}

main();













