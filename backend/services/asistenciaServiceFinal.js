import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio final: sin límites artificiales, solo filtros de fecha
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

    console.log(`📊 Servicio FINAL - Filtros: ${JSON.stringify(filters)}`);

    // Construir filtros básicos
    const citasFilter = {};

    // FILTRO POR DEFECTO: Último mes si no se especifican fechas
    if (!fechaDesde && !fechaHasta) {
      const fechaActual = new Date();
      const haceUnMes = new Date();
      haceUnMes.setMonth(haceUnMes.getMonth() - 1);
      
      citasFilter['Fecha ci'] = {
        $gte: haceUnMes,
        $lte: fechaActual
      };
      
      console.log(`📊 Filtro automático: Último mes`);
    } else {
      // Usar fechas específicas si se proporcionan
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
    }

    if (taller) {
      citasFilter.Taller = parseInt(taller);
    }

    if (nombre) {
      citasFilter.Nombre = { $regex: nombre, $options: 'i' };
    }

    if (matricula) {
      citasFilter.Matricula = { $regex: matricula, $options: 'i' };
    }

    if (search) {
      citasFilter.$or = [
        { Referencia: { $regex: search, $options: 'i' } },
        { Nombre: { $regex: search, $options: 'i' } },
        { Matricula: { $regex: search, $options: 'i' } }
      ];
    }

    console.log(`📊 Filtro aplicado:`, JSON.stringify(citasFilter, null, 2));

    // Contar total de citas que coinciden con el filtro
    const totalCitas = await Cita.countDocuments(citasFilter);
    console.log(`📊 Total de citas en filtro: ${totalCitas}`);
    
    // Obtener citas con paginación
    const startIndex = (page - 1) * limit;
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
      .limit(limit)
      .lean();

    console.log(`📊 Citas obtenidas (página ${page}): ${citas.length}`);

    // Obtener configuración para días de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    // Obtener todas las matrículas únicas de las citas
    const matriculas = [...new Set(citas.map(cita => cita.Matricula).filter(Boolean))];
    
    // Obtener ingresos para las matrículas encontradas
    let ingresosMap = new Map();
    if (matriculas.length > 0) {
      try {
        console.log(`📊 Buscando ingresos para ${matriculas.length} matrículas...`);
        const ingresos = await Ingreso.find({
          'Matrícula vehí': { $in: matriculas }
        }).select('Referencia Fecaper "Matrícula vehí"').lean().maxTimeMS(5000);
        
        // Crear mapa de matrícula -> ingresos
        ingresos.forEach(ingreso => {
          const matricula = ingreso['Matrícula vehí'];
          if (!ingresosMap.has(matricula)) {
            ingresosMap.set(matricula, []);
          }
          ingresosMap.get(matricula).push(ingreso);
        });
        
        console.log(`📊 Ingresos encontrados: ${ingresos.length} para ${matriculas.length} matrículas`);
      } catch (error) {
        console.warn('Error obteniendo ingresos:', error.message);
      }
    }

    // Procesar cada cita verificando asistencia real
    const citasConAsistencia = [];

    for (const cita of citas) {
      let tieneAsistencia = false;
      let ingresoReferencia = null;
      let fechaIngreso = null;

      // Verificar asistencia
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

      citasConAsistencia.push({
        ...cita,
        tieneAsistencia,
        ingresoReferencia,
        fechaIngreso
      });
    }

    console.log(`📊 Citas procesadas: ${citasConAsistencia.length}`);

    // Estadísticas de asistencia
    const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);

    // Filtrar por estado de asistencia
    let citasFiltradas = citasConAsistencia;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasConAsistencia.filter(cita => cita.tieneAsistencia);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasConAsistencia.filter(cita => !cita.tieneAsistencia);
    }

    // Calcular paginación basada en las citas filtradas
    const totalFiltradas = citasFiltradas.length;
    const totalPages = Math.ceil(totalFiltradas / limit);

    console.log(`📊 Resultado: ${citasFiltradas.length} citas mostradas de ${totalCitas} totales (filtro: ${estadoAsistencia})`);

    return {
      data: citasFiltradas,
      pagination: {
        page,
        limit,
        total: totalFiltradas, // Total basado en las citas filtradas
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error en servicio FINAL:', error);
    throw error;
  }
}

// Funciones para comentarios
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