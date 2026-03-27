import mongoose from 'mongoose';

const configuracionSchema = new mongoose.Schema({
  // Siempre habrá solo un documento de configuración
  singleton: {
    type: Boolean,
    default: true,
    unique: true
  },
  
  // Conexión MongoDB
  mongodb: {
    uri: String,
    database: String,
    collections: {
      citas: { type: String, default: 'citas' },
      ingresos: { type: String, default: 'ingresos' }
    }
  },
  
  // Rutas de archivos Excel
  filePaths: {
    citas: String,
    ingresos: String,
    orsAbiertas: String,
    /** Presup CRM — se sincroniza con presupCrm.excel.filePath (primera hoja del Excel, como el resto). */
    presupuestos: String
  },
  
  // Configuración del scheduler
  scheduler: {
    enabled: { type: Boolean, default: false },
    cronExpression: { type: String, default: '0 */6 * * *' } // Cada 6 horas por defecto
  },
  
  // Mapeos
  mappings: {
    talleres: {
      type: Map,
      of: String,
      default: new Map()
    },
    usuarios: {
      type: Map,
      of: String,
      default: new Map()
    },
    campos: {
      type: Map,
      of: String,
      default: new Map()
    },
    orsAbiertasTalleres: {
      type: Map,
      of: String,
      default: new Map()
    }
  },
  
  // Configuración de asistencia
  asistencia: {
    diasTolerancia: { type: Number, default: 3 } // Días después de la cita para buscar ingreso
  },

  // Configuración de oportunidades
  oportunidades: {
    palabrasClave: { type: String, default: '' }, // Palabras separadas por comas
    mesesDesdeCierre: { type: Number, default: 3 } // Meses desde F cierr
  },

  // Configuración de accesorios
  accesorios: {
    diasEspera: { type: Number, default: 7 }, // Días sin comentarios antes de cambiar de "en espera" a "pendiente"
    ciudadEmpresa: { type: mongoose.Schema.Types.Mixed, default: {} }, // Mapeo ciudad -> texto empresa para dashboard
    marcaEmpresa: { type: mongoose.Schema.Types.Mixed, default: {} },  // Mapeo marca -> texto empresa para dashboard
    ciudadMarcaEmpresa: { type: mongoose.Schema.Types.Mixed, default: {} } // Mapeo "Ciudad|Marca" -> texto empresa para dashboard
  },

  // Configuración de ventas
  ventas: {
    rutaCtasPV: String, // Ruta al archivo Ctas_PV.xlsx
    rutaBalances: String // Ruta a la carpeta con archivos balance mensuales
  },

  // Log de última importación
  lastImport: {
    timestamp: Date,
    status: String, // 'success', 'error', 'in_progress'
    duration: Number,
    summary: {
      citasNuevas: { type: Number, default: 0 },
      citasActualizadas: { type: Number, default: 0 },
      ingresosNuevos: { type: Number, default: 0 },
      ingresosActualizados: { type: Number, default: 0 },
      boletosNuevos: { type: Number, default: 0 },
      boletosActualizados: { type: Number, default: 0 },
      totalRegistros: { type: Number, default: 0 },
      asistenciaCalculada: mongoose.Schema.Types.Mixed,
      ventasProcesadas: mongoose.Schema.Types.Mixed,
      /** Primeras N operaciones con cambios por campo (ver importService) */
      detalleCitas: mongoose.Schema.Types.Mixed,
      detalleIngresos: mongoose.Schema.Types.Mixed,
      detalleCitasTruncado: { type: Boolean, default: false },
      detalleIngresosTruncado: { type: Boolean, default: false }
    },
    error: String
  },

  /** Snapshot de la última importación OK (stats + detalle; Mixed para no perder campos) */
  lastSuccessfulImport: mongoose.Schema.Types.Mixed,

  /** Última actualización por módulo (importación granular o manual completa) */
  lastImportByModule: {
    ventas: Date,
    citas: Date,
    ingresos: Date,
    /** Sincronización desde API de boletos (accesorios) */
    boletos: Date,
    orsAbiertas: Date,
    presupuestos: Date
  },

  // CRM Presupuestos (OC Presup) — aislado de citas/ingresos
  presupCrm: {
    mongodb: {
      uri: { type: String, default: '' },
      database: { type: String, default: 'Presupuestos' },
      collection: { type: String, default: 'presup_taller' },
      /** Catálogo talleres Presup CRM (misma BD): por defecto `talleres`. */
      collectionTalleres: { type: String, default: 'talleres' }
    },
    excel: {
      filePath: { type: String, default: '' }
    },
    scheduler: {
      enabled: { type: Boolean, default: false },
      cronExpression: { type: String, default: '0 */6 * * *' }
    },
    talleres: [{
      codigo: String,
      nombre: String,
      activo: { type: Boolean, default: true }
    }],
    aceites: [{
      codigo: String,
      descripcion: String,
      precio: { type: Number, default: 0 }
    }],
    general: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastImport: {
      timestamp: Date,
      status: String,
      rows: { type: Number, default: 0 },
      error: String
    }
  }
}, {
  timestamps: true,
  collection: 'configuracion'
});

const Configuracion = mongoose.model('Configuracion', configuracionSchema);

export default Configuracion;



