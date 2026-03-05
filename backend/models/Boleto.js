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
    enum: ['cerrado', 'aceptado', 'abierto']
  },
  estadoNuevo: {
    type: String,
    enum: ['cerrado', 'aceptado', 'abierto']
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

const boletoSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
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
    },
    usuario: {
      type: String
    }
  },
  fechaUltimoComentario: {
    type: Date
  },
  datosBoleto: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  logs: [logSchema]
}, {
  timestamps: true,
  collection: 'boletos'
});

// Índices para búsquedas optimizadas
boletoSchema.index({ id: 1 });
boletoSchema.index({ estado: 1, subEstado: 1 });
boletoSchema.index({ 'alarma.activa': 1, 'alarma.fechaHora': 1 });
boletoSchema.index({ fechaUltimoComentario: 1 });
boletoSchema.index({ 'datosBoleto.typeOfSale': 1 });
boletoSchema.index({ 'datosBoleto.origen.city': 1 });
boletoSchema.index({ 'datosBoleto.origen.ciudad': 1 });

const Boleto = mongoose.model('Boleto', boletoSchema);

export default Boleto;
