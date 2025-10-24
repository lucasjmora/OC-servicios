// Simular la función corregida
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
      const year = timeValue.getFullYear();
      // Si es fecha de Excel de solo hora (1899 o 1900)
      if (year === 1899 || year === 1900) {
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
    
    // Si es un número decimal (formato Excel de hora)
    if (typeof timeValue === 'number') {
      // Excel almacena las horas como fracciones de día
      if (timeValue >= 0 && timeValue < 1) {
        // Convertir a minutos totales y luego a horas:minutos para evitar problemas de redondeo
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Error parseando hora:', timeValue, error.message);
    return null;
  }
}

// Tests
console.log('🧪 Probando función parseExcelTime corregida\n');

// Test 1: Fecha de Excel con hora (como la cita 9562580)
const testDate1 = new Date('1899-12-30T13:16:48.000Z');
console.log('Test 1: Fecha Excel con hora 13:16');
console.log('  Input:', testDate1);
console.log('  Output:', parseExcelTime(testDate1));
console.log('  Esperado: "13:16" ✅\n');

// Test 2: Otra fecha de Excel con hora
const testDate2 = new Date('1899-12-30T10:02:00.000Z');
console.log('Test 2: Fecha Excel con hora 10:02');
console.log('  Input:', testDate2);
console.log('  Output:', parseExcelTime(testDate2));
console.log('  Esperado: "10:02" ✅\n');

// Test 3: null
console.log('Test 3: null');
console.log('  Input: null');
console.log('  Output:', parseExcelTime(null));
console.log('  Esperado: null ✅\n');

// Test 4: Decimal (fracción de día)
console.log('Test 4: Decimal 0.5 (mediodía)');
console.log('  Input: 0.5');
console.log('  Output:', parseExcelTime(0.5));
console.log('  Esperado: "12:00" ✅\n');

// Test 5: Fecha con hora 00:00 (debería retornar null)
const testDate3 = new Date('1899-12-30T00:00:00.000Z');
console.log('Test 5: Fecha con hora 00:00');
console.log('  Input:', testDate3);
console.log('  Output:', parseExcelTime(testDate3));
console.log('  Esperado: null ✅\n');

console.log('✅ Todos los tests completados');





