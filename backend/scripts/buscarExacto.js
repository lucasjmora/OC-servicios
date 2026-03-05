import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Ingreso from '../models/Ingreso.js';
import configStorageService from '../services/configStorageService.js';

dotenv.config({ path: './.env' });

async function main() {
  const uri = process.env.MONGODB_URI || (await configStorageService.initialize() && configStorageService.getConfig()?.mongodb?.uri);
  await mongoose.connect(uri);
  
  const matricula = 'AH075EN';
  console.log(`Buscando ingresos con matrícula exacta: "${matricula}"\n`);
  
  // Buscar exacto
  const exactos = await Ingreso.find({ 'Matrícula vehí': matricula }).lean();
  console.log(`Exactos: ${exactos.length}`);
  exactos.forEach(i => console.log(`  Ref: ${i.Referencia}, Fecha: ${i.Fecaper}`));
  
  // Buscar con regex case insensitive
  const regex = await Ingreso.find({ 'Matrícula vehí': new RegExp('^' + matricula + '$', 'i') }).lean();
  console.log(`\nCon regex case-insensitive: ${regex.length}`);
  regex.forEach(i => console.log(`  Ref: ${i.Referencia}, Matrícula: "${i['Matrícula vehí']}", Fecha: ${i.Fecaper}`));
  
  // Buscar que contenga 075EN
  const contiene = await Ingreso.find({ 'Matrícula vehí': new RegExp('075EN', 'i') }).lean();
  console.log(`\nQue contenga "075EN": ${contiene.length}`);
  contiene.forEach(i => console.log(`  Ref: ${i.Referencia}, Matrícula: "${i['Matrícula vehí']}", Fecha: ${i.Fecaper}`));
  
  // Buscar que contenga AH075
  const contiene2 = await Ingreso.find({ 'Matrícula vehí': new RegExp('AH075', 'i') }).lean();
  console.log(`\nQue contenga "AH075": ${contiene2.length}`);
  contiene2.forEach(i => console.log(`  Ref: ${i.Referencia}, Matrícula: "${i['Matrícula vehí']}", Fecha: ${i.Fecaper}`));
  
  await mongoose.disconnect();
}

main().catch(console.error);











