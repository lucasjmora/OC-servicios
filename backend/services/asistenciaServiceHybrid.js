import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio híbrido: datos reales con muestra pequeña para evitar timeouts
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
      limit = 25
    } = pagination;

    // Obtener configuración de días de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    console.log(`📊 Servicio HÍBRIDO - Días tolerancia: ${diasTolerancia}, Estado: ${estadoAsistencia}`);

    // Construir filtros básicos
    const citasFilter = {};

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

    // Obtener una muestra pequeña de citas para evitar timeout
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .limit(limit * 2) // Obtener el doble para tener margen de filtrado
      .lean();

    console.log(`📊 Citas obtenidas (muestra): ${citas.length}`);

    // Obtener todas las matrículas únicas de las citas
    const matriculas = [...new Set(citas.map(cita => cita.Matricula).filter(Boolean))];
    
    // Obtener ingresos para las matrículas encontradas
    let ingresosMap = new Map();
    if (matriculas.length > 0) {
      try {
        console.log(`📊 Buscando ingresos para ${matriculas.length} matrículas...`);
        const ingresos = await Ingreso.find({
          'Matrícula vehí': { $in: matriculas }
        }).select('Referencia Fecaper "Matrícula vehí"').lean().maxTimeMS(8000);
        
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

    // Procesar cada cita
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
      console.log(`📊 Filtro "asistió" aplicado: ${citasFiltradas.length} citas`);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasConAsistencia.filter(cita => !cita.tieneAsistencia);
      console.log(`📊 Filtro "no asistió" aplicado: ${citasFiltradas.length} citas`);
    }

    // Aplicar paginación después del filtrado
    const startIndex = (page - 1) * limit;
    const citasPaginadas = citasFiltradas.slice(startIndex, startIndex + limit);

    // Estadísticas
    const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen HÍBRIDO: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);
    console.log(`📊 Filtro "${estadoAsistencia}" -> ${citasPaginadas.length} citas mostradas`);

    // Calcular paginación
    const totalPages = Math.ceil(citasFiltradas.length / limit);

    return {
      data: citasPaginadas,
      pagination: {
        page,
        limit,
        total: citasFiltradas.length,
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error en servicio HÍBRIDO de asistencia:', error);
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




