import mongoose from 'mongoose';

const ventaSchema = new mongoose.Schema({
  mesKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  ventas: {
    type: Number,
    default: 0
  },
  descuentos: {
    type: Number,
    default: 0
  },
  costos: {
    type: Number,
    default: 0
  },
  // Campos por empresa
  ventasFC: {
    type: Number,
    default: 0
  },
  descuentosFC: {
    type: Number,
    default: 0
  },
  ventasGV: {
    type: Number,
    default: 0
  },
  descuentosGV: {
    type: Number,
    default: 0
  },
  ventasPW: {
    type: Number,
    default: 0
  },
  descuentosPW: {
    type: Number,
    default: 0
  },
  // Datos desglosados por Location y channel
  factTaller: [{
    empresa: String,
    location: String,
    facturacion: Number,
    costos: Number,
    mb: Number
  }],
  ventaPV: [{
    empresa: String,
    location: String,
    facturacion: Number,
    costos: Number,
    mb: Number
  }],
  factRepuestos: [{
    channel: String,
    empresa: String,
    facturacion: Number,
    costos: Number,
    mb: Number
  }],
  fechaActualizacion: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'ventas'
});

// Índice para búsquedas por mes
ventaSchema.index({ mesKey: 1 });

const Venta = mongoose.model('Venta', ventaSchema);

export default Venta;

