/**
 * Overrides de configuración desde variables de entorno (sin commitear secretos).
 * Prioridad: env > archivo local / MongoDB persistido para valores efectivos en runtime.
 */

function deepClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

/**
 * Aplica variables de entorno sobre una copia de la configuración (valores efectivos).
 */
export function applyEnvConfigOverrides(config) {
  const out = deepClone(config) || {};
  out.mongodb = { uri: '', database: 'oc_servicios', collections: {}, ...(out.mongodb || {}) };
  out.filePaths = { citas: '', ingresos: '', orsAbiertas: '', presupuestos: '', ...(out.filePaths || {}) };
  out.presupCrm = {
    mongodb: { uri: '', database: 'Presupuestos', collection: 'presup_taller', collectionTalleres: 'talleres' },
    excel: { filePath: '' },
    ...(out.presupCrm || {})
  };
  out.presupCrm.mongodb = { ...out.presupCrm.mongodb };
  out.presupCrm.excel = { ...out.presupCrm.excel };

  if (process.env.MONGODB_URI) {
    out.mongodb.uri = process.env.MONGODB_URI;
  }
  if (process.env.MONGODB_DATABASE) {
    out.mongodb.database = process.env.MONGODB_DATABASE;
  }

  if (process.env.FILE_PATH_CITAS) {
    out.filePaths.citas = process.env.FILE_PATH_CITAS;
  }
  if (process.env.FILE_PATH_INGRESOS) {
    out.filePaths.ingresos = process.env.FILE_PATH_INGRESOS;
  }
  if (process.env.FILE_PATH_ORS_ABIERTAS) {
    out.filePaths.orsAbiertas = process.env.FILE_PATH_ORS_ABIERTAS;
  }
  if (process.env.FILE_PATH_PRESUPUESTOS) {
    out.filePaths.presupuestos = process.env.FILE_PATH_PRESUPUESTOS;
  }

  if (process.env.PRESUP_MONGODB_URI) {
    out.presupCrm.mongodb.uri = process.env.PRESUP_MONGODB_URI;
  }
  if (process.env.PRESUP_MONGODB_DATABASE) {
    out.presupCrm.mongodb.database = process.env.PRESUP_MONGODB_DATABASE;
  }
  if (process.env.PRESUP_MONGODB_COLLECTION) {
    out.presupCrm.mongodb.collection = process.env.PRESUP_MONGODB_COLLECTION;
  }
  if (process.env.PRESUP_MONGODB_COLLECTION_TALLERES) {
    out.presupCrm.mongodb.collectionTalleres = process.env.PRESUP_MONGODB_COLLECTION_TALLERES;
  }
  if (process.env.PRESUP_EXCEL_FILE_PATH) {
    out.presupCrm.excel = { ...out.presupCrm.excel, filePath: process.env.PRESUP_EXCEL_FILE_PATH };
  }

  out.ventas = { rutaCtasPV: '', rutaBalances: '', ...(out.ventas || {}) };
  if (process.env.FILE_PATH_VENTAS_CTAS_PV) {
    out.ventas.rutaCtasPV = process.env.FILE_PATH_VENTAS_CTAS_PV;
  }
  if (process.env.FILE_PATH_VENTAS_BALANCES) {
    out.ventas.rutaBalances = process.env.FILE_PATH_VENTAS_BALANCES;
  }

  return out;
}

/**
 * Solo bloque presupCrm con overrides de env (para rutas que ya arman defaultPresupCrm + DB).
 */
export function mergePresupCrmWithEnv(presupCrm) {
  return applyEnvConfigOverrides({
    mongodb: {},
    filePaths: {},
    presupCrm: {
      mongodb: { uri: '', database: 'Presupuestos', collection: 'presup_taller', collectionTalleres: 'talleres' },
      excel: { filePath: '' },
      ...presupCrm
    }
  }).presupCrm;
}

/** Qué campos están definidos solo / priorizados por env (para la UI y respuestas API). */
export function getEnvSourceFlags() {
  return {
    mongodbUri: !!process.env.MONGODB_URI,
    mongodbDatabase: !!process.env.MONGODB_DATABASE,
    filePathsCitas: !!process.env.FILE_PATH_CITAS,
    filePathsIngresos: !!process.env.FILE_PATH_INGRESOS,
    filePathsOrsAbiertas: !!process.env.FILE_PATH_ORS_ABIERTAS,
    filePathsPresupuestos: !!process.env.FILE_PATH_PRESUPUESTOS,
    presupMongoUri: !!process.env.PRESUP_MONGODB_URI,
    presupMongoDatabase: !!process.env.PRESUP_MONGODB_DATABASE,
    presupMongoCollection: !!process.env.PRESUP_MONGODB_COLLECTION,
    presupMongoCollectionTalleres: !!process.env.PRESUP_MONGODB_COLLECTION_TALLERES,
    presupExcelFilePath: !!process.env.PRESUP_EXCEL_FILE_PATH,
    ventasRutaCtasPV: !!process.env.FILE_PATH_VENTAS_CTAS_PV,
    ventasRutaBalances: !!process.env.FILE_PATH_VENTAS_BALANCES
  };
}

/** Oculta contraseña en URI mongodb:// o mongodb+srv:// */
export function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  let s = uri;
  s = s.replace(/^(mongodb\+srv:\/\/)([^:@/]+)(:)([^@]+)(@)/i, '$1$2$3***$5');
  s = s.replace(/^(mongodb:\/\/)([^:@/]+)(:)([^@]+)(@)/i, '$1$2$3***$5');
  return s;
}

