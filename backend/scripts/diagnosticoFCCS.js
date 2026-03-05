import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import CitaGestion from '../models/CitaGestion.js';
import Configuracion from '../models/Configuracion.js';

const normalizarMatricula = (matricula) => {
  if (!matricula) return '';
  return matricula.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const normalizarFecha = (fecha) => {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }
  const fechaDate = new Date(fecha);
  if (isNaN(fechaDate.getTime())) return null;
  return new Date(fechaDate.getFullYear(), fechaDate.getMonth(), fechaDate.getDate());
};

const estaDentroDeTolerancia = (fechaCita, fechaIngreso, diasTolerancia = 3) => {
  const fechaCitaNormalizada = normalizarFecha(fechaCita);
  const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);

  if (!fechaCitaNormalizada || !fechaIngresoNormalizada) {
    return false;
  }

  const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  
  if (diffMs < 0) {
    return false;
  }
  
  return diffDias <= diasTolerancia;
};

async function diagnostico() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oc-servicios';
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    // Fechas: 16/12/2025 - 22/12/2025 (igual que página de asistencia)
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

    const citasFilter = {
      'Fecha ci': { 
        $gte: fechaLimite, 
        $lte: fechaHasta 
      },
      Taller: codigoTallerFC_CS
    };

    const citas = await Cita.find(citasFilter).lean();
    console.log(`\n📊 Citas encontradas: ${citas.length}`);
    
    // Mostrar todas las citas
    console.log('\n📋 TODAS LAS CITAS ENCONTRADAS:');
    citas.forEach((c, i) => {
      const fechaStr = c['Fecha ci'] ? (isNaN(new Date(c['Fecha ci']).getTime()) ? 'INVÁLIDA' : new Date(c['Fecha ci']).toISOString()) : 'SIN FECHA';
      console.log(`   ${i + 1}. Referencia: ${c.Referencia}, Matrícula: "${c.Matricula}", Fecha: ${fechaStr}`);
    });

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
    console.log(`\n📋 Matrículas únicas: ${matriculas.length}`);
    matriculas.forEach((m, i) => {
      console.log(`   ${i + 1}. "${m}" (normalizada: "${normalizarMatricula(m)}")`);
    });

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
        console.log(`\n🔍 Buscando ingresos con ${orConditions.length} condiciones...`);
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

    // Identificar citas que "no asistieron" con búsqueda directa
    const citasNoAsistio = [];
    const citasConAsistencia = [];
    
    console.log('\n🔍 Verificando asistencia para cada cita...\n');
    
    for (const cita of citas) {
      let tieneAsistencia = false;
      const matriculaNormalizada = normalizarMatricula(cita.Matricula);
      
      console.log(`\n📋 Cita ${cita.Referencia}:`);
      console.log(`   - Matrícula original: "${cita.Matricula}"`);
      console.log(`   - Matrícula normalizada: "${matriculaNormalizada}"`);
      const fechaCitaStr = cita['Fecha ci'] ? (isNaN(new Date(cita['Fecha ci']).getTime()) ? 'INVÁLIDA' : new Date(cita['Fecha ci']).toISOString()) : 'SIN FECHA';
      console.log(`   - Fecha cita: ${fechaCitaStr}`);
      
      // Verificar que la fecha sea válida
      const fechaCitaValida = cita['Fecha ci'] && !isNaN(new Date(cita['Fecha ci']).getTime());
      
      if (fechaCitaValida && matriculaNormalizada) {
        // Si la matrícula no está en el mapa inicial, buscar directamente
        if (!ingresosMap.has(matriculaNormalizada)) {
          console.log(`   ⚠️ Matrícula no encontrada en mapa inicial. Buscando directamente...`);
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
            
            console.log(`   📊 Ingresos directos encontrados: ${ingresosDirectos.length}`);
            
            if (ingresosDirectos.length > 0) {
              ingresosDirectos.forEach(ing => {
                const matNormIngreso = normalizarMatricula(ing['Matrícula vehí']);
                const fechaIngStr = ing.Fecaper ? (isNaN(new Date(ing.Fecaper).getTime()) ? 'INVÁLIDA' : new Date(ing.Fecaper).toISOString()) : 'SIN FECHA';
            console.log(`      - Ingreso ${ing.Referencia}: Matrícula "${ing['Matrícula vehí']}" (normalizada: "${matNormIngreso}"), Fecha: ${fechaIngStr}`);
                if (matNormIngreso) {
                  if (!ingresosMap.has(matNormIngreso)) {
                    ingresosMap.set(matNormIngreso, []);
                  }
                  ingresosMap.get(matNormIngreso).push(ing);
                }
              });
            }
          } catch (error) {
            console.warn(`   ❌ Error buscando ingresos directamente:`, error.message);
          }
        }
        
        // Ahora verificar si tiene asistencia
        if (ingresosMap.has(matriculaNormalizada)) {
          const fechaCita = cita['Fecha ci'];
          const ingresosCita = ingresosMap.get(matriculaNormalizada);
          console.log(`   📊 Ingresos en mapa para esta matrícula: ${ingresosCita.length}`);
          
          ingresosCita.forEach(ing => {
            const dentroTolerancia = estaDentroDeTolerancia(fechaCita, ing.Fecaper, diasTolerancia);
            const fechaCitaNorm = normalizarFecha(fechaCita);
            const fechaIngresoNorm = normalizarFecha(ing.Fecaper);
            const diffMs = fechaIngresoNorm - fechaCitaNorm;
            const diffDias = diffMs / (1000 * 60 * 60 * 24);
            
            const fechaIngStr2 = ing.Fecaper ? (isNaN(new Date(ing.Fecaper).getTime()) ? 'INVÁLIDA' : new Date(ing.Fecaper).toISOString()) : 'SIN FECHA';
            console.log(`      - Ingreso ${ing.Referencia}: Fecha ${fechaIngStr2}, Diferencia: ${diffDias.toFixed(2)} días, Dentro tolerancia: ${dentroTolerancia ? '✅ SÍ' : '❌ NO'}`);
            
            if (dentroTolerancia) {
              tieneAsistencia = true;
            }
          });
        } else {
          console.log(`   ⚠️ Matrícula no encontrada en mapa después de búsqueda directa`);
        }
      }
      
      if (tieneAsistencia) {
        citasConAsistencia.push(cita);
        console.log(`   ✅ RESULTADO: TIENE ASISTENCIA`);
      } else {
        citasNoAsistio.push(cita);
        console.log(`   ❌ RESULTADO: NO TIENE ASISTENCIA`);
      }
    }

    console.log(`\n\n📊 RESUMEN:`);
    console.log(`   - Total citas: ${citas.length}`);
    console.log(`   - Con asistencia: ${citasConAsistencia.length}`);
    console.log(`   - Sin asistencia: ${citasNoAsistio.length}`);

    // Obtener CitaGestion
    const referenciasCitasNoAsistio = citasNoAsistio.map(c => c.Referencia);
    const todasCitasGestion = await CitaGestion.find({
      citaReferencia: { $in: referenciasCitasNoAsistio }
    }).lean();

    const gestionPorReferencia = new Map();
    todasCitasGestion.forEach(cg => {
      gestionPorReferencia.set(cg.citaReferencia, cg);
    });

    // Filtrar citas que cumplen las condiciones: "No asistió" + "Abierto (Pendiente)"
    const citasFinales = citasNoAsistio.filter(cita => {
      const gestion = gestionPorReferencia.get(cita.Referencia);
      if (!gestion) {
        return true;
      }
      return gestion.estado === 'abierto' && gestion.subEstado === 'pendiente';
    });

    console.log(`\n✅ RESULTADO FINAL (No asistió + Abierto Pendiente): ${citasFinales.length} citas`);
    console.log(`   - Sin CitaGestion: ${citasFinales.filter(c => !gestionPorReferencia.has(c.Referencia)).length}`);
    console.log(`   - Con CitaGestion abierto/pendiente: ${citasFinales.filter(c => {
      const g = gestionPorReferencia.get(c.Referencia);
      return g && g.estado === 'abierto' && g.subEstado === 'pendiente';
    }).length}`);

    console.log(`\n📋 Referencias de citas finales:`);
    citasFinales.forEach(c => {
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

diagnostico();

