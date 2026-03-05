import Boleto from '../models/Boleto.js';
import Configuracion from '../models/Configuracion.js';
import { registrarLogBoleto } from './boletosService.js';

/**
 * Verifica y corrige estados de boletos según la configuración de días de espera.
 * 
 * PASO 1: Corrige boletos en "pendiente" que deberían estar en "en_espera"
 *   - Si un boleto tiene menos de diasEspera días desde su creación, debe estar en "en_espera"
 * 
 * PASO 2: Cambia boletos de "en_espera" a "pendiente" cuando corresponda
 *   - Solo si tienen al menos diasEspera días desde creación
 *   - Y además no tienen comentarios recientes o tienen alarma vencida
 * 
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarEstadosBoletos = async () => {
  try {
    // Obtener configuración de días de espera
    const config = await Configuracion.findOne({ singleton: true });
    const diasEspera = config?.accesorios?.diasEspera || 7;
    
    const ahora = new Date();
    const fechaLimite = new Date(ahora);
    fechaLimite.setDate(fechaLimite.getDate() - diasEspera);
    
    console.log(`[BOLETOS-ALARMAS] Verificando estados con ${diasEspera} días de espera configurados`);
    console.log(`[BOLETOS-ALARMAS] Fecha límite: ${fechaLimite.toLocaleString('es-ES')}`);
    
    // PASO 1: Corregir boletos que deberían estar en "en_espera" pero están en "pendiente"
    // (boletos nuevos o recientes que fueron creados incorrectamente como "pendiente")
    const boletosParaCorregir = await Boleto.find({
      estado: 'abierto',
      subEstado: 'pendiente',
      // Sin alarma activa (para no interferir con alarmas configuradas)
      $or: [
        { 'alarma.activa': { $ne: true } },
        { 'alarma.activa': { $exists: false } },
        { alarma: { $exists: false } }
      ]
    });
    
    console.log(`[BOLETOS-ALARMAS] Encontrados ${boletosParaCorregir.length} boletos en "pendiente" para revisar`);
    
    let corregidos = 0;
    let noCorregidos = 0;
    const razonesNoCorreccion = {
      sinFechaCreacion: 0,
      demasiadosDias: 0,
      conFechaPeroSinComentarios: 0,
      error: 0
    };
    
    for (const boleto of boletosParaCorregir) {
      try {
        // Obtener fecha de creación del boleto (fecha REAL del boleto, no cuando se guardó en DB)
        // PRIORIDAD 1: Fecha real del boleto en datosBoleto.createdAt
        // PRIORIDAD 2: Fecha en datosBoleto.origen.createdAt
        // PRIORIDAD 3: Fallback al createdAt de Mongoose (cuando se guardó en nuestra DB)
        let fechaCreacion = null;
        if (boleto.datosBoleto) {
          if (boleto.datosBoleto.createdAt) {
            fechaCreacion = new Date(boleto.datosBoleto.createdAt);
          } else if (boleto.datosBoleto.origen?.createdAt) {
            fechaCreacion = new Date(boleto.datosBoleto.origen.createdAt);
          }
        }
        // Si no encontramos fecha en datosBoleto, usar createdAt de Mongoose como fallback
        if (!fechaCreacion || isNaN(fechaCreacion.getTime())) {
          fechaCreacion = boleto.createdAt || null;
        }
        
        // Si tiene fecha de creación reciente (menos de X días), cambiar a "en_espera"
        // REGLA: Si tiene menos de diasEspera días desde creación, debe estar en "en_espera"
        if (fechaCreacion && !isNaN(fechaCreacion.getTime())) {
          const diasDesdeCreacion = Math.floor((ahora - fechaCreacion) / (1000 * 60 * 60 * 24));
          
          // Si tiene diasEspera días o menos desde creación, debe estar en "en_espera"
          // sin importar si tiene comentarios o no
          // Usar <= para incluir boletos que tienen exactamente los días configurados
          if (diasDesdeCreacion <= diasEspera) {
            boleto.subEstado = 'en_espera';
            await boleto.save();
            
            await registrarLogBoleto(
              boleto,
              'CORRECCION_ESTADO_INICIAL',
              boleto.estado,
              boleto.estado,
              'SISTEMA',
              `SubEstado corregido automáticamente a "en_espera" (boleto creado hace ${diasDesdeCreacion} días, menos de ${diasEspera} días configurados)`,
              'pendiente',
              'en_espera'
            );
            
            corregidos++;
            console.log(`[BOLETOS-ALARMAS] Boleto ${boleto.id} corregido a "en_espera" (creado hace ${diasDesdeCreacion} días, menos de ${diasEspera} días)`);
          } else {
            // Tiene fecha pero ya pasaron los días, no se corrige
            noCorregidos++;
            razonesNoCorreccion.demasiadosDias++;
            console.log(`[BOLETOS-ALARMAS] Boleto ${boleto.id} NO corregido: creado hace ${diasDesdeCreacion} días (>= ${diasEspera} días, correcto estar en "pendiente")`);
          }
        } else if (!boleto.fechaUltimoComentario) {
          // Si no tiene fecha de creación pero tampoco tiene comentarios, asumir que es nuevo y poner en "en_espera"
          boleto.subEstado = 'en_espera';
          await boleto.save();
          
          await registrarLogBoleto(
            boleto,
            'CORRECCION_ESTADO_INICIAL',
            boleto.estado,
            boleto.estado,
            'SISTEMA',
            'SubEstado corregido automáticamente a "en_espera" (boleto sin fecha de creación ni comentarios)',
            'pendiente',
            'en_espera'
          );
          
          corregidos++;
          console.log(`[BOLETOS-ALARMAS] Boleto ${boleto.id} corregido a "en_espera" (sin fecha ni comentarios)`);
        } else {
          // Tiene fecha de creación pero no se pudo determinar, y tiene comentarios
          noCorregidos++;
          razonesNoCorreccion.sinFechaCreacion++;
          console.log(`[BOLETOS-ALARMAS] Boleto ${boleto.id} NO corregido: sin fecha de creación válida pero tiene comentarios`);
        }
      } catch (error) {
        console.error(`[BOLETOS-ALARMAS] Error corrigiendo boleto ${boleto.id}:`, error.message);
        noCorregidos++;
        razonesNoCorreccion.error++;
      }
    }
    
    console.log(`[BOLETOS-ALARMAS] Resumen PASO 1: ${corregidos} corregidos, ${noCorregidos} no corregidos`, razonesNoCorreccion);
    
    // PASO 2: Cambiar boletos de "en_espera" a "pendiente" si han pasado los días
    // Buscar boletos que necesitan cambio de estado:
    // 1. Boletos en "abierto - en_espera" que tienen al menos diasEspera días desde creación
    // 2. Y además tienen fechaUltimoComentario anterior a la fecha límite o no tienen comentarios
    // 3. O tienen una alarma vencida
    // IMPORTANTE: No cambiar boletos que tienen menos de diasEspera días desde creación
    const boletosEnEspera = await Boleto.find({
      estado: 'abierto',
      subEstado: 'en_espera'
    });
    
    console.log(`[BOLETOS-ALARMAS] Revisando ${boletosEnEspera.length} boletos en "en_espera" para cambio a "pendiente"`);
    
    let procesados = 0;
    let errores = 0;
    const boletosParaCambiar = [];
    
    // Filtrar boletos que pueden cambiar a "pendiente"
    for (const boleto of boletosEnEspera) {
      try {
        // Obtener fecha de creación del boleto (fecha REAL del boleto, no cuando se guardó en DB)
        // PRIORIDAD 1: Fecha real del boleto en datosBoleto.createdAt
        // PRIORIDAD 2: Fecha en datosBoleto.origen.createdAt
        // PRIORIDAD 3: Fallback al createdAt de Mongoose (cuando se guardó en nuestra DB)
        let fechaCreacion = null;
        if (boleto.datosBoleto) {
          if (boleto.datosBoleto.createdAt) {
            fechaCreacion = new Date(boleto.datosBoleto.createdAt);
          } else if (boleto.datosBoleto.origen?.createdAt) {
            fechaCreacion = new Date(boleto.datosBoleto.origen.createdAt);
          }
        }
        // Si no encontramos fecha en datosBoleto, usar createdAt de Mongoose como fallback
        if (!fechaCreacion || isNaN(fechaCreacion.getTime())) {
          fechaCreacion = boleto.createdAt || null;
        }
        
        // Si no tiene fecha de creación, no cambiar a pendiente (mantener en espera)
        if (!fechaCreacion || isNaN(fechaCreacion.getTime())) {
          continue;
        }
        
        // Calcular días desde creación
        const diasDesdeCreacion = Math.floor((ahora - fechaCreacion) / (1000 * 60 * 60 * 24));
        
        // REGLA: Solo cambiar a "pendiente" si tiene MÁS de diasEspera días desde creación
        // Si tiene diasEspera días o menos, debe permanecer en "en_espera"
        if (diasDesdeCreacion <= diasEspera) {
          // El boleto es reciente (dentro del período de espera), debe permanecer en "en_espera"
          continue;
        }
        
        // Verificar si tiene una alarma vigente (activa y no vencida)
        const tieneAlarmaVigente = boleto.alarma?.activa && 
                                    boleto.alarma?.fechaHora && 
                                    new Date(boleto.alarma.fechaHora) > ahora;
        
        // Si tiene una alarma vigente, NO cambiar el estado (debe mantenerse en "en_espera")
        if (tieneAlarmaVigente) {
          continue;
        }
        
        // Verificar si debe cambiar a "pendiente":
        // 1. Tiene alarma vencida
        // 2. No tiene comentarios o tiene comentarios antiguos
        const tieneAlarmaVencida = boleto.alarma?.activa && boleto.alarma?.fechaHora <= ahora;
        const tieneComentariosAntiguos = !boleto.fechaUltimoComentario || boleto.fechaUltimoComentario < fechaLimite;
        
        if (tieneAlarmaVencida || tieneComentariosAntiguos) {
          boletosParaCambiar.push(boleto);
        }
        
      } catch (error) {
        console.error(`[BOLETOS-ALARMAS] Error verificando boleto ${boleto.id}:`, error.message);
      }
    }
    
    console.log(`[BOLETOS-ALARMAS] Encontrados ${boletosParaCambiar.length} boletos para cambiar a "pendiente"`);
    
    // Procesar boletos que pueden cambiar
    for (const boleto of boletosParaCambiar) {
      try {
        const subEstadoAnterior = boleto.subEstado;
        const razon = [];
        
        // Verificar si es por alarma vencida
        if (boleto.alarma?.activa && boleto.alarma?.fechaHora <= ahora) {
          razon.push('alarma vencida');
          boleto.alarma.activa = false; // Desactivar alarma
        }
        
        // Verificar si es por días sin comentarios
        if (!boleto.fechaUltimoComentario || boleto.fechaUltimoComentario < fechaLimite) {
          const diasSinComentarios = boleto.fechaUltimoComentario 
            ? Math.floor((ahora - boleto.fechaUltimoComentario) / (1000 * 60 * 60 * 24))
            : 'sin comentarios';
          razon.push(`${diasSinComentarios} días sin comentarios`);
        }
        
        // Cambiar subEstado a "pendiente"
        boleto.subEstado = 'pendiente';
        await boleto.save();
        
        // Registrar log automático
        await registrarLogBoleto(
          boleto,
          'TRANSICION_AUTOMATICA_DIAS_ESPERA',
          boleto.estado,
          boleto.estado,
          'SISTEMA',
          `SubEstado cambiado automáticamente de "en_espera" a "pendiente" (${razon.join(', ')})`,
          subEstadoAnterior,
          'pendiente'
        );
        
        procesados++;
        console.log(`[BOLETOS-ALARMAS] Boleto ${boleto.id} cambiado a "pendiente" - ${razon.join(', ')}`);
        
      } catch (error) {
        console.error(`[BOLETOS-ALARMAS] Error procesando boleto ${boleto.id}:`, error.message);
        errores++;
      }
    }
    
    return {
      corregidos, // Boletos corregidos de "pendiente" a "en_espera"
      procesados, // Boletos cambiados de "en_espera" a "pendiente"
      errores,
      total: boletosParaCambiar.length,
      revisados: boletosParaCorregir.length, // Total de boletos revisados en PASO 1
      noCorregidos: boletosParaCorregir.length - corregidos, // Boletos que no necesitaban corrección
      exito: errores === 0
    };
    
  } catch (error) {
    console.error('[BOLETOS-ALARMAS] Error verificando estados de boletos:', error);
    return {
      procesados: 0,
      errores: 1,
      total: 0,
      exito: false,
      error: error.message
    };
  }
};

/**
 * Verifica alarmas vencidas de boletos y las procesa
 * Cambia el subEstado a "pendiente" si está en "en_espera" y desactiva la alarma
 * Se ejecuta periódicamente por el scheduler
 */
