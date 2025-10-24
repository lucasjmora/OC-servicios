import mongoose from 'mongoose';

const citaSchema = new mongoose.Schema({
  Referencia: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  Taller: Number,
  'Fecha cr': Date,
  Usuario: String,
  Matricula: String,
  'Marca/modelo': String,
  'Fecha ci': Date,
  'Hora ': String,
  Asesor: String,
  Averia: String,
  Secci: String,
  Tiempo: String,
  Nombre: String,
  Telefono: String,
  Observaciones: String,
  // Campos de asistencia pre-calculados
  EstadoAsistencia: {
    type: String,
    enum: ['Asistió', 'No asistió', null],
    default: null
  },
  IngresoReferencia: {
    type: String,
    default: null
  },
  FechaIngreso: {
    type: Date,
    default: null
  },
  FechaCalculo: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'citas'
});

// Índices para mejorar búsquedas
citaSchema.index({ Taller: 1, 'Fecha ci': -1 });
citaSchema.index({ Asesor: 1 });
citaSchema.index({ Nombre: 'text', Matricula: 'text' });
citaSchema.index({ Matricula: 1, 'Fecha ci': 1 }); // Índice para asistencia
citaSchema.index({ EstadoAsistencia: 1 }); // Índice para filtros de asistencia

const Cita = mongoose.model('Cita', citaSchema);

export default Cita;



