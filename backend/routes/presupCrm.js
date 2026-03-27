import express from 'express';
import multer from 'multer';
import Configuracion from '../models/Configuracion.js';
import configStorageService from '../services/configStorageService.js';
import {
  mergePresupCrmWithEnv,
  buildClientSafeConfig,
  getEnvSourceFlags,
  stripEnvBackedFieldsFromUpdates
} from '../services/envConfig.js';
import {
  loadPresupConfigFromDb,
  getMergedPresupCrm,
  ensureMongoDefaultConnection,
  getPresupConnection,
  resetPresupConnection,
  testMongoConnection,
  testExcelRead,
  importFromExcel,
  getDashboardStats,
  getPresupSlaPendienteStatsPorEmpresa,
  listPresupuestos,
  getPresupFiltrosOpciones,
  getPresupuestoByReferencia,
  listComentariosPresup,
  addComentarioPresup,
  updatePresupuestoEstado,
  listAdjuntosPresup,
  guardarAdjuntoPresup,
  fetchTalleresCatalog,
  persistTalleresCatalog
} from '../services/presupCrmService.js';

/** Alias: conexión Mongo principal (misma lógica que en presupCrmService). */
const ensureMainMongo = ensureMongoDefaultConnection;

const uploadPresup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = express.Router();

const defaultPresupCrm = () => ({
  mongodb: {
    uri: '',
    database: 'Presupuestos',
    collection: 'presup_taller',
    /** Catálogo de talleres: colección en la misma BD (p. ej. `talleres`). */
    collectionTalleres: 'talleres'
  },
  excel: { filePath: '' },
  scheduler: { enabled: false, cronExpression: '0 */6 * * *' },
  talleres: [],
  aceites: [],
  general: {},
  lastImport: null
});

