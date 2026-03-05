import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Ingreso from '../models/Ingreso.js';
import configStorageService from '../services/configStorageService.js';

dotenv.config({ path: './.env' });

async function resolveMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  await configStorageService.initialize();
  const localConfig = configStorageService.getConfig();
  if (localConfig?.mongodb?.uri) {
    return localConfig.mongodb.uri;
  }

  const dbConfig = await mongoose.connection.db?.admin().command({ ping: 1 });
  return null;
}

function normalizarMatricula(matricula) {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function main() {
  try {
    const matricula = process.argv[2];
    if (!matricula) {
      console.error('Uso: node scripts/buscarIngresos.js <MATRICULA>');
      process.exit(1);
    }

    const uri = process.env.MONGODB_URI || (await configStorageService.initialize() && configStorageService.getConfig()?.mongodb?.uri);
    
    if (!uri) {
      console.error('No se pudo resolver la URI de MongoDB.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`\n🔍 BUSCANDO INGRESOS - Matrícula: ${matricula}\n`);
    console.log('='.repeat(60));

    const matriculaNormalizada = normalizarMatricula(matricula);
    console.log(`Matrícula normalizada: "${matriculaNormalizada}"\n`);

    // Buscar con diferentes variaciones
    const patrones = [
      matricula,
      matriculaNormalizada,
      matricula.replace(/\s+/g, ''),
      matricula.replace(/[^A-Z0-9]/g, ''),
      new RegExp(matriculaNormalizada.substring(0, 4), 'i'), // Primeros 4 caracteres
      new RegExp(matriculaNormalizada.substring(0, 5), 'i'), // Primeros 5 caracteres
    ];

    console.log('🔍 Buscando con diferentes patrones...\n');

    // Buscar todos los ingresos que contengan parte de la matrícula
    const ingresosEncontrados = await Ingreso.find({
      'Matrícula vehí': {
        $regex: matriculaNormalizada.substring(0, 4),
        $options: 'i'
      }
    }).limit(50).lean();

    console.log(`📋 Ingresos encontrados (primeros 4 caracteres "${matriculaNormalizada.substring(0, 4)}"): ${ingresosEncontrados.length}\n`);

    if (ingresosEncontrados.length > 0) {
      console.log('Ingresos encontrados:');
      ingresosEncontrados.forEach((ingreso, idx) => {
        const matriculaIngreso = ingreso['Matrícula vehí'];
        const matriculaIngresoNorm = normalizarMatricula(matriculaIngreso);
        const coincide = matriculaIngresoNorm === matriculaNormalizada;
        
        console.log(`\n${idx + 1}. Referencia: ${ingreso.Referencia}`);
        console.log(`   Matrícula raw: "${matriculaIngreso}"`);
        console.log(`   Matrícula normalizada: "${matriculaIngresoNorm}"`);
        console.log(`   ¿Coincide exactamente? ${coincide ? '✅ SÍ' : '❌ NO'}`);
        console.log(`   Fecha: ${ingreso.Fecaper ? new Date(ingreso.Fecaper).toISOString().split('T')[0] : 'N/A'}`);
      });
    } else {
      console.log('⚠️  No se encontraron ingresos con ese patrón.\n');
      console.log('Buscando todas las matrículas que contengan "075"...\n');
      
      const ingresosCon075 = await Ingreso.find({
        'Matrícula vehí': { $regex: '075', $options: 'i' }
      }).limit(20).lean();
      
      console.log(`Encontrados ${ingresosCon075.length} ingresos con "075":`);
      ingresosCon075.forEach((ingreso, idx) => {
        console.log(`   ${idx + 1}. "${ingreso['Matrícula vehí']}" - Ref: ${ingreso.Referencia}`);
      });
    }

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();











