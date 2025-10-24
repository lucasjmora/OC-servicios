import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Cita from '../models/Cita.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucasjmora:rUAhjnEbxWJXv9nY@lm-mongodb.mw28zss.mongodb.net/oc_servicios?retryWrites=true&w=majority';

async function verificarHoraCita() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar la cita específica
    const referencia = '9562580';
    console.log(`📋 Buscando cita con referencia: ${referencia}\n`);
    
    const cita = await Cita.findOne({ Referencia: referencia }).lean();
    
    if (!cita) {
      console.log('❌ No se encontró la cita');
      process.exit(1);
    }
    
    console.log('✅ Cita encontrada:');
    console.log('=' .repeat(60));
    console.log('Referencia:', cita.Referencia);
    console.log('Nombre:', cita.Nombre);
    console.log('Fecha Cita:', cita['Fecha ci']);
    console.log('Hora (campo completo):', cita['Hora ']);
    console.log('Tipo de Hora:', typeof cita['Hora ']);
    console.log('Hora es null?:', cita['Hora '] === null);
    console.log('Hora es undefined?:', cita['Hora '] === undefined);
    console.log('Hora es string vacío?:', cita['Hora '] === '');
    console.log('=' .repeat(60));
    
    // Buscar algunas citas sin hora
    console.log('\n🔍 Buscando citas sin hora...\n');
    const citasSinHora = await Cita.find({
      $or: [
        { 'Hora ': null },
        { 'Hora ': '' },
        { 'Hora ': { $exists: false } }
      ]
    })
    .limit(10)
    .lean();
    
    console.log(`📊 Citas sin hora encontradas: ${citasSinHora.length}`);
    citasSinHora.forEach((c, i) => {
      console.log(`${i + 1}. ${c.Referencia} - Hora: "${c['Hora ']}" (tipo: ${typeof c['Hora ']})`);
    });
    
    // Contar total de citas con y sin hora
    console.log('\n📊 Estadísticas generales:\n');
    const totalCitas = await Cita.countDocuments();
    const citasConHora = await Cita.countDocuments({
      'Hora ': { $exists: true, $ne: null, $ne: '' }
    });
    const citasSinHoraTotal = totalCitas - citasConHora;
    
    console.log(`Total de citas: ${totalCitas}`);
    console.log(`Citas CON hora: ${citasConHora} (${(citasConHora / totalCitas * 100).toFixed(1)}%)`);
    console.log(`Citas SIN hora: ${citasSinHoraTotal} (${(citasSinHoraTotal / totalCitas * 100).toFixed(1)}%)`);
    
    await mongoose.disconnect();
    console.log('\n✅ Verificación completada');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verificarHoraCita();





