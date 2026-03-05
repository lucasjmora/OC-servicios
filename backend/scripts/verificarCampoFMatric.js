import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI no está configurada en las variables de entorno');
  process.exit(1);
}

async function verificarCampoFMatric() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const db = mongoose.connection.db;
    const ingresosCollection = db.collection('ingresos');

    // Obtener una muestra de documentos para ver qué campos tienen
    console.log('📋 Analizando campos de la colección "ingresos"...\n');

    // Obtener algunos documentos de ejemplo
    const muestras = await ingresosCollection.find({}).limit(10).toArray();

    if (muestras.length === 0) {
      console.log('⚠️ No se encontraron documentos en la colección "ingresos"');
      await mongoose.disconnect();
      return;
    }

    console.log(`📊 Analizando ${muestras.length} documentos de ejemplo:\n`);

    // Verificar si existe el campo "F.Matric" en alguno de los documentos
    let tieneFMatric = false;
    const camposEncontrados = new Set();

    muestras.forEach((doc, index) => {
      console.log(`Documento ${index + 1} (Referencia: ${doc.Referencia || 'N/A'}):`);
      
      // Buscar todos los campos que contengan "matric" o "F."
      const camposRelevantes = Object.keys(doc).filter(key => 
        key.toLowerCase().includes('matric') || 
        key.toLowerCase().includes('matrícula') ||
        key.startsWith('F.') ||
        key.toLowerCase().includes('patente')
      );

      if (camposRelevantes.length > 0) {
        console.log('  Campos relacionados con matrícula:');
        camposRelevantes.forEach(campo => {
          const valor = doc[campo];
          console.log(`    - ${campo}: "${valor}" (tipo: ${typeof valor})`);
          camposEncontrados.add(campo);
          
          if (campo === 'F.Matric' || campo === 'F.Matrícula' || campo === 'F.Matricula') {
            tieneFMatric = true;
          }
        });
      } else {
        console.log('  ⚠️ No se encontraron campos relacionados con matrícula');
      }

      // Mostrar todos los campos que empiezan con "F."
      const camposF = Object.keys(doc).filter(key => key.startsWith('F.'));
      if (camposF.length > 0) {
        console.log('  Campos que empiezan con "F.":');
        camposF.forEach(campo => {
          console.log(`    - ${campo}: "${doc[campo]}" (tipo: ${typeof doc[campo]})`);
          camposEncontrados.add(campo);
        });
      }

      console.log('');
    });

    // Verificar específicamente si existe "F.Matric" en toda la colección
    console.log('🔍 Verificando si existe el campo "F.Matric" en la colección...\n');
    
    const conteoFMatric = await ingresosCollection.countDocuments({ 'F.Matric': { $exists: true, $ne: null } });
    const conteoFMatricula = await ingresosCollection.countDocuments({ 'F.Matrícula': { $exists: true, $ne: null } });
    const conteoFMatriculaSinTilde = await ingresosCollection.countDocuments({ 'F.Matricula': { $exists: true, $ne: null } });
    const conteoMatriculaVehi = await ingresosCollection.countDocuments({ 'Matrícula vehí': { $exists: true, $ne: null } });

    console.log('📊 Conteo de documentos con campos de matrícula:');
    console.log(`  - "F.Matric": ${conteoFMatric} documentos`);
    console.log(`  - "F.Matrícula": ${conteoFMatricula} documentos`);
    console.log(`  - "F.Matricula": ${conteoFMatriculaSinTilde} documentos`);
    console.log(`  - "Matrícula vehí": ${conteoMatriculaVehi} documentos\n`);

    // Obtener un ejemplo de documento que tenga F.Matric si existe
    if (conteoFMatric > 0) {
      console.log('✅ El campo "F.Matric" EXISTE en la base de datos\n');
      const ejemplo = await ingresosCollection.findOne({ 'F.Matric': { $exists: true, $ne: null } });
      console.log('Ejemplo de documento con "F.Matric":');
      console.log(`  Referencia: ${ejemplo.Referencia}`);
      console.log(`  F.Matric: "${ejemplo['F.Matric']}"`);
      if (ejemplo['Matrícula vehí']) {
        console.log(`  Matrícula vehí: "${ejemplo['Matrícula vehí']}"`);
      }
    } else {
      console.log('❌ El campo "F.Matric" NO existe en la base de datos\n');
    }

    // Resumen de todos los campos encontrados
    console.log('\n📋 Resumen de campos relacionados con matrícula encontrados:');
    Array.from(camposEncontrados).sort().forEach(campo => {
      console.log(`  - ${campo}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Verificación completada');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verificarCampoFMatric();
