import xlsx from 'xlsx';
import fs from 'fs';

// Talleres excluidos del cuadro (no se consideran)
const TALLERES_EXCLUIDOS = new Set([
  'PLACE ROUEN - SAN NICOLAS',
  'PERITAJE - GRANVILLE',
  'PERITAJE - FORTECAR',
  'GEELY - JUNIN'
]);

// Cache en memoria (no se persiste en MongoDB)
let pivotCache = {
  talleres: [],
  tiposOrden: [],
  data: {},
  sumBase: {},
  orders: [],
  lastUpdated: null,
  error: null
};

/**
 * Busca el nombre de columna real en el objeto, permitiendo variaciones
 */
function findColumnKey(row, possibleNames) {
  const keys = Object.keys(row || {});
  const lowerPossible = possibleNames.map(n => (n || '').toLowerCase().trim());
  const lowerNoSpaces = lowerPossible.map(n => n.replace(/\s/g, ''));
  for (const key of keys) {
    const keyNormalized = key.toLowerCase().trim();
    const keyNoSpaces = keyNormalized.replace(/\s/g, '');
    if (lowerPossible.includes(keyNormalized)) return key;
    if (lowerNoSpaces.includes(keyNoSpaces)) return key;
    // Solo aplicar fallbacks si coinciden con el tipo de columna buscada
    if (keyNoSpaces === 'nombretaller' && lowerNoSpaces.some(n => n.includes('taller'))) return key;
    if ((keyNoSpaces === 'tipo' || keyNormalized.startsWith('tipo')) && lowerNoSpaces.some(n => n.includes('tipo'))) return key;
    if (keyNormalized.replace(/\s/g, '_') === 'tipo_or' && lowerNoSpaces.some(n => n.includes('tipo'))) return key;
  }
  return null;
}

/**
 * Obtiene el valor de Base como número para comparación
 */
