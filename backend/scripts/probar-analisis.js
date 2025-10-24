import AnalisisAsistenciaService from '../services/analisisAsistenciaService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script de prueba para demostrar el análisis de asistencia
 */
async function probarAnalisis() {
  try {
    console.log('🧪 PRUEBA DE ANÁLISIS DE ASISTENCIA\n');
    console.log('=' .repeat(50));

    // Simular datos de prueba
    console.log('📊 Simulando datos de prueba...\n');

    // Crear archivos temporales con datos de prueba
    const filePaths = {
      citas: path.join(__dirname, '../../jsons/citas.xlsx'),
      ingresos: path.join(__dirname, '../../jsons/ingresos.xlsx')
    };

    console.log('🔍 Verificando archivos...');
    console.log(`   - Citas: ${filePaths.citas}`);
    console.log(`   - Ingresos: ${filePaths.ingresos}\n`);

    // Crear servicio de análisis
    const analisisService = new AnalisisAsistenciaService(filePaths, 5);

    console.log('📈 EJECUTANDO ANÁLISIS...\n');

    // Ejecutar análisis
    const resultados = await analisisService.analizarAsistencia();

    // Mostrar resultados detallados
    console.log('\n📋 RESULTADOS DETALLADOS:');
    console.log('=' .repeat(50));
    
    const citasConEstados = analisisService.getCitasConEstados();
    
    // Mostrar primeras 10 citas como ejemplo
    console.log('\n🔍 MUESTRA DE CITAS CON ESTADOS:');
    citasConEstados.slice(0, 10).forEach((cita, index) => {
      console.log(`${index + 1}. ${cita.Referencia || 'Sin referencia'}`);
      console.log(`   Matrícula: ${cita.Matricula || 'N/A'}`);
      console.log(`   Fecha Cita: ${cita['Fecha ci'] || 'N/A'}`);
      console.log(`   Estado: ${cita.EstadoAsistencia || 'N/A'}`);
      console.log(`   Ingreso Ref: ${cita.IngresoReferencia || 'N/A'}`);
      console.log('');
    });

    // Estadísticas finales
    console.log('📊 ESTADÍSTICAS FINALES:');
    console.log('=' .repeat(50));
    console.log(`✅ Total citas procesadas: ${resultados.citasProcesadas}`);
    console.log(`✅ Con asistencia: ${resultados.citasConAsistencia} (${((resultados.citasConAsistencia / resultados.citasProcesadas) * 100).toFixed(1)}%)`);
    console.log(`❌ Sin asistencia: ${resultados.citasSinAsistencia} (${((resultados.citasSinAsistencia / resultados.citasProcesadas) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Errores: ${resultados.errores}`);
    console.log(`📅 Días de tolerancia: 5`);

    console.log('\n🎯 VENTAJAS DEL ANÁLISIS PRE-IMPORTACIÓN:');
    console.log('=' .repeat(50));
    console.log('✅ Estados calculados UNA VEZ en lugar de en cada consulta');
    console.log('✅ Consultas MongoDB súper rápidas (sin joins complejos)');
    console.log('✅ Respuesta instantánea en la UI');
    console.log('✅ Datos consistentes y pre-validados');
    console.log('✅ Escalabilidad sin problemas de rendimiento');

    console.log('\n🚀 PRÓXIMOS PASOS:');
    console.log('=' .repeat(50));
    console.log('1. Integrar con el servicio de importación existente');
    console.log('2. Actualizar el modelo Cita para incluir campos calculados');
    console.log('3. Modificar la UI para mostrar estados pre-calculados');
    console.log('4. Configurar días de tolerancia desde la UI');

    return resultados;

  } catch (error) {
    console.error('❌ Error en prueba de análisis:', error);
    
    if (error.code === 'ENOENT') {
      console.log('\n💡 SOLUCIÓN:');
      console.log('Los archivos Excel no se encontraron. Asegúrate de que existan en:');
      console.log('   - oc-servicios/jsons/citas.xlsx');
      console.log('   - oc-servicios/jsons/ingresos.xlsx');
    }
    
    throw error;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  probarAnalisis()
    .then(() => {
      console.log('\n🎉 Prueba completada exitosamente!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Prueba falló:', error.message);
      process.exit(1);
    });
}

export default probarAnalisis;




