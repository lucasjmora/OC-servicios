import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import CitaGestion from '../models/CitaGestion.js';
import Configuracion from '../models/Configuracion.js';

// Función para normalizar matrícula (debe ser idéntica a la del servicio)
const normalizarMatricula = (matricula) => {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// Función para normalizar fecha
const normalizarFecha = (fecha) => {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }
  const fechaDate = new Date(fecha);
  if (isNaN(fechaDate.getTime())) return null;
  return new Date(fechaDate.getFullYear(), fechaDate.getMonth(), fechaDate.getDate());
};

// Función para verificar si está dentro de tolerancia
const estaDentroDeTolerancia = (fechaCita, fechaIngreso, diasTolerancia = 3) => {
  const fechaCitaNormalizada = normalizarFecha(fechaCita);
  const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);

  if (!fechaCitaNormalizada || !fechaIngresoNormalizada) {
    return false;
  }

  const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  
  // El ingreso debe ser posterior o igual a la fecha de la cita
  if (diffMs < 0) {
    return false;
  }
  
  return diffDias <= diasTolerancia;
};

async function comparar() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oc-servicios';
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    // Fechas: usar el mismo rango que la página de asistencia (16/12/2025 - 22/12/2025)
    // Parsear fechas en formato YYYY-MM-DD (igual que el dashboard cuando recibe parámetros)
    const fechaDesdeStr = '2025-12-16';
    const fechaHastaStr = '2025-12-22';
    const [yearDesde, monthDesde, dayDesde] = fechaDesdeStr.split('-').map(Number);
    const [yearHasta, monthHasta, dayHasta] = fechaHastaStr.split('-').map(Number);
    
    const fechaLimite = new Date(Date.UTC(yearDesde, monthDesde - 1, dayDesde - 1, 20, 0, 0, 0));
    const fechaHasta = new Date(Date.UTC(yearHasta, monthHasta - 1, dayHasta + 1, 2, 59, 59, 999));

    console.log(`📅 Rango de fechas: ${fechaLimite.toISOString()} hasta ${fechaHasta.toISOString()}`);

    // Buscar código de taller FC CS
    let codigoTallerFC_CS = null;
    for (const [codigo, nombre] of Object.entries(talleresMap)) {
      if (nombre === 'FC CS') {
        codigoTallerFC_CS = parseInt(codigo);
        break;
      }
    }

    if (!codigoTallerFC_CS) {
      console.log('❌ No se encontró el código de taller para FC CS');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n🔍 Buscando citas para FC CS (código: ${codigoTallerFC_CS})...`);

    // Buscar citas (igual que dashboard)
    const citasFilter = {
      'Fecha ci': { 
        $gte: fechaLimite, 
        $lte: fechaHasta 
      },
      Taller: codigoTallerFC_CS
    };

    const citas = await Cita.find(citasFilter).select('Referencia Taller Matricula Fecha ci').lean();
    console.log(`\n📊 Citas encontradas: ${citas.length}`);

    // Obtener todas las matrículas únicas
    const matriculaVariantes = new Set();
    citas.forEach(cita => {
      if (cita.Matricula) {
        const valorTrim = cita.Matricula.toString().trim();
        if (valorTrim) {
          const valorUpper = valorTrim.toUpperCase();
          matriculaVariantes.add(valorUpper);
        }
      }
    });

    const matriculas = Array.from(matriculaVariantes).filter(Boolean);
    console.log(`📋 Matrículas únicas: ${matriculas.length}`);

    // Buscar ingresos (igual que dashboard - solo regex pattern, sin límite)
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
        console.log(`🔍 Buscando ingresos con ${orConditions.length} condiciones...`);
        const ingresos = await Ingreso.find({
          $or: orConditions
        }).select({
          Referencia: 1,
          Fecaper: 1,
          'Matrícula vehí': 1
        }).lean();

        console.log(`✅ Ingresos encontrados: ${ingresos.length}`);

        ingresos.forEach(ingreso => {
          const matriculaNormalizadaIngreso = normalizarMatricula(ingreso['Matrícula vehí']);
          if (matriculaNormalizadaIngreso) {
            if (!ingresosMap.has(matriculaNormalizadaIngreso)) {
              ingresosMap.set(matriculaNormalizadaIngreso, []);
            }
            ingresosMap.get(matriculaNormalizadaIngreso).push(ingreso);
          }
        });

        console.log(`📊 Mapa de ingresos: ${ingresosMap.size} claves únicas`);
      }
    }

    // Identificar citas que "no asistieron" (igual que dashboard y asistenciaService)
    // IMPORTANTE: Usar búsqueda directa si la matrícula no está en el mapa inicial
    const citasNoAsistio = [];
    for (const cita of citas) {
      let tieneAsistencia = false;
      const matriculaNormalizada = normalizarMatricula(cita.Matricula);
      
      if (cita['Fecha ci'] && matriculaNormalizada) {
        // Si la matrícula no está en el mapa inicial, buscar directamente (igual que asistenciaService.js)
        if (!ingresosMap.has(matriculaNormalizada)) {
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
            }).limit(10).lean();
            
            if (ingresosDirectos.length > 0) {
              // Agregar estos ingresos al mapa
              ingresosDirectos.forEach(ingreso => {
                const matNormIngreso = normalizarMatricula(ingreso['Matrícula vehí']);
                if (matNormIngreso) {
                  if (!ingresosMap.has(matNormIngreso)) {
                    ingresosMap.set(matNormIngreso, []);
                  }
                  ingresosMap.get(matNormIngreso).push(ingreso);
                }
              });
            }
          } catch (error) {
            console.warn(`Error buscando ingresos directamente para cita ${cita.Referencia}:`, error.message);
          }
        }
        
        // Ahora verificar si tiene asistencia
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

    console.log(`\n📊 Citas "no asistió": ${citasNoAsistio.length}`);

    // Obtener CitaGestion para estas citas
    const referenciasCitasNoAsistio = citasNoAsistio.map(c => c.Referencia);
    const todasCitasGestion = await CitaGestion.find({
      citaReferencia: { $in: referenciasCitasNoAsistio }
    }).lean();

    console.log(`📊 CitasGestion encontradas: ${todasCitasGestion.length}`);

    // Crear mapa de referencia -> CitaGestion
    const gestionPorReferencia = new Map();
    todasCitasGestion.forEach(cg => {
      gestionPorReferencia.set(cg.citaReferencia, cg);
    });

    // Filtrar citas que cumplen las condiciones: "No asistió" + "Abierto (Pendiente)"
    const citasFinales = citasNoAsistio.filter(cita => {
      const gestion = gestionPorReferencia.get(cita.Referencia);

      // Si no tiene CitaGestion, se considera abierto pendiente por defecto
      if (!gestion) {
        return true;
      }

      // Si tiene CitaGestion, debe estar abierto y pendiente
      return gestion.estado === 'abierto' && gestion.subEstado === 'pendiente';
    });

    console.log(`\n✅ RESULTADO FINAL (igual que dashboard): ${citasFinales.length} citas`);
    console.log(`   - Sin CitaGestion: ${citasFinales.filter(c => !gestionPorReferencia.has(c.Referencia)).length}`);
    console.log(`   - Con CitaGestion abierto/pendiente: ${citasFinales.filter(c => {
      const g = gestionPorReferencia.get(c.Referencia);
      return g && g.estado === 'abierto' && g.subEstado === 'pendiente';
    }).length}`);

    // Mostrar algunas referencias
    console.log(`\n📋 Primeras 10 referencias:`);
    citasFinales.slice(0, 10).forEach(c => {
      console.log(`   - ${c.Referencia}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

comparar();

