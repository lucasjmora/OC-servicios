import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import CitaGestion from '../models/CitaGestion.js';
import Configuracion from '../models/Configuracion.js';
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

  return 'mongodb://localhost:27017/oc-servicios';
}

// Conectar a MongoDB
const MONGODB_URI = await resolveMongoUri();
await mongoose.connect(MONGODB_URI);
console.log('✅ Conectado a MongoDB');

// Obtener configuración
const config = await Configuracion.findOne({ singleton: true });
const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

// Fechas: últimos 7 días hasta ayer (16/12/2025 a 22/12/2025)
const ahora = new Date();
const fechaLimite = new Date(Date.UTC(
  ahora.getUTCFullYear(),
  ahora.getUTCMonth(),
  ahora.getUTCDate() - 7, // Hace 7 días
  0, 0, 0, 0
));
const fechaHasta = new Date(Date.UTC(
  ahora.getUTCFullYear(),
  ahora.getUTCMonth(),
  ahora.getUTCDate() - 1, // Ayer
  23, 59, 59, 999
));

console.log(`📅 Fecha límite: ${fechaLimite.toISOString()}`);
console.log(`📅 Fecha hasta: ${fechaHasta.toISOString()}`);

// Obtener todas las citas de FC CS (taller 414) en el rango de fechas
const citasFilter = {
  'Fecha ci': { 
    $gte: fechaLimite, 
    $lte: fechaHasta 
  },
  Taller: 414 // FC CS
};

const citas = await Cita.find(citasFilter).select('Referencia Taller Matricula Fecha ci').lean();
console.log(`\n📊 Total citas FC CS en rango: ${citas.length}`);

// Normalizar matrículas
const normalizarMatricula = (matricula) => {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const normalizarFecha = (fecha) => {
  if (!fecha) return null;
  const fechaDate = fecha instanceof Date ? new Date(fecha) : new Date(fecha);
  if (isNaN(fechaDate.getTime())) return null;
  return Date.UTC(
    fechaDate.getUTCFullYear(),
    fechaDate.getUTCMonth(),
    fechaDate.getUTCDate()
  );
};

const estaDentroDeTolerancia = (fechaCita, fechaIngreso) => {
  const fechaCitaNormalizada = normalizarFecha(fechaCita);
  const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);
  if (!fechaCitaNormalizada || !fechaIngresoNormalizada) return false;
  const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
  if (diffMs < 0) return false;
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias <= diasTolerancia;
};

// Obtener todas las matrículas únicas
const matriculaVariantes = new Set();
citas.forEach(cita => {
  if (cita?.Matricula) {
    const valorOriginal = cita.Matricula.toString();
    const valorTrim = valorOriginal.trim();
    if (valorOriginal) matriculaVariantes.add(valorOriginal);
    if (valorTrim) {
      matriculaVariantes.add(valorTrim);
      matriculaVariantes.add(valorTrim.toUpperCase());
    }
  }
});

const matriculas = Array.from(matriculaVariantes).filter(Boolean);

// Buscar ingresos
const ingresosMap = new Map();
if (matriculas.length > 0) {
  const orConditions = [];
  const matriculasNormalizadasSet = new Set();

  matriculas.forEach(valor => {
    const matriculaNormalizada = normalizarMatricula(valor);
    if (!matriculaNormalizada || matriculasNormalizadasSet.has(matriculaNormalizada)) {
      return;
    }
    matriculasNormalizadasSet.add(matriculaNormalizada);
    const regexPattern = matriculaNormalizada.split('').join('[^A-Z0-9]*');
    const regex = new RegExp(`^${regexPattern}[^A-Z0-9]*$`, 'i');
    orConditions.push({ 'Matrícula vehí': regex });
  });

  if (orConditions.length > 0) {
    const ingresos = await Ingreso.find({
      $or: orConditions
    }).select({
      Referencia: 1,
      Fecaper: 1,
      'Matrícula vehí': 1
    }).lean();

    ingresos.forEach(ingreso => {
      const matriculaNormalizadaIngreso = normalizarMatricula(ingreso['Matrícula vehí']);
      if (matriculaNormalizadaIngreso) {
        if (!ingresosMap.has(matriculaNormalizadaIngreso)) {
          ingresosMap.set(matriculaNormalizadaIngreso, []);
        }
        ingresosMap.get(matriculaNormalizadaIngreso).push(ingreso);
      }
    });
  }
}

// Identificar citas que "no asistieron"
const citasNoAsistio = [];
citas.forEach(cita => {
  let tieneAsistencia = false;
  const matriculaNormalizada = normalizarMatricula(cita.Matricula);
  
  if (cita['Fecha ci'] && matriculaNormalizada && ingresosMap.has(matriculaNormalizada)) {
    const fechaCita = cita['Fecha ci'];
    const ingresosCita = ingresosMap.get(matriculaNormalizada);
    const ingresoEncontrado = ingresosCita?.find(ingreso => {
      return estaDentroDeTolerancia(fechaCita, ingreso.Fecaper);
    });
    if (ingresoEncontrado) {
      tieneAsistencia = true;
    }
  }
  
  if (!tieneAsistencia) {
    citasNoAsistio.push(cita);
  }
});

console.log(`📊 Citas "no asistió": ${citasNoAsistio.length}`);

// Obtener CitaGestion para estas citas
const referenciasCitasNoAsistio = citasNoAsistio.map(c => c.Referencia);
const todasCitasGestion = await CitaGestion.find({
  citaReferencia: { $in: referenciasCitasNoAsistio }
}).lean();

const gestionPorReferencia = new Map();
todasCitasGestion.forEach(cg => {
  gestionPorReferencia.set(cg.citaReferencia, cg);
});

// Filtrar citas que cumplen: "No asistió" + "Abierto (Pendiente)"
const citasFinales = citasNoAsistio.filter(cita => {
  const gestion = gestionPorReferencia.get(cita.Referencia);
  
  // Si no tiene CitaGestion, se considera abierto pendiente por defecto
  if (!gestion) {
    return true;
  }
  
  // Si tiene CitaGestion, debe estar abierto y pendiente
  return gestion.estado === 'abierto' && gestion.subEstado === 'pendiente';
});

console.log(`\n✅ RESULTADO FINAL:`);
console.log(`   Total citas FC CS (no asistió + abierto pendiente): ${citasFinales.length}`);
console.log(`   - Sin CitaGestion: ${citasFinales.filter(c => !gestionPorReferencia.has(c.Referencia)).length}`);
console.log(`   - Con CitaGestion abierto/pendiente: ${citasFinales.filter(c => {
  const g = gestionPorReferencia.get(c.Referencia);
  return g && g.estado === 'abierto' && g.subEstado === 'pendiente';
}).length}`);

await mongoose.disconnect();
console.log('\n✅ Desconectado de MongoDB');

