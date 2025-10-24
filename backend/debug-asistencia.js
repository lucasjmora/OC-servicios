import mongoose from 'mongoose';
import Cita from './models/Cita.js';
import Ingreso from './models/Ingreso.js';

// Conectar a MongoDB
const MONGODB_URI = 'mongodb+srv://lucas:lucas123@cluster0.4hvl8.mongodb.net/oc_servicios?retryWrites=true&w=majority';
await mongoose.connect(MONGODB_URI);

console.log('🔍 Diagnóstico de Asistencia...\n');

// Obtener algunas citas de muestra
const citas = await Cita.find({})
  .sort({ 'Fecha ci': -1 })
  .limit(5)
  .lean();

console.log('📋 Muestra de Citas:');
citas.forEach((cita, index) => {
  console.log(`${index + 1}. Referencia: ${cita.Referencia}`);
  console.log(`   Matrícula: "${cita.Matricula}"`);
  console.log(`   Fecha Cita: ${cita['Fecha ci']}`);
  console.log(`   Nombre: ${cita.Nombre}`);
  console.log('');
});

// Obtener algunos ingresos de muestra
const ingresos = await Ingreso.find({})
  .sort({ Fecaper: -1 })
  .limit(5)
  .lean();

console.log('📋 Muestra de Ingresos:');
ingresos.forEach((ingreso, index) => {
  console.log(`${index + 1}. Referencia: ${ingreso.Referencia}`);
  console.log(`   Matrícula: "${ingreso['Matrícula vehí']}"`);
  console.log(`   Fecha Ingreso: ${ingreso.Fecaper}`);
  console.log(`   Cliente: ${ingreso['IDP NOMBRE'] || 'N/A'}`);
  console.log('');
});

// Verificar coincidencias por matrícula
console.log('🔍 Verificando coincidencias por matrícula...');
const matriculaCita = citas[0]?.Matricula;
if (matriculaCita) {
  console.log(`Buscando ingresos para matrícula: "${matriculaCita}"`);
  
  const ingresosMismaMatricula = await Ingreso.find({
    'Matrícula vehí': matriculaCita
  }).lean();
  
  console.log(`Ingresos encontrados: ${ingresosMismaMatricula.length}`);
  
  if (ingresosMismaMatricula.length > 0) {
    ingresosMismaMatricula.forEach((ingreso, index) => {
      console.log(`  ${index + 1}. Fecha: ${ingreso.Fecaper}`);
      console.log(`     Referencia: ${ingreso.Referencia}`);
    });
  }
}

// Verificar estructura de campos
console.log('\n🔍 Estructura de campos:');
console.log('Campos en Cita:', Object.keys(citas[0] || {}));
console.log('Campos en Ingreso:', Object.keys(ingresos[0] || {}));

await mongoose.disconnect();
console.log('\n✅ Diagnóstico completado');




