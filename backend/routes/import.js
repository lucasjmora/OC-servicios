import express from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import {
  executeImport,
  getImportStatus,
  getImportProgress,
  getLastSuccessfulImport,
  isImportRunning
} from '../services/importService.js';
import { procesarVentas } from '../services/ventasService.js';
import { sincronizarBoletos } from '../services/boletosService.js';
import { refreshORsPivot } from '../services/orsAbiertasService.js';
import Configuracion from '../models/Configuracion.js';
import { applyEnvConfigOverrides } from '../services/envConfig.js';
import { importFromExcel, getMergedPresupCrm } from '../services/presupCrmService.js';

const router = express.Router();

/**
 * Importación manual debe poder leer todos los Excel del flujo: citas, ingresos, ORs, ventas (Ctas_PV + carpeta balances) y Presup CRM.
 */
function assertManualImportPathsOk(effective, mergedPresup) {
  const errors = [];
  const fp = effective.filePaths || {};

  const citas = fp.citas?.trim();
  const ingresos = fp.ingresos?.trim();
  const ors = fp.orsAbiertas?.trim();

  if (!citas) errors.push('Citas: defina FILE_PATH_CITAS (o ruta en configuración)');
  else if (!fs.existsSync(citas)) errors.push(`Citas: archivo no encontrado (${citas})`);

  if (!ingresos) errors.push('Ingresos: defina FILE_PATH_INGRESOS (o ruta en configuración)');
  else if (!fs.existsSync(ingresos)) errors.push(`Ingresos: archivo no encontrado (${ingresos})`);

  if (!ors) errors.push('ORs abiertas: defina FILE_PATH_ORS_ABIERTAS (o ruta en configuración)');
  else if (!fs.existsSync(ors)) errors.push(`ORs abiertas: archivo no encontrado (${ors})`);

  const presupUri = mergedPresup?.mongodb?.uri?.trim();
  const presupExcel = mergedPresup?.excel?.filePath?.trim();
  if (!presupUri) errors.push('Presup CRM: defina PRESUP_MONGODB_URI (o URI en parámetros de presupuestos)');
  if (!presupExcel) errors.push('Presup CRM: defina PRESUP_EXCEL_FILE_PATH o FILE_PATH_PRESUPUESTOS');
  else if (!fs.existsSync(presupExcel)) errors.push(`Presup CRM: Excel no encontrado (${presupExcel})`);

  const ventas = effective.ventas;
  if (!ventas?.rutaCtasPV?.trim()) {
    errors.push('Ventas: defina ventas.rutaCtasPV (ruta al archivo Ctas_PV.xlsx) en la configuración guardada');
  } else {
    const p = ventas.rutaCtasPV.trim();
    const alt = p.endsWith('.xlsx') ? p : `${p}.xlsx`;
    if (!fs.existsSync(p) && !fs.existsSync(alt)) {
      errors.push(`Ventas: Ctas_PV no encontrado (${p})`);
    }
  }
  if (!ventas?.rutaBalances?.trim()) {
    errors.push('Ventas: defina ventas.rutaBalances (carpeta de balances mensuales) en la configuración guardada');
  } else {
    const d = ventas.rutaBalances.trim();
    try {
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
        errors.push(`Ventas: carpeta de balances no válida (${d})`);
      }
    } catch {
      errors.push(`Ventas: no se puede acceder a la carpeta de balances (${d})`);
    }
  }

  if (errors.length) {
    const err = new Error(
      'La importación completa requiere todas las rutas y archivos. Revise la lista y el .env o la configuración en MongoDB.'
    );
    err.statusCode = 400;
    err.details = errors;
    throw err;
  }
}

const MODULE_KEYS = [
  'ventas',
  'citas',
  'ingresos',
  'boletos',
  'orsAbiertas',
  'presupuestos'
];

async function setLastImportByModuleField(moduleKey, date = new Date()) {
  await Configuracion.findOneAndUpdate(
    { singleton: true },
    { $set: { [`lastImportByModule.${moduleKey}`]: date } },
    { upsert: true }
  );
}

async function setLastImportByModuleAll(date = new Date()) {
  const $set = {};
  for (const k of MODULE_KEYS) {
    $set[`lastImportByModule.${k}`] = date;
  }
  await Configuracion.findOneAndUpdate({ singleton: true }, { $set }, { upsert: true });
}

function assertNotImportRunning(res) {
  if (isImportRunning()) {
    res.status(409).json({
      error: 'Ya hay una importación de citas/ingresos en curso. Espere a que termine.'
    });
    return true;
  }
  return false;
}

