import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Venta from '../models/Venta.js';
import Configuracion from '../models/Configuracion.js';
import configStorageService from './configStorageService.js';

/**
 * Lee un archivo Excel y retorna los datos como array de objetos
 */
function readExcelFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }
  
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    cellNF: false,
    cellText: false
  });
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = xlsx.utils.sheet_to_json(worksheet, {
    raw: true,
    dateNF: 'yyyy-mm-dd'
  });
  
  return data;
}

/**
 * Procesa los datos de ventas desde archivos Excel
 * Conecta Ctas_PV.xlsx con archivos balance mensuales
 */
export async function procesarVentas() {
  try {
    console.log('💰 Iniciando procesamiento de ventas...');
    
    // Obtener configuración (intentar desde almacenamiento local primero, luego MongoDB)
    let config = null;
    
    // Intentar desde almacenamiento local
    try {
      if (configStorageService.isInitialized) {
        const localConfig = configStorageService.getConfig();
        if (localConfig?.ventas?.rutaCtasPV && localConfig?.ventas?.rutaBalances) {
          config = localConfig;
        }
      }
    } catch (localError) {
      console.log('ℹ️  No se pudo obtener configuración desde almacenamiento local');
    }
    
    // Si no hay config local o MongoDB está conectado, intentar desde MongoDB
    if (!config && mongoose.connection.readyState === 1) {
      try {
        const dbConfig = await Configuracion.findOne({ singleton: true });
        if (dbConfig?.ventas?.rutaCtasPV && dbConfig?.ventas?.rutaBalances) {
          config = dbConfig;
        }
      } catch (dbError) {
        console.log('ℹ️  No se pudo obtener configuración desde MongoDB');
      }
    }
    
    if (!config?.ventas?.rutaCtasPV || !config?.ventas?.rutaBalances) {
      console.log('⚠️ Configuración de ventas no encontrada, omitiendo procesamiento');
      return { procesados: 0, errores: 0 };
    }
    
    let rutaCtasPV = config.ventas.rutaCtasPV;
    const rutaBalances = config.ventas.rutaBalances;
    
    // Validar que existan las rutas
    if (!fs.existsSync(rutaCtasPV)) {
      console.log(`⚠️ Archivo Ctas_PV no encontrado: ${rutaCtasPV}`);
      // Intentar agregar extensión .xlsx si no la tiene
      const rutaConExtension = rutaCtasPV.endsWith('.xlsx') ? rutaCtasPV : `${rutaCtasPV}.xlsx`;
      if (fs.existsSync(rutaConExtension)) {
        console.log(`✅ Archivo encontrado con extensión: ${rutaConExtension}`);
        rutaCtasPV = rutaConExtension;
      } else {
        return { procesados: 0, errores: 1 };
      }
    } else {
      // Verificar que no sea un directorio
      const stats = fs.statSync(rutaCtasPV);
      if (stats.isDirectory()) {
        console.log(`❌ ERROR: La ruta especificada es un directorio, no un archivo: ${rutaCtasPV}`);
        console.log(`❌ Por favor, configure la ruta completa al archivo Ctas_PV.xlsx específico, no solo el directorio.`);
        return { procesados: 0, errores: 1, error: 'La ruta configurada es un directorio. Se requiere la ruta completa al archivo Ctas_PV.xlsx' };
      }
    }
    
    if (!fs.existsSync(rutaBalances) || !fs.statSync(rutaBalances).isDirectory()) {
      console.log(`⚠️ Carpeta de balances no encontrada: ${rutaBalances}`);
      return { procesados: 0, errores: 1 };
    }
    
    // Listar todos los archivos en la carpeta para debugging
    const todosLosArchivos = fs.readdirSync(rutaBalances);
    console.log(`📂 Archivos encontrados en carpeta balances (${todosLosArchivos.length}):`, todosLosArchivos);
    
    // Leer archivo Ctas_PV.xlsx
    console.log(`📖 Leyendo archivo Ctas_PV: ${rutaCtasPV}`);
    const ctasPV = readExcelFile(rutaCtasPV);
    console.log(`✅ ${ctasPV.length} cuentas leídas de Ctas_PV`);
    
    // Log de las primeras cuentas para debugging
    if (ctasPV.length > 0) {
      console.log('🔍 Muestra de columnas disponibles en Ctas_PV:', Object.keys(ctasPV[0]));
      console.log('🔍 Muestra de primera cuenta:', JSON.stringify(ctasPV[0], null, 2));
      if (ctasPV.length > 1) {
        console.log('🔍 Muestra de segunda cuenta:', JSON.stringify(ctasPV[1], null, 2));
      }
    }
    
    // Crear mapa CM -> { Tipo_cta, Empresa, Location, channel, UN }
    const mapaCM = new Map();
    let cuentasSinTipoValido = 0;
    let tiposEncontrados = new Set();
    
    ctasPV.forEach((cuenta, index) => {
      // Buscar el campo CM en diferentes variantes posibles
      const cmRaw = cuenta.CM || cuenta['CM'] || cuenta['Cta Mayor'] || cuenta['CtaMayor'] || cuenta['Cuenta Mayor'] || cuenta['cuenta mayor'];
      const cm = cmRaw;
      
      if (cm) {
        // Normalizar CM como string para comparación
        const cmStr = String(cm).trim();
        
        // Buscar el campo Tipo_cta en diferentes variantes posibles
        const tipoCtaRaw = cuenta.Tipo_cta || cuenta['Tipo_cta'] || cuenta.tipo_cta || cuenta['Tipo Cta'] || cuenta['Tipo de cuenta'] || cuenta.Tipo || cuenta.Obs;
        
        const tipoCta = tipoCtaRaw ? String(tipoCtaRaw).trim() : null;
        const empresa = cuenta.Empresa ? String(cuenta.Empresa).trim().toUpperCase() : null;
        const location = cuenta.Location ? String(cuenta.Location).trim() : null;
        const channel = cuenta.channel ? String(cuenta.channel).trim() : null;
        const un = cuenta.UN ? String(cuenta.UN).trim() : null;
        
        // Registrar todos los tipos encontrados para debugging
        if (tipoCta) {
          tiposEncontrados.add(tipoCta.toLowerCase());
        }
        
        // Validación más flexible: aceptar variaciones de los tipos
        let tipoCtaNormalizado = null;
        if (tipoCta) {
          const tipoLower = tipoCta.toLowerCase();
          if (tipoLower.includes('venta') || tipoLower === 'v' || tipoLower === 'ventas') {
            tipoCtaNormalizado = 'venta';
          } else if (tipoLower.includes('descuento') || tipoLower === 'd' || tipoLower === 'descuentos') {
            tipoCtaNormalizado = 'descuento';
          } else if (tipoLower.includes('costo') || tipoLower === 'c' || tipoLower === 'costos') {
            tipoCtaNormalizado = 'costo';
          }
        }
        
        if (tipoCtaNormalizado) {
          mapaCM.set(cmStr, {
            tipoCta: tipoCtaNormalizado,
            empresa: empresa, // FC, GV, PW o null
            location: location,
            channel: channel,
            un: un // Taller, Repuestos o null
          });
        } else {
          cuentasSinTipoValido++;
          if (index < 5) {
            console.log(`⚠️ Cuenta ${index + 1} sin tipo válido - CM: ${cmStr}, Tipo_cta: ${tipoCta || 'NO ENCONTRADO'}`);
          }
        }
      }
    });
    
    console.log(`📊 Mapa CM creado: ${mapaCM.size} cuentas con tipo válido`);
    console.log(`⚠️ ${cuentasSinTipoValido} cuentas sin tipo válido`);
    if (tiposEncontrados.size > 0) {
      console.log(`📋 Tipos encontrados en el archivo:`, Array.from(tiposEncontrados));
    }
    
    // Leer archivos balance de la carpeta
    const archivosBalance = fs.readdirSync(rutaBalances)
      .filter(archivo => {
        // Filtrar archivos con formato MM_YYYY.xlsx (case insensitive)
        const match = archivo.match(/^(\d{1,2})_(\d{4})\.xlsx$/i);
        if (match) {
          console.log(`✅ Archivo balance válido encontrado: ${archivo}`);
        }
        return match !== null;
      })
      .sort();
    
    console.log(`📁 Archivos balance válidos encontrados: ${archivosBalance.length}`);
    if (archivosBalance.length > 0) {
      console.log(`📋 Lista de archivos a procesar:`, archivosBalance);
    }
    
    if (archivosBalance.length === 0) {
      console.log('⚠️ No se encontraron archivos balance con formato MM_YYYY.xlsx');
      return { procesados: 0, errores: 0 };
    }
    
    let procesados = 0;
    let errores = 0;
    
    // Procesar cada archivo balance
    for (const archivo of archivosBalance) {
      try {
        const match = archivo.match(/^(\d{1,2})_(\d{4})\.xlsx$/i);
        if (!match) continue;
        
        const mes = parseInt(match[1], 10);
        const año = parseInt(match[2], 10);
        const mesKey = `${año}-${String(mes).padStart(2, '0')}`;
        
        const rutaArchivo = path.join(rutaBalances, archivo);
        console.log(`📖 Procesando balance: ${archivo} (${mesKey})`);
        
        // Leer archivo balance
        const balance = readExcelFile(rutaArchivo);
        console.log(`✅ ${balance.length} registros leídos de ${archivo}`);
        
        // Inicializar acumuladores por tipo (totales)
        let ventas = 0;
        let descuentos = 0;
        let costos = 0;
        
        // Inicializar acumuladores por empresa
        let ventasFC = 0;
        let descuentosFC = 0;
        let ventasGV = 0;
        let descuentosGV = 0;
        let ventasPW = 0;
        let descuentosPW = 0;
        
        // Acumuladores desglosados para tablas detalladas
        // Fact. Taller: {empresa_location: {ventas, descuentos, costos}}
        const factTallerMap = new Map();
        // Venta PV: {empresa_location: {ventas, descuentos, costos}}
        const ventaPVMap = new Map();
        // Fact. Repuestos: {channel_empresa: {ventas, descuentos, costos}}
        const factRepuestosMap = new Map();
        // Acumulador temporal de repuestos por empresa (para sumar a Venta PV)
        const repuestosPorEmpresa = new Map(); // {empresa: {ventas, descuentos, costos}}
        
        // Procesar cada registro del balance
        balance.forEach(registro => {
          const cuentaMayor = registro['Cuenta mayor'];
          if (!cuentaMayor) return;
          
          // Normalizar cuenta mayor como string
          const cuentaMayorStr = String(cuentaMayor).trim();
          
          // Buscar en el mapa CM
          const infoCM = mapaCM.get(cuentaMayorStr);
          if (!infoCM) return;
          
          const tipoCta = infoCM.tipoCta;
          const empresa = infoCM.empresa;
          const location = infoCM.location;
          const channel = infoCM.channel;
          const un = infoCM.un;
          
          // Obtener saldo (puede estar en "Saldo mes", "Saldo mes" o "Saldo")
          let saldo = registro['Saldo mes'] || registro['Saldo'] || registro['SaldoMes'] || 0;
          
          // Convertir a número si es string
          if (typeof saldo === 'string') {
            // Remover separadores de miles y convertir
            saldo = parseFloat(saldo.replace(/[^\d.-]/g, '')) || 0;
          }
          
          // Aplicar inversión de signos según tipo
          if (tipoCta === 'venta') {
            // Ventas: saldos negativos → invertir
            if (saldo < 0) {
              const valor = Math.abs(saldo);
              ventas += valor;
              
              // Acumular por empresa
              if (empresa === 'FC') {
                ventasFC += valor;
              } else if (empresa === 'GV') {
                ventasGV += valor;
              } else if (empresa === 'PW') {
                ventasPW += valor;
              }
              
              // Acumular desglosado según UN (Unidad de Negocio)
              // Fact. Taller: solo UN = "Taller"
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyTaller = `${empresa}_${location}`;
                if (!factTallerMap.has(keyTaller)) {
                  factTallerMap.set(keyTaller, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factTallerMap.get(keyTaller).ventas += valor;
              }
              
              // Venta PV: unifica ambas UN (Taller + Repuestos)
              // Para Taller: agrupar por empresa y location
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyPV = `${empresa}_${location}`;
                if (!ventaPVMap.has(keyPV)) {
                  ventaPVMap.set(keyPV, { ventas: 0, descuentos: 0, costos: 0, location: location });
                }
                ventaPVMap.get(keyPV).ventas += valor;
              }
              
              // Acumular repuestos por empresa (para sumar después a cada location de Venta PV)
              if (un && un.toLowerCase() === 'repuestos' && empresa) {
                if (!repuestosPorEmpresa.has(empresa)) {
                  repuestosPorEmpresa.set(empresa, { ventas: 0, descuentos: 0, costos: 0 });
                }
                repuestosPorEmpresa.get(empresa).ventas += valor;
              }
              
              // Fact. Repuestos: solo UN = "Repuestos"
              if (un && un.toLowerCase() === 'repuestos' && channel && empresa) {
                const keyRepuestos = `${channel}_${empresa}`;
                if (!factRepuestosMap.has(keyRepuestos)) {
                  factRepuestosMap.set(keyRepuestos, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factRepuestosMap.get(keyRepuestos).ventas += valor;
              }
            }
          } else if (tipoCta === 'descuento') {
            // Descuentos: saldos positivos → invertir
            if (saldo > 0) {
              const valor = -saldo;
              descuentos += valor;
              
              // Acumular por empresa
              if (empresa === 'FC') {
                descuentosFC += valor;
              } else if (empresa === 'GV') {
                descuentosGV += valor;
              } else if (empresa === 'PW') {
                descuentosPW += valor;
              }
              
              // Acumular desglosado según UN
              // Fact. Taller: solo UN = "Taller"
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyTaller = `${empresa}_${location}`;
                if (!factTallerMap.has(keyTaller)) {
                  factTallerMap.set(keyTaller, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factTallerMap.get(keyTaller).descuentos += valor;
              }
              
              // Venta PV: solo Taller (con locations)
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyPV = `${empresa}_${location}`;
                if (!ventaPVMap.has(keyPV)) {
                  ventaPVMap.set(keyPV, { ventas: 0, descuentos: 0, costos: 0, location: location });
                }
                ventaPVMap.get(keyPV).descuentos += valor;
              }
              
              // Acumular descuentos de repuestos por empresa
              if (un && un.toLowerCase() === 'repuestos' && empresa) {
                if (!repuestosPorEmpresa.has(empresa)) {
                  repuestosPorEmpresa.set(empresa, { ventas: 0, descuentos: 0, costos: 0 });
                }
                repuestosPorEmpresa.get(empresa).descuentos += valor;
              }
              
              // Fact. Repuestos: solo UN = "Repuestos"
              if (un && un.toLowerCase() === 'repuestos' && channel && empresa) {
                const keyRepuestos = `${channel}_${empresa}`;
                if (!factRepuestosMap.has(keyRepuestos)) {
                  factRepuestosMap.set(keyRepuestos, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factRepuestosMap.get(keyRepuestos).descuentos += valor;
              }
            }
          } else if (tipoCta === 'costo') {
            // Costos: saldos positivos → invertir
            if (saldo > 0) {
              const valorCosto = -saldo;
              costos += valorCosto;
              
              // Acumular desglosado según UN
              // Fact. Taller: solo UN = "Taller"
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyTaller = `${empresa}_${location}`;
                if (!factTallerMap.has(keyTaller)) {
                  factTallerMap.set(keyTaller, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factTallerMap.get(keyTaller).costos += valorCosto;
              }
              
              // Venta PV: solo Taller (con locations)
              if (un && un.toLowerCase() === 'taller' && location && empresa) {
                const keyPV = `${empresa}_${location}`;
                if (!ventaPVMap.has(keyPV)) {
                  ventaPVMap.set(keyPV, { ventas: 0, descuentos: 0, costos: 0, location: location });
                }
                // Acumular costos como valores absolutos para evitar problemas con signos
                ventaPVMap.get(keyPV).costos += Math.abs(valorCosto);
              }
              
              // Acumular costos de repuestos por empresa
              if (un && un.toLowerCase() === 'repuestos' && empresa) {
                if (!repuestosPorEmpresa.has(empresa)) {
                  repuestosPorEmpresa.set(empresa, { ventas: 0, descuentos: 0, costos: 0 });
                }
                // Acumular costos como valores absolutos
                repuestosPorEmpresa.get(empresa).costos += Math.abs(valorCosto);
              }
              
              // Fact. Repuestos: solo UN = "Repuestos"
              if (un && un.toLowerCase() === 'repuestos' && channel && empresa) {
                const keyRepuestos = `${channel}_${empresa}`;
                if (!factRepuestosMap.has(keyRepuestos)) {
                  factRepuestosMap.set(keyRepuestos, { ventas: 0, descuentos: 0, costos: 0 });
                }
                factRepuestosMap.get(keyRepuestos).costos += valorCosto;
              }
            }
          }
        });
        
        // Sumar repuestos a cada location de Venta PV
        // Para cada empresa, distribuir los repuestos proporcionalmente entre sus locations
        repuestosPorEmpresa.forEach((repuestosData, empresa) => {
          // Obtener todas las locations de esta empresa en Venta PV
          const locationsEmpresa = [];
          ventaPVMap.forEach((valores, key) => {
            const [keyEmpresa] = key.split('_');
            if (keyEmpresa === empresa) {
              locationsEmpresa.push(key);
            }
          });
          
          // Si hay locations, distribuir los repuestos proporcionalmente
          if (locationsEmpresa.length > 0) {
            const numLocations = locationsEmpresa.length;
            locationsEmpresa.forEach((key) => {
              const valores = ventaPVMap.get(key);
              // Distribuir los repuestos proporcionalmente entre las locations
              valores.ventas += repuestosData.ventas / numLocations;
              valores.descuentos += repuestosData.descuentos / numLocations;
              // Asegurar que los costos se sumen correctamente (siempre positivos)
              const costosRepuestosDistribuidos = Math.abs(repuestosData.costos) / numLocations;
              valores.costos += costosRepuestosDistribuidos;
            });
          }
        });
        
        // Convertir mapas a arrays y calcular MB
        const factTaller = [];
        factTallerMap.forEach((valores, key) => {
          const [empresa, location] = key.split('_');
          const facturacion = valores.ventas + valores.descuentos; // descuentos ya es negativo
          const costosVal = Math.abs(valores.costos);
          const mb = facturacion > 0 ? ((facturacion - costosVal) / facturacion) * 100 : 0;
          factTaller.push({
            empresa,
            location,
            facturacion,
            costos: costosVal,
            mb: Math.round(mb * 100) / 100 // Redondear a 2 decimales
          });
        });
        
        const ventaPV = [];
        ventaPVMap.forEach((valores, key) => {
          const [empresa, locationOrChannel] = key.split('_');
          const facturacion = valores.ventas + valores.descuentos; // descuentos ya es negativo
          // Asegurar que los costos sean siempre positivos (pueden ser negativos por cómo se acumulan)
          const costosVal = Math.abs(valores.costos);
          const mb = facturacion > 0 ? ((facturacion - costosVal) / facturacion) * 100 : 0;
          // Para Venta PV, location puede ser location (Taller) o channel (Repuestos)
          ventaPV.push({
            empresa,
            location: locationOrChannel, // Puede ser location o channel según UN
            facturacion,
            costos: costosVal,
            mb: Math.round(mb * 100) / 100 // Redondear a 2 decimales
          });
        });
        
        const factRepuestos = [];
        factRepuestosMap.forEach((valores, key) => {
          const [channel, empresa] = key.split('_');
          const facturacion = valores.ventas + valores.descuentos; // descuentos ya es negativo
          const costosVal = Math.abs(valores.costos);
          const mb = facturacion > 0 ? ((facturacion - costosVal) / facturacion) * 100 : 0;
          factRepuestos.push({
            channel,
            empresa,
            facturacion,
            costos: costosVal,
            mb: Math.round(mb * 100) / 100 // Redondear a 2 decimales
          });
        });
        
        // Guardar o actualizar en MongoDB (solo si está conectado)
        try {
          await Venta.findOneAndUpdate(
            { mesKey },
            {
              mesKey,
              ventas,
              descuentos,
              costos,
              ventasFC,
              descuentosFC,
              ventasGV,
              descuentosGV,
              ventasPW,
              descuentosPW,
              factTaller,
              ventaPV,
              factRepuestos,
              fechaActualizacion: new Date()
            },
            { upsert: true, new: true }
          );
        } catch (dbError) {
          console.log(`⚠️ No se pudo guardar en MongoDB para ${mesKey}:`, dbError.message);
          // Continuar procesando otros archivos aunque falle el guardado
        }
        
        console.log(`✅ ${mesKey} procesado: Ventas=${ventas.toFixed(2)}, Descuentos=${descuentos.toFixed(2)}, Costos=${costos.toFixed(2)}`);
        console.log(`   Por empresa - FC: V=${ventasFC.toFixed(2)}, D=${descuentosFC.toFixed(2)} | GV: V=${ventasGV.toFixed(2)}, D=${descuentosGV.toFixed(2)} | PW: V=${ventasPW.toFixed(2)}, D=${descuentosPW.toFixed(2)}`);
        procesados++;
        
      } catch (error) {
        console.error(`❌ Error procesando archivo ${archivo}:`, error.message);
        errores++;
      }
    }
    
    console.log(`✅ Procesamiento de ventas completado: ${procesados} meses procesados, ${errores} errores`);
    
    return { procesados, errores };
    
  } catch (error) {
    console.error('❌ Error en procesamiento de ventas:', error);
    throw error;
  }
}

/**
 * Obtiene el resumen de ventas para un mes específico
 */
export async function obtenerResumenVentas(mesKey) {
  try {
    // Si MongoDB no está conectado, retornar valores por defecto
    if (mongoose.connection.readyState !== 1) {
      return {
        mesKey,
        ventas: 0,
        descuentos: 0,
        costos: 0,
        ventasNetas: 0,
        ventasFC: 0,
        descuentosFC: 0,
        ventasNetasFC: 0,
        ventasGV: 0,
        descuentosGV: 0,
        ventasNetasGV: 0,
        ventasPW: 0,
        descuentosPW: 0,
        ventasNetasPW: 0,
        factTaller: [],
        ventaPV: [],
        factRepuestos: [],
        fechaActualizacion: null
      };
    }
    
    const venta = await Venta.findOne({ mesKey }).lean();
    
    if (!venta) {
      return {
        mesKey,
        ventas: 0,
        descuentos: 0,
        costos: 0,
        ventasNetas: 0,
        ventasFC: 0,
        descuentosFC: 0,
        ventasNetasFC: 0,
        ventasGV: 0,
        descuentosGV: 0,
        ventasNetasGV: 0,
        ventasPW: 0,
        descuentosPW: 0,
        ventasNetasPW: 0,
        factTaller: [],
        ventaPV: [],
        factRepuestos: [],
        fechaActualizacion: null
      };
    }
    
    const ventas = venta.ventas || 0;
    const descuentos = venta.descuentos || 0;
    const ventasFC = venta.ventasFC || 0;
    const descuentosFC = venta.descuentosFC || 0;
    const ventasGV = venta.ventasGV || 0;
    const descuentosGV = venta.descuentosGV || 0;
    const ventasPW = venta.ventasPW || 0;
    const descuentosPW = venta.descuentosPW || 0;
    
    return {
      mesKey: venta.mesKey,
      ventas,
      descuentos,
      costos: venta.costos || 0,
      // ventasNetas = ventas + descuentos (porque descuentos ya es negativo)
      ventasNetas: ventas + descuentos,
      ventasFC,
      descuentosFC,
      ventasNetasFC: ventasFC + descuentosFC,
      ventasGV,
      descuentosGV,
      ventasNetasGV: ventasGV + descuentosGV,
      ventasPW,
      descuentosPW,
      ventasNetasPW: ventasPW + descuentosPW,
      factTaller: venta.factTaller || [],
      ventaPV: venta.ventaPV || [],
      factRepuestos: venta.factRepuestos || [],
      fechaActualizacion: venta.fechaActualizacion
    };
  } catch (error) {
    console.error('Error obteniendo resumen de ventas:', error);
    // Retornar valores por defecto en caso de error
    return {
      mesKey,
      ventas: 0,
      descuentos: 0,
      costos: 0,
      ventasNetas: 0,
      ventasFC: 0,
      descuentosFC: 0,
      ventasNetasFC: 0,
      ventasGV: 0,
      descuentosGV: 0,
      ventasNetasGV: 0,
      ventasPW: 0,
      descuentosPW: 0,
      ventasNetasPW: 0,
      fechaActualizacion: null
    };
  }
}

/**
 * Obtiene lista de meses disponibles
 */
export async function obtenerMesesDisponibles() {
  try {
    // Si MongoDB no está conectado, retornar array vacío
    if (mongoose.connection.readyState !== 1) {
      return [];
    }
    
    const ventas = await Venta.find({})
      .select('mesKey fechaActualizacion')
      .sort({ mesKey: -1 })
      .lean();
    
    return ventas.map(v => ({
      mesKey: v.mesKey,
      fechaActualizacion: v.fechaActualizacion
    }));
  } catch (error) {
    console.error('Error obteniendo meses disponibles:', error);
    // Retornar array vacío en caso de error
    return [];
  }
}