/** GET /api/presup-crm/config */
router.get('/config', async (req, res) => {
  try {
    await ensureMainMongo();
    const merged = await getMergedPresupCrm();
    const safe = buildClientSafeConfig({ presupCrm: merged }).presupCrm;
    res.json({ presupCrm: safe, envSourceHints: getEnvSourceFlags() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/presup-crm/config */
router.put('/config', async (req, res) => {
  try {
    const ok = await ensureMainMongo();
    if (!ok) {
      return res.status(500).json({ error: 'MongoDB no disponible para guardar configuración' });
    }
    const rawBody = req.body?.presupCrm || req.body;
    const afterStrip = stripEnvBackedFieldsFromUpdates({ presupCrm: rawBody });
    const bodyDelta = afterStrip.presupCrm !== undefined ? afterStrip.presupCrm : {};
    let current = await loadPresupConfigFromDb();
    if (!current?.mongodb?.uri && configStorageService.isInitialized) {
      current = configStorageService.getConfig().presupCrm;
    }
    const merged = { ...defaultPresupCrm(), ...current, ...bodyDelta };
    resetPresupConnection();

    const doc = await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: { presupCrm: merged } },
      { new: true, upsert: true }
    );

    if (configStorageService.isInitialized) {
      await configStorageService.updatePresupCrm(merged);
    }

    const effective = mergePresupCrmWithEnv({ ...defaultPresupCrm(), ...doc.presupCrm });
    const safe = buildClientSafeConfig({ presupCrm: effective }).presupCrm;
    res.json({ presupCrm: safe, envSourceHints: getEnvSourceFlags() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/presup-crm/test-mongo */
router.post('/test-mongo', async (req, res) => {
  try {
    const cfg = req.body?.presupCrm || req.body;
    const merged = mergePresupCrmWithEnv({ ...defaultPresupCrm(), ...cfg });
    await testMongoConnection(merged);
    res.json({ ok: true, message: 'Conexión correcta' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** POST /api/presup-crm/test-excel */
router.post('/test-excel', async (req, res) => {
  try {
    const cfg = req.body?.presupCrm || req.body;
    const merged = mergePresupCrmWithEnv({ ...defaultPresupCrm(), ...cfg });
    const r = await testExcelRead(merged);
    res.json(r);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** POST /api/presup-crm/import */
router.post('/import', async (req, res) => {
  try {
    await ensureMainMongo();
    const merged = await getMergedPresupCrm();
    /** Por defecto: upsert por referencia. fullReplace=true vacía la colección (importación total). */
    const fullReplace = req.body?.fullReplace === true;
    const r = await importFromExcel(merged, { fullReplace });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/presup-crm/stats/sla-pendiente-empresas — abierto + SLA pendiente por FC/GV/PW (dashboard OC Servicios) */
router.get('/stats/sla-pendiente-empresas', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      const fechaHasta = new Date();
      fechaHasta.setHours(23, 59, 59, 999);
      return res.json({
        success: true,
        data: {
          FC: { total: 0, porTaller: {} },
          GV: { total: 0, porTaller: {} },
          PW: { total: 0, porTaller: {} },
          fechaDesde: null,
          fechaHasta: fechaHasta.toISOString()
        },
        configured: false
      });
    }
    const data = await getPresupSlaPendienteStatsPorEmpresa(merged);
    res.json({ success: true, data, configured: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/presup-crm/dashboard */
router.get('/dashboard', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const stats = await getDashboardStats(merged, req.query);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/presupuestos/filtros — valores para desplegables */
router.get('/presupuestos/filtros', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const data = await getPresupFiltrosOpciones(merged);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/presupuestos/:referencia/comentarios */
router.get('/presupuestos/:referencia/comentarios', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const items = await listComentariosPresup(merged, req.params.referencia);
    res.json({ comentarios: items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/presup-crm/presupuestos/:referencia/comentarios */
router.post('/presupuestos/:referencia/comentarios', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const c = await addComentarioPresup(merged, req.params.referencia, {
      usuario: req.body?.usuario,
      texto: req.body?.texto
    });
    res.json(c);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/presup-crm/presupuestos/:referencia/adjuntos — listado de archivos en carpeta */
router.get('/presupuestos/:referencia/adjuntos', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const archivos = await listAdjuntosPresup(merged, req.params.referencia);
    res.json({ archivos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/presup-crm/presupuestos/:referencia/adjuntos — subir archivo */
router.post(
  '/presupuestos/:referencia/adjuntos',
  uploadPresup.single('file'),
  async (req, res) => {
    try {
      let presupCfg = await loadPresupConfigFromDb();
      if (!presupCfg?.mongodb?.uri && configStorageService.isInitialized) {
        presupCfg = configStorageService.getConfig().presupCrm;
      }
      const merged = { ...defaultPresupCrm(), ...presupCfg };
      if (!merged.mongodb?.uri) {
        return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Adjunte un archivo (campo file)' });
      }
      const r = await guardarAdjuntoPresup(merged, req.params.referencia, req.file);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

/** PATCH /api/presup-crm/presupuestos/:referencia/estado — aceptar | rechazar | reabrir */
router.patch('/presupuestos/:referencia/estado', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const accion = req.body?.accion || req.query?.accion;
    const out = await updatePresupuestoEstado(merged, req.params.referencia, {
      accion,
      numeroOrdenReparacion: req.body?.numeroOrdenReparacion,
      comentario: req.body?.comentario,
      motivo: req.body?.motivo,
      usuario: req.body?.usuario
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/presup-crm/presupuestos/:referencia — detalle completo (pantalla OC Presup) */
router.get('/presupuestos/:referencia', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const ref = req.params.referencia;
    const data = await getPresupuestoByReferencia(merged, ref);
    if (!data) {
      return res.status(404).json({ error: 'No se encontró el presupuesto' });
    }
    const directorioAdjuntos = String(merged.general?.directorioAdjuntos || '').trim();
    res.json({ ...data, directorioAdjuntos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/presupuestos */
router.get('/presupuestos', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const data = await listPresupuestos(merged, req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/talleres — catálogo en MongoDB `Presupuestos.talleres` (no en configuración oc_servicios). */
router.get('/talleres', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const list = await fetchTalleresCatalog(merged);
    res.json({ talleres: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/presup-crm/talleres — persiste en la colección `talleres` de la BD Presupuestos. */
router.put('/talleres', async (req, res) => {
  try {
    const merged = await getMergedPresupCrm();
    if (!merged.mongodb?.uri) {
      return res.status(400).json({ error: 'Configure la URI de MongoDB en Parámetros de presupuestos' });
    }
    const talleres = Array.isArray(req.body?.talleres) ? req.body.talleres : [];
    resetPresupConnection();
    const list = await persistTalleresCatalog(merged, talleres);
    res.json({ talleres: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/aceites */
router.get('/aceites', async (req, res) => {
  try {
    await ensureMainMongo();
    const doc = await Configuracion.findOne({ singleton: true }).lean();
    const list = doc?.presupCrm?.aceites || [];
    res.json({ aceites: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/presup-crm/aceites */
router.put('/aceites', async (req, res) => {
  try {
    const ok = await ensureMainMongo();
    if (!ok) return res.status(500).json({ error: 'MongoDB no disponible' });
    const aceites = Array.isArray(req.body?.aceites) ? req.body.aceites : [];
    resetPresupConnection();
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: { 'presupCrm.aceites': aceites } },
      { upsert: true }
    );
    if (configStorageService.isInitialized) {
      const cur = configStorageService.getConfig();
      await configStorageService.updatePresupCrm({ ...cur.presupCrm, aceites });
    }
    res.json({ aceites });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/general */
router.get('/general', async (req, res) => {
  try {
    await ensureMainMongo();
    const doc = await Configuracion.findOne({ singleton: true }).lean();
    res.json({ general: doc?.presupCrm?.general || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/presup-crm/general */
router.put('/general', async (req, res) => {
  try {
    const ok = await ensureMainMongo();
    if (!ok) return res.status(500).json({ error: 'MongoDB no disponible' });
    const general = req.body?.general && typeof req.body.general === 'object' ? req.body.general : {};
    await Configuracion.findOneAndUpdate(
      { singleton: true },
      { $set: { 'presupCrm.general': general } },
      { upsert: true }
    );
    if (configStorageService.isInitialized) {
      const cur = configStorageService.getConfig();
      await configStorageService.updatePresupCrm({ ...cur.presupCrm, general });
    }
    res.json({ general });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/presup-crm/health */
router.get('/health', (req, res) => {
  res.json({ module: 'presup-crm', status: 'ok' });
});

export default router;
