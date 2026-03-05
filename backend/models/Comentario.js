import mongoose from 'mongoose';

const comentarioSchema = new mongoose.Schema({
  referencia: {
    type: String,
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ['cita', 'oportunidad', 'boleto'],
    required: true
  },
  usuario: {
    type: String,
    required: true
  },
  comentario: {
    type: String,
    required: true
  },
  esLog: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'comentarios'
});

// Índices para búsquedas optimizadas
comentarioSchema.index({ referencia: 1, timestamp: -1 });
comentarioSchema.index({ tipo: 1, referencia: 1 });

const Comentario = mongoose.model('Comentario', comentarioSchema);

export default Comentario;




