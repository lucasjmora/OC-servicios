import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio funcional: datos reales con procesamiento básico
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
      limit = 50 // Límite estándar
    } = pagination;

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    console.log(`📊 Servicio FUNCIONAL - Estado: ${estadoAsistencia}, Página: ${page}`);

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
      
      console.log(`📊 Filtro automático: Último mes (${haceUnMes.toISOString().split('T')[0]} a ${fechaActual.toISOString().split('T')[0]})`);
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

    // Contar total de citas que coinciden con el filtro
    const totalCitas = await Cita.countDocuments(citasFilter);
    
    // Obtener citas con paginación real
    const startIndex = (page - 1) * limit;
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
      .limit(limit)
      .lean();

    console.log(`📊 Total de citas en filtro: ${totalCitas}`);
    console.log(`📊 Citas obtenidas (página ${page}, límite ${limit}): ${citas.length}`);

    // Procesar cada cita de forma simple (sin verificación de asistencia por ahora)
    const citasConAsistencia = citas.map(cita => ({
      ...cita,
      tieneAsistencia: false, // Por ahora, todas como "no asistió"
      ingresoReferencia: null,
      fechaIngreso: null
    }));

    console.log(`📊 Citas procesadas: ${citasConAsistencia.length}`);

    // Filtrar por estado de asistencia
    let citasFiltradas = citasConAsistencia;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasConAsistencia.filter(cita => cita.tieneAsistencia);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasConAsistencia.filter(cita => !cita.tieneAsistencia);
    }

    console.log(`📊 Filtro "${estadoAsistencia}" -> ${citasFiltradas.length} citas mostradas`);

    // Calcular paginación correcta basada en el total real
    const totalPages = Math.ceil(totalCitas / limit);

    return {
      data: citasFiltradas,
      pagination: {
        page,
        limit,
        total: totalCitas, // Total real de citas que coinciden con el filtro
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error en servicio FUNCIONAL:', error);
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
