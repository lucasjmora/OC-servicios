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
    ingresos: String
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
    summary: {
      citasNuevas: { type: Number, default: 0 },
      citasActualizadas: { type: Number, default: 0 },
      ingresosNuevos: { type: Number, default: 0 },
      ingresosActualizados: { type: Number, default: 0 }
    },
    error: String
  }
}, {
  timestamps: true,
  collection: 'configuracion'
});

const Configuracion = mongoose.model('Configuracion', configuracionSchema);

export default Configuracion;



