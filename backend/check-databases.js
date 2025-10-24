// Script para verificar en qué base de datos están los datos
import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://lucasjmora:rUAhjnEbxWJXv9nY@lm-mongodb.mw28zss.mongodb.net/';

async function checkDatabases() {
  try {
    console.log('🔍 Verificando bases de datos...\n');
    
    // Conectar sin especificar base de datos
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Listar todas las bases de datos
    const admin = mongoose.connection.db.admin();
    const databases = await admin.listDatabases();
    
    console.log('\n📊 Bases de datos disponibles:');
    databases.databases.forEach(db => {
      console.log(`   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Verificar cada base de datos relevante
    for (const dbInfo of databases.databases) {
      const dbName = dbInfo.name;
      if (dbName.includes('oc') || dbName === 'test' || dbName === 'oc_servicios') {
        console.log(`\n🔍 Verificando base de datos: ${dbName}`);
        
        const db = mongoose.connection.useDb(dbName);
        const collections = await db.listCollections().toArray();
        
        console.log(`   Colecciones en ${dbName}:`);
        for (const collection of collections) {
          const coll = db.collection(collection.name);
          const count = await coll.countDocuments();
          console.log(`     - ${collection.name}: ${count} documentos`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

checkDatabases();





