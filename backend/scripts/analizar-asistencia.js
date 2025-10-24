import AnalisisAsistenciaService from '../services/analisisAsistenciaService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script para analizar asistencia en archivos Excel
 */
async function analizarAsistencia() {
  try {
    console.log('🚀 Iniciando análisis de asistencia...\n');

    // Configurar rutas de archivos (ajustar según tu estructura)
    const filePaths = {
      citas: path.join(__dirname, '../../jsons/citas.xlsx'), // Ajustar ruta
      ingresos: path.join(__dirname, '../../jsons/ingresos.xlsx') // Ajustar ruta
    };

    // Crear instancia del servicio
    const analisisService = new AnalisisAsistenciaService(filePaths, 5); // 5 días de tolerancia

    // Ejecutar análisis
    const resultados = await analisisService.analizarAsistencia();

    // Obtener citas con estados calculados
    const citasConEstados = analisisService.getCitasConEstados();

    console.log('\n📋 MUESTRA DE RESULTADOS:');
    citasConEstados.slice(0, 5).forEach((cita, index) => {
      console.log(`${index + 1}. ${cita.Referencia} (${cita.Matricula}): ${cita.EstadoAsistencia}`);
    });

    console.log('\n✅ Análisis completado exitosamente!');
    console.log(`📊 Total de citas analizadas: ${resultados.citasProcesadas}`);
    console.log(`✅ Con asistencia: ${resultados.citasConAsistencia}`);
    console.log(`❌ Sin asistencia: ${resultados.citasSinAsistencia}`);

    return resultados;

  } catch (error) {
    console.error('❌ Error en análisis de asistencia:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  analizarAsistencia()
    .then(() => {
      console.log('\n🎉 Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script falló:', error);
      process.exit(1);
    });
}

export default analizarAsistencia;




