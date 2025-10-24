import Cita from '../models/Cita.js';
import Configuracion from '../models/Configuracion.js';

/**
 * Versión básica del servicio de asistencia - solo muestra citas sin verificar asistencia
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

    console.log(`📊 Servicio básico - Días tolerancia: ${diasTolerancia}, Estado: ${estadoAsistencia}`);

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

    // Obtener citas con paginación
    const startIndex = (page - 1) * limit;
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
      .limit(limit)
      .lean();

    console.log(`📊 Citas obtenidas: ${citas.length}`);

    // Para esta versión básica, simulamos que todas las citas tienen asistencia
    // Esto nos permitirá probar el filtro sin problemas de rendimiento
    const citasConAsistencia = citas.map((cita, index) => ({
      ...cita,
      tieneAsistencia: index % 3 === 0, // Simular: 1 de cada 3 tiene asistencia
      ingresoReferencia: index % 3 === 0 ? `ING${cita.Referencia}` : null,
      fechaIngreso: index % 3 === 0 ? cita['Fecha ci'] : null
    }));

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

    // Estadísticas para debugging
    const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);
    console.log(`📊 Filtro "${estadoAsistencia}" -> ${citasFiltradas.length} citas mostradas`);

    // Calcular paginación
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
    console.error('Error en servicio básico de asistencia:', error);
    throw error;
  }
}

// Funciones básicas para comentarios
export async function getComentariosCita(citaReferencia) {
  return [];
}

export async function addComentarioCita(citaReferencia, comentarioData) {
  return { citaReferencia, ...comentarioData, timestamp: new Date() };
}




