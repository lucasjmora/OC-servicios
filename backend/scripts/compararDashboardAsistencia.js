import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Cita from '../models/Cita.js';
import CitaGestion from '../models/CitaGestion.js';
import Ingreso from '../models/Ingreso.js';
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

  throw new Error('No se encontró URI de MongoDB');
}

// Conectar a MongoDB
const MONGODB_URI = await resolveMongoUri();
await mongoose.connect(MONGODB_URI);
console.log('✅ Conectado a MongoDB');

// Función para normalizar matrícula (igual que en ambos endpoints)
const normalizarMatricula = (matricula) => {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// Función para normalizar fecha
const normalizarFecha = (fecha) => {
  if (!fecha) return null;
  const fechaDate = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(fechaDate.getTime())) return null;
  return Date.UTC(
    fechaDate.getUTCFullYear(),
    fechaDate.getUTCMonth(),
    fechaDate.getUTCDate()
  );
};

// Obtener configuración
const config = await Configuracion.findOne({ singleton: true });
const diasTolerancia = config?.asistencia?.diasTolerancia || 3;
const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};

// Parámetros de prueba - Dashboard usa fechas por defecto (hace 7 días hasta ayer)
// Si hoy es 24/12/2025, entonces: hace 7 días = 16/12, ayer = 23/12
const fechaDesde = '2025-12-16';
const fechaHasta = '2025-12-23';
const tallerNombre = 'FC CS';

// Buscar código de taller FC CS
let codigoTallerFC_CS = null;
for (const [codigo, nombre] of Object.entries(talleresMap)) {
  if (nombre === tallerNombre) {
    codigoTallerFC_CS = parseInt(codigo);
    break;
  }
}

if (!codigoTallerFC_CS) {
  console.error('❌ No se encontró el código de taller para FC CS');
  process.exit(1);
}

console.log(`\n🔍 Buscando citas para ${tallerNombre} (código: ${codigoTallerFC_CS})...`);
console.log(`📅 Rango de fechas: ${fechaDesde} a ${fechaHasta}`);

// Calcular fechas (igual que asistenciaService.js)
const [yearDesde, monthDesde, dayDesde] = fechaDesde.split('-').map(Number);
const [yearHasta, monthHasta, dayHasta] = fechaHasta.split('-').map(Number);

const fechaDesdeDate = new Date(Date.UTC(yearDesde, monthDesde - 1, dayDesde - 1, 20, 0, 0, 0));
const fechaHastaDate = new Date(Date.UTC(yearHasta, monthHasta - 1, dayHasta + 1, 2, 59, 59, 999));

console.log(`📅 Fecha desde (UTC): ${fechaDesdeDate.toISOString()}`);
console.log(`📅 Fecha hasta (UTC): ${fechaHastaDate.toISOString()}`);

// Obtener citas (igual que dashboard)
const citasFilter = {
  'Fecha ci': { 
    $gte: fechaDesdeDate, 
    $lte: fechaHastaDate 
  },
  Taller: codigoTallerFC_CS
};

const citas = await Cita.find(citasFilter).lean();
console.log(`\n📊 Total citas encontradas: ${citas.length}`);

// Obtener todas las matrículas únicas (igual que ambos endpoints)
const matriculaVariantes = new Set();
citas.forEach(cita => {
  if (!cita?.Matricula) {
    return;
  }

  const valorOriginal = cita.Matricula.toString();
  const valorTrim = valorOriginal.trim();

  if (valorOriginal) {
    matriculaVariantes.add(valorOriginal);
  }

  if (valorTrim) {
    matriculaVariantes.add(valorTrim);
    const valorUpper = valorTrim.toUpperCase();
    if (valorUpper) {
      matriculaVariantes.add(valorUpper);
    }
  }
});

const matriculas = Array.from(matriculaVariantes).filter(Boolean);
console.log(`📋 Matrículas únicas encontradas: ${matriculas.length}`);

// Buscar ingresos (igual que ambos endpoints)
let ingresosMap = new Map();
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
      let matriculaValue = ingreso['Matrícula vehí'];
      if (!matriculaValue) {
        return;
      }
      
      const matriculaNormalizadaIngreso = normalizarMatricula(matriculaValue);
      if (!matriculaNormalizadaIngreso) {
        return;
      }
      
      const clavesAdicionales = [];
      if (matriculaValue) {
        clavesAdicionales.push(matriculaValue.toString().trim());
      }
      if (matriculaValue) {
        const alfanumerico = matriculaValue.toString().replace(/[^A-Za-z0-9]/g, '');
        if (alfanumerico) {
          clavesAdicionales.push(alfanumerico);
        }
      }
      
      const clavesNormalizadas = new Set([matriculaNormalizadaIngreso]);
      clavesAdicionales
        .filter(Boolean)
        .forEach(clave => {
          const normalizadaClave = normalizarMatricula(clave);
          if (normalizadaClave) {
            clavesNormalizadas.add(normalizadaClave);
          }
        });
      
      clavesNormalizadas.forEach(clave => {
        if (!ingresosMap.has(clave)) {
          ingresosMap.set(clave, []);
        }
        ingresosMap.get(clave).push(ingreso);
      });
    });
  }
}

console.log(`📋 Ingresos mapeados: ${ingresosMap.size} claves únicas`);

// Función para verificar tolerancia
const estaDentroDeTolerancia = (fechaCita, fechaIngreso, diasToleranciaParam = diasTolerancia) => {
  const fechaCitaNormalizada = normalizarFecha(fechaCita);
  const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);
  if (!fechaCitaNormalizada || !fechaIngresoNormalizada) return false;
  const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
  if (diffMs < 0) {
    return false;
  }
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias <= diasToleranciaParam;
};