function validateVentasPaths(effective) {
  const errors = [];
  const ventas = effective.ventas;
  if (!ventas?.rutaCtasPV?.trim()) {
    errors.push('Ventas: defina FILE_PATH_VENTAS_CTAS_PV / ventas.rutaCtasPV');
  } else {
    const p = ventas.rutaCtasPV.trim();
    const alt = p.endsWith('.xlsx') ? p : `${p}.xlsx`;
    if (!fs.existsSync(p) && !fs.existsSync(alt)) {
      errors.push(`Ventas: Ctas_PV no encontrado (${p})`);
    }
  }
  if (!ventas?.rutaBalances?.trim()) {
    errors.push('Ventas: defina FILE_PATH_VENTAS_BALANCES / ventas.rutaBalances');
  } else {
    const d = ventas.rutaBalances.trim();
    try {
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
        errors.push(`Ventas: carpeta de balances no válida (${d})`);
      }
    } catch {
      errors.push(`Ventas: no se puede acceder a la carpeta de balances (${d})`);
    }
  }
  return errors;
}

function validateCitasPath(effective) {
  const errors = [];
  const citas = effective.filePaths?.citas?.trim();
  if (!citas) errors.push('Citas: defina FILE_PATH_CITAS');
  else if (!fs.existsSync(citas)) errors.push(`Citas: archivo no encontrado (${citas})`);
  return errors;
}

function validateIngresosPath(effective) {
  const errors = [];
  const ingresos = effective.filePaths?.ingresos?.trim();
  if (!ingresos) errors.push('Ingresos: defina FILE_PATH_INGRESOS');
  else if (!fs.existsSync(ingresos)) errors.push(`Ingresos: archivo no encontrado (${ingresos})`);
  return errors;
}

function validateOrsPath(effective) {
  const errors = [];
  const ors = effective.filePaths?.orsAbiertas?.trim();
  if (!ors) errors.push('ORs: defina FILE_PATH_ORS_ABIERTAS');
  else if (!fs.existsSync(ors)) errors.push(`ORs: archivo no encontrado (${ors})`);
  return errors;
}

function validatePresupPaths(mergedPresup) {
  const errors = [];
  const presupUri = mergedPresup?.mongodb?.uri?.trim();
  const presupExcel = mergedPresup?.excel?.filePath?.trim();
  if (!presupUri) errors.push('Presupuestos: defina PRESUP_MONGODB_URI');
  if (!presupExcel) errors.push('Presupuestos: defina PRESUP_EXCEL_FILE_PATH o FILE_PATH_PRESUPUESTOS');
  else if (!fs.existsSync(presupExcel)) errors.push(`Presupuestos: Excel no encontrado (${presupExcel})`);
  return errors;
}

/** Boletos / accesorios: API externa (BOLETOS_PAT, BOLETOS_API_URL opcional en .env) */
function validateBoletosEnv() {
  const errors = [];
  if (!process.env.BOLETOS_PAT?.trim()) {
    errors.push(
      'Accesorios (Boletos): defina BOLETOS_PAT en el .env del servidor (API de reservas)'
    );
  }
  return errors;
}

