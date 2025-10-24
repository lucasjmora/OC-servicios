import Cita from '../models/Cita.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio de asistencia OPTIMIZADO que usa datos pre-calculados
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

    console.log(`📊 Servicio OPTIMIZADO - Estado: ${estadoAsistencia}`);

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

    // 🚀 FILTRO POR ESTADO DE ASISTENCIA (usando campo pre-calculado)
    if (estadoAsistencia === 'asistio') {
      citasFilter.EstadoAsistencia = 'Asistió';
    } else if (estadoAsistencia === 'noAsistio') {
      citasFilter.EstadoAsistencia = 'No asistió';
    }
    // Si es 'todos', no se agrega filtro

    // Contar total de citas que coinciden con el filtro
    const totalCitas = await Cita.countDocuments(citasFilter);
    
    // Obtener citas con paginación
    const startIndex = (page - 1) * limit;
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
      .limit(limit)
      .lean();

    console.log(`📊 Total de citas en filtro: ${totalCitas}`);
    console.log(`📊 Citas obtenidas (página ${page}): ${citas.length}`);

    // Obtener conteo de comentarios para todas las citas
    const referencias = citas.map(cita => cita.Referencia);
    const conteoComentarios = await Comentario.aggregate([
      { $match: { citaReferencia: { $in: referencias } } },
      { $group: { _id: '$citaReferencia', count: { $sum: 1 } } }
    ]);
    
    // Crear mapa de conteo de comentarios
    const comentariosMap = {};
    conteoComentarios.forEach(item => {
      comentariosMap[item._id] = item.count;
    });

    // Mapear datos para incluir el flag tieneAsistencia y conteo de comentarios
    const citasConAsistencia = citas.map(cita => ({
      ...cita,
      tieneAsistencia: cita.EstadoAsistencia === 'Asistió',
      totalComentarios: comentariosMap[cita.Referencia] || 0
    }));

    // Estadísticas
    const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);

    // Calcular paginación
    const totalPages = Math.ceil(totalCitas / limit);

    // Obtener configuración
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 5;

    console.log(`✅ Resultado: ${citasConAsistencia.length} citas mostradas de ${totalCitas} totales (filtro: ${estadoAsistencia})`);

    return {
      data: citasConAsistencia,
      pagination: {
        page,
        limit,
        total: totalCitas,
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error en servicio OPTIMIZADO:', error);
    throw error;
  }
}

export async function getComentariosCita(citaReferencia) {
  return Comentario.find({ citaReferencia }).sort({ timestamp: -1 }).lean();
}

export async function addComentarioCita(citaReferencia, data) {
  const { usuario, comentario } = data;
  const newComentario = new Comentario({
    citaReferencia,
    usuario,
    comentario
  });
  return newComentario.save();
}

export default { getCitasConAsistencia, getComentariosCita, addComentarioCita };

