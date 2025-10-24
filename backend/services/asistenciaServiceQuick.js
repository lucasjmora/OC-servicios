import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';

/**
 * Servicio rápido: implementa la lógica correcta pero con límite de muestra
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
      limit = 25 // Límite más pequeño para respuesta rápida
    } = pagination;

    console.log(`📊 Servicio QUICK - Filtros: ${JSON.stringify(filters)}`);

    // Construir filtros básicos para citas
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

    console.log(`📊 Filtro de citas aplicado:`, JSON.stringify(citasFilter, null, 2));

    // Obtener configuración de días de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 5;

    // Obtener solo una muestra de citas (para respuesta rápida)
    const citas = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .limit(limit * 3) // Obtener 3 veces el límite para tener opciones de filtrado
      .lean();

    console.log(`📊 Citas obtenidas (muestra): ${citas.length}`);

    // Obtener matrículas únicas de estas citas
    const matriculasCitas = [...new Set(citas.map(cita => cita.Matricula).filter(Boolean))];
    console.log(`📊 Matrículas únicas: ${matriculasCitas.length}`);

    // Obtener ingresos relevantes
    let ingresosRelevantes = [];
    if (matriculasCitas.length > 0) {
      try {
        ingresosRelevantes = await Ingreso.find({
          'Matrícula vehí': { $in: matriculasCitas }
        }).lean();
        
        console.log(`📊 Ingresos encontrados: ${ingresosRelevantes.length}`);
      } catch (error) {
        console.warn('Error obteniendo ingresos:', error.message);
      }
    }

    // Procesar cada cita aplicando la lógica correcta
    const citasConAsistencia = [];

    for (const cita of citas) {
      let tieneAsistencia = false;
      let ingresoReferencia = null;
      let fechaIngreso = null;

      // Verificar si la matrícula de la cita existe en los ingresos
      if (cita.Matricula) {
        const ingresosDeEstaMatricula = ingresosRelevantes.filter(
          ingreso => ingreso['Matrícula vehí'] === cita.Matricula
        );

        // Si hay ingresos con esta matrícula, verificar fechas
        if (ingresosDeEstaMatricula.length > 0 && cita['Fecha ci']) {
          const fechaCita = new Date(cita['Fecha ci']);
          
          if (!isNaN(fechaCita.getTime())) {
            // Calcular fecha límite (fecha de cita + días de tolerancia)
            const fechaLimite = new Date(fechaCita);
            fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);

            // Buscar si algún ingreso está dentro del rango de fechas
            for (const ingreso of ingresosDeEstaMatricula) {
              const fechaIngresoObj = new Date(ingreso.Fecaper);
              
              if (!isNaN(fechaIngresoObj.getTime())) {
                // Verificar si el ingreso está en el rango: fecha de cita <= fecha ingreso <= fecha límite
                if (fechaIngresoObj >= fechaCita && fechaIngresoObj <= fechaLimite) {
                  tieneAsistencia = true;
                  ingresoReferencia = ingreso.Referencia;
                  fechaIngreso = ingreso.Fecaper;
                  break; // Encontramos una coincidencia
                }
              }
            }
          }
        }
      }

      citasConAsistencia.push({
        ...cita,
        tieneAsistencia,
        ingresoReferencia,
        fechaIngreso
      });
    }

    console.log(`📊 Procesamiento completado: ${citasConAsistencia.length} citas`);

    // Estadísticas finales
    const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasConAsistencia.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 RESUMEN: ${conAsistencia} ASISTIERON, ${sinAsistencia} NO ASISTIERON`);

    // Aplicar filtro por estado de asistencia ANTES de paginar
    let citasFiltradas = citasConAsistencia;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasConAsistencia.filter(cita => cita.tieneAsistencia);
      console.log(`📊 Filtro "asistió": ${citasFiltradas.length} citas`);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasConAsistencia.filter(cita => !cita.tieneAsistencia);
      console.log(`📊 Filtro "no asistió": ${citasFiltradas.length} citas`);
    }

    // Aplicar paginación DESPUÉS del filtro
    const startIndex = (page - 1) * limit;
    const citasPaginated = citasFiltradas.slice(startIndex, startIndex + limit);

    // Calcular paginación
    const totalFiltradas = citasFiltradas.length;
    const totalPages = Math.ceil(totalFiltradas / limit);

    console.log(`📊 RESULTADO: ${citasPaginated.length} citas mostradas de ${totalFiltradas} filtradas (página ${page}/${totalPages})`);

    return {
      data: citasPaginated,
      pagination: {
        page,
        limit,
        total: totalFiltradas,
        totalPages
      },
      config: {
        diasTolerancia
      }
    };

  } catch (error) {
    console.error('Error en servicio QUICK:', error);
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




