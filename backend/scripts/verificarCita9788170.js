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

// Función para normalizar matrícula (debe ser idéntica a la del servicio)
const normalizarMatricula = (matricula) => {
  if (!matricula) return null;
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

async function verificarCita() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oc-servicios';
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    const referencia = '9788170';
    console.log(`🔍 Buscando cita con referencia: ${referencia}`);
    
    const cita = await Cita.findOne({ Referencia: referencia }).lean();
    
    if (!cita) {
      console.log(`❌ No se encontró la cita ${referencia}`);
      await mongoose.disconnect();
      return;
    }

    console.log(`\n📋 INFORMACIÓN DE LA CITA:`);
    console.log(`   - Referencia: ${cita.Referencia}`);
    console.log(`   - Matrícula: "${cita.Matricula}"`);
    console.log(`   - Fecha cita: ${cita['Fecha ci'] ? new Date(cita['Fecha ci']).toISOString() : 'N/A'}`);
    console.log(`   - Taller: ${cita.Taller}`);

    const matriculaNormalizada = normalizarMatricula(cita.Matricula);
    console.log(`\n🔍 Matrícula normalizada: "${matriculaNormalizada}"`);

    if (!matriculaNormalizada || !cita['Fecha ci']) {
      console.log(`\n❌ La cita no tiene matrícula o fecha válida`);
      await mongoose.disconnect();
      return;
    }

    // Buscar ingresos con esta matrícula
    console.log(`\n🔍 Buscando ingresos para la matrícula "${matriculaNormalizada}"...`);
    
    // Buscar ingresos con diferentes variantes de la matrícula
    const regexPattern = matriculaNormalizada.split('').join('[^A-Z0-9]*');
    const regex = new RegExp(`^${regexPattern}[^A-Z0-9]*$`, 'i');
    
    const ingresos = await Ingreso.find({
      $or: [
        { 'Matrícula vehí': regex },
        { 'Matrícula vehí': { $regex: `^${matriculaNormalizada}$`, $options: 'i' } },
        { 'Matrícula vehí': { $regex: `.*${matriculaNormalizada}.*`, $options: 'i' } }
      ]
    }).lean();

    console.log(`\n📊 Ingresos encontrados: ${ingresos.length}`);
    
    if (ingresos.length === 0) {
      console.log(`\n❌ No se encontraron ingresos para la matrícula "${matriculaNormalizada}"`);
      console.log(`\n🔍 Buscando ingresos similares (primeros 3 caracteres)...`);
      const ingresosSimilares = await Ingreso.find({
        'Matrícula vehí': { $regex: `^${matriculaNormalizada.substring(0, 3)}`, $options: 'i' }
      }).limit(10).lean();
      
      if (ingresosSimilares.length > 0) {
        console.log(`\n📋 Ingresos con matrícula similar (primeros 3 caracteres):`);
        ingresosSimilares.forEach(ing => {
          const matNorm = normalizarMatricula(ing['Matrícula vehí']);
          console.log(`   - Ingreso ${ing.Referencia}: Matrícula raw "${ing['Matrícula vehí']}", normalizada "${matNorm}"`);
        });
      }
    } else {
      console.log(`\n📋 INGRESOS ENCONTRADOS:`);
      ingresos.forEach((ingreso, index) => {
        const matNorm = normalizarMatricula(ingreso['Matrícula vehí']);
        const fechaCita = cita['Fecha ci'];
        const fechaIngreso = ingreso.Fecaper;
        const dentroTolerancia = estaDentroDeTolerancia(fechaCita, fechaIngreso, 3);
        const fechaCitaNorm = normalizarFecha(fechaCita);
        const fechaIngresoNorm = normalizarFecha(fechaIngreso);
        const diffMs = fechaIngresoNorm - fechaCitaNorm;
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        
        console.log(`\n   [${index + 1}] Ingreso ${ingreso.Referencia}:`);
        console.log(`      - Matrícula raw: "${ingreso['Matrícula vehí']}"`);
        console.log(`      - Matrícula normalizada: "${matNorm}"`);
        console.log(`      - Fecha ingreso: ${new Date(fechaIngreso).toISOString()}`);
        console.log(`      - Fecha cita: ${new Date(fechaCita).toISOString()}`);
        console.log(`      - Diferencia: ${diffDias.toFixed(2)} días`);
        console.log(`      - Es posterior: ${diffMs >= 0 ? '✅ SÍ' : '❌ NO'}`);
        console.log(`      - Dentro de tolerancia (3 días): ${dentroTolerancia ? '✅ SÍ' : '❌ NO'}`);
        console.log(`      - ¿Coincide matrícula normalizada? ${matNorm === matriculaNormalizada ? '✅ SÍ' : '❌ NO'}`);
      });

      // Verificar si hay algún ingreso que cumpla las condiciones
      const ingresoValido = ingresos.find(ingreso => {
        const matNorm = normalizarMatricula(ingreso['Matrícula vehí']);
        return matNorm === matriculaNormalizada && 
               estaDentroDeTolerancia(cita['Fecha ci'], ingreso.Fecaper, 3);
      });

      if (ingresoValido) {
        console.log(`\n✅ RESULTADO: La cita SÍ tiene asistencia`);
        console.log(`   - Ingreso válido: ${ingresoValido.Referencia}`);
        console.log(`   - Fecha ingreso: ${new Date(ingresoValido.Fecaper).toISOString()}`);
      } else {
        console.log(`\n❌ RESULTADO: No se encontró un ingreso válido que cumpla todas las condiciones`);
        console.log(`   - Matrícula debe coincidir exactamente (normalizada)`);
        console.log(`   - Fecha ingreso debe ser posterior o igual a la fecha de cita`);
        console.log(`   - Diferencia debe ser <= 3 días`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verificarCita();





