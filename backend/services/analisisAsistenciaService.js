import XLSX from 'xlsx';
import path from 'path';

/**
 * Servicio para analizar asistencia en archivos Excel antes de importar a MongoDB
 */
export class AnalisisAsistenciaService {
  constructor(filePaths, diasTolerancia = 5) {
    this.filePaths = filePaths;
    this.diasTolerancia = diasTolerancia;
    this.citasData = [];
    this.ingresosData = [];
  }

  /**
   * Analizar archivos Excel y calcular estados de asistencia
   */
  async analizarAsistencia() {
    try {
      console.log('🔍 Iniciando análisis de asistencia en archivos Excel...');
      
      // 1. Leer archivos Excel
      await this.leerArchivosExcel();
      
      // 2. Calcular estados de asistencia
      const resultados = await this.calcularEstadosAsistencia();
      
      // 3. Generar reporte de análisis
      await this.generarReporteAnalisis(resultados);
      
      return resultados;
    } catch (error) {
      console.error('Error en análisis de asistencia:', error);
      throw error;
    }
  }

  /**
   * Leer archivos Excel
   */
  async leerArchivosExcel() {
    console.log('📖 Leyendo archivos Excel...');
    
    // Leer archivo de Citas
    if (this.filePaths.citas) {
      const workbookCitas = XLSX.readFile(this.filePaths.citas);
      const sheetNameCitas = workbookCitas.SheetNames[0];
      this.citasData = XLSX.utils.sheet_to_json(workbookCitas.Sheets[sheetNameCitas], { raw: true });
      console.log(`📊 Citas leídas: ${this.citasData.length}`);
    }

    // Leer archivo de Ingresos
    if (this.filePaths.ingresos) {
      const workbookIngresos = XLSX.readFile(this.filePaths.ingresos);
      const sheetNameIngresos = workbookIngresos.SheetNames[0];
      this.ingresosData = XLSX.utils.sheet_to_json(workbookIngresos.Sheets[sheetNameIngresos], { raw: true });
      console.log(`📊 Ingresos leídos: ${this.ingresosData.length}`);
    }
  }

  /**
   * Calcular estados de asistencia comparando citas e ingresos
   */
  async calcularEstadosAsistencia() {
    console.log('🧮 Calculando estados de asistencia...');
    
    const resultados = {
      citasProcesadas: 0,
      citasConAsistencia: 0,
      citasSinAsistencia: 0,
      errores: 0,
      detalles: []
    };

    // Crear mapa de ingresos por matrícula para lookup rápido
    const ingresosMap = new Map();
    this.ingresosData.forEach(ingreso => {
      const matricula = ingreso['Matrícula vehí'];
      if (matricula && !ingresosMap.has(matricula)) {
        ingresosMap.set(matricula, []);
      }
      if (matricula) {
        ingresosMap.get(matricula).push(ingreso);
      }
    });

    console.log(`🗺️ Mapa de ingresos creado: ${ingresosMap.size} matrículas únicas`);

    // Procesar cada cita
    for (const cita of this.citasData) {
      try {
        resultados.citasProcesadas++;
        
        let estadoAsistencia = 'No asistió';
        let ingresoReferencia = null;
        let fechaIngreso = null;

        // Verificar si la matrícula existe en ingresos
        if (cita.Matricula && ingresosMap.has(cita.Matricula)) {
          const fechaCita = this.parsearFecha(cita['Fecha ci']);
          
          if (fechaCita) {
            const fechaLimite = new Date(fechaCita);
            fechaLimite.setDate(fechaLimite.getDate() + this.diasTolerancia);

            // Buscar ingreso dentro del rango de fechas
            const ingresosCita = ingresosMap.get(cita.Matricula);
            const ingresoEncontrado = ingresosCita.find(ingreso => {
              const fechaIngresoObj = this.parsearFecha(ingreso.Fecaper);
              return fechaIngresoObj && fechaIngresoObj >= fechaCita && fechaIngresoObj <= fechaLimite;
            });

            if (ingresoEncontrado) {
              estadoAsistencia = 'Asistió';
              ingresoReferencia = ingresoEncontrado.Referencia;
              fechaIngreso = ingresoEncontrado.Fecaper;
              resultados.citasConAsistencia++;
            } else {
              resultados.citasSinAsistencia++;
            }
          } else {
            resultados.citasSinAsistencia++;
          }
        } else {
          resultados.citasSinAsistencia++;
        }

        // Agregar campos calculados a la cita
        cita.EstadoAsistencia = estadoAsistencia;
        cita.IngresoReferencia = ingresoReferencia;
        cita.FechaIngreso = fechaIngreso;
        cita.FechaCalculo = new Date().toISOString();

        resultados.detalles.push({
          referencia: cita.Referencia,
          matricula: cita.Matricula,
          fechaCita: cita['Fecha ci'],
          estado: estadoAsistencia,
          ingresoReferencia: ingresoReferencia
        });

      } catch (error) {
        console.warn(`Error procesando cita ${cita.Referencia}:`, error.message);
        resultados.errores++;
      }
    }

    console.log(`✅ Análisis completado:`);
    console.log(`   - Citas procesadas: ${resultados.citasProcesadas}`);
    console.log(`   - Con asistencia: ${resultados.citasConAsistencia}`);
    console.log(`   - Sin asistencia: ${resultados.citasSinAsistencia}`);
    console.log(`   - Errores: ${resultados.errores}`);

    return resultados;
  }

  /**
   * Generar reporte de análisis
   */
  async generarReporteAnalisis(resultados) {
    const reporte = {
      fechaAnalisis: new Date().toISOString(),
      diasTolerancia: this.diasTolerancia,
      archivos: {
        citas: this.filePaths.citas,
        ingresos: this.filePaths.ingresos
      },
      estadisticas: {
        citasProcesadas: resultados.citasProcesadas,
        citasConAsistencia: resultados.citasConAsistencia,
        citasSinAsistencia: resultados.citasSinAsistencia,
        errores: resultados.errores,
        porcentajeAsistencia: (resultados.citasConAsistencia / resultados.citasProcesadas * 100).toFixed(2)
      }
    };

    console.log('📊 REPORTE DE ANÁLISIS:');
    console.log(JSON.stringify(reporte, null, 2));

    return reporte;
  }

  /**
   * Obtener datos de citas con estados calculados
   */
  getCitasConEstados() {
    return this.citasData;
  }

  /**
   * Parsear fecha desde Excel
   */
  parsearFecha(fechaExcel) {
    if (!fechaExcel) return null;
    
    try {
      // Si es un número (días desde 1900)
      if (typeof fechaExcel === 'number') {
        const fecha = new Date((fechaExcel - 25569) * 86400 * 1000);
        return isNaN(fecha.getTime()) ? null : fecha;
      }
      
      // Si es string o Date
      const fecha = new Date(fechaExcel);
      return isNaN(fecha.getTime()) ? null : fecha;
    } catch (error) {
      return null;
    }
  }
}

export default AnalisisAsistenciaService;




