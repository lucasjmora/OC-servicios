import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  usuario: {
    type: String,
    required: true
  },
  accion: {
    type: String,
    required: true
  },
  estadoAnterior: {
    type: String,
    enum: ['pendiente', 'en_gestion', 'a_tratar', 'cerrado']
  },
  estadoNuevo: {
    type: String,
    enum: ['pendiente', 'en_gestion', 'a_tratar', 'cerrado']
  },
  comentario: {
    type: String
  }
});

const oportunidadSchema = new mongoose.Schema({
  ingresoReferencia: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'en_gestion', 'a_tratar', 'cerrado'],
    default: 'pendiente'
  },
  alarma: {
    fechaHora: {
      type: Date
    },
    activa: {
      type: Boolean,
      default: false
    }
  },
  motivoCierre: {
    type: String
  },
  logs: [logSchema]
}, {
  timestamps: true,
  collection: 'oportunidades'
});

// Índices para búsquedas optimizadas
oportunidadSchema.index({ ingresoReferencia: 1 });
oportunidadSchema.index({ estado: 1 });
oportunidadSchema.index({ 'alarma.activa': 1, 'alarma.fechaHora': 1 });

// Validación: motivoCierre requerido si estado es 'cerrado'
oportunidadSchema.pre('save', function(next) {
  if (this.estado === 'cerrado' && (!this.motivoCierre || this.motivoCierre.trim() === '')) {
    return next(new Error('El motivo de cierre es obligatorio cuando el estado es "cerrado"'));
  }
  next();
});

const Oportunidad = mongoose.model('Oportunidad', oportunidadSchema);

export default Oportunidad;



