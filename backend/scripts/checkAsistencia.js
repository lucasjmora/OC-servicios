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
      console.error('Uso: node scripts/checkAsistencia.js <MATRICULA>');
      process.exit(1);
    }

    const uri = await resolveMongoUri();
    if (!uri) {
      console.error('No se pudo resolver la URI de MongoDB. Configúrala desde la aplicación.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`Conectado a MongoDB. Consultando datos para matrícula ${matricula}...`);

    const config = await Configuracion.findOne({ singleton: true }).lean();
    const diasTolerancia = config?.asistencia?.diasTolerancia ?? 3;
    console.log(`Días de tolerancia configurados: ${diasTolerancia}`);

    // Buscar por matrícula de forma flexible (con regex)
    const normalizarMatricula = (mat) => {
      if (!mat) return '';
      return mat.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    };

    const matriculaNormalizada = normalizarMatricula(matricula);
    
    // Buscar por matrícula exacta primero
    let citas = await Cita.find({ Matricula: matricula })
      .sort({ 'Fecha ci': 1 })
      .lean();

    // Si no se encuentra, buscar con regex flexible
    if (!citas.length && matriculaNormalizada) {
      const regex = new RegExp(matriculaNormalizada, 'i');
      citas = await Cita.find({ Matricula: regex })
        .sort({ 'Fecha ci': 1 })
        .lean();
    }

    // También verificar si es una referencia
    if (!citas.length) {
      const citaPorRef = await Cita.findOne({ Referencia: matricula }).lean();
      if (citaPorRef) {
        citas = [citaPorRef];
        console.log(`⚠️ Se encontró por referencia en lugar de matrícula.`);
      }
    }

    if (!citas.length) {
      console.log(`No se encontraron citas para "${matricula}".`);
      console.log(`   Buscado como matrícula exacta y con regex (${matriculaNormalizada}).`);
      console.log(`   También verificado como referencia.`);
      return;
    }

    for (const cita of citas) {
      console.log('----------------------------------------');
      console.log(`Referencia cita: ${cita.Referencia}`);
      console.log(`Fecha cita: ${formatFecha(cita['Fecha ci'])}`);
      console.log(`Estado asistencia almacenado: ${cita.EstadoAsistencia || 'Sin calcular'}`);
      console.log(`Ingreso vinculado: ${cita.IngresoReferencia || 'N/A'}`);

      const fechaMin = new Date(cita['Fecha ci']);
      const fechaMax = new Date(fechaMin);
      fechaMax.setDate(fechaMax.getDate() + diasTolerancia);

      // Buscar ingresos con búsqueda flexible usando la matrícula de la cita
      const matriculaCitaNormalizada = normalizarMatricula(cita.Matricula);
      const regexIngreso = matriculaCitaNormalizada ? new RegExp(matriculaCitaNormalizada, 'i') : null;
      
      const condicionesBusqueda = [
        { 'Matrícula vehí': cita.Matricula },
        ...(regexIngreso ? [{ 'Matrícula vehí': regexIngreso }] : [])
      ];
      
      const ingresos = await Ingreso.find({
        $or: condicionesBusqueda,
        Fecaper: {
          $gte: fechaMin,
          $lte: fechaMax
        }
      })
        .sort({ Fecaper: 1 })
        .lean();

      if (!ingresos.length) {
        console.log('No se encontraron ingresos dentro del rango de tolerancia.');
      } else {
        console.log(`Ingresos encontrados (${ingresos.length}):`);
        ingresos.forEach((ingreso) => {
          console.log(`  • Referencia ${ingreso.Referencia} | Fecha ingreso ${formatFecha(ingreso.Fecaper)} | Δ días ${diasEntre(cita['Fecha ci'], ingreso.Fecaper)}`);
        });
      }
    }
  } catch (error) {
    console.error('Error analizando asistencia:', error);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();


