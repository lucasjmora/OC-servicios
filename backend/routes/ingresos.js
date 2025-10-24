import express from 'express';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Obtener todos los ingresos con filtros y paginación
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      taller = '',
      estado = '',
      tipo = '',
      fechaDesde = '',
      fechaHasta = ''
    } = req.query;
    
    // Construir filtros
    const filters = {};
    
    // Búsqueda de texto
    if (search) {
      filters.$or = [
        { CLIENTE: { $regex: search, $options: 'i' } },
        { 'Matrícula vehí': { $regex: search, $options: 'i' } },
        { Referencia: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtro por taller
    if (taller) {
      filters.Taller = taller;
    }
    
    // Filtro por estado
    if (estado) {
      filters.Estad = estado;
    }
    
    // Filtro por tipo
    if (tipo) {
      filters['Tipo O'] = tipo;
    }
    
    // Filtro por rango de fechas
    if (fechaDesde || fechaHasta) {
      filters['Fecaper'] = {};
      if (fechaDesde) {
        filters['Fecaper'].$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        filters['Fecaper'].$lte = new Date(fechaHasta);
      }
    }
    
    // Calcular skip
    const skip = (Number(page) - 1) * Number(limit);
    
    // Ejecutar consulta con paginación
    const [ingresos, total] = await Promise.all([
      Ingreso.find(filters)
        .sort({ 'Fecaper': -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Ingreso.countDocuments(filters)
    ]);
    
    // Obtener mapeos para aplicarlos
    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};
    
    // Aplicar mapeos
    const ingresosConMapeos = ingresos.map(ingreso => ({
      ...ingreso,
      TallerNombre: talleresMap[ingreso.Taller] || ingreso['Nombre taller'] || ingreso.Taller
    }));
    
    res.json({
      data: ingresosConMapeos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un ingreso por ID
router.get('/:id', async (req, res) => {
  try {
    const ingreso = await Ingreso.findById(req.params.id);
    
    if (!ingreso) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }
    
    res.json(ingreso);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;




