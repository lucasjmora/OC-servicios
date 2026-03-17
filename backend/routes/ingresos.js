import express from 'express';
import Ingreso from '../models/Ingreso.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Columnas para export CSV Mkt (mismo orden que frontend, excluyendo MKT_HIDDEN)
const MKT_EXPORT_COLUMNS = [
  { key: 'Referencia', header: 'Referencia' },
  { key: 'F cierr', header: 'F cierr' },
  { key: 'FMatric', header: 'FMatric' },
  { key: 'Teléfono', header: 'Teléfono' },
  { key: 'E-mail', header: 'E-mail' },
  { key: 'Matrícula vehí', header: 'Matrícula vehí' },
  { key: 'Modelo', header: 'Modelo' },
  { key: 'Nombre taller', header: 'Nombre taller' },
  { key: 'Tipo O', header: 'Tipo O' },
  { key: 'Desaveria', header: 'Desaveria' },
  { key: 'Km', header: 'Km' },
  { key: 'Nombre titular', header: 'Nombre titular' },
  { key: 'CON', header: 'CON' }
];

const DATE_KEYS = ['Fecaper', 'F cierr', 'FMatric', 'FEC OBS '];

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';') || str.includes(',')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatDateForCsv(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildIngresosFilters(reqQuery) {
  const { search, taller, estado, tipo, fechaDesde, fechaHasta, excludeTalleres, tipoOPrefix, sortBy } = reqQuery;
  const filters = {};
  if (search) {
    filters.$or = [
      { CLIENTE: { $regex: search, $options: 'i' } },
      { 'Matrícula vehí': { $regex: search, $options: 'i' } },
      { Referencia: { $regex: search, $options: 'i' } },
      { FMatric: { $regex: search, $options: 'i' } }
    ];
  }
  if (taller) {
    const talleres = taller.split(',').map((t) => t.trim()).filter(Boolean);
    filters.Taller = talleres.length > 1 ? { $in: talleres } : talleres[0];
  } else if (excludeTalleres) {
    const excluded = excludeTalleres.split(',').map((t) => t.trim()).filter(Boolean);
    if (excluded.length > 0) filters.Taller = { $nin: excluded };
  }
  if (estado) filters.Estad = estado;
  if (tipoOPrefix) {
    const prefixes = tipoOPrefix.split(',').map((p) => p.trim()).filter(Boolean);
    const regex = new RegExp('^(' + prefixes.map((p) => escapeRegex(p)).join('|') + ')');
    filters['$and'] = filters['$and'] || [];
    filters['$and'].push({
      $or: [
        { 'Tipo O': { $regex: regex } },
        { 'Tipo O': { $in: [null, ''] } },
        { 'Tipo O': { $exists: false } }
      ]
    });
  } else if (tipo) filters['Tipo O'] = tipo;
  if (fechaDesde || fechaHasta) {
    const dateField = sortBy && sortBy.trim() === 'F cierr' ? 'F cierr' : 'Fecaper';
    filters[dateField] = {};
    if (fechaDesde) filters[dateField].$gte = new Date(fechaDesde);
    if (fechaHasta) filters[dateField].$lte = new Date(fechaHasta);
  }
  return filters;
}

// Export streaming: procesa en lotes sin cargar todo en memoria
router.get('/export', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const filters = buildIngresosFilters({
      ...req.query,
      excludeTalleres: req.query.excludeTalleres || '',
      tipoOPrefix: req.query.tipoOPrefix || '1,2',
      sortBy: req.query.sortBy || 'F cierr'
    });
    const sortField = (req.query.sortBy && String(req.query.sortBy).trim()) || 'Fecaper';
    const sortOpt = { [sortField]: -1 };

    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ingresos-mkt-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write('\uFEFFsep=;\n');
    const headerRow = MKT_EXPORT_COLUMNS.map((c) => escapeCsvValue(c.header)).join(';');
    res.write(headerRow + '\n');

    const BATCH_SIZE = 5000;
    let buffer = '';
    let count = 0;
    const cursor = Ingreso.find(filters).sort(sortOpt).lean().cursor();

    for await (const doc of cursor) {
      const ingreso = {
        ...doc,
        'Nombre taller': talleresMap[doc.Taller] || doc['Nombre taller'] || doc.Taller
      };
      const values = MKT_EXPORT_COLUMNS.map((col) => {
        let val = ingreso[col.key];
        if (DATE_KEYS.includes(col.key) && val) val = formatDateForCsv(val);
        return escapeCsvValue(val !== undefined && val !== null ? val : '');
      });
      buffer += values.join(';') + '\n';
      count++;
      if (count % BATCH_SIZE === 0) {
        res.write(buffer);
        buffer = '';
      }
    }
    if (buffer) res.write(buffer);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      console.error('Error durante export streaming:', error);
    }
  }
});

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




