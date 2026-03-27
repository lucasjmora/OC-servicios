/**
 * Obtiene boletos del API de booking y lista claves (y un nivel de anidación).
 * Requiere BOLETOS_PAT (y opcionalmente BOLETOS_API_URL) en el entorno o en backend/.env
 *
 * Uso (desde backend/): node scripts/fetch-booking-sample.mjs
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

function loadDotenv() {
  const envPath = path.join(backendRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotenv();

const BOLETOS_API_URL = process.env.BOLETOS_API_URL || 'https://boleto-services.opencars.com.ar/pat/booking';
const BOLETOS_PAT = process.env.BOLETOS_PAT;

function normalizeResponse(data) {
  if (Array.isArray(data)) return data;
  if (data?.bookings && Array.isArray(data.bookings)) return data.bookings;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data && typeof data === 'object') return [data];
  return [];
}

function describeValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return 'object';
  return typeof v;
}

function shallowDescribe(obj, maxKeys = 40) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  const keys = Object.keys(obj).slice(0, maxKeys);
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { _: 'object', keys: Object.keys(v).slice(0, 30) };
    } else if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
      out[k] = { _: 'array', firstItemKeys: Object.keys(v[0]).slice(0, 30) };
    } else {
      out[k] = describeValue(v);
    }
  }
  return out;
}

async function main() {
  if (!BOLETOS_PAT) {
    console.error('Falta BOLETOS_PAT. Configurá backend/.env o exportá la variable.');
    process.exit(1);
  }

  const params = {
    page: 1,
    limit: 5,
    typeOfSale: 'VN',
    startDate: '2024-01-01',
    endDate: new Date().toISOString().split('T')[0]
  };

  const { data } = await axios.get(BOLETOS_API_URL, {
    params,
    headers: {
      Authorization: `Bearer ${BOLETOS_PAT}`,
      'Content-Type': 'application/json'
    },
    timeout: 45000
  });

  const boletos = normalizeResponse(data);
  const unionKeys = new Set();
  for (const b of boletos) {
    if (b && typeof b === 'object') Object.keys(b).forEach((k) => unionKeys.add(k));
  }

  const first = boletos[0] || null;
  const result = {
    url: BOLETOS_API_URL,
    paramsUsados: params,
    cantidadEnRespuesta: boletos.length,
    clavesTopLevelUnion: [...unionKeys].sort(),
    muestraPrimerBoleto: first ? shallowDescribe(first) : null,
    idsMuestra: boletos.slice(0, 5).map((b) => b?.id || b?._id || b?.bookingId || null)
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