// Importación manual
router.post('/manual', async (req, res) => {
  try {
    if (assertNotImportRunning(res)) return;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: 'MongoDB no está conectado. Por favor, espera unos segundos y vuelve a intentar.'
      });
    }

    const config = await Configuracion.findOne({ singleton: true });

    if (!config) {
      return res.status(400).json({
        error: 'Configuración no encontrada. Configure las rutas de archivos primero.'
      });
    }

    const plain =
      config && typeof config.toObject === 'function'
        ? config.toObject({ flattenMaps: true })
        : JSON.parse(JSON.stringify(config));
    const effective = applyEnvConfigOverrides(plain);

    const mergedPresupRaw = await getMergedPresupCrm();
    const fpPresup = effective.filePaths?.presupuestos?.trim();
    const excelPath =
      mergedPresupRaw.excel?.filePath?.trim() || fpPresup || '';
    const mergedPresup = {
      ...mergedPresupRaw,
      excel: { ...mergedPresupRaw.excel, filePath: excelPath }
    };

    assertManualImportPathsOk(effective, mergedPresup);

    const { citas, ingresos } = effective.filePaths;

    const resultado = await executeImport(citas, ingresos);

    const orsAbiertasPath = effective.filePaths?.orsAbiertas?.trim();
    await refreshORsPivot(orsAbiertasPath);
    console.log('Pivot de ORs Abiertas actualizado correctamente');

    const presupCrm = await importFromExcel(mergedPresup, { fullReplace: false });

    const ts = new Date();
    await setLastImportByModuleAll(ts);

    res.json({ ...resultado, presupCrm });
  } catch (error) {
    console.error('Error en importación manual:', error);
    if (error.statusCode === 400 && Array.isArray(error.details)) {
      return res.status(400).json({
        error: error.message,
        details: error.details
      });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/import/module/:module
 * module: ventas | citas | ingresos | boletos | ors | presupuestos
 */
router.post('/module/:module', async (req, res) => {
  const mod = String(req.params.module || '').toLowerCase();
  const map = {
    ventas: 'ventas',
    citas: 'citas',
    ingresos: 'ingresos',
    boletos: 'boletos',
    accesorios: 'boletos',
    ors: 'orsAbiertas',
    presupuestos: 'presupuestos',
    'ors-abiertas': 'orsAbiertas'
  };
  const moduleKey = map[mod];
  if (!moduleKey) {
    return res.status(400).json({
      error:
        'Módulo inválido. Use: ventas, citas, ingresos, boletos, ors, presupuestos'
    });
  }

  try {
    if (assertNotImportRunning(res)) return;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: 'MongoDB no está conectado.'
      });
    }

    const config = await Configuracion.findOne({ singleton: true });
    if (!config) {
      return res.status(400).json({ error: 'Configuración no encontrada' });
    }

    const plain =
      config && typeof config.toObject === 'function'
        ? config.toObject({ flattenMaps: true })
        : JSON.parse(JSON.stringify(config));
    const effective = applyEnvConfigOverrides(plain);

    const mergedPresupRaw = await getMergedPresupCrm();
    const fpPresup = effective.filePaths?.presupuestos?.trim();
    const excelPath =
      mergedPresupRaw.excel?.filePath?.trim() || fpPresup || '';
    const mergedPresup = {
      ...mergedPresupRaw,
      excel: { ...mergedPresupRaw.excel, filePath: excelPath }
    };

    let payload = {};

    if (moduleKey === 'ventas') {
      const err = validateVentasPaths(effective);
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const data = await procesarVentas();
      await setLastImportByModuleField('ventas');
      payload = { module: 'ventas', data };
    } else if (moduleKey === 'citas') {
      const err = validateCitasPath(effective);
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const citas = effective.filePaths.citas.trim();
      const resultado = await executeImport(citas, '', { scope: 'citas-only' });
      await setLastImportByModuleField('citas');
      payload = { module: 'citas', resultado };
    } else if (moduleKey === 'ingresos') {
      const err = validateIngresosPath(effective);
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const ingresos = effective.filePaths.ingresos.trim();
      const resultado = await executeImport('', ingresos, { scope: 'ingresos-only' });
      await setLastImportByModuleField('ingresos');
      payload = { module: 'ingresos', resultado };
    } else if (moduleKey === 'boletos') {
      const err = validateBoletosEnv();
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const data = await sincronizarBoletos({});
      await setLastImportByModuleField('boletos');
      payload = { module: 'boletos', data };
    } else if (moduleKey === 'orsAbiertas') {
      const err = validateOrsPath(effective);
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const orsPath = effective.filePaths.orsAbiertas.trim();
      await refreshORsPivot(orsPath);
      await setLastImportByModuleField('orsAbiertas');
      payload = { module: 'orsAbiertas', ok: true };
    } else if (moduleKey === 'presupuestos') {
      const err = validatePresupPaths(mergedPresup);
      if (err.length) {
        return res.status(400).json({ error: err[0], details: err });
      }
      const data = await importFromExcel(mergedPresup, { fullReplace: false });
      await setLastImportByModuleField('presupuestos');
      payload = { module: 'presupuestos', data };
    }

    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Error importación por módulo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test de conexión a MongoDB
router.post('/test-connection', async (req, res) => {
  try {
    const { uri } = req.body;

    if (!uri) {
      return res.status(400).json({ error: 'URI de MongoDB requerida' });
    }

    console.log('Probando conexión a MongoDB...');

    const testConnection = await mongoose.createConnection(uri).asPromise();

    console.log('✅ Conexión exitosa a MongoDB');

    await testConnection.close();

    res.json({
      success: true,
      message: 'Conexión exitosa a MongoDB'
    });
  } catch (error) {
    console.error('❌ Error en conexión a MongoDB:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener estado de última importación
router.get('/status', async (req, res) => {
  try {
    const status = await getImportStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener progreso actual de importación
router.get('/progress', async (req, res) => {
  try {
    const progress = getImportProgress();
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener logs recientes de importación
router.get('/logs', async (req, res) => {
  try {
    const { getRecentLogs } = await import('../services/importService.js');
    const filter = req.query.filter || null;
    const limit = parseInt(req.query.limit) || 100;
    const logs = getRecentLogs(filter, limit);
    res.json({
      success: true,
      logs: logs,
      total: logs.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener registro de última importación exitosa
router.get('/last-successful', async (req, res) => {
  try {
    const lastSuccessful = await getLastSuccessfulImport();
    res.json({
      success: true,
      data: lastSuccessful
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
