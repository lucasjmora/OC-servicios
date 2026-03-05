import mongoose from 'mongoose';

const martinaInteraccionesSchema = new mongoose.Schema({
  // Único documento de configuración
  singleton: {
    type: Boolean,
    default: true,
    unique: true
  },
  
  // Última fecha procesada (para análisis incremental)
  ultimaFechaProcesada: {
    type: Date,
    default: null
  },
  
  // SessionIds ya procesados (para evitar duplicados)
  // Guardado como objeto: { "sessionId": Date }
  sessionIdsProcesados: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Resultados por mes
  meses: [{
    mes: String, // "jul 2025"
    mesKey: String, // "2025-07"
    interacciones: Number,
    porEmpresa: {
      FC: Number,
      GV: Number,
      PW: Number
    }
  }],
  
  // Timestamp de última actualización
  ultimaActualizacion: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'martina_interacciones'
});

// Índices
martinaInteraccionesSchema.index({ singleton: 1 });
martinaInteraccionesSchema.index({ 'meses.mesKey': 1 });

const MartinaInteracciones = mongoose.model('MartinaInteracciones', martinaInteraccionesSchema);

export default MartinaInteracciones;

