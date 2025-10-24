import express from 'express';
import Cita from '../models/Cita.js';
import Configuracion from '../models/Configuracion.js';

const router = express.Router();

// Obtener todas las citas con filtros y paginación
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/citas - Iniciando consulta');
    
    const {
      page = 1,
      limit = 50,
      search = '',
      taller = '',
      asesor = '',
      fechaDesde = '',
      fechaHasta = ''
    } = req.query;
    
    console.log('Parámetros de consulta:', { page, limit, search, taller, asesor, fechaDesde, fechaHasta });
    
    // Verificar conexión a MongoDB
    const mongoose = (await import('mongoose')).default;
    console.log('Estado de conexión MongoDB:', mongoose.connection.readyState);
    
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB no está conectado');
      return res.status(500).json({ error: 'MongoDB no está conectado' });
    }
    
    // Construir filtros
    const filters = {};
    
    // Búsqueda de texto
    if (search) {
      filters.$or = [
        { Nombre: { $regex: search, $options: 'i' } },
        { Matricula: { $regex: search, $options: 'i' } },
        { Referencia: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtro por taller
    if (taller) {
      filters.Taller = Number(taller);
    }
    
    // Filtro por asesor
    if (asesor) {
      filters.Asesor = asesor;
    }
    
    // Filtro por rango de fechas
    if (fechaDesde || fechaHasta) {
      filters['Fecha ci'] = {};
      if (fechaDesde) {
        filters['Fecha ci'].$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        filters['Fecha ci'].$lte = new Date(fechaHasta);
      }
    }
    
    console.log('Filtros aplicados:', JSON.stringify(filters, null, 2));
    
    // Calcular skip
    const skip = (Number(page) - 1) * Number(limit);
    
    // Verificar total de documentos en la colección
    const totalDocs = await Cita.countDocuments();
    console.log(`Total de documentos en colección citas: ${totalDocs}`);
    
    // Ejecutar consulta con paginación
    const [citas, total] = await Promise.all([
      Cita.find(filters)
        .sort({ 'Fecha ci': -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Cita.countDocuments(filters)
    ]);
    
    console.log(`Consulta ejecutada: ${citas.length} citas encontradas, total: ${total}`);
    
    // Obtener mapeos para aplicarlos
    const config = await Configuracion.findOne({ singleton: true });
    const talleresMap = config?.mappings?.talleres ? Object.fromEntries(config.mappings.talleres) : {};
    const usuariosMap = config?.mappings?.usuarios ? Object.fromEntries(config.mappings.usuarios) : {};
    
    // Aplicar mapeos
    const citasConMapeos = citas.map(cita => ({
      ...cita,
      TallerNombre: talleresMap[cita.Taller] || cita.Taller,
      UsuarioNombre: usuariosMap[cita.Usuario] || cita.Usuario
    }));
    
    res.json({
      data: citasConMapeos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error en GET /api/citas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener una cita por ID
router.get('/:id', async (req, res) => {
  try {
    const cita = await Cita.findById(req.params.id);
    
    if (!cita) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    res.json(cita);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;


