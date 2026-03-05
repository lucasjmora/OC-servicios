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
    required: false
  },
  estadoNuevo: {
    type: String,
    required: false
  },
  subEstadoAnterior: {
    type: String,
    enum: ['pendiente', 'en_espera'],
    required: false
  },
  subEstadoNuevo: {
    type: String,
    enum: ['pendiente', 'en_espera'],
    required: false
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
    enum: ['cerrado', 'aceptado', 'abierto'],
    default: 'abierto'
  },
  subEstado: {
    type: String,
    enum: ['pendiente', 'en_espera'],
    default: 'pendiente',
    validate: {
      validator: function(value) {
        // subEstado solo es válido si estado es 'abierto'
        if (this.estado === 'abierto') {
          return value === 'pendiente' || value === 'en_espera';
        }
        // Si estado no es 'abierto', subEstado debe ser null/undefined
        return value === null || value === undefined;
      },
      message: 'subEstado solo es válido cuando estado es "abierto"'
    }
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
oportunidadSchema.index({ estado: 1, subEstado: 1 });
oportunidadSchema.index({ 'alarma.activa': 1, 'alarma.fechaHora': 1 });


const Oportunidad = mongoose.model('Oportunidad', oportunidadSchema);

export default Oportunidad;




























