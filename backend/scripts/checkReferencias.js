import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

async function checkReferencias() {
  try {
    // Obtener configuración de MongoDB
    const config = await Configuracion.findOne({ singleton: true });
    if (!config || !config.mongodb?.uri) {
      console.error('❌ No se encontró configuración de MongoDB');
      process.exit(1);
    }

    // Conectar a MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ Conectado a MongoDB');

    // Obtener algunas referencias de citas
    console.log('\n📋 Verificando referencias de CITAS:');
    const citas = await Cita.find({}).limit(10).lean();
    console.log(`Total de citas en BD: ${await Cita.countDocuments()}`);
    console.log('\nEjemplos de referencias de citas:');
    citas.forEach((cita, index) => {
      const ref = cita.Referencia;
      console.log(`  ${index + 1}. Referencia: "${ref}" (tipo: ${typeof ref}, valor: ${JSON.stringify(ref)})`);
    });

    // Obtener algunas referencias de ingresos
    console.log('\n💰 Verificando referencias de INGRESOS:');
    const ingresos = await Ingreso.find({}).limit(10).lean();
    console.log(`Total de ingresos en BD: ${await Ingreso.countDocuments()}`);
    console.log('\nEjemplos de referencias de ingresos:');
    ingresos.forEach((ingreso, index) => {
      const ref = ingreso.Referencia;
      console.log(`  ${index + 1}. Referencia: "${ref}" (tipo: ${typeof ref}, valor: ${JSON.stringify(ref)})`);
    });

    // Verificar tipos en la colección directamente
    console.log('\n🔍 Verificando tipos directamente en MongoDB:');
    const citasRaw = await mongoose.connection.db.collection('citas').find({}).limit(5).toArray();
    console.log('\nReferencias de citas (raw de MongoDB):');
    citasRaw.forEach((cita, index) => {
      const ref = cita.Referencia;
      console.log(`  ${index + 1}. Referencia: ${JSON.stringify(ref)} (tipo MongoDB: ${ref?.constructor?.name || typeof ref})`);
    });

    const ingresosRaw = await mongoose.connection.db.collection('ingresos').find({}).limit(5).toArray();
    console.log('\nReferencias de ingresos (raw de MongoDB):');
    ingresosRaw.forEach((ingreso, index) => {
      const ref = ingreso.Referencia;
      console.log(`  ${index + 1}. Referencia: ${JSON.stringify(ref)} (tipo MongoDB: ${ref?.constructor?.name || typeof ref})`);
    });

    // Verificar si hay referencias como número vs string
    console.log('\n📊 Estadísticas de tipos:');
    const todasCitas = await Cita.find({}, { Referencia: 1 }).lean();
    const todasIngresos = await Ingreso.find({}, { Referencia: 1 }).lean();
    
    const citasNumeros = todasCitas.filter(c => typeof c.Referencia === 'number').length;
    const citasStrings = todasCitas.filter(c => typeof c.Referencia === 'string').length;
    const ingresosNumeros = todasIngresos.filter(i => typeof i.Referencia === 'number').length;
    const ingresosStrings = todasIngresos.filter(i => typeof i.Referencia === 'string').length;

    console.log(`Citas - Números: ${citasNumeros}, Strings: ${citasStrings}`);
    console.log(`Ingresos - Números: ${ingresosNumeros}, Strings: ${ingresosStrings}`);

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkReferencias();




