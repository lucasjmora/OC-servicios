/**
 * One-off: verifica si existe datosBoleto.entrega en la colección boletos.
 * Uso: node scripts/check-boleto-entrega.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let uri = process.env.MONGODB_URI;
if (!uri) {
  const p = path.join(__dirname, '../../data/config.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  uri = j.mongodb?.uri;
}
if (!uri) {
  console.log(JSON.stringify({ error: 'no_mongo_uri' }));
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });
const col = mongoose.connection.db.collection('boletos');
const total = await col.estimatedDocumentCount();
const withEntrega = await col.countDocuments({
  'datosBoleto.entrega': { $exists: true, $ne: null }
});
const sample = await col.findOne(
  { 'datosBoleto.entrega': { $exists: true, $ne: null } },
  { projection: { id: 1, 'datosBoleto.entrega': 1 } }
);
const anyDoc = await col.findOne({}, { projection: { id: 1, datosBoleto: 1 } });
let keysSample = [];
if (anyDoc?.datosBoleto && typeof anyDoc.datosBoleto === 'object') {
  keysSample = Object.keys(anyDoc.datosBoleto);
}
/** Cualquier clave de primer nivel en datosBoleto que contenga "entrega" (case insensitive) */
const aggEntregaKeys = await col
  .aggregate([
    { $match: { datosBoleto: { $type: 'object' } } },
    { $project: { pairs: { $objectToArray: '$datosBoleto' } } },
    { $unwind: '$pairs' },
    { $match: { 'pairs.k': { $regex: /entrega/i } } },
    { $limit: 5 },
    { $project: { _id: 0, id: '$_id', key: '$pairs.k', valuePreview: '$pairs.v' } }
  ])
  .toArray();

const nestedPaths = [
  'datosBoleto.origen.entrega',
  'datosBoleto.delivery',
  'datosBoleto.fechaEntrega',
  'datosBoleto.entregaEstimada'
];
const nestedCounts = {};
for (const p of nestedPaths) {
  nestedCounts[p] = await col.countDocuments({ [p]: { $exists: true, $ne: null } });
}

await mongoose.disconnect();

console.log(
  JSON.stringify(
    {
      collection_boletos_estimated_count: total,
      documentos_con_datosBoleto_entrega: withEntrega,
      muestra_id_y_entrega: sample
        ? { id: sample.id, entrega: sample.datosBoleto?.entrega }
        : null,
      claves_en_datosBoleto_muestra_cualquier_doc: keysSample.slice(0, 50),
      total_claves_muestra: keysSample.length,
      incluye_entrega_en_claves: keysSample.includes('entrega'),
      muestras_clave_entrega_por_objetoToArray: aggEntregaKeys,
      conteos_rutas_anidadas_comunes: nestedCounts
    },
    null,
    2
  )
);
