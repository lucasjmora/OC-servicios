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
    enum: ['tratado', 'no_tratado'],
    required: false
  },
  estadoNuevo: {
    type: String,
    enum: ['tratado', 'no_tratado'],
    required: false
  },
  comentario: {
    type: String
  }
});

const botConversacionGestionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  empresa: {
    type: String,
    enum: ['FC', 'GV', 'PW'],
    required: true,
    index: true
  },
  estado: {
    type: String,
    enum: ['tratado', 'no_tratado'],
    default: 'no_tratado'
  },
  logs: [logSchema]
}, {
  timestamps: true,
  collection: 'botConversacionesGestion'
});

// Índice compuesto para búsquedas eficientes
botConversacionGestionSchema.index({ sessionId: 1, empresa: 1 }, { unique: true });

const BotConversacionGestion = mongoose.model('BotConversacionGestion', botConversacionGestionSchema);

export default BotConversacionGestion;






