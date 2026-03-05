import Cita from '../models/Cita.js';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';
import Comentario from '../models/Comentario.js';
import CitaGestion from '../models/CitaGestion.js';

const normalizarMatricula = (matricula) => {
  if (!matricula) return '';

  return matricula
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

/**
 * Obtiene todas las citas con informaciÃ³n de asistencia
 * @param {Object} filters - Filtros de bÃºsqueda
 * @param {Object} pagination - PaginaciÃ³n
 * @returns {Object} Resultado con datos y paginaciÃ³n
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

    // Obtener configuraciÃ³n de dÃ­as de tolerancia
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    console.log(`ðŸ“Š DÃ­as de tolerancia configurados: ${diasTolerancia}`);

    // Construir filtros para la consulta de citas
    const citasFilter = {};

    // Filtro por fechas
    if (fechaDesde || fechaHasta) {
      citasFilter['Fecha ci'] = {};
      if (fechaDesde) {
        // Parsear fecha desde string (formato YYYY-MM-DD)
        // IMPORTANTE: Las fechas en MongoDB estÃ¡n almacenadas como Date objects
        // Las fechas estÃ¡n almacenadas como medianoche del dÃ­a en hora local Argentina (UTC-3)
        // Ejemplo: 3/12/2025 00:00:48 hora local = 2025-12-03T03:00:48.000Z en UTC
        // Para incluir todas las citas del dÃ­a, usamos el inicio del dÃ­a en UTC correspondiente a medianoche local
        let fechaDesdeDate;
        if (typeof fechaDesde === 'string' && fechaDesde.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Formato ISO: YYYY-MM-DD
          const [year, month, day] = fechaDesde.split('-').map(Number);
          // Crear fecha en UTC para el dÃ­a anterior a las 20:00 (4 horas antes de medianoche UTC del dÃ­a solicitado)
          // Las fechas estÃ¡n almacenadas como medianoche local (UTC-3), que es 03:00 UTC
          // Usar el dÃ­a anterior a las 20:00 UTC para asegurar que incluimos todas las citas del dÃ­a solicitado
          fechaDesdeDate = new Date(Date.UTC(year, month - 1, day - 1, 20, 0, 0, 0));
        } else {
          // Otro formato, intentar parsear normalmente
          fechaDesdeDate = new Date(fechaDesde);
          fechaDesdeDate.setUTCDate(fechaDesdeDate.getUTCDate() - 1);
          fechaDesdeDate.setUTCHours(20, 0, 0, 0);
        }
        citasFilter['Fecha ci'].$gte = fechaDesdeDate;
        console.log(`ðŸ“Š Filtro fechaDesde: ${fechaDesde} -> ${fechaDesdeDate.toISOString()} (local: ${fechaDesdeDate.toLocaleDateString('es-AR')})`);
      }
      if (fechaHasta) {
        // Parsear fecha hasta string (formato YYYY-MM-DD)
        let fechaHastaDate;
        if (typeof fechaHasta === 'string' && fechaHasta.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Formato ISO: YYYY-MM-DD
          const [year, month, day] = fechaHasta.split('-').map(Number);
          // Crear fecha en UTC para el final del día solicitado
          // Las fechas están almacenadas como medianoche local (UTC-3), que es 03:00 UTC
          // Para incluir todas las citas del día hasta el final (23:59:59 hora local),
          // necesitamos cubrir hasta las 02:59:59.999 UTC del día siguiente
          // Esto asegura que incluimos todas las citas del día solicitado, pero NO del día siguiente
          // Ejemplo: fechaHasta = 2025-12-03 -> fechaHastaDate = 2025-12-04T02:59:59.999Z
          // Esto incluye citas del 03/12 hasta las 23:59:59 hora local, pero excluye citas del 04/12
          fechaHastaDate = new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
        } else {
          // Otro formato, intentar parsear normalmente
          fechaHastaDate = new Date(fechaHasta);
          fechaHastaDate.setUTCDate(fechaHastaDate.getUTCDate() + 1);
          fechaHastaDate.setUTCHours(2, 59, 59, 999);
        }
        citasFilter['Fecha ci'].$lte = fechaHastaDate;
        console.log(`📊 Filtro fechaHasta: ${fechaHasta} -> ${fechaHastaDate.toISOString()} (local: ${fechaHastaDate.toLocaleDateString('es-AR')})`);
      }
    }

    // Filtro por taller - puede ser un código único o múltiples códigos separados por coma
    if (taller) {
      // Si contiene comas, es múltiples códigos (talleres agrupados por nombre)
      if (taller.includes(',')) {
        const codigos = taller.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
        if (codigos.length > 0) {
          citasFilter.Taller = { $in: codigos };
        }
      } else {
        // Código único
      citasFilter.Taller = parseInt(taller);
      }
    }

    // Filtro por nombre
    if (nombre) {
      citasFilter.Nombre = { $regex: nombre, $options: 'i' };
    }

    // Filtro por matrÃ­cula
    if (matricula) {
      citasFilter.Matricula = { $regex: matricula, $options: 'i' };
    }

    // Filtro de bÃºsqueda general
    if (search) {
      citasFilter.$or = [
        { Referencia: { $regex: search, $options: 'i' } },
        { Nombre: { $regex: search, $options: 'i' } },
        { Matricula: { $regex: search, $options: 'i' } },
        { 'Marca/modelo': { $regex: search, $options: 'i' } }
      ];
    }

    // Obtener citas con paginación fija de 25 por página
    const LIMITE_FIJO = 25;
    
    // Contar total de citas base (sin procesar asistencia)
    const totalCitasBase = await Cita.countDocuments(citasFilter);
    
    // Si hay filtro de estado de asistencia, necesitamos procesar más citas ANTES de paginar
    // para poder filtrar correctamente y luego aplicar la paginación
    let citasParaProcesar = [];
    let proporcionGlobal = null;
    
    if (estadoAsistencia !== 'todos') {
      // Obtener TODAS las citas que cumplen los filtros para procesar asistencia y filtrar correctamente
      // Luego aplicaremos la paginación a las citas filtradas
      // IMPORTANTE: Procesar todas las citas para que el filtro de estado funcione correctamente
      // Si hay muchas citas, esto puede ser lento, pero es necesario para la precisión
      console.log(`📊 Procesando TODAS las citas (${totalCitasBase}) para aplicar filtro de asistencia antes de paginar...`);
      
      citasParaProcesar = await Cita.find(citasFilter)
        .sort({ 'Fecha ci': -1 })
        .lean(); // Sin límite - procesar todas las citas
    } else {
      // Sin filtro de asistencia, obtener solo las citas de la página actual
      const startIndex = (page - 1) * LIMITE_FIJO;
      citasParaProcesar = await Cita.find(citasFilter)
      .sort({ 'Fecha ci': -1 })
      .skip(startIndex)
        .limit(LIMITE_FIJO)
      .lean();
    }
    
    // Función auxiliar para normalizar fechas (definida antes de usarse)
    const normalizarFecha = (fecha) => {
      if (!fecha) return null;
      const fechaDate = fecha instanceof Date ? fecha : new Date(fecha);
      if (isNaN(fechaDate.getTime())) {
        return null;
      }
      // Normalizar a medianoche UTC del día correspondiente
      return Date.UTC(
        fechaDate.getUTCFullYear(),
        fechaDate.getUTCMonth(),
        fechaDate.getUTCDate()
      );
    };
    
    console.log(`📊 Citas obtenidas para procesar: ${citasParaProcesar.length}`);
    
    // Log de fechas de las citas encontradas para debugging
    if (citasParaProcesar.length > 0 && (fechaDesde || fechaHasta)) {
      const fechasCitas = citasParaProcesar.map(c => ({
        referencia: c.Referencia,
        fechaCi: c['Fecha ci'],
        fechaCiISO: c['Fecha ci'] ? new Date(c['Fecha ci']).toISOString() : null,
        fechaCiLocal: c['Fecha ci'] ? new Date(c['Fecha ci']).toLocaleDateString('es-AR') : null
      }));
      console.log(`ðŸ“Š Primeras 5 fechas de citas encontradas:`);
      fechasCitas.slice(0, 5).forEach(c => {
        console.log(`  - Cita ${c.referencia}: ${c.fechaCiISO} (local: ${c.fechaCiLocal})`);
      });
      
      // Verificar si hay citas del 3/12 (verificar tanto UTC como local)
      const citas3Dic = fechasCitas.filter(c => {
        if (!c.fechaCi) return false;
        const fecha = new Date(c.fechaCi);
        const diaUTC = fecha.getUTCDate();
        const mesUTC = fecha.getUTCMonth();
        const diaLocal = fecha.getDate();
        const mesLocal = fecha.getMonth();
        // Verificar tanto en UTC como en hora local
        return (diaUTC === 3 && mesUTC === 11) || (diaLocal === 3 && mesLocal === 11);
      });
      console.log(`ðŸ“Š Citas del 3/12 encontradas: ${citas3Dic.length}`);
      if (citas3Dic.length > 0) {
        citas3Dic.slice(0, 3).forEach(c => {
          console.log(`  - Cita ${c.referencia}: ${c.fechaCiISO} (local: ${c.fechaCiLocal})`);
        });
      }
      
      // Mostrar todas las fechas Ãºnicas encontradas para debugging
      const fechasUnicas = [...new Set(fechasCitas.map(c => c.fechaCiLocal))].sort();
      console.log(`ðŸ“Š Fechas Ãºnicas encontradas (local): ${fechasUnicas.join(', ')}`);
    }


    // Obtener todas las matrÃ­culas Ãºnicas de las citas
    const matriculaVariantes = new Set();
    citasParaProcesar.forEach(cita => {
      if (!cita?.Matricula) {
        return;
      }

      const valorOriginal = cita.Matricula.toString();
      const valorTrim = valorOriginal.trim();

      if (valorOriginal) {
        matriculaVariantes.add(valorOriginal);
      }

      if (valorTrim) {
        matriculaVariantes.add(valorTrim);
        const valorUpper = valorTrim.toUpperCase();
        if (valorUpper) {
          matriculaVariantes.add(valorUpper);
        }
      }
    });

    const matriculas = Array.from(matriculaVariantes).filter(Boolean);
    
    // Obtener todos los ingresos que coincidan con las matrÃ­culas en una sola consulta
    let ingresosMap = new Map();
    if (matriculas.length > 0) {
      try {
        const orConditions = [];
        const matriculasNormalizadasSet = new Set();

        matriculas.forEach(valor => {
          const matriculaNormalizada = normalizarMatricula(valor);
          if (!matriculaNormalizada || matriculasNormalizadasSet.has(matriculaNormalizada)) {
            return;
          }
          matriculasNormalizadasSet.add(matriculaNormalizada);

          // Buscar matrÃ­culas que coincidan despuÃ©s de normalizar (ignorando caracteres especiales)
          // Usamos un patrÃ³n que busca la secuencia de caracteres alfanumÃ©ricos en orden
          const regexPattern = matriculaNormalizada.split('').join('[^A-Z0-9]*');
          const regex = new RegExp(`^${regexPattern}[^A-Z0-9]*$`, 'i');
          
          // Log para debugging de matrÃ­culas especÃ­ficas
          if (matriculaNormalizada === 'AH075EN' || matriculaNormalizada.includes('075')) {
            console.log(`ðŸ” DEBUG ${matriculaNormalizada}: PatrÃ³n regex generado: ${regexPattern}`);
            console.log(`   Regex completo: ${regex.toString()}`);
          }
          
          // Usar solo regex pattern (igual que el dashboard) para mantener consistencia
          orConditions.push({ 'Matrícula vehí': regex });
        });

        console.log(`ðŸ” Buscando ingresos para ${matriculasNormalizadasSet.size} matrÃ­culas Ãºnicas`);
        
        if (orConditions.length > 0) {
          console.log(`ðŸ“ Generadas ${orConditions.length} condiciones de bÃºsqueda`);
          
          // Filtrar ingresos por fecha: solo buscar ingresos desde la fecha mÃ­nima de las citas menos la tolerancia
          // Esto optimiza la bÃºsqueda y evita traer ingresos muy antiguos
          const fechaMinimaCita = Math.min(...citas.map(c => {
            const fecha = normalizarFecha(c['Fecha ci']);
            return fecha || Infinity;
          }).filter(f => f !== Infinity));
          
          // Fecha mÃ­nima para buscar ingresos: fecha mÃ­nima de cita menos tolerancia (en dÃ­as)
          const fechaMinimaIngreso = fechaMinimaCita - (diasTolerancia * 24 * 60 * 60 * 1000);
          const fechaMinimaIngresoDate = new Date(fechaMinimaIngreso);
          
          console.log(`ðŸ“… Filtrando ingresos desde: ${fechaMinimaIngresoDate.toISOString()} (${fechaMinimaIngresoDate.toLocaleDateString('es-AR')}) para citas desde ${new Date(fechaMinimaCita).toLocaleDateString('es-AR')}`);
          
                    // Construir filtro combinado: matrÃ­culas Y fecha
          // Usar $and explÃ­cito para asegurar que ambos filtros se apliquen correctamente
          const ingresosFilter = {
            $and: [
              { $or: orConditions },
              { Fecaper: { $gte: fechaMinimaIngresoDate } }
            ]
          };
          
          console.log(`ðŸ” Filtro de ingresos aplicado. Condiciones OR: ${orConditions.length}, Fecha mÃ­nima: ${fechaMinimaIngresoDate.toISOString()}`);
          
          // Primero probar sin filtro de fecha para verificar si hay coincidencias de matrÃ­culas
          // IMPORTANTE: Usar búsqueda más simple y directa para encontrar ingresos
          // SIN límite y SIN filtro de fecha (igual que el dashboard) para asegurar que encontramos todos los ingresos
          const ingresosSinFiltroFecha = await Ingreso.find({
            $or: orConditions
          }).select({
            Referencia: 1,
            Fecaper: 1,
            'Matrícula vehí': 1
          }).lean(); // Sin límite - igual que el dashboard
          
          console.log(`🔍 Ingresos encontrados SIN filtro de fecha: ${ingresosSinFiltroFecha.length}`);
          if (ingresosSinFiltroFecha.length > 0) {
            console.log(`📋 Primeros 5 ingresos encontrados:`);
            ingresosSinFiltroFecha.slice(0, 5).forEach(ing => {
              const matNorm = normalizarMatricula(ing['Matrícula vehí']);
              console.log(`   - Ingreso ${ing.Referencia}: Matrícula raw "${ing['Matrícula vehí']}", normalizada "${matNorm}", Fecaper ${ing.Fecaper ? new Date(ing.Fecaper).toISOString() : 'N/A'}`);
            });
          }
          if (ingresosSinFiltroFecha.length > 0) {
            ingresosSinFiltroFecha.slice(0, 3).forEach(ing => {
              console.log(`   📋 Ingreso ${ing.Referencia}: Fecaper ${new Date(ing.Fecaper).toISOString()}, Matrícula: ${ing['Matrícula vehí']}`);
            });
          } else {
            // Si no hay ingresos sin filtro de fecha, mostrar las matrículas que se están buscando
            console.log(`⚠️ No se encontraron ingresos para las matrículas buscadas. Matrículas de las citas (primeras 5):`);
            citas.slice(0, 5).forEach(c => {
              const matNorm = normalizarMatricula(c.Matricula);
              console.log(`   - Cita ${c.Referencia}: Matrícula original "${c.Matricula}", normalizada "${matNorm}"`);
            });
            
            // Verificar si hay ingresos con esas matrículas pero sin el filtro de fecha
            const todasLasMatriculas = Array.from(matriculasNormalizadasSet);
            if (todasLasMatriculas.length > 0) {
              const ingresosPorMatricula = await Ingreso.find({
                'Matrícula vehí': { $regex: todasLasMatriculas[0].substring(0, 3), $options: 'i' }
              }).select({
                Referencia: 1,
                Fecaper: 1,
                'Matrícula vehí': 1
              }).limit(10).lean();
              
              console.log(`🔍 Ingresos con matrícula similar a "${todasLasMatriculas[0]}" (primeros 3 caracteres): ${ingresosPorMatricula.length}`);
              if (ingresosPorMatricula.length > 0) {
                ingresosPorMatricula.slice(0, 3).forEach(ing => {
                  console.log(`   📅 Ingreso ${ing.Referencia}: Matrícula "${ing['Matrícula vehí']}", Fecaper ${new Date(ing.Fecaper).toISOString()}`);
                });
              }
            }
          }
          
          // IMPORTANTE: Usar ingresosSinFiltroFecha directamente (igual que el dashboard)
          // No usar filtro de fecha ni límites - la validación de fechas se hace después
          const ingresos = ingresosSinFiltroFecha;
          
          console.log(`✅ Consulta MongoDB ejecutada: ${ingresos.length} ingresos encontrados (sin límite, sin filtro de fecha)`);
          
          // Crear un mapa de matrÃ­cula -> ingresos para bÃºsqueda rÃ¡pida
          ingresos.forEach(ingreso => {
          // Log para debugging: verificar si el ingreso tiene matrícula
          // IMPORTANTE: Verificar todos los campos posibles relacionados con matrícula
          const camposMatricula = Object.keys(ingreso).filter(k => 
            k.toLowerCase().includes('matrícula') || 
            k.toLowerCase().includes('matricula') || 
            k.toLowerCase().includes('patente')
          );
          
          // Buscar el campo de matrícula en cualquiera de sus variantes
          let matriculaValue = null;
          let nombreCampoMatricula = null;
          
          // Primero intentar con el nombre exacto
          if (ingreso['Matrícula vehí']) {
            matriculaValue = ingreso['Matrícula vehí'];
            nombreCampoMatricula = 'Matrícula vehí';
          } else if (camposMatricula.length > 0) {
            // Si no está con el nombre exacto, buscar en los campos relacionados
            nombreCampoMatricula = camposMatricula[0];
            matriculaValue = ingreso[nombreCampoMatricula];
            console.log(`⚠️ Ingreso ${ingreso.Referencia}: Campo 'Matrícula vehí' no encontrado, usando "${nombreCampoMatricula}" = "${matriculaValue}"`);
          }
          
          if (!matriculaValue) {
            console.log(`⚠️ Ingreso ${ingreso.Referencia} no tiene campo de matrícula. Campos disponibles:`, Object.keys(ingreso));
            console.log(`   - Campos relacionados con matrícula:`, camposMatricula);
            return;
          }
          
          const matriculaNormalizadaIngreso = normalizarMatricula(matriculaValue);
          if (!matriculaNormalizadaIngreso) {
            console.log(`⚠️ Ingreso ${ingreso.Referencia} tiene matrícula "${matriculaValue}" pero normalizada está vacía`);
            return;
          }
          
          console.log(`✅ Procesando ingreso ${ingreso.Referencia}: Matrícula raw "${matriculaValue}" (campo: ${nombreCampoMatricula}), normalizada "${matriculaNormalizadaIngreso}"`);

          const clavesAdicionales = [];

          // Agregar tambiÃ©n la matrÃ­cula original tal cual aparece en la cita (sin normalizar)
          if (matriculaValue) {
            clavesAdicionales.push(matriculaValue.toString().trim());
          }

          // Agregar versiones sin espacios ni signos pero respetando la mezcla de mayÃºsculas/minÃºsculas
          if (matriculaValue) {
            const alfanumericoCita = matriculaValue.toString().replace(/[^A-Za-z0-9]/g, '');
            if (alfanumericoCita) {
              clavesAdicionales.push(alfanumericoCita);
            }
          }

          // Registrar el ingreso bajo cada clave asociada
          const clavesNormalizadas = new Set([matriculaNormalizadaIngreso]);

          clavesAdicionales
            .filter(Boolean)
            .forEach(clave => {
              const normalizadaClave = normalizarMatricula(clave);
              if (normalizadaClave) {
                clavesNormalizadas.add(normalizadaClave);
              }
            });

          clavesNormalizadas.forEach(clave => {
            if (!ingresosMap.has(clave)) {
              ingresosMap.set(clave, []);
            }

            ingresosMap.get(clave).push(ingreso);
          });
          });
          
          console.log(`📊 Ingresos procesados: ${ingresos.length} ingresos mapeados a ${ingresosMap.size} claves únicas`);
          console.log('🔑 Primeras 10 claves en el mapa de ingresos:', Array.from(ingresosMap.keys()).slice(0, 10));
          if (ingresosMap.size > 0) {
            // Mostrar algunos ejemplos de ingresos en el mapa
            const primeraClave = Array.from(ingresosMap.keys())[0];
            const ingresosPrimeraClave = ingresosMap.get(primeraClave);
            console.log(`📋 Ejemplo: Clave "${primeraClave}" tiene ${ingresosPrimeraClave.length} ingreso(s)`);
            if (ingresosPrimeraClave.length > 0) {
              ingresosPrimeraClave.slice(0, 3).forEach(ing => {
                console.log(`   - Ingreso ${ing.Referencia}: Matrícula "${ing['Matrícula vehí']}", Fecaper ${ing.Fecaper ? new Date(ing.Fecaper).toISOString() : 'N/A'}`);
              });
            }
          } else if (ingresos.length > 0) {
            // Si hay ingresos pero no se mapearon, mostrar el primer ingreso para debugging
            console.log(`⚠️ Hay ${ingresos.length} ingresos pero 0 claves en el mapa. Primer ingreso:`);
            const primerIngreso = ingresos[0];
            console.log(`   - Referencia: ${primerIngreso.Referencia}`);
            console.log(`   - Todos los campos del ingreso:`, Object.keys(primerIngreso));
            console.log(`   - Matrícula vehí: "${primerIngreso['Matrícula vehí']}" (tipo: ${typeof primerIngreso['Matrícula vehí']})`);
            // Verificar si el campo tiene otro nombre
            const camposMatricula = Object.keys(primerIngreso).filter(k => 
              k.toLowerCase().includes('matrícula') || 
              k.toLowerCase().includes('matricula') || 
              k.toLowerCase().includes('patente')
            );
            console.log(`   - Campos relacionados con matrícula:`, camposMatricula);
            camposMatricula.forEach(campo => {
              console.log(`     - ${campo}: "${primerIngreso[campo]}" (tipo: ${typeof primerIngreso[campo]})`);
            });
            console.log(`   - Matrícula normalizada: "${normalizarMatricula(primerIngreso['Matrícula vehí'])}"`);
          }
          
          if (ingresos.length === 0 && matriculasNormalizadasSet.size > 0) {
            console.warn(`âš ï¸ No se encontraron ingresos para ${matriculasNormalizadasSet.size} matrÃ­culas Ãºnicas. Verificar normalizaciÃ³n de matrÃ­culas.`);
            console.warn(`   MatrÃ­culas buscadas (primeras 5):`, Array.from(matriculasNormalizadasSet).slice(0, 5));
          }
        } else {
          console.warn(`âš ï¸ No se generaron condiciones de bÃºsqueda para ${matriculasNormalizadasSet.size} matrÃ­culas Ãºnicas.`);
        }
      } catch (error) {
        console.error('âŒ Error obteniendo ingresos:', error);
        console.error('   Stack:', error.stack);
      }
    }

    // Procesar cada cita usando el mapa de ingresos
    const citasConAsistencia = [];

    // normalizarFecha ya estÃ¡ definida arriba (lÃ­nea 167)

    const estaDentroDeTolerancia = (fechaCita, fechaIngreso) => {
      const fechaCitaNormalizada = normalizarFecha(fechaCita);
      const fechaIngresoNormalizada = normalizarFecha(fechaIngreso);

      if (!fechaCitaNormalizada || !fechaIngresoNormalizada) {
        return false;
      }

      const diffMs = fechaIngresoNormalizada - fechaCitaNormalizada;
      const diffDias = diffMs / (1000 * 60 * 60 * 24);
      
      // Aceptar ingresos hasta X dÃ­as despuÃ©s de la cita (no antes)
      // El ingreso debe ser posterior o igual a la fecha de la cita
      if (diffMs < 0) {
        return false; // El ingreso es anterior a la cita, no cuenta como asistencia
      }
      
      return diffDias <= diasTolerancia;
    };

    // Log del estado del mapa de ingresos
    console.log(`\n📊 ESTADO DEL MAPA DE INGRESOS:`);
    console.log(`   - Total claves en mapa: ${ingresosMap.size}`);
    console.log(`   - Total citas para procesar: ${citasParaProcesar.length}`);
    if (ingresosMap.size === 0) {
      console.warn(`   ⚠️ ADVERTENCIA: El mapa de ingresos está VACÍO. No se podrá determinar asistencia.`);
      console.warn(`   - Verificar que haya ingresos en la base de datos`);
      console.warn(`   - Verificar que las matrículas de las citas coincidan con las de los ingresos`);
    } else {
      console.log(`   ✅ El mapa tiene ${ingresosMap.size} claves únicas`);
      // Mostrar algunas matrículas de las citas para comparar
      const matriculasCitas = citasParaProcesar.slice(0, 5).map(c => ({
        referencia: c.Referencia,
        matriculaOriginal: c.Matricula,
        matriculaNormalizada: normalizarMatricula(c.Matricula),
        enMapa: ingresosMap.has(normalizarMatricula(c.Matricula))
      }));
      console.log(`   📋 Primeras 5 matrículas de citas:`);
      matriculasCitas.forEach(m => {
        console.log(`      - Cita ${m.referencia}: "${m.matriculaOriginal}" -> "${m.matriculaNormalizada}" - ¿En mapa? ${m.enMapa ? '✅' : '❌'}`);
      });
    }
    
    // Contador para logs detallados (solo primeras 10 citas)
    let contadorLogs = 0;
    const MAX_LOGS_DETALLADOS = 10;
    
    for (const cita of citasParaProcesar) {
      let tieneAsistencia = false;
      let ingresoReferencia = null;
      let fechaIngreso = null;
      let totalComentarios = 0;

      // Verificar asistencia usando el mapa de ingresos
      const matriculaNormalizada = normalizarMatricula(cita.Matricula);
      const mostrarLogsDetallados = contadorLogs < MAX_LOGS_DETALLADOS;
      
      if (mostrarLogsDetallados) {
        console.log(`\n🔍 [${contadorLogs + 1}] Procesando cita ${cita.Referencia}:`);
        console.log(`   - Matrícula original: "${cita.Matricula}"`);
        console.log(`   - Matrícula normalizada: "${matriculaNormalizada}"`);
        console.log(`   - Fecha cita: ${cita['Fecha ci'] ? new Date(cita['Fecha ci']).toISOString() : 'N/A'}`);
      }
      
      // Log inicial para debugging
      if (!cita.Matricula || !cita['Fecha ci']) {
        console.log(`⚠️ Cita ${cita.Referencia}: Sin matrícula o fecha - Matrícula: ${cita.Matricula}, Fecha: ${cita['Fecha ci']}`);
      }

      if (cita['Fecha ci'] && matriculaNormalizada) {
        if (!ingresosMap.has(matriculaNormalizada)) {
          // Log para debugging: verificar si hay matrÃ­culas similares en el mapa
          const clavesSimilares = Array.from(ingresosMap.keys()).filter(clave => 
            clave.includes(matriculaNormalizada.substring(0, 3)) || 
            matriculaNormalizada.includes(clave.substring(0, 3))
          );
          if (clavesSimilares.length > 0) {
            console.log(`âš ï¸ MatrÃ­cula ${matriculaNormalizada} (cita ${cita.Referencia}) no encontrada en mapa, pero hay claves similares: ${clavesSimilares.slice(0, 3).join(', ')}`);
          }
        }
        
        // Si la matrícula no está en el mapa después de la verificación inicial, buscar directamente
        if (!ingresosMap.has(matriculaNormalizada)) {
          try {
            const regexPattern = matriculaNormalizada.split('').join('[^A-Z0-9]*');
            const regex = new RegExp(`^${regexPattern}[^A-Z0-9]*$`, 'i');
            
            const ingresosDirectos = await Ingreso.find({
              $or: [
                { 'Matrícula vehí': regex },
                { 'Matrícula vehí': { $regex: `^${matriculaNormalizada}$`, $options: 'i' } },
                { 'Matrícula vehí': { $regex: `.*${matriculaNormalizada}.*`, $options: 'i' } }
              ]
            }).select({
              Referencia: 1,
              Fecaper: 1,
              'Matrícula vehí': 1
            }).lean();
            
            if (ingresosDirectos.length > 0) {
              // Agregar estos ingresos al mapa usando la misma lógica de claves múltiples que el dashboard
              ingresosDirectos.forEach(ingreso => {
                let matriculaValue = ingreso['Matrícula vehí'];
                if (!matriculaValue) {
                  return;
                }
                
                const matriculaNormalizadaIngreso = normalizarMatricula(matriculaValue);
                if (!matriculaNormalizadaIngreso) {
                  return;
                }
                
                // Crear claves adicionales para variantes de matrícula (igual que el dashboard)
                const clavesAdicionales = [];
                
                if (matriculaValue) {
                  clavesAdicionales.push(matriculaValue.toString().trim());
                }
                
                if (matriculaValue) {
                  const alfanumerico = matriculaValue.toString().replace(/[^A-Za-z0-9]/g, '');
                  if (alfanumerico) {
                    clavesAdicionales.push(alfanumerico);
                  }
                }
                
                // Registrar el ingreso bajo cada clave asociada
                const clavesNormalizadas = new Set([matriculaNormalizadaIngreso]);
                
                clavesAdicionales
                  .filter(Boolean)
                  .forEach(clave => {
                    const normalizadaClave = normalizarMatricula(clave);
                    if (normalizadaClave) {
                      clavesNormalizadas.add(normalizadaClave);
                    }
                  });
                
                clavesNormalizadas.forEach(clave => {
                  if (!ingresosMap.has(clave)) {
                    ingresosMap.set(clave, []);
                  }
                  ingresosMap.get(clave).push(ingreso);
                });
              });
            }
          } catch (error) {
            console.warn(`Error buscando ingresos directamente para cita ${cita.Referencia}:`, error.message);
          }
        }
      }

      if (cita['Fecha ci'] && matriculaNormalizada && ingresosMap.has(matriculaNormalizada)) {
        try {
          const fechaCita = cita['Fecha ci'];

          // Buscar ingreso en el mapa
          const ingresosCita = ingresosMap.get(matriculaNormalizada);

          console.log(`ðŸ” Buscando ingresos para ${matriculaNormalizada} (cita ${cita.Referencia}). Â¿Existe? ${ingresosMap.has(matriculaNormalizada)}`);

          if (!ingresosCita || ingresosCita.length === 0) {
            console.log(`âš ï¸ No se encontraron ingresos normalizados para ${matriculaNormalizada} (cita ${cita.Referencia})`);
          } else {
            console.log(`ðŸ” Evaluando ${ingresosCita.length} ingresos para ${matriculaNormalizada} (cita ${cita.Referencia})`);
            ingresosCita.forEach(ingreso => {
              console.log(`   • Ingreso ${ingreso.Referencia} - Matricula raw "${ingreso['Matrícula vehí']}" - Fecha ${ingreso.Fecaper}`);
            });
          }

          const ingresoEncontrado = ingresosCita?.find(ingreso => {
            const fechaCitaNorm = normalizarFecha(fechaCita);
            const fechaIngresoNorm = normalizarFecha(ingreso.Fecaper);
            const diffMs = fechaIngresoNorm - fechaCitaNorm;
            const diffDias = diffMs / (1000 * 60 * 60 * 24);
            const dentroTolerancia = estaDentroDeTolerancia(fechaCita, ingreso.Fecaper);
            
            // Log detallado para debugging - mostrar todas las comparaciones cuando hay pocos ingresos
            if (ingresosCita.length <= 5 || Math.abs(diffDias) <= diasTolerancia + 2) {
              console.log(`   ðŸ” Comparando: Cita ${new Date(fechaCita).toISOString()} (norm: ${fechaCitaNorm}) vs Ingreso ${new Date(ingreso.Fecaper).toISOString()} (norm: ${fechaIngresoNorm})`);
              console.log(`      Diferencia: ${diffDias.toFixed(2)} dÃ­as, Tolerancia: ${diasTolerancia}, Dentro: ${dentroTolerancia}, Es posterior: ${diffMs >= 0}`);
            }
            
            return dentroTolerancia;
          });

          if (ingresoEncontrado) {
            tieneAsistencia = true;
            ingresoReferencia = ingresoEncontrado.Referencia;
            fechaIngreso = ingresoEncontrado.Fecaper;
            const fechaCitaNorm = normalizarFecha(fechaCita);
            const fechaIngresoNorm = normalizarFecha(fechaIngreso);
            const diffDias = (fechaIngresoNorm - fechaCitaNorm) / (1000 * 60 * 60 * 24);
            console.log(`âœ… Ingreso encontrado para ${matriculaNormalizada}: ${ingresoReferencia} (fecha ${fechaIngreso}) con diferencia ${diffDias.toFixed(2)} dÃ­as (tolerancia: ${diasTolerancia})`);
          } else if (ingresosCita && ingresosCita.length > 0) {
            const fechaCitaNormalizada = normalizarFecha(fechaCita);
            const fechaCitaDate = new Date(fechaCita);
            console.log(`âŒ No se encontrÃ³ ingreso en rango para ${matriculaNormalizada}. Fecha cita ${fechaCitaDate.toISOString()} (norm: ${fechaCitaNormalizada}, local: ${fechaCitaDate.toLocaleDateString('es-AR')})`);
            // Mostrar TODOS los ingresos disponibles para debugging
            console.log(`   ðŸ“‹ Total ingresos disponibles: ${ingresosCita.length}`);
            ingresosCita.forEach(ing => {
              const fechaIngNorm = normalizarFecha(ing.Fecaper);
              const fechaIngDate = new Date(ing.Fecaper);
              const diffMs = fechaIngNorm - fechaCitaNormalizada;
              const diffDias = diffMs / (1000 * 60 * 60 * 24);
              const esPosterior = diffMs >= 0;
              const dentroTolerancia = esPosterior && diffDias <= diasTolerancia;
              console.log(`   ðŸ“… Ingreso ${ing.Referencia}: ${fechaIngDate.toISOString()} (norm: ${fechaIngNorm}, local: ${fechaIngDate.toLocaleDateString('es-AR')}), diferencia: ${diffDias.toFixed(2)} dÃ­as, posterior: ${esPosterior}, dentro: ${dentroTolerancia}`);
            });
          }
        } catch (error) {
          console.warn(`Error verificando asistencia para cita ${cita.Referencia}:`, error.message);
        }
      }

      if (cita.Referencia) {
        totalComentarios = await Comentario.countDocuments({
          referencia: cita.Referencia,
          tipo: 'cita'
        }).catch(error => {
          console.warn(`Error contando comentarios para cita ${cita.Referencia}:`, error.message);
          return 0;
        });
      }

      // Obtener estado de gestión de la cita
      // Por defecto:
      // - Si tiene asistencia: estado "cerrado"
      // - Si no tiene asistencia: estado "abierto pendiente"
      let estadoGestion = tieneAsistencia ? 'cerrado' : 'abierto';
      let subEstadoGestion = tieneAsistencia ? null : 'pendiente';
      let alarmaGestion = null;
      let tieneCitaGestion = false;
      if (cita.Referencia) {
        const citaGestion = await CitaGestion.findOne({ citaReferencia: cita.Referencia }).lean().catch(() => null);
        if (citaGestion) {
          tieneCitaGestion = true;
          // Si existe CitaGestion, usar su estado (no sobrescribir)
          estadoGestion = citaGestion.estado;
          subEstadoGestion = citaGestion.subEstado;
          alarmaGestion = citaGestion.alarma;
        }
      }

      // Asegurar que tieneAsistencia sea siempre un boolean explícito
      const tieneAsistenciaFinal = Boolean(tieneAsistencia);

      const citaConAsistencia = {
        ...cita,
        tieneAsistencia: tieneAsistenciaFinal, // Asegurar que sea boolean explícito
        ingresoReferencia,
        fechaIngreso,
        totalComentarios,
        estado: estadoGestion,
        subEstado: subEstadoGestion,
        alarma: alarmaGestion,
        tieneCitaGestion // Guardar si tiene CitaGestion para el filtro
      };

      // Log final para verificar clasificación
      if (mostrarLogsDetallados) {
        console.log(`   📊 RESULTADO FINAL para cita ${cita.Referencia}:`);
        console.log(`      - tieneAsistencia: ${tieneAsistenciaFinal ? '✅ SÍ' : '❌ NO'} (tipo: ${typeof tieneAsistenciaFinal}, valor: ${tieneAsistenciaFinal})`);
        console.log(`      - estado: ${estadoGestion}`);
        console.log(`      - subEstado: ${subEstadoGestion || 'null'}`);
        console.log(`      - tieneCitaGestion: ${tieneCitaGestion}`);
      }

      citasConAsistencia.push(citaConAsistencia);
      contadorLogs++;
    }

    console.log(`\n📊 RESUMEN DE PROCESAMIENTO:`);
    console.log(`   - Citas para procesar: ${citasParaProcesar.length}`);
    console.log(`   - Citas procesadas: ${citasConAsistencia.length}`);
    
    // Validar que hay citas procesadas
    if (citasConAsistencia.length === 0) {
      console.warn(`⚠️ No se procesaron citas. citasParaProcesar.length: ${citasParaProcesar.length}`);
    } else {
      // Log de clasificación para debugging
      const conAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia === true).length;
      const sinAsistencia = citasConAsistencia.filter(c => c.tieneAsistencia === false).length;
      const sinClasificar = citasConAsistencia.filter(c => c.tieneAsistencia === undefined || c.tieneAsistencia === null).length;
      
      console.log(`\n📊 CLASIFICACIÓN DE ASISTENCIA:`);
      console.log(`   ✅ Con asistencia: ${conAsistencia} (${((conAsistencia / citasConAsistencia.length) * 100).toFixed(1)}%)`);
      console.log(`   ❌ Sin asistencia: ${sinAsistencia} (${((sinAsistencia / citasConAsistencia.length) * 100).toFixed(1)}%)`);
      if (sinClasificar > 0) {
        console.warn(`   ⚠️ Sin clasificar: ${sinClasificar} (esto es un problema!)`);
      }
      
      // Verificar que hay citas de ambos tipos
      if (conAsistencia === 0 && sinAsistencia > 0) {
        console.warn(`\n⚠️ ADVERTENCIA: Todas las citas están clasificadas como "sin asistencia"`);
        console.warn(`   Esto podría indicar un problema en la búsqueda de ingresos o en la lógica de tolerancia`);
        console.warn(`   Verificar: mapa de ingresos tiene ${ingresosMap.size} matrículas únicas`);
      } else if (sinAsistencia === 0 && conAsistencia > 0) {
        console.warn(`\n⚠️ ADVERTENCIA: Todas las citas están clasificadas como "con asistencia"`);
        console.warn(`   Esto podría indicar un problema en la lógica de determinación de asistencia`);
      }
      
      // Mostrar ejemplos de cada tipo
      const ejemploConAsistencia = citasConAsistencia.find(c => c.tieneAsistencia === true);
      const ejemploSinAsistencia = citasConAsistencia.find(c => c.tieneAsistencia === false);
      if (ejemploConAsistencia) {
        console.log(`\n   ✅ Ejemplo CON asistencia:`);
        console.log(`      - Referencia: ${ejemploConAsistencia.Referencia}`);
        console.log(`      - Matrícula: ${ejemploConAsistencia.Matricula} (normalizada: ${normalizarMatricula(ejemploConAsistencia.Matricula)})`);
        console.log(`      - Ingreso: ${ejemploConAsistencia.ingresoReferencia}`);
        console.log(`      - Fecha ingreso: ${ejemploConAsistencia.fechaIngreso ? new Date(ejemploConAsistencia.fechaIngreso).toISOString() : 'N/A'}`);
        console.log(`      - tieneAsistencia: ${ejemploConAsistencia.tieneAsistencia}`);
      }
      if (ejemploSinAsistencia) {
        console.log(`\n   ❌ Ejemplo SIN asistencia:`);
        console.log(`      - Referencia: ${ejemploSinAsistencia.Referencia}`);
        console.log(`      - Matrícula: ${ejemploSinAsistencia.Matricula} (normalizada: ${normalizarMatricula(ejemploSinAsistencia.Matricula)})`);
        console.log(`      - ¿Tiene matrícula en mapa? ${ingresosMap.has(normalizarMatricula(ejemploSinAsistencia.Matricula))}`);
        console.log(`      - tieneAsistencia: ${ejemploSinAsistencia.tieneAsistencia}`);
        if (ejemploSinAsistencia.Matricula && ingresosMap.has(normalizarMatricula(ejemploSinAsistencia.Matricula))) {
          const ingresos = ingresosMap.get(normalizarMatricula(ejemploSinAsistencia.Matricula));
          console.log(`      - Ingresos encontrados: ${ingresos.length}`);
        }
      }
      
      // Verificar que todas las citas tengan el campo tieneAsistencia
      const citasSinCampo = citasConAsistencia.filter(c => !('tieneAsistencia' in c));
      if (citasSinCampo.length > 0) {
        console.error(`\n❌ ERROR: ${citasSinCampo.length} citas NO tienen el campo 'tieneAsistencia'`);
        citasSinCampo.slice(0, 3).forEach(c => {
          console.error(`   - Cita ${c.Referencia} no tiene campo tieneAsistencia`);
        });
      }
    }

    // Filtrar por estado de asistencia
    let citasFiltradas = citasConAsistencia || [];
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasConAsistencia.filter(cita => {
        // Asegurar que tieneAsistencia sea boolean
        const tieneAsistencia = Boolean(cita.tieneAsistencia);
        return tieneAsistencia === true;
      });
      console.log(`📊 Filtro "asistio": ${citasFiltradas.length} citas de ${citasConAsistencia.length} procesadas`);
    } else if (estadoAsistencia === 'noAsistio') {
      // Filtrar por "No asistió" Y estado "Abierto (Pendiente)" para ser consistente con el dashboard
      // La lógica debe ser idéntica a la del dashboard: solo incluir si no tiene CitaGestion O si tiene estado='abierto' y subEstado='pendiente'
      const antesFiltro = citasConAsistencia.length;
      citasFiltradas = citasConAsistencia.filter(cita => {
        // Asegurar que tieneAsistencia sea boolean
        const tieneAsistencia = Boolean(cita.tieneAsistencia);
        
        // PRIMERO: Debe ser "No asistió"
        if (tieneAsistencia === true) {
          return false; // Excluir citas con asistencia
        }
        
        // SEGUNDO: Verificar estado de gestión (misma lógica que dashboard)
        // Si no tiene CitaGestion, se considera abierto pendiente por defecto
        if (!cita.tieneCitaGestion) {
          return true; // Sin CitaGestion = abierto pendiente por defecto
        }
        
        // Si tiene CitaGestion, debe estar abierto y pendiente
        return cita.estado === 'abierto' && cita.subEstado === 'pendiente';
      });
      
      // Verificar que no haya citas con asistencia en el resultado
      const citasConAsistenciaEnResultado = citasFiltradas.filter(c => Boolean(c.tieneAsistencia) === true);
      if (citasConAsistenciaEnResultado.length > 0) {
        console.error(`❌ ERROR CRÍTICO: Filtro "noAsistio" pero ${citasConAsistenciaEnResultado.length} citas tienen asistencia en resultado!`);
        citasConAsistenciaEnResultado.forEach(c => {
          console.error(`   - Cita ${c.Referencia} tiene asistencia: ${c.tieneAsistencia}`);
        });
        // Filtrar nuevamente para corregir
        citasFiltradas = citasFiltradas.filter(c => Boolean(c.tieneAsistencia) === false);
      }
      
      console.log(`📊 Filtro "noAsistio": ${citasFiltradas.length} citas de ${antesFiltro} procesadas (${citasConAsistencia.filter(c => !Boolean(c.tieneAsistencia)).length} sin asistencia total)`);
    }
    
    // Si hay filtro de asistencia, aplicar paginación DESPUÉS del filtrado
    // Si no hay filtro, las citas ya vienen paginadas de la consulta
    let citasPaginadas = citasFiltradas || [];
    if (estadoAsistencia !== 'todos') {
      // Con filtro: aplicar paginación después de filtrar
      const startIndex = (page - 1) * LIMITE_FIJO;
      citasPaginadas = (citasFiltradas || []).slice(startIndex, startIndex + LIMITE_FIJO);
      console.log(`📊 Paginación aplicada: mostrando ${citasPaginadas.length} citas de ${(citasFiltradas || []).length} filtradas (página ${page})`);
    } else {
      // Sin filtro: las citas ya están paginadas
      citasPaginadas = citasFiltradas || [];
      console.log(`📊 Sin filtro de asistencia: usando ${citasPaginadas.length} citas ya paginadas`);
    }

    console.log(`📊 Citas con asistencia: ${citasConAsistencia.filter(c => c.tieneAsistencia).length}`);
    console.log(`📊 Citas sin asistencia: ${citasConAsistencia.filter(c => !c.tieneAsistencia).length}`);
    console.log(`📊 Filtro aplicado: ${estadoAsistencia} - Citas filtradas: ${citasFiltradas.length}`);
    console.log(`📊 Total citas base (sin filtro asistencia): ${totalCitasBase}`);
    console.log(`📊 Página actual: ${page}, Citas en página: ${citasPaginadas.length}`);
    if (estadoAsistencia === 'noAsistio') {
      const sinCitaGestion = citasFiltradas.filter(c => !c.tieneCitaGestion).length;
      const conCitaGestionAbiertoPendiente = citasFiltradas.filter(c => c.tieneCitaGestion && c.estado === 'abierto' && c.subEstado === 'pendiente').length;
      console.log(`📊 Citas "no asistió" filtradas - Sin CitaGestion: ${sinCitaGestion}, Con CitaGestion abierto/pendiente: ${conCitaGestionAbiertoPendiente}`);
      console.log(`📊 Citas sin asistencia en página: ${citasConAsistencia.filter(c => !c.tieneAsistencia).length}`);
      console.log(`📊 Citas sin asistencia que NO cumplen filtro estado: ${citasConAsistencia.filter(c => !c.tieneAsistencia && !(!c.tieneCitaGestion || (c.estado === 'abierto' && c.subEstado === 'pendiente'))).length}`);
    }

    // Calcular total para paginación
    // Si no hay filtro de asistencia, usar el total base (exacto)
    // Si hay filtro de asistencia, usar la proporción global calculada de la muestra
    let totalEstimado = totalCitasBase;
    
    if (estadoAsistencia !== 'todos') {
      // Calcular proporción basándose en las citas procesadas
      const proporcion = citasConAsistencia.length > 0 ? citasFiltradas.length / citasConAsistencia.length : 0;
      
      console.log(`📊 Cálculo de total estimado:`);
      console.log(`   - Citas procesadas: ${citasConAsistencia.length}`);
      console.log(`   - Citas filtradas: ${citasFiltradas.length}`);
      console.log(`   - Proporción: ${proporcion.toFixed(4)} (${(proporcion * 100).toFixed(2)}%)`);
      console.log(`   - Total citas base: ${totalCitasBase}`);
      
      // Si procesamos todas las citas (sin límite), el total es exacto
      if (citasParaProcesar.length >= totalCitasBase) {
        // Procesamos todas las citas, el total filtrado es exacto
        totalEstimado = citasFiltradas.length;
      } else {
        // Procesamos solo una muestra, estimar el total
        totalEstimado = Math.round(totalCitasBase * proporcion);
      }
      
      console.log(`   - Total estimado: ${totalEstimado}`);
      
      // Asegurar que el total estimado sea al menos el número de resultados en páginas anteriores + actual
      const minimoTotal = (page - 1) * LIMITE_FIJO + citasPaginadas.length;
      totalEstimado = Math.max(totalEstimado, minimoTotal);
      
      console.log(`   - Mínimo total (páginas anteriores + actual): ${minimoTotal}`);
      console.log(`   - Total estimado (después de mínimo): ${totalEstimado}`);
      
      // Si hay exactamente LIMITE_FIJO resultados en la página, probablemente hay más páginas
      if (citasPaginadas.length === LIMITE_FIJO && citasFiltradas.length > page * LIMITE_FIJO) {
        // Hay más citas filtradas que las mostradas en esta página
        totalEstimado = Math.max(totalEstimado, citasFiltradas.length);
        console.log(`   - Hay más citas filtradas (${citasFiltradas.length}), ajustando total: ${totalEstimado}`);
      }
    } else if (estadoAsistencia !== 'todos' && totalCitasBase <= LIMITE_FIJO) {
      // Si hay pocas citas, el total es exacto
      totalEstimado = citasFiltradas.length;
      console.log(`📊 Total exacto (pocas citas): ${totalEstimado}`);
    } else {
      // Sin filtro de asistencia, usar total exacto
      totalEstimado = totalCitasBase;
    }
    
    const totalPages = Math.ceil(totalEstimado / LIMITE_FIJO);
    
    console.log(`📊 Total estimado final: ${totalEstimado}, Total páginas: ${totalPages}`);

    // Validación final: verificar que todas las citas devueltas tengan tieneAsistencia
    const citasSinAsistencia = citasPaginadas.filter(c => !('tieneAsistencia' in c));
    if (citasSinAsistencia.length > 0) {
      console.error(`\n❌ ERROR CRÍTICO: ${citasSinAsistencia.length} citas devueltas NO tienen el campo 'tieneAsistencia'`);
      citasSinAsistencia.forEach(c => {
        console.error(`   - Cita ${c.Referencia} no tiene campo tieneAsistencia`);
        // Asegurar que tenga el campo (fallback)
        c.tieneAsistencia = false;
      });
    }
    
    // Log final de lo que se devuelve
    const conAsistenciaDevueltas = citasPaginadas.filter(c => c.tieneAsistencia === true).length;
    const sinAsistenciaDevueltas = citasPaginadas.filter(c => c.tieneAsistencia === false).length;
    const sinClasificarDevueltas = citasPaginadas.filter(c => c.tieneAsistencia !== true && c.tieneAsistencia !== false).length;
    
    console.log(`\n📤 DATOS A DEVOLVER:`);
    console.log(`   - Filtro aplicado: ${estadoAsistencia}`);
    console.log(`   - Total citas en página: ${citasPaginadas.length}`);
    console.log(`   - Con asistencia: ${conAsistenciaDevueltas}`);
    console.log(`   - Sin asistencia: ${sinAsistenciaDevueltas}`);
    console.log(`   - Sin clasificar: ${sinClasificarDevueltas}`);
    
    // Si el filtro es "noAsistio", verificar que todas las citas devueltas sean sin asistencia
    if (estadoAsistencia === 'noAsistio' && conAsistenciaDevueltas > 0) {
      console.error(`\n❌ ERROR: Filtro "noAsistio" activo pero se están devolviendo ${conAsistenciaDevueltas} citas CON asistencia!`);
      citasPaginadas.forEach(c => {
        if (c.tieneAsistencia === true) {
          console.error(`   - Cita ${c.Referencia} tiene asistencia pero está en resultados de "noAsistio"`);
        }
      });
    }
    if (sinClasificarDevueltas > 0) {
      console.error(`   - ⚠️ Sin clasificar: ${sinClasificarDevueltas} (PROBLEMA!)`);
    }
    console.log(`   - Total estimado: ${totalEstimado}`);
    console.log(`   - Total páginas: ${totalPages}`);
    
    // Verificar que todas las citas tengan el campo correctamente
    citasPaginadas.forEach((cita, index) => {
      if (!('tieneAsistencia' in cita)) {
        console.error(`   ❌ Cita ${index + 1} (${cita.Referencia}) NO tiene campo tieneAsistencia`);
        cita.tieneAsistencia = false; // Fallback
      } else if (typeof cita.tieneAsistencia !== 'boolean') {
        console.error(`   ❌ Cita ${index + 1} (${cita.Referencia}) tiene tieneAsistencia=${cita.tieneAsistencia} (no es boolean)`);
        cita.tieneAsistencia = Boolean(cita.tieneAsistencia); // Convertir a boolean
      }
    });

    return {
      data: citasPaginadas,
      pagination: {
        page,
        limit: LIMITE_FIJO, // Siempre devolver 25 como límite
        total: totalEstimado,
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
 * Obtiene comentarios de una cita especÃ­fica
 * @param {string} citaReferencia - Referencia de la cita
 * @returns {Array} Lista de comentarios
 */
export async function getComentariosCita(citaReferencia) {
  try {
    const comentarios = await Comentario.find({
      referencia: citaReferencia,
      tipo: 'cita'
    })
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
      referencia: citaReferencia,
      tipo: 'cita',
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
 * Obtiene estadÃ­sticas de asistencia
 * @returns {Object} EstadÃ­sticas
 */
export async function getEstadisticasAsistencia() {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    const diasTolerancia = config?.asistencia?.diasTolerancia || 3;

    const totalCitas = await Cita.countDocuments();
    const totalIngresos = await Ingreso.countDocuments();

    // Obtener una muestra de citas para calcular estadÃ­sticas
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
    console.error('Error obteniendo estadÃ­sticas de asistencia:', error);
    throw error;
  }
}