// Identificar citas "No asistió" (igual que dashboard)
const citasNoAsistio = [];
for (const cita of citas) {
  let tieneAsistencia = false;
  const matriculaNormalizada = normalizarMatricula(cita.Matricula);
  
  if (cita['Fecha ci'] && matriculaNormalizada) {
    if (!ingresosMap.has(matriculaNormalizada)) {
      // Búsqueda directa
      try {
        const regexPattern = matriculaNormalizada.split('').join('[^A-Z0-9]*');
        const regex = new RegExp(`^${regexPattern}[^A-Z0-9]*$`, 'i');
        
        const ingresosDirectos = await Ingreso.find({
          $or: [
            { 'Matrícula vehí': regex },
            { 'Matrícula vehí': { $regex: `^${matriculaNormalizada}$`, $options: 'i' } },
            { 'Matrícula vehí': { $regex: `.*${matriculaNormalizada}.*`, $options: 'i' } }
          ]
        }).select({
          Referencia: 1,
          Fecaper: 1,
          'Matrícula vehí': 1
        }).lean();
        
        if (ingresosDirectos.length > 0) {
          ingresosDirectos.forEach(ingreso => {
            let matriculaValue = ingreso['Matrícula vehí'];
            if (!matriculaValue) {
              return;
            }
            
            const matriculaNormalizadaIngreso = normalizarMatricula(matriculaValue);
            if (!matriculaNormalizadaIngreso) {
              return;
            }
            
            const clavesAdicionales = [];
            if (matriculaValue) {
              clavesAdicionales.push(matriculaValue.toString().trim());
            }
            if (matriculaValue) {
              const alfanumerico = matriculaValue.toString().replace(/[^A-Za-z0-9]/g, '');
              if (alfanumerico) {
                clavesAdicionales.push(alfanumerico);
              }
            }
            
            const clavesNormalizadas = new Set([matriculaNormalizadaIngreso]);
            clavesAdicionales
              .filter(Boolean)
              .forEach(clave => {
                const normalizadaClave = normalizarMatricula(clave);
                if (normalizadaClave) {
                  clavesNormalizadas.add(normalizadaClave);
                }
              });
            
            clavesNormalizadas.forEach(clave => {
              if (!ingresosMap.has(clave)) {
                ingresosMap.set(clave, []);
              }
              ingresosMap.get(clave).push(ingreso);
            });
          });
        }
      } catch (error) {
        console.warn(`Error buscando ingresos para cita ${cita.Referencia}:`, error.message);
      }
    }
    
    if (ingresosMap.has(matriculaNormalizada)) {
      try {
        const fechaCita = cita['Fecha ci'];
        const ingresosCita = ingresosMap.get(matriculaNormalizada);
        const ingresoEncontrado = ingresosCita?.find(ingreso => {
          return estaDentroDeTolerancia(fechaCita, ingreso.Fecaper, diasTolerancia);
        });
        if (ingresoEncontrado) {
          tieneAsistencia = true;
        }
      } catch (error) {
        console.warn(`Error verificando asistencia para cita ${cita.Referencia}:`, error.message);
      }
    }
  }
  
  if (!tieneAsistencia) {
    citasNoAsistio.push(cita);
  }
}

console.log(`\n📊 Citas "No asistió": ${citasNoAsistio.length}`);

// Obtener CitaGestion (igual que dashboard)
const referenciasCitasNoAsistio = citasNoAsistio.map(c => c.Referencia);
const todasCitasGestion = await CitaGestion.find({
  citaReferencia: { $in: referenciasCitasNoAsistio }
}).lean();

console.log(`📊 Citas gestion encontradas: ${todasCitasGestion.length}`);

const gestionPorReferencia = new Map();
todasCitasGestion.forEach(cg => {
  gestionPorReferencia.set(cg.citaReferencia, cg);
});

// Filtrar por estado "abierto (pendiente)" (igual que dashboard)
const citasFinales = citasNoAsistio.filter(cita => {
  const gestion = gestionPorReferencia.get(cita.Referencia);
  
  if (!gestion) {
    return true;
  }
  
  return gestion.estado === 'abierto' && gestion.subEstado === 'pendiente';
});

console.log(`\n📊 RESULTADO FINAL:`);
console.log(`   - Total citas en rango: ${citas.length}`);
console.log(`   - Citas "No asistió": ${citasNoAsistio.length}`);
console.log(`   - Citas finales (No asistió + Abierto Pendiente): ${citasFinales.length}`);
console.log(`   - Sin CitaGestion: ${citasFinales.filter(c => !gestionPorReferencia.has(c.Referencia)).length}`);
console.log(`   - Con CitaGestion abierto/pendiente: ${citasFinales.filter(c => {
  const g = gestionPorReferencia.get(c.Referencia);
  return g && g.estado === 'abierto' && g.subEstado === 'pendiente';
}).length}`);

// Mostrar detalles de las citas finales
console.log(`\n📋 Detalles de las citas finales:`);
citasFinales.forEach((cita, index) => {
  const gestion = gestionPorReferencia.get(cita.Referencia);
  const fechaCi = cita['Fecha ci'];
  console.log(`   ${index + 1}. Cita ${cita.Referencia}:`);
  console.log(`      - Fecha ci: ${fechaCi ? new Date(fechaCi).toLocaleDateString('es-AR') + ' ' + new Date(fechaCi).toLocaleTimeString('es-AR') : 'N/A'}`);
  console.log(`      - Matrícula: ${cita.Matricula || 'N/A'}`);
  console.log(`      - CitaGestion: ${gestion ? `${gestion.estado}/${gestion.subEstado}` : 'Sin CitaGestion'}`);
});

await mongoose.disconnect();
console.log('\n✅ Desconectado de MongoDB');

