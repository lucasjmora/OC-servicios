import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
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

async function main() {
  try {
    const uri = await resolveMongoUri();
    if (!uri) {
      console.error('No se pudo resolver la URI de MongoDB.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Conectado a MongoDB\n');

    // Obtener todos los usuarios únicos
    const usuarios = await Cita.distinct('Usuario');
    console.log(`Total de usuarios únicos: ${usuarios.length}\n`);

    // Buscar usuarios que contengan "martina"
    const usuariosMartina = usuarios.filter(u => 
      u && u.toString().toLowerCase().includes('martina')
    );

    console.log('Usuarios que contienen "martina":');
    if (usuariosMartina.length > 0) {
      usuariosMartina.forEach(u => {
        console.log(`  - "${u}"`);
      });
      
      // Contar citas de cada usuario
      console.log('\nCitas por usuario:');
      for (const usuario of usuariosMartina) {
        const count = await Cita.countDocuments({ Usuario: usuario });
        console.log(`  - "${usuario}": ${count} citas`);
      }
    } else {
      console.log('  No se encontraron usuarios con "martina"');
      console.log('\nPrimeros 20 usuarios encontrados:');
      usuarios.slice(0, 20).forEach(u => {
        console.log(`  - "${u}"`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

