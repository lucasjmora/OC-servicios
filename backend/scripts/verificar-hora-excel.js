import xlsx from 'xlsx';
import fs from 'fs';
import Configuracion from '../models/Configuracion.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lucasjmora:rUAhjnEbxWJXv9nY@lm-mongodb.mw28zss.mongodb.net/oc_servicios?retryWrites=true&w=majority';

async function verificarHoraExcel() {
  try {
    console.log('🔍 Conectando a MongoDB para obtener configuración...');
    await mongoose.connect(MONGODB_URI);
    
    const config = await Configuracion.findOne({ singleton: true });
    const citasPath = config?.filePaths?.citas;
    
    if (!citasPath || !fs.existsSync(citasPath)) {
      console.log('❌ No se encontró el archivo de citas configurado');
      console.log('Ruta configurada:', citasPath);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('📖 Leyendo archivo Excel:', citasPath);
    
    const workbook = xlsx.readFile(citasPath, {
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      raw: true
    });
    
    console.log(`✅ Archivo leído: ${data.length} citas\n`);
    
    // Buscar la cita específica
    const referencia = '9562580';
    const cita = data.find(c => c.Referencia?.toString() === referencia);
    
    if (!cita) {
      console.log('❌ No se encontró la cita en el Excel');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('✅ Cita encontrada en Excel:');
    console.log('=' .repeat(60));
    console.log('Referencia:', cita.Referencia);
    console.log('Nombre:', cita.Nombre);
    console.log('Fecha ci:', cita['Fecha ci']);
    console.log('Hora (raw):', cita['Hora ']);
    console.log('Tipo de Hora:', typeof cita['Hora ']);
    console.log('=' .repeat(60));
    
    // Buscar citas sin hora en Excel
    console.log('\n🔍 Analizando horas en Excel...\n');
    
    let conHoraValida = 0;
    let sinHora = 0;
    let horaInvalida = 0;
    
    const ejemplosSinHora = [];
    
    data.forEach((c, index) => {
      const hora = c['Hora '];
      
      if (!hora && hora !== 0) {
        sinHora++;
        if (ejemplosSinHora.length < 5) {
          ejemplosSinHora.push({
            referencia: c.Referencia,
            hora: hora,
            tipo: typeof hora
          });
        }
      } else if (typeof hora === 'number' && hora >= 0 && hora < 1) {
        conHoraValida++;
      } else if (typeof hora === 'string' && hora.includes(':')) {
        conHoraValida++;
      } else {
        horaInvalida++;
        if (ejemplosSinHora.length < 5) {
          ejemplosSinHora.push({
            referencia: c.Referencia,
            hora: hora,
            tipo: typeof hora
          });
        }
      }
    });
    
    console.log('📊 Estadísticas de horas en Excel:');
    console.log(`Total: ${data.length}`);
    console.log(`Con hora válida: ${conHoraValida} (${(conHoraValida / data.length * 100).toFixed(1)}%)`);
    console.log(`Sin hora: ${sinHora} (${(sinHora / data.length * 100).toFixed(1)}%)`);
    console.log(`Hora inválida: ${horaInvalida} (${(horaInvalida / data.length * 100).toFixed(1)}%)`);
    
    if (ejemplosSinHora.length > 0) {
      console.log('\n📋 Ejemplos de citas sin hora:');
      ejemplosSinHora.forEach((ej, i) => {
        console.log(`${i + 1}. Ref: ${ej.referencia} - Hora: "${ej.hora}" (tipo: ${ej.tipo})`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Verificación completada');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

verificarHoraExcel();





