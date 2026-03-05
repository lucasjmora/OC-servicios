import mongoose from 'mongoose';

const botMessageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  chatId: {
    type: String,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['apiMessage', 'userMessage'],
    required: true
  },
  createdDate: {
    type: Date,
    required: true,
    index: true
  },
  flowName: String,
  flowId: String,
  chatType: String,
  executionId: String,
  id: String,
  usedTools: mongoose.Schema.Types.Mixed
}, {
  timestamps: false, // No usar timestamps automáticos, usar createdDate del documento
  strict: false // Permitir campos adicionales que puedan venir de MongoDB
});

// Índices compuestos para mejorar búsquedas
botMessageSchema.index({ sessionId: 1, createdDate: 1 });
botMessageSchema.index({ chatId: 1, createdDate: 1 });

export default botMessageSchema;






