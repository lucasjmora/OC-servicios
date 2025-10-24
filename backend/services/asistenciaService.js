import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Obtiene todas las citas con información de asistencia
 * @param {Object} filters - Filtros de búsqueda
 * @param {Object} pagination - Paginación
 * @returns {Object} Resultado con datos y paginación
 */
export async function getCitasConAsistencia(filters = {}, pagination = {}) {
  try {
    const {
      search = '',
      fechaDesde = '',
      fechaHasta = '',
      taller = '',
      nombre = '',
      matricula = '',
      estadoAsistencia = 'todos'
    } = filters;

    const {
      page = 1,
      limit = 50
    } = pagination;

    // Obtener configuración de días de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    console.log(`📊 Días de tolerancia configurados: ${diasTolerancia}`);

    // Construir filtros para la consulta de citas
    const citasFilter = {};

    // Filtro por fechas
    if (fechaDesde || fechaHasta) {
      citasFilter['Fecha ci'] = {};
      if (fechaDesde) {
        citasFilter['Fecha ci'].$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        const fechaHastaEnd = new Date(fechaHasta);
        fechaHastaEnd.setHours(23, 59, 59, 999);
        citasFilter['Fecha ci'].$lte = fechaHastaEnd;
      }
    }

    // Filtro por taller
    if (taller) {
      citasFilter.Taller = parseInt(taller);
    }

    // Filtro por nombre
    if (nombre) {
      citasFilter.Nombre = { $regex: nombre, $options: 'i' };
    }

    // Filtro por matrícula
    if (matricula) {
      citasFilter.Matricula = { $regex: matricula, $options: 'i' };
    }

    // Filtro de búsqueda general
    if (search) {
      citasFilter.$or = [
        { Referencia: { $regex: search, $options: 'i' } },
        { Nombre: { $regex: search, $options: 'i' } },
        { Matricula: { $regex: search, $options: 'i' } },
        { 'Marca/modelo': { $regex: search, $options: 'i' } }
      ];
    }

    // Obtener citas con paginación directa y límite reducido para evitar timeout
    const startIndex = (page - 1) * limit;
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
      .limit(Math.min(limit, 25)) // Limitar a máximo 25 citas por página
      .lean();

    console.log(`📊 Citas obtenidas: ${citas.length}`);

    // Obtener todas las matrículas únicas de las citas
    const matriculas = [...new Set(citas.map(cita => cita.Matricula).filter(Boolean))];
    
    // Obtener todos los ingresos que coincidan con las matrículas en una sola consulta
    let ingresosMap = new Map();
    if (matriculas.length > 0) {
      try {
        const ingresos = await Ingreso.find({
          'Matrícula vehí': { $in: matriculas }
        }).select('Referencia Fecaper "Matrícula vehí"').lean().maxTimeMS(5000);
        
        // Crear un mapa de matrícula -> ingresos para búsqueda rápida
        ingresos.forEach(ingreso => {
          const matricula = ingreso['Matrícula vehí'];
          if (!ingresosMap.has(matricula)) {
            ingresosMap.set(matricula, []);
          }
          ingresosMap.get(matricula).push(ingreso);
        });
        
        console.log(`📊 Ingresos encontrados para ${matriculas.length} matrículas: ${ingresos.length}`);
      } catch (error) {
        console.warn('Error obteniendo ingresos:', error.message);
      }
    }

    // Procesar cada cita usando el mapa de ingresos
    const citasConAsistencia = [];

    for (const cita of citas) {
      let tieneAsistencia = false;
      let ingresoReferencia = null;
      let fechaIngreso = null;

      // Verificar asistencia usando el mapa de ingresos
      if (cita['Fecha ci'] && cita.Matricula && ingresosMap.has(cita.Matricula)) {
        try {
          const fechaCita = new Date(cita['Fecha ci']);
          
          if (!isNaN(fechaCita.getTime())) {
            const fechaLimite = new Date(fechaCita);
            fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);

            // Buscar ingreso en el mapa
            const ingresosCita = ingresosMap.get(cita.Matricula);
            const ingresoEncontrado = ingresosCita.find(ingreso => {
              const fechaIngreso = new Date(ingreso.Fecaper);
              return fechaIngreso >= fechaCita && fechaIngreso <= fechaLimite;
            });

            if (ingresoEncontrado) {
              tieneAsistencia = true;
              ingresoReferencia = ingresoEncontrado.Referencia;
              fechaIngreso = ingresoEncontrado.Fecaper;
            }
          }
        } catch (error) {
          console.warn(`Error verificando asistencia para cita ${cita.Referencia}:`, error.message);
        }
      }

      const citaConAsistencia = {
        ...cita,
        tieneAsistencia,
        ingresoReferencia,
        fechaIngreso
      };

      citasConAsistencia.push(citaConAsistencia);
    }

    console.log(`📊 Citas procesadas: ${citasConAsistencia.length}`);

    // Filtrar por estado de asistencia
    let citasFiltradas = citasConAsistencia;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasConAsistencia.filter(cita => cita.tieneAsistencia);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasConAsistencia.filter(cita => !cita.tieneAsistencia);
    }

    console.log(`📊 Citas con asistencia: ${citasConAsistencia.filter(c => c.tieneAsistencia).length}`);
    console.log(`📊 Citas sin asistencia: ${citasConAsistencia.filter(c => !c.tieneAsistencia).length}`);
    console.log(`📊 Filtro aplicado: ${estadoAsistencia} - Citas filtradas: ${citasFiltradas.length}`);

    // Para obtener el total correcto, necesitamos contar todas las citas que coincidan con el filtro
    // Por ahora, usamos un aproximado basado en la página actual
    const totalAproximado = citasFiltradas.length === limit ? (page * limit) + 1 : (page - 1) * limit + citasFiltradas.length;
    const totalPages = Math.ceil(totalAproximado / limit);

    return {
      data: citasFiltradas,
      pagination: {
        page,
        limit,
        total: totalAproximado,
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error obteniendo citas con asistencia:', error);
    throw error;
  }
}