function parseBaseValue(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (!str) return 0;
  const num = parseFloat(str.replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

/**
 * Parsea un valor numérico (acepta coma como decimal)
 */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  const num = parseFloat(str.replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Parsea fecha y calcula días desde esa fecha hasta hoy
 */
function daysFromDate(val) {
  if (val === null || val === undefined) return null;
  let d;
  if (val instanceof Date) d = val;
  else if (typeof val === 'number') d = new Date(val);
  else {
    const str = String(val).trim();
    if (!str) return null;
    d = new Date(str);
  }
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((hoy - d) / (1000 * 60 * 60 * 24));
}

/**
 * Lee un archivo Excel de ORs Abiertas y retorna los datos filtrados
 */
function readORsExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    cellNF: false,
    cellText: false
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const data = xlsx.utils.sheet_to_json(worksheet, {
    raw: true,
    dateNF: 'yyyy-mm-dd'
  });

  if (!data.length) {
    return { rows: [], talleres: [], tiposOrden: [] };
  }

  const firstRow = data[0];
  const colTaller = findColumnKey(firstRow, ['Nombre taller', 'Nombre Taller', 'Nombre_taller']);
  const colTipoOR = findColumnKey(firstRow, ['Tipo OR', 'Tipo_OR', 'TipoOR', 'Tipo O', 'Tipo ']);
  const colBase = findColumnKey(firstRow, ['Base', 'base']);
  const colReferencia = findColumnKey(firstRow, ['Referencia', 'referencia']) ??
    Object.keys(firstRow).find(k => k.trim().toLowerCase() === 'referencia');
  const colFecAper = findColumnKey(firstRow, ['Fec.aper', 'Fec aper', 'Fecha apertura', 'Fecaper', 'FecAper']);
  const colDesAveria = findColumnKey(firstRow, ['Des.averia', 'Des averia', 'Desaveria', 'Des avería']);
  const colManoObra = findColumnKey(firstRow, ['Mano obra', 'ManoObra']);
  const colTotalMaterial = findColumnKey(firstRow, ['Total material', 'TotalMaterial']);
  const colSubarrenda = findColumnKey(firstRow, ['SUBARRENDA', 'Subarrenda', 'SUBARRENDADO', 'Subarrendado']);

  if (!colTaller) {
    throw new Error(`Columna "Nombre taller" no encontrada. Columnas disponibles: ${Object.keys(firstRow).join(', ')}`);
  }
  if (!colTipoOR) {
    throw new Error(`Columna "Tipo OR" no encontrada. Columnas disponibles: ${Object.keys(firstRow).join(', ')}`);
  }
  if (!colBase) {
    throw new Error(`Columna "Base" no encontrada. Columnas disponibles: ${Object.keys(firstRow).join(', ')}`);
  }

  const filtered = data.filter(row => {
    // Solo considerar líneas con Referencia distinto de vacío
    const referencia = colReferencia ? String(row[colReferencia] ?? '').trim() : '';
    if (!referencia) return false;
    const base = parseBaseValue(row[colBase]);
    if (base === 0) return false;
    // Ignorar filas en blanco: sin taller ni tipo de orden
    const taller = String(row[colTaller] ?? '').trim();
    const tipoOR = String(row[colTipoOR] ?? '').trim();
    if (!taller && !tipoOR) return false;
    // No considerar órdenes sin tipo
    if (!tipoOR) return false;
    // Excluir talleres específicos
    if (taller && TALLERES_EXCLUIDOS.has(taller)) return false;
    return true;
  });

  const talleresSet = new Set();
  const tiposOrdenSet = new Set();

  filtered.forEach(row => {
    const taller = String(row[colTaller] ?? '').trim() || '(Sin taller)';
    const tipoOR = String(row[colTipoOR] ?? '').trim() || '(Sin tipo)';
    talleresSet.add(taller);
    tiposOrdenSet.add(tipoOR);
  });

  const talleres = [...talleresSet].sort((a, b) => a.localeCompare(b));
  talleres.push('Total');

  const tiposOrden = [...tiposOrdenSet].sort((a, b) => a.localeCompare(b));
  tiposOrden.push('Total');

  const colMap = {
    colTaller,
    colTipoOR,
    colBase,
    colReferencia,
    colFecAper,
    colDesAveria,
    colManoObra,
    colTotalMaterial,
    colSubarrenda
  };

  return { rows: filtered, talleres, tiposOrden, ...colMap };
}

/**
 * Construye la lista de órdenes para la tabla detalle
 */
function buildOrders(rows, colMap) {
  return rows.map(row => {
    const nombreTaller = String(row[colMap.colTaller] ?? '').trim() || '-';
    const fecAperVal = colMap.colFecAper ? row[colMap.colFecAper] : null;
    const dias = daysFromDate(fecAperVal);
    const referencia = colMap.colReferencia ? String(row[colMap.colReferencia] ?? '').trim() : '';
    const desAveria = colMap.colDesAveria ? String(row[colMap.colDesAveria] ?? '').trim() : '';
    const manoObra = colMap.colManoObra ? parseNum(row[colMap.colManoObra]) : null;
    const totalMaterial = colMap.colTotalMaterial ? parseNum(row[colMap.colTotalMaterial]) : null;
    const subarrenda = colMap.colSubarrenda ? parseNum(row[colMap.colSubarrenda]) : null;
    const base = colMap.colBase ? parseBaseValue(row[colMap.colBase]) : 0;

    return {
      nombreTaller,
      dias: dias != null ? dias : '-',
      referencia,
      desAveria,
      manoObra: manoObra != null ? manoObra : '-',
      totalMaterial: totalMaterial != null ? totalMaterial : '-',
      subarrenda: subarrenda != null ? subarrenda : '-',
      base: base !== 0 ? base : '-'
    };
  });
}

/**
 * Construye la estructura de datos del pivot (conteo y suma de Base)
 */
function buildPivotData(rows, talleres, tiposOrden, colTaller, colTipoOR, colBase) {
  const data = {};
  const sumBase = {};

  talleres.forEach(t => {
    data[t] = {};
    sumBase[t] = {};
    tiposOrden.forEach(to => {
      data[t][to] = 0;
      sumBase[t][to] = 0;
    });
  });

  rows.forEach(row => {
    const taller = String(row[colTaller] ?? '').trim() || '(Sin taller)';
    const tipoOR = String(row[colTipoOR] ?? '').trim() || '(Sin tipo)';
    const baseVal = parseBaseValue(colBase ? row[colBase] : 0);

    if (data[taller]) {
      data[taller][tipoOR] = (data[taller][tipoOR] || 0) + 1;
      data[taller]['Total'] = (data[taller]['Total'] || 0) + 1;
      sumBase[taller][tipoOR] = (sumBase[taller][tipoOR] || 0) + baseVal;
      sumBase[taller]['Total'] = (sumBase[taller]['Total'] || 0) + baseVal;
    }
    data['Total'][tipoOR] = (data['Total'][tipoOR] || 0) + 1;
    data['Total']['Total'] = (data['Total']['Total'] || 0) + 1;
    sumBase['Total'][tipoOR] = (sumBase['Total'][tipoOR] || 0) + baseVal;
    sumBase['Total']['Total'] = (sumBase['Total']['Total'] || 0) + baseVal;
  });

  return { data, sumBase };
}

/**
 * Lee el Excel, filtra filas con Base=0 y actualiza el cache en memoria
 */
export async function refreshORsPivot(filePath) {
  if (!filePath || !filePath.trim()) {
    pivotCache.error = 'Ruta de archivo no configurada';
    pivotCache.lastUpdated = null;
    return pivotCache;
  }

  try {
    pivotCache.error = null;
    const result = readORsExcel(filePath);
    const { rows, talleres, tiposOrden, colTaller, colTipoOR, colBase } = result;
    const { data, sumBase } = buildPivotData(rows, talleres, tiposOrden, colTaller, colTipoOR, colBase);
    const orders = buildOrders(rows, result);

    pivotCache = {
      talleres,
      tiposOrden,
      data,
      sumBase,
      orders,
      lastUpdated: new Date().toISOString(),
      error: null
    };

    return pivotCache;
  } catch (err) {
    pivotCache.error = err.message;
    pivotCache.lastUpdated = null;
    throw err;
  }
}

/**
 * Devuelve los datos del pivot actual (o estructura vacía si nunca se ha refrescado)
 */
export function getORsPivot() {
  return {
    talleres: pivotCache.talleres || [],
    tiposOrden: pivotCache.tiposOrden || [],
    data: pivotCache.data || {},
    sumBase: pivotCache.sumBase || {},
    orders: pivotCache.orders || [],
    lastUpdated: pivotCache.lastUpdated,
    error: pivotCache.error
  };
}
