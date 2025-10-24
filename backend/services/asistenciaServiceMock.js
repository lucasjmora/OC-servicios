/**
 * Servicio mock para probar el filtro sin depender de la base de datos
 */

export async function getCitasConAsistencia(filters = {}, pagination = {}) {
  try {
    const {
      estadoAsistencia = 'todos'
    } = filters;

    const {
      page = 1,
      limit = 25
    } = pagination;

    console.log(`📊 Servicio MOCK - Estado filtro: ${estadoAsistencia}`);

    // Generar datos mock para probar el filtro
    const citasMock = [
      {
        Referencia: '9000001',
        'Fecha cr': new Date('2024-01-15'),
        'Fecha ci': new Date('2024-01-20'),
        'Hora ': '09:00',
        Nombre: 'Juan Pérez',
        Telefono: '123456789',
        Matricula: 'ABC123',
        'Marca/modelo': 'Toyota Corolla',
        Averia: 'Revisión general',
        Taller: 1,
        tieneAsistencia: true,
        ingresoReferencia: 'ING001',
        fechaIngreso: new Date('2024-01-20')
      },
      {
        Referencia: '9000002',
        'Fecha cr': new Date('2024-01-16'),
        'Fecha ci': new Date('2024-01-21'),
        'Hora ': '10:30',
        Nombre: 'María García',
        Telefono: '987654321',
        Matricula: 'XYZ789',
        'Marca/modelo': 'Honda Civic',
        Averia: 'Cambio de aceite',
        Taller: 2,
        tieneAsistencia: false,
        ingresoReferencia: null,
        fechaIngreso: null
      },
      {
        Referencia: '9000003',
        'Fecha cr': new Date('2024-01-17'),
        'Fecha ci': new Date('2024-01-22'),
        'Hora ': '14:00',
        Nombre: 'Carlos López',
        Telefono: '555666777',
        Matricula: 'DEF456',
        'Marca/modelo': 'Ford Focus',
        Averia: 'Reparación frenos',
        Taller: 1,
        tieneAsistencia: true,
        ingresoReferencia: 'ING002',
        fechaIngreso: new Date('2024-01-22')
      },
      {
        Referencia: '9000004',
        'Fecha cr': new Date('2024-01-18'),
        'Fecha ci': new Date('2024-01-23'),
        'Hora ': '11:15',
        Nombre: 'Ana Martínez',
        Telefono: '111222333',
        Matricula: 'GHI789',
        'Marca/modelo': 'Nissan Sentra',
        Averia: 'Revisión eléctrica',
        Taller: 3,
        tieneAsistencia: false,
        ingresoReferencia: null,
        fechaIngreso: null
      },
      {
        Referencia: '9000005',
        'Fecha cr': new Date('2024-01-19'),
        'Fecha ci': new Date('2024-01-24'),
        'Hora ': '16:45',
        Nombre: 'Pedro Rodríguez',
        Telefono: '444555666',
        Matricula: 'JKL012',
        'Marca/modelo': 'Chevrolet Cruze',
        Averia: 'Mantenimiento preventivo',
        Taller: 2,
        tieneAsistencia: true,
        ingresoReferencia: 'ING003',
        fechaIngreso: new Date('2024-01-24')
      }
    ];

    console.log(`📊 Datos mock generados: ${citasMock.length} citas`);

    // Filtrar por estado de asistencia
    let citasFiltradas = citasMock;
    if (estadoAsistencia === 'asistio') {
      citasFiltradas = citasMock.filter(cita => cita.tieneAsistencia);
      console.log(`📊 Filtro "asistió" aplicado: ${citasFiltradas.length} citas`);
    } else if (estadoAsistencia === 'noAsistio') {
      citasFiltradas = citasMock.filter(cita => !cita.tieneAsistencia);
      console.log(`📊 Filtro "no asistió" aplicado: ${citasFiltradas.length} citas`);
    }

    // Estadísticas para debugging
    const conAsistencia = citasMock.filter(c => c.tieneAsistencia).length;
    const sinAsistencia = citasMock.filter(c => !c.tieneAsistencia).length;
    
    console.log(`📊 Resumen MOCK: ${conAsistencia} asistieron, ${sinAsistencia} no asistieron`);
    console.log(`📊 Filtro "${estadoAsistencia}" -> ${citasFiltradas.length} citas mostradas`);

    // Calcular paginación
    const totalAproximado = citasFiltradas.length;
    const totalPages = Math.ceil(totalAproximado / limit);

    return {
      data: citasFiltradas,
      pagination: {
        page,
        limit,
        total: totalAproximado,
        totalPages
      },
      config: {
        diasTolerancia: 3
      }
    };

  } catch (error) {
    console.error('Error en servicio MOCK de asistencia:', error);
    throw error;
  }
}

// Funciones básicas para comentarios
export async function getComentariosCita(citaReferencia) {
  return [];
}

export async function addComentarioCita(citaReferencia, comentarioData) {
  return { citaReferencia, ...comentarioData, timestamp: new Date() };
}