/**
 * Obtiene comentarios de una cita específica
 * @param {string} citaReferencia - Referencia de la cita
 * @returns {Array} Lista de comentarios
 */
export async function getComentariosCita(citaReferencia) {
  try {
    const comentarios = await Comentario.find({ citaReferencia })
      .sort({ timestamp: -1 })
      .lean();

    return comentarios;
  } catch (error) {
    console.error('Error obteniendo comentarios:', error);
    throw error;
  }
}

/**
 * Agrega un comentario a una cita
 * @param {string} citaReferencia - Referencia de la cita
 * @param {Object} comentarioData - Datos del comentario
 * @returns {Object} Comentario creado
 */
export async function addComentarioCita(citaReferencia, comentarioData) {
  try {
    const { usuario, comentario } = comentarioData;

    const nuevoComentario = new Comentario({
      citaReferencia,
      usuario,
      comentario
    });

    const comentarioGuardado = await nuevoComentario.save();
    return comentarioGuardado;
  } catch (error) {
    console.error('Error agregando comentario:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas de asistencia
 * @returns {Object} Estadísticas
 */
export async function getEstadisticasAsistencia() {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    const totalCitas = await Cita.countDocuments();
    const totalIngresos = await Ingreso.countDocuments();

    // Obtener una muestra de citas para calcular estadísticas
    const citasMuestra = await Cita.find({})
      .select('Referencia "Fecha ci" Matricula')
      .limit(1000)
      .lean();

    let citasConAsistencia = 0;
    let citasSinAsistencia = 0;

    for (const cita of citasMuestra) {
      if (cita['Fecha ci'] && cita.Matricula) {
        try {
          const fechaCita = new Date(cita['Fecha ci']);
          if (!isNaN(fechaCita.getTime())) {
            const fechaLimite = new Date(fechaCita);
            fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);

            const ingresoExiste = await Ingreso.findOne({
              'Matrícula vehí': cita.Matricula,
              Fecaper: {
                $gte: fechaCita,
                $lte: fechaLimite
              }
            });

            if (ingresoExiste) {
              citasConAsistencia++;
            } else {
              citasSinAsistencia++;
            }
          }
        } catch (error) {
          citasSinAsistencia++;
        }
      } else {
        citasSinAsistencia++;
      }
    }

    return {
      totalCitas,
      totalIngresos,
      citasConAsistencia,
      citasSinAsistencia,
      diasTolerancia,
      muestra: citasMuestra.length
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas de asistencia:', error);
    throw error;
  }
}