const PLACEHOLDER_PATH = '(definido en variable de entorno)';

/**
 * Respuesta segura para el cliente: enmascara URIs y oculta rutas sensibles si vienen de env.
 */
export function buildClientSafeConfig(mergedConfig, flags = getEnvSourceFlags()) {
  const c = deepClone(mergedConfig);
  if (!c) return c;

  if (c.mongodb) {
    c.mongodb.uri = c.mongodb.uri ? maskMongoUri(c.mongodb.uri) : '';
    if (flags.mongodbUri) {
      c.mongodb.uri = maskMongoUri(process.env.MONGODB_URI || c.mongodb.uri);
    }
  }

  c.filePaths = { ...c.filePaths };
  if (flags.filePathsCitas) c.filePaths.citas = PLACEHOLDER_PATH;
  if (flags.filePathsIngresos) c.filePaths.ingresos = PLACEHOLDER_PATH;
  if (flags.filePathsOrsAbiertas) c.filePaths.orsAbiertas = PLACEHOLDER_PATH;
  if (flags.filePathsPresupuestos) c.filePaths.presupuestos = PLACEHOLDER_PATH;

  if (c.presupCrm?.mongodb) {
    c.presupCrm.mongodb = { ...c.presupCrm.mongodb };
    if (c.presupCrm.mongodb.uri) {
      c.presupCrm.mongodb.uri = maskMongoUri(c.presupCrm.mongodb.uri);
    }
    if (flags.presupMongoUri) {
      c.presupCrm.mongodb.uri = process.env.PRESUP_MONGODB_URI
        ? maskMongoUri(process.env.PRESUP_MONGODB_URI)
        : c.presupCrm.mongodb.uri;
    }
  }
  if (c.presupCrm?.excel && flags.presupExcelFilePath) {
    c.presupCrm.excel = { ...c.presupCrm.excel, filePath: PLACEHOLDER_PATH };
  }

  if (c.ventas) {
    c.ventas = { ...c.ventas };
    if (flags.ventasRutaCtasPV) c.ventas.rutaCtasPV = PLACEHOLDER_PATH;
    if (flags.ventasRutaBalances) c.ventas.rutaBalances = PLACEHOLDER_PATH;
  }

  return c;
}

/**
 * Evita que un PUT borre valores persistidos cuando el campo lo controla env y el body trae placeholder o vacío.
 */
export function stripEnvBackedFieldsFromUpdates(updates) {
  if (!updates || typeof updates !== 'object') return updates;
  const u = deepClone(updates);
  const flags = getEnvSourceFlags();

  if (flags.mongodbUri && u.mongodb) {
    const uri = u.mongodb.uri;
    if (!uri || uri === PLACEHOLDER_PATH || uri.includes('***')) {
      delete u.mongodb.uri;
      if (Object.keys(u.mongodb).length === 0) delete u.mongodb;
    }
  }
  if (flags.mongodbDatabase && u.mongodb?.database && process.env.MONGODB_DATABASE) {
    delete u.mongodb.database;
    if (Object.keys(u.mongodb).length === 0) delete u.mongodb;
  }

  if (u.filePaths) {
    if (flags.filePathsCitas && (!u.filePaths.citas || u.filePaths.citas === PLACEHOLDER_PATH)) delete u.filePaths.citas;
    if (flags.filePathsIngresos && (!u.filePaths.ingresos || u.filePaths.ingresos === PLACEHOLDER_PATH)) {
      delete u.filePaths.ingresos;
    }
    if (flags.filePathsOrsAbiertas && (!u.filePaths.orsAbiertas || u.filePaths.orsAbiertas === PLACEHOLDER_PATH)) {
      delete u.filePaths.orsAbiertas;
    }
    if (flags.filePathsPresupuestos && (!u.filePaths.presupuestos || u.filePaths.presupuestos === PLACEHOLDER_PATH)) {
      delete u.filePaths.presupuestos;
    }
    if (Object.keys(u.filePaths).length === 0) delete u.filePaths;
  }

  if (u.presupCrm) {
    if (flags.presupMongoUri && u.presupCrm.mongodb?.uri) {
      const uri = u.presupCrm.mongodb.uri;
      if (!uri || uri === PLACEHOLDER_PATH || uri.includes('***')) {
        delete u.presupCrm.mongodb.uri;
      }
    }
    if (flags.presupExcelFilePath && u.presupCrm.excel?.filePath) {
      const p = u.presupCrm.excel.filePath;
      if (!p || p === PLACEHOLDER_PATH) delete u.presupCrm.excel.filePath;
    }
    if (u.presupCrm.mongodb && Object.keys(u.presupCrm.mongodb).length === 0) delete u.presupCrm.mongodb;
    if (u.presupCrm.excel && Object.keys(u.presupCrm.excel).length === 0) delete u.presupCrm.excel;
    if (Object.keys(u.presupCrm).length === 0) delete u.presupCrm;
  }

  if (u.ventas) {
    if (flags.ventasRutaCtasPV && (!u.ventas.rutaCtasPV || u.ventas.rutaCtasPV === PLACEHOLDER_PATH)) {
      delete u.ventas.rutaCtasPV;
    }
    if (flags.ventasRutaBalances && (!u.ventas.rutaBalances || u.ventas.rutaBalances === PLACEHOLDER_PATH)) {
      delete u.ventas.rutaBalances;
    }
    if (Object.keys(u.ventas).length === 0) delete u.ventas;
  }

  return u;
}
