import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio real: verificación completa de asistencia
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

    console.log(`📊 Servicio REAL - Filtros: ${JSON.stringify(filters)}`);

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

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    // Obtener TODAS las citas que coinciden con el filtro (sin paginación)
    const todasLasCitas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .lean();

    console.log(`📊 Total de citas en filtro: ${todasLasCitas.length}`);

    // Obtener todas las matrículas únicas
    const matriculas = [...new Set(todasLasCitas.map(cita => cita.Matricula).filter(Boolean))];
    
    // Obtener ingresos para todas las matrículas
    let ingresosMap = new Map();
    if (matriculas.length > 0) {
      try {
        console.log(`📊 Buscando ingresos para ${matriculas.length} matrículas...`);
        const ingresos = await Ingreso.find({
          'Matrícula vehí': { $in: matriculas }
        }).select('Referencia Fecaper "Matrícula vehí"').lean().maxTimeMS(10000);
        
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

    // Procesar TODAS las citas verificando asistencia
    const todasLasCitasConAsistencia = [];

    for (const cita of todasLasCitas) {
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

      todasLasCitasConAsistencia.push({
        ...cita,
        tieneAsistencia,
        ingresoReferencia,
        fechaIngreso
      });
    }

    console.log(`📊 Todas las citas procesadas: ${todasLasCitasConAsistencia.length}`);

    // Estadísticas de asistencia
    const conAsistencia = todasLasCitasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = todasLasCitasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen TOTAL: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);

    // Filtrar por estado de asistencia ANTES de paginar
    let citasFiltradas = todasLasCitasConAsistencia;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = todasLasCitasConAsistencia.filter(cita => cita.tieneAsistencia);
      console.log(`📊 Filtro "asistió" aplicado: ${citasFiltradas.length} citas`);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = todasLasCitasConAsistencia.filter(cita => !cita.tieneAsistencia);
      console.log(`📊 Filtro "no asistió" aplicado: ${citasFiltradas.length} citas`);
    }

    // Aplicar paginación DESPUÉS del filtro
    const startIndex = (page - 1) * limit;
    const citasPaginated = citasFiltradas.slice(startIndex, startIndex + limit);

    // Calcular paginación basada en las citas filtradas
    const totalFiltradas = citasFiltradas.length;
    const totalPages = Math.ceil(totalFiltradas / limit);

    console.log(`📊 Resultado final: ${citasPaginated.length} citas mostradas de ${totalFiltradas} filtradas (página ${page})`);

    return {
      data: citasPaginated,
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
    console.error('Error en servicio REAL:', error);
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