export const verificarAlarmasBoletos = async () => {
  try {
    const ahora = new Date();
    
    // Buscar boletos con alarma activa y vencida que estén en "abierto"
    const boletosConAlarmaVencida = await Boleto.find({
      'alarma.activa': true,
      'alarma.fechaHora': { $lte: ahora },
      estado: 'abierto'
    });

    console.log(`[BOLETOS-ALARMAS] Verificando ${boletosConAlarmaVencida.length} alarmas vencidas`);

    let procesados = 0;
    let errores = 0;

    for (const boleto of boletosConAlarmaVencida) {
      try {
        const estadoAnterior = boleto.estado;
        const subEstadoAnterior = boleto.subEstado;
        
        // Si está en "en_espera", cambiar a "pendiente"
        // Si ya está en "pendiente", solo desactivar la alarma
        let cambioEstado = false;
        if (subEstadoAnterior === 'en_espera') {
          boleto.subEstado = 'pendiente';
          cambioEstado = true;
        }
        
        // Desactivar alarma
        boleto.alarma.activa = false;
        
        await boleto.save();

        // Registrar log solo si hubo cambio de estado
        if (cambioEstado) {
          await registrarLogBoleto(
            boleto,
            'ALARMA_DISPARADA',
            estadoAnterior,
            estadoAnterior, // El estado principal no cambia, solo el subEstado
            'SISTEMA',
            `Alarma disparada automáticamente el ${ahora.toLocaleString('es-ES')} - SubEstado cambiado de "en_espera" a "pendiente"`,
            subEstadoAnterior,
            'pendiente'
          );
        } else {
          // Solo registrar que la alarma fue desactivada
          await registrarLogBoleto(
            boleto,
            'ALARMA_DESACTIVADA',
            estadoAnterior,
            estadoAnterior,
            'SISTEMA',
            `Alarma vencida desactivada automáticamente el ${ahora.toLocaleString('es-ES')}`,
            subEstadoAnterior,
            subEstadoAnterior
          );
        }

        procesados++;
        console.log(`[BOLETOS-ALARMAS] Alarma procesada para boleto ${boleto.id} - ${cambioEstado ? 'Estado cambiado a pendiente' : 'Alarma desactivada'}`);
        
      } catch (error) {
        console.error(`[BOLETOS-ALARMAS] Error procesando alarma del boleto ${boleto.id}:`, error.message);
        errores++;
      }
    }

    return {
      procesados,
      errores,
      total: boletosConAlarmaVencida.length,
      exito: errores === 0
    };
    
  } catch (error) {
    console.error('[BOLETOS-ALARMAS] Error verificando alarmas de boletos:', error);
    return {
      procesados: 0,
      errores: 1,
      total: 0,
      exito: false,
      error: error.message
    };
  }
};

