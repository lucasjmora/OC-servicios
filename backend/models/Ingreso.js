import mongoose from 'mongoose';

const ingresoSchema = new mongoose.Schema({
  Referencia: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  Taller: String,
  'Nombre taller': String,
  'Tipo O': String,
  Estad: String,
  Numero: String,
  'Matrícula vehí': String,
  FMatric: Date, // Excel "F.Matric" (fecha; el limpiador quita el punto)
  'Cta cargo': String,
  CLIENTE: String,
  Recepcionista: String,
  'Fecaper': Date,
  'F cierr': Date,
  'Serie/num': String,
  'Desaveria': String,
  'Usuario Cita': String,
  Bastidor: String,
  Modelo: String,
  BASE: String,
  'Tiemfact': String,
  'Mano obra': Number,
  BENEFICIO: Number,
  'Total material': Number,
  'BENEFICIOS REC': Number,
  SUBARRENDADO: Number,
  'BENEFSUB': String,
  Observaciones: String,
  Km: String,
  'E-mail': String,
  'Teléfono': String,
  Telefono: String,
  Opera: String,
  'Nombre titular': String,
  CON: String,
  'OBSERVACIONES INTERNAS': String,
  'FEC OBS ': String,
  'HOR O': String,
  'IDP NOMBRE': String
}, {
  timestamps: true,
  collection: 'ingresos'
});

// Índices para búsquedas optimizadas
ingresoSchema.index({ Taller: 1, 'Fecaper': -1 });
ingresoSchema.index({ Estad: 1 });
ingresoSchema.index({ CLIENTE: 'text', 'Matrícula vehí': 'text' });

const Ingreso = mongoose.model('Ingreso', ingresoSchema);

export default Ingreso;




