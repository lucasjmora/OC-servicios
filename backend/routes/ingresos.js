import express from 'express';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Obtener todos los ingresos con filtros y paginación (sin caché para ver datos actualizados)
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      taller = '',
      estado = '',
      tipo = '',
      fechaDesde = '',
      fechaHasta = '',
      excludeTalleres = '',
      tipoOPrefix = '',
      sortBy = ''
    } = req.query;

    // Construir filtros
    const filters = {};

    // Búsqueda de texto
    if (search) {
      filters.$or = [
        { CLIENTE: { $regex: search, $options: 'i' } },
        { 'Matrícula vehí': { $regex: search, $options: 'i' } },
        { Referencia: { $regex: search, $options: 'i' } },
        { FMatric: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtro por taller (puede ser uno o varios separados por coma)
    if (taller) {
      const talleres = taller.split(',').map((t) => t.trim()).filter(Boolean);
      filters.Taller = talleres.length > 1 ? { $in: talleres } : talleres[0];
    } else if (excludeTalleres) {
      const excluded = excludeTalleres.split(',').map((t) => t.trim()).filter(Boolean);
      if (excluded.length > 0) {
        filters.Taller = { $nin: excluded };
      }
    }
    
    // Filtro por estado
    if (estado) {
      filters.Estad = estado;
    }
    
    // Filtro por tipo (puede restringirse por prefijos, ej. tipoOPrefix=1,2)
    // Incluir también Tipo O vacío/null para que las oportunidades actualizadas (mismo dataset que Ingresos Taller) entren en Mkt
    if (tipoOPrefix) {
      const prefixes = tipoOPrefix.split(',').map((p) => p.trim()).filter(Boolean);
      const regex = new RegExp('^(' + prefixes.map((p) => escapeRegex(p)).join('|') + ')');
      if (tipo) {
        if (!filters.$and) filters.$and = [];
        filters.$and.push({ 'Tipo O': { $regex: regex } }, { 'Tipo O': tipo });
      } else {
        filters['$and'] = filters['$and'] || [];
        filters['$and'].push({
          $or: [
            { 'Tipo O': { $regex: regex } },
            { 'Tipo O': { $in: [null, ''] } },
            { 'Tipo O': { $exists: false } }
          ]
        });
      }
    } else if (tipo) {
      filters['Tipo O'] = tipo;
    }
    
    // Filtro por rango de fechas
    // - Vista normal: filtra por Fecaper (fecha de apertura)
    // - Mkt/dB (sortBy = 'F cierr'): filtra por F cierr (fecha de cierre)
    if (fechaDesde || fechaHasta) {
      const dateField = sortBy && sortBy.trim() === 'F cierr' ? 'F cierr' : 'Fecaper';
      filters[dateField] = {};
      if (fechaDesde) {
        filters[dateField].$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        filters[dateField].$lte = new Date(fechaHasta);
      }
    }
    
    // Calcular skip
    const skip = (Number(page) - 1) * Number(limit);

    // Orden: por defecto Fecaper descendente; si sortBy viene (ej. "F cierr"), usar ese campo.
    // Siempre usamos find().lean() para que Ingresos Taller y Mkt/dB reciban el mismo formato
    // (Mongoose aplica el schema y las fechas se serializan igual). En sort descendente, nulls van al final.
    const sortField = sortBy && typeof sortBy === 'string' ? sortBy.trim() : 'Fecaper';
    const sortOpt = { [sortField]: -1 };

    const ingresos = await Ingreso.find(filters).sort(sortOpt).skip(skip).limit(Number(limit)).lean();

    const total = await Ingreso.countDocuments(filters);
    
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




