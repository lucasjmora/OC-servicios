import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Configuracion from '../models/Configuracion.js';
import Cita from '../models/Cita.js';
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

  const dbConfig = await Configuracion.findOne({ singleton: true }).lean();
  return dbConfig?.mongodb?.uri || null;
}

function normalizarMatricula(matricula) {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatFecha(fecha) {
  if (!fecha) return 'N/A';
  return new Date(fecha).toISOString().split('T')[0];
}

function diasEntre(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return null;
  const diff = new Date(fechaFin) - new Date(fechaInicio);
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

async function main() {
  try {
    const matricula = process.argv[2];
    if (!matricula) {
      console.error('Uso: node scripts/debugAsistencia.js <MATRICULA>');
      process.exit(1);
    }

    const uri = await resolveMongoUri();
    if (!uri) {
      console.error('No se pudo resolver la URI de MongoDB.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`\n🔍 DEBUG ASISTENCIA - Matrícula: ${matricula}\n`);
    console.log('='.repeat(60));

    const config = await Configuracion.findOne({ singleton: true }).lean();
    const diasTolerancia = config?.asistencia?.diasTolerancia ?? 3;
    console.log(`\n📊 Días de tolerancia configurados: ${diasTolerancia}\n`);

    // Buscar citas
    const matriculaNormalizada = normalizarMatricula(matricula);
    console.log(`🔍 Matrícula normalizada: "${matriculaNormalizada}"\n`);

    const citas = await Cita.find({ 
      $or: [
        { Matricula: matricula },
        { Matricula: new RegExp(matriculaNormalizada, 'i') }
      ]
    }).sort({ 'Fecha ci': 1 }).lean();

    console.log(`📋 Citas encontradas: ${citas.length}\n`);

    for (const cita of citas) {
      console.log('─'.repeat(60));
      console.log(`Referencia cita: ${cita.Referencia}`);
      console.log(`Matrícula en cita: "${cita.Matricula}"`);
      console.log(`Matrícula normalizada: "${normalizarMatricula(cita.Matricula)}"`);
      console.log(`Fecha cita: ${formatFecha(cita['Fecha ci'])}`);
      console.log(`Estado asistencia almacenado: ${cita.EstadoAsistencia || 'Sin calcular'}`);
      console.log(`Ingreso vinculado: ${cita.IngresoReferencia || 'N/A'}\n`);

      const fechaCita = new Date(cita['Fecha ci']);
      const fechaMin = new Date(fechaCita);
      fechaMin.setDate(fechaMin.getDate() - diasTolerancia);
      const fechaMax = new Date(fechaCita);
      fechaMax.setDate(fechaMax.getDate() + diasTolerancia);

      console.log(`📅 Rango de búsqueda:`);
      console.log(`   Desde: ${formatFecha(fechaMin)} (${diasTolerancia} días antes)`);
      console.log(`   Cita:  ${formatFecha(fechaCita)}`);
      console.log(`   Hasta: ${formatFecha(fechaMax)} (${diasTolerancia} días después)\n`);

      // Buscar TODOS los ingresos con esta matrícula (sin filtro de fecha primero)
      const todosIngresos = await Ingreso.find({
        $or: [
          { 'Matrícula vehí': cita.Matricula },
          { 'Matrícula vehí': new RegExp(normalizarMatricula(cita.Matricula), 'i') },
          { 'Matrícula vehí': new RegExp(matriculaNormalizada, 'i') }
        ]
      }).sort({ Fecaper: 1 }).lean();

      console.log(`🔍 Total ingresos encontrados (sin filtro fecha): ${todosIngresos.length}`);

      if (todosIngresos.length > 0) {
        console.log(`\n📋 Todos los ingresos para esta matrícula:`);
        todosIngresos.forEach((ingreso, idx) => {
          const matriculaIngreso = ingreso['Matrícula vehí'];
          const matriculaIngresoNorm = normalizarMatricula(matriculaIngreso);
          const fechaIngreso = ingreso.Fecaper;
          const diffDias = diasEntre(fechaCita, fechaIngreso);
          const dentroRango = fechaIngreso >= fechaMin && fechaIngreso <= fechaMax;
          
          console.log(`\n   ${idx + 1}. Referencia: ${ingreso.Referencia}`);
          console.log(`      Matrícula raw: "${matriculaIngreso}"`);
          console.log(`      Matrícula normalizada: "${matriculaIngresoNorm}"`);
          console.log(`      Fecha ingreso: ${formatFecha(fechaIngreso)}`);
          console.log(`      Δ días desde cita: ${diffDias !== null ? diffDias : 'N/A'}`);
          console.log(`      ¿Dentro de rango? ${dentroRango ? '✅ SÍ' : '❌ NO'}`);
          if (dentroRango) {
            console.log(`      ✅ ESTE INGRESO DEBERÍA SER DETECTADO`);
          }
        });
      }

      // Ahora buscar con filtro de fecha
      const ingresosEnRango = await Ingreso.find({
        $or: [
          { 'Matrícula vehí': cita.Matricula },
          { 'Matrícula vehí': new RegExp(normalizarMatricula(cita.Matricula), 'i') },
          { 'Matrícula vehí': new RegExp(matriculaNormalizada, 'i') }
        ],
        Fecaper: {
          $gte: fechaMin,
          $lte: fechaMax
        }
      }).sort({ Fecaper: 1 }).lean();

      console.log(`\n✅ Ingresos dentro del rango de fechas: ${ingresosEnRango.length}`);
      if (ingresosEnRango.length > 0) {
        ingresosEnRango.forEach((ingreso) => {
          console.log(`   • Referencia ${ingreso.Referencia} | Fecha ${formatFecha(ingreso.Fecaper)} | Δ días ${diasEntre(cita['Fecha ci'], ingreso.Fecaper)}`);
        });
      } else {
        console.log(`   ⚠️  No se encontraron ingresos en el rango`);
      }
    }

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();











