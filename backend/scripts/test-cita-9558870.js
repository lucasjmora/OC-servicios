import xlsx from 'xlsx';
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Configuracion from '../models/Configuracion.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucasjmora:rUAhjnEbxWJXv9nY@lm-mongodb.mw28zss.mongodb.net/oc_servicios?retryWrites=true&w=majority';

// Función corregida
function parseExcelTime(timeValue) {
  if (!timeValue && timeValue !== 0) return null;
  
  try {
    // Si es el valor por defecto de Excel (1900-01-00), retornar null
    if (timeValue === '1900-01-00' || 
        timeValue === '1900-01-00T00:00:00.000Z' ||
        (typeof timeValue === 'string' && timeValue.includes('1900-01-00'))) {
      return null;
    }
    
    // ✅ Si es un objeto Date (Excel con cellDates: true)
    if (timeValue instanceof Date) {
      const year = timeValue.getUTCFullYear();
      // Si es fecha de Excel de solo hora (1899 o 1900)
      if (year === 1899 || year === 1900) {
        // Para fechas de Excel de solo hora, usar la hora local (sin conversión UTC)
        // ya que Excel las guarda en la zona horaria local
        const hours = timeValue.getHours();
        const minutes = timeValue.getMinutes();
        // Si tiene hora válida (no es 00:00)
        if (hours !== 0 || minutes !== 0) {
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        return null;
      }
      // Si es una fecha normal con hora
      const hours = timeValue.getHours();
      const minutes = timeValue.getMinutes();
      if (hours !== 0 || minutes !== 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
      return null;
    }
    
    return null;
  } catch (error) {
    console.warn('Error parseando hora:', timeValue, error.message);
    return null;
  }
}

async function testCita9558870() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    
    const config = await Configuracion.findOne({ singleton: true });
    const citasPath = config?.filePaths?.citas;
    
    if (!citasPath || !fs.existsSync(citasPath)) {
      console.log('❌ No se encontró el archivo de citas');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('📖 Leyendo archivo Excel...');
    
    const workbook = xlsx.readFile(citasPath, {
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      raw: true
    });
    
    // Buscar la cita específica
    const referencia = '9558870';
    const cita = data.find(c => c.Referencia?.toString() === referencia);
    
    if (!cita) {
      console.log('❌ No se encontró la cita 9558870');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('\n✅ Cita 9558870 encontrada en Excel:');
    console.log('=' .repeat(60));
    console.log('Referencia:', cita.Referencia);
    console.log('Nombre:', cita.Nombre);
    console.log('Fecha ci:', cita['Fecha ci']);
    console.log('Hora (raw):', cita['Hora ']);
    console.log('Tipo de Hora:', typeof cita['Hora ']);
    console.log('Hora es Date?:', cita['Hora '] instanceof Date);
    
    if (cita['Hora '] instanceof Date) {
      console.log('Año:', cita['Hora '].getUTCFullYear());
      console.log('Hora UTC:', cita['Hora '].getUTCHours());
      console.log('Minutos UTC:', cita['Hora '].getUTCMinutes());
      console.log('Hora Local:', cita['Hora '].getHours());
      console.log('Minutos Local:', cita['Hora '].getMinutes());
    }
    
    console.log('\n🧪 Probando función parseExcelTime:');
    const horaProcesada = parseExcelTime(cita['Hora ']);
    console.log('Hora procesada:', horaProcesada);
    console.log('Esperado: 09:00');
    console.log('¿Correcto?', horaProcesada === '09:00' ? '✅ SÍ' : '❌ NO');
    
    console.log('\n📊 Verificando otras citas similares...');
    const citasConHora = data.filter(c => 
      c['Hora '] instanceof Date && 
      c['Hora '].getUTCFullYear() === 1899
    ).slice(0, 5);
    
    console.log('Ejemplos de fechas de hora de Excel:');
    citasConHora.forEach((c, i) => {
      const hora = parseExcelTime(c['Hora ']);
      console.log(`${i + 1}. ${c.Referencia}: ${c['Hora ']} → ${hora}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Test completado');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

testCita9558870();




