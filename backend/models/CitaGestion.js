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

const citaGestionSchema = new mongoose.Schema({
  citaReferencia: {
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
  logs: [logSchema]
}, {
  timestamps: true
});

// Índices
citaGestionSchema.index({ citaReferencia: 1 });
citaGestionSchema.index({ estado: 1, subEstado: 1 });
citaGestionSchema.index({ 'alarma.activa': 1, 'alarma.fechaHora': 1 });

const CitaGestion = mongoose.model('CitaGestion', citaGestionSchema);

export default CitaGestion;






