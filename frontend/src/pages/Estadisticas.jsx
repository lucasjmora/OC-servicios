import React, { useEffect, useState, useRef } from 'react';
import PageHeader from '../components/PageHeader';
import { getMartinaMensualStats, getMartinaInteraccionesStats } from '../services/api';
import { FaChartBar, FaChevronDown, FaChevronRight } from 'react-icons/fa';

const Estadisticas = () => {
  const [martinaInteraccionesStats, setMartinaInteraccionesStats] = useState(null);
  const [martinaMensualStats, setMartinaMensualStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Referencias para los contenedores de scroll
  const interaccionesScrollRef = useRef(null);
  const agendamientoScrollRef = useRef(null);
  
  // Estado para controlar qué empresas están expandidas (por mes)
  const [empresasExpandidas, setEmpresasExpandidas] = useState({}); // { "mesKey-empresa": true }
  // Estado para controlar qué talleres están expandidos (por mes y empresa)
  const [talleresExpandidos, setTalleresExpandidos] = useState({}); // { "mesKey-empresa-taller": true }

  // Función para formatear números con punto como separador de miles
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  useEffect(() => {
    loadEstadisticas();
  }, []);

  const loadEstadisticas = async () => {
    setLoading(true);
    
    try {
      // Cargar estadísticas mensuales primero (más rápido)
      let mensualData = null;
      try {
        const mensualRes = await getMartinaMensualStats();
        const mesesMensual = mensualRes?.data?.data?.meses || mensualRes?.data?.meses;
        if (mesesMensual && Array.isArray(mesesMensual) && mesesMensual.length > 0) {
          mensualData = { meses: mesesMensual };
          setMartinaMensualStats(mensualData);
        } else {
          setMartinaMensualStats({ meses: [] });
        }
      } catch (err) {
        console.warn('Error obteniendo estadísticas mensuales de Martina:', err);
        setMartinaMensualStats({ meses: [] });
      }
      
      // Cargar estadísticas de interacciones (puede tardar más)
      try {
        console.log('[FRONTEND] Iniciando petición de interacciones...');
        const interaccionesRes = await getMartinaInteraccionesStats();
        console.log('[FRONTEND] Respuesta de interacciones recibida:', interaccionesRes?.data);
        const mesesInteracciones = interaccionesRes?.data?.data?.meses || interaccionesRes?.data?.meses;
        console.log('[FRONTEND] Meses de interacciones:', mesesInteracciones?.length, mesesInteracciones);
        
        // Si hay datos mensuales, alinear las interacciones con esos meses
        if (mensualData && mensualData.meses && mensualData.meses.length > 0) {
          const interaccionesMap = new Map();
          if (mesesInteracciones && Array.isArray(mesesInteracciones) && mesesInteracciones.length > 0) {
            mesesInteracciones.forEach(mes => {
              interaccionesMap.set(mes.mesKey, mes);
            });
          }
          
          // Crear array alineado con los meses de estadísticas mensuales
          const interaccionesAlineadas = mensualData.meses.map(mesMensual => {
            const interaccionMes = interaccionesMap.get(mesMensual.mesKey);
            return {
              mes: mesMensual.mes,
              mesKey: mesMensual.mesKey,
              interacciones: interaccionMes?.interacciones || 0,
              porEmpresa: interaccionMes?.porEmpresa || { FC: 0, GV: 0, PW: 0 }
            };
          });
          
          console.log('[FRONTEND] Interacciones alineadas:', interaccionesAlineadas);
          setMartinaInteraccionesStats({ meses: interaccionesAlineadas });
        } else if (mesesInteracciones && Array.isArray(mesesInteracciones) && mesesInteracciones.length > 0) {
          // Si no hay datos mensuales, usar los datos de interacciones tal cual
          console.log('[FRONTEND] Usando datos de interacciones directamente:', mesesInteracciones);
          setMartinaInteraccionesStats({ meses: mesesInteracciones });
        } else {
          // Si no hay datos de interacciones, inicializar con array vacío
          console.warn('[FRONTEND] No hay datos de interacciones');
          setMartinaInteraccionesStats({ meses: [] });
        }
      } catch (err) {
        console.error('Error obteniendo estadísticas de interacciones de Martina:', err);
        // Si hay datos mensuales, crear estructura vacía alineada
        if (mensualData && mensualData.meses && mensualData.meses.length > 0) {
          const interaccionesAlineadas = mensualData.meses.map(mesMensual => ({
            mes: mesMensual.mes,
            mesKey: mesMensual.mesKey,
            interacciones: 0,
            porEmpresa: { FC: 0, GV: 0, PW: 0 }
          }));
          setMartinaInteraccionesStats({ meses: interaccionesAlineadas });
        } else {
          setMartinaInteraccionesStats({ meses: [] });
        }
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      // Asegurar que siempre se inicialice, incluso si hay error
      setMartinaMensualStats({ meses: [] });
      setMartinaInteraccionesStats({ meses: [] });
    } finally {
      setLoading(false);
    }
  };

  // Obtener meses de referencia (de estadísticas mensuales si están disponibles)
  const mesesReferencia = martinaMensualStats?.meses || martinaInteraccionesStats?.meses || [];

  // Efecto para desplazar el scroll hacia la derecha cuando se cargan los datos
  useEffect(() => {
    if (!loading && mesesReferencia.length > 0) {
      // Pequeño delay para asegurar que el DOM esté renderizado
      setTimeout(() => {
        if (interaccionesScrollRef.current) {
          interaccionesScrollRef.current.scrollLeft = interaccionesScrollRef.current.scrollWidth;
        }
        if (agendamientoScrollRef.current) {
          agendamientoScrollRef.current.scrollLeft = agendamientoScrollRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [loading, mesesReferencia.length]);

  // Funciones para expandir/colapsar
  const toggleEmpresa = (mesKey, empresa) => {
    const key = `${mesKey}-${empresa}`;
    setEmpresasExpandidas(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleTaller = (mesKey, empresa, taller) => {
    const key = `${mesKey}-${empresa}-${taller}`;
    setTalleresExpandidos(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isEmpresaExpandida = (mesKey, empresa) => {
    return empresasExpandidas[`${mesKey}-${empresa}`] || false;
  };

  const isTallerExpandido = (mesKey, empresa, taller) => {
    return talleresExpandidos[`${mesKey}-${empresa}-${taller}`] || false;
  };

  // Funciones para expandir/colapsar empresas en Interacciones Martina

  return (
    <div className="p-8">
      <PageHeader 
        title="Estadísticas" 
        subtitle="Estadísticas de agendamiento Martina (BOT)"
        icon={FaChartBar}
      />

      {/* Contenedor común para alinear las tablas */}
      <div className="flex flex-wrap gap-6">
        {/* Tabla de interacciones Martina */}
        <div className="bg-background-card border border-gray-700 rounded-lg p-6 fade-in flex-1 min-w-[600px]">
          <h3 className="text-lg font-semibold text-white mb-4">
            Interacciones Martina
          </h3>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Cargando estadísticas...</p>
            </div>
          ) : mesesReferencia.length > 0 ? (
            <div ref={interaccionesScrollRef} className="overflow-x-auto" style={{ position: 'relative' }}>
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: '800px' }}>
                <colgroup>
                  <col style={{ width: '200px' }} />
                  {mesesReferencia.map((mes, index) => (
                    <col key={index} style={{ width: '70px' }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-4 text-sm font-semibold text-gray-300 border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1e2139' }}>Interacciones Martina</th>
                    {mesesReferencia.map((mes, index) => {
                      const interaccionMes = martinaInteraccionesStats?.meses?.find(m => m.mesKey === mes.mesKey);
                      return (
                        <th key={index} className="text-center py-2 px-0.5 text-sm font-semibold text-gray-300">
                          {mes.mes}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-700">
                    <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>Interacciones totales</td>
                    {mesesReferencia.map((mes, index) => {
                      const interaccionMes = martinaInteraccionesStats?.meses?.find(m => m.mesKey === mes.mesKey);
                      return (
                        <td key={index} className="text-center py-2 px-0.5 text-sm text-gray-300">
                          {formatNumber(interaccionMes?.interacciones || 0)}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Fortecar (FC) */}
                  <tr>
                    <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>
                      Fortecar (FC)
                    </td>
                    {mesesReferencia.map((mes, index) => {
                      const interaccionMes = martinaInteraccionesStats?.meses?.find(m => m.mesKey === mes.mesKey);
                      return (
                        <td key={index} className="text-center py-2 px-0.5 text-sm text-gray-300">
                          {formatNumber(interaccionMes?.porEmpresa?.FC || 0)}
                        </td>
                      );
                    })}
                  </tr>
                  
                  {/* Granville (GV) */}
                  <tr>
                    <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>
                      Granville (GV)
                    </td>
                    {mesesReferencia.map((mes, index) => {
                      const interaccionMes = martinaInteraccionesStats?.meses?.find(m => m.mesKey === mes.mesKey);
                      return (
                        <td key={index} className="text-center py-2 px-0.5 text-sm text-gray-300">
                          {formatNumber(interaccionMes?.porEmpresa?.GV || 0)}
                        </td>
                      );
                    })}
                  </tr>
                  
                  {/* Pampawagen (PW) */}
                  <tr>
                    <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>
                      Pampawagen (PW)
                    </td>
                    {mesesReferencia.map((mes, index) => {
                      const interaccionMes = martinaInteraccionesStats?.meses?.find(m => m.mesKey === mes.mesKey);
                      return (
                        <td key={index} className="text-center py-2 px-0.5 text-sm text-gray-300">
                          {formatNumber(interaccionMes?.porEmpresa?.PW || 0)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">
                No hay datos de interacciones disponibles
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Verifica que BOT_ANALYZER_MONGODB_URI esté configurada en el backend
              </p>
            </div>
          )}
        </div>

        {/* Tabla de estadísticas mensuales */}
        <div className="bg-background-card border border-gray-700 rounded-lg p-6 fade-in flex-1 min-w-[600px]">
          <h3 className="text-lg font-semibold text-white mb-4">
            Agendamiento Martina
          </h3>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Cargando estadísticas...</p>
            </div>
          ) : mesesReferencia.length > 0 ? (
            <div ref={agendamientoScrollRef} className="overflow-x-auto" style={{ position: 'relative' }}>
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '150px' }} />
                  {mesesReferencia.map((mes, index) => (
                    <col key={index} style={{ width: '90px' }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-4 text-sm font-semibold text-gray-300 border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#1e2139' }}></th>
                    <th className="text-left py-2 px-4 text-sm font-semibold text-gray-300 border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 10, backgroundColor: '#1e2139' }}></th>
                    {mesesReferencia.map((mes, index) => (
                      <th key={index} className="text-center py-2 px-1 text-sm font-semibold text-gray-300">
                        {mes.mes}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Sección Open Cars */}
                  <tr>
                    <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>Open Cars</td>
                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas totales</td>
                    {mesesReferencia.map((mes, index) => (
                      <td key={index} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                        <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(mes.total)}</div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas Martina</td>
                    {mesesReferencia.map((mes, index) => (
                      <td key={index} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                        <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(mes.bot)} <span style={{ color: '#ffffff' }}>({mes.porcentaje}%)</span></div>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-700">
                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Ventas Martina</td>
                    {mesesReferencia.map((mes, index) => {
                      const botExtra = mes.botExtra || 0;
                      const porcentajeBotExtra = mes.bot > 0 ? ((botExtra / mes.bot) * 100).toFixed(1) : '0.0';
                      return (
                        <td key={index} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                          <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(botExtra)} <span style={{ color: '#ffffff' }}>({porcentajeBotExtra}%)</span></div>
                        </td>
                      );
                    })}
                  </tr>
                  
                  {/* Filas expandibles por empresa y taller */}
                  {(() => {
                    // Obtener todas las empresas únicas de todos los meses
                    const empresasUnicas = new Set();
                    mesesReferencia.forEach(mes => {
                      const desglose = mes.desglose || [];
                      desglose.forEach(emp => empresasUnicas.add(emp.empresa));
                    });
                    
                    return Array.from(empresasUnicas).sort().map((empresaCodigo) => {
                      const nombreEmpresa = empresaCodigo === 'FC' ? 'Fortecar' : 
                                           empresaCodigo === 'GV' ? 'Granville' : 
                                           empresaCodigo === 'PW' ? 'Pampawagen' : 
                                           empresaCodigo;
                      
                      // Verificar si alguna empresa está expandida para algún mes
                      const algunaExpandida = mesesReferencia.some(m => isEmpresaExpandida(m.mesKey, empresaCodigo));
                      
                      return (
                        <React.Fragment key={empresaCodigo}>
                          {/* Fila principal de empresa */}
                          <tr 
                            className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                            onClick={() => {
                              // Expandir/colapsar talleres para todos los meses
                              mesesReferencia.forEach(mes => {
                                toggleEmpresa(mes.mesKey, empresaCodigo);
                              });
                            }}
                          >
                            <td className="py-2 px-4 text-sm font-medium text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>
                              <div className="flex items-center gap-2">
                                {algunaExpandida ? (
                                  <FaChevronDown className="text-xs" />
                                ) : (
                                  <FaChevronRight className="text-xs" />
                                )}
                                <span>{nombreEmpresa} ({empresaCodigo})</span>
                              </div>
                            </td>
                            <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas totales</td>
                            {mesesReferencia.map((mes, mIdx) => {
                              const desglose = mes.desglose || [];
                              const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                              
                              if (!empresaData) {
                                return (
                                  <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                    <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                  </td>
                                );
                              }
                              
                              const totalEmpresa = empresaData.talleres.reduce((sum, t) => sum + t.total, 0);
                              
                              return (
                                <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                  <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(totalEmpresa)}</div>
                                </td>
                              );
                            })}
                          </tr>
                          
                          {/* Citas Martina de la empresa */}
                          <tr>
                            <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                            <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas Martina</td>
                            {mesesReferencia.map((mes, mIdx) => {
                              const desglose = mes.desglose || [];
                              const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                              
                              if (!empresaData) {
                                return (
                                  <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                    <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                  </td>
                                );
                              }
                              
                              const botEmpresa = empresaData.talleres.reduce((sum, t) => sum + t.bot, 0);
                              const totalEmpresa = empresaData.talleres.reduce((sum, t) => sum + t.total, 0);
                              const porcentajeEmpresa = totalEmpresa > 0 ? ((botEmpresa / totalEmpresa) * 100).toFixed(1) : '0.0';
                              
                              return (
                                <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                  <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(botEmpresa)} <span style={{ color: '#ffffff' }}>({porcentajeEmpresa}%)</span></div>
                                </td>
                              );
                            })}
                          </tr>
                          
                          {/* Ventas Martina de la empresa */}
                          <tr className="border-b border-gray-700">
                            <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                            <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Ventas Martina</td>
                            {mesesReferencia.map((mes, mIdx) => {
                              const desglose = mes.desglose || [];
                              const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                              
                              if (!empresaData) {
                                return (
                                  <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                    <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                  </td>
                                );
                              }
                              
                              const botEmpresa = empresaData.talleres.reduce((sum, t) => sum + t.bot, 0);
                              const botExtraEmpresa = empresaData.talleres.reduce((sum, t) => sum + t.botExtra, 0);
                              const porcentajeExtraEmpresa = botEmpresa > 0 ? (((botExtraEmpresa / botEmpresa) * 100).toFixed(1)) : '0.0';
                              
                              return (
                                <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                  <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(botExtraEmpresa)} <span style={{ color: '#ffffff' }}>({porcentajeExtraEmpresa}%)</span></div>
                                </td>
                              );
                            })}
                          </tr>
                          
                          {/* Filas de talleres (una fila por taller con todos los meses, agrupados por nombre) */}
                          {(() => {
                            // Agrupar talleres por nombre (normalizado) para evitar duplicados
                            const talleresPorNombre = new Map();
                            
                            mesesReferencia.forEach(mes => {
                              const desglose = mes.desglose || [];
                              const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                              if (empresaData && empresaData.talleres) {
                                empresaData.talleres.forEach(taller => {
                                  // Normalizar el nombre del taller (sin espacios al final)
                                  const nombreNormalizado = (taller.tallerNombre || `Taller ${taller.taller}`).trim();
                                  
                                  if (!talleresPorNombre.has(nombreNormalizado)) {
                                    talleresPorNombre.set(nombreNormalizado, {
                                      nombre: nombreNormalizado,
                                      numerosTaller: []
                                    });
                                  }
                                  
                                  // Agregar el número de taller si no está ya en la lista
                                  const tallerInfo = talleresPorNombre.get(nombreNormalizado);
                                  if (!tallerInfo.numerosTaller.includes(taller.taller)) {
                                    tallerInfo.numerosTaller.push(taller.taller);
                                  }
                                });
                              }
                            });
                            
                            // Verificar si la empresa está expandida para mostrar talleres
                            const algunaExpandida = mesesReferencia.some(m => isEmpresaExpandida(m.mesKey, empresaCodigo));
                            
                            if (!algunaExpandida || talleresPorNombre.size === 0) return null;
                            
                            // Convertir a array y ordenar por nombre
                            const talleresArray = Array.from(talleresPorNombre.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
                            
                            return talleresArray.map((tallerInfo) => {
                              return (
                                <React.Fragment key={`${empresaCodigo}-${tallerInfo.nombre}`}>
                                  {/* Fila principal del taller - Citas totales */}
                                  <tr className="hover:bg-gray-800/30 bg-gray-900/20">
                                    <td className="py-2 px-4 text-sm text-gray-400 pl-8 border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}>
                                      {tallerInfo.nombre}
                                    </td>
                                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas totales</td>
                                    {mesesReferencia.map((mes, mIdx) => {
                                      const desglose = mes.desglose || [];
                                      const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                                      
                                      if (!empresaData) {
                                        return (
                                          <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                            <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                          </td>
                                        );
                                      }
                                      
                                      // Sumar datos de todos los talleres con este nombre
                                      const talleresConEsteNombre = empresaData.talleres.filter(t => {
                                        const nombreT = (t.tallerNombre || `Taller ${t.taller}`).trim();
                                        return nombreT === tallerInfo.nombre;
                                      });
                                      
                                      const total = talleresConEsteNombre.reduce((sum, t) => sum + t.total, 0);
                                      
                                      return (
                                        <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                          <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(total)}</div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                  
                                  {/* Citas Martina del taller */}
                                  <tr className="hover:bg-gray-800/30 bg-gray-900/20">
                                    <td className="py-2 px-4 text-sm text-gray-400 border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Citas Martina</td>
                                    {mesesReferencia.map((mes, mIdx) => {
                                      const desglose = mes.desglose || [];
                                      const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                                      
                                      if (!empresaData) {
                                        return (
                                          <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                            <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                          </td>
                                        );
                                      }
                                      
                                      // Sumar datos de todos los talleres con este nombre
                                      const talleresConEsteNombre = empresaData.talleres.filter(t => {
                                        const nombreT = (t.tallerNombre || `Taller ${t.taller}`).trim();
                                        return nombreT === tallerInfo.nombre;
                                      });
                                      
                                      const bot = talleresConEsteNombre.reduce((sum, t) => sum + t.bot, 0);
                                      const total = talleresConEsteNombre.reduce((sum, t) => sum + t.total, 0);
                                      const porcentaje = total > 0 ? ((bot / total) * 100).toFixed(1) : '0.0';
                                      
                                      return (
                                        <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                          <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(bot)} <span style={{ color: '#ffffff' }}>({porcentaje}%)</span></div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                  
                                  {/* Ventas Martina del taller */}
                                  <tr className="hover:bg-gray-800/30 bg-gray-900/20">
                                    <td className="py-2 px-4 text-sm text-gray-400 border-r border-gray-700" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: '#1e2139' }}></td>
                                    <td className="py-2 px-4 text-sm text-white border-r border-gray-700" style={{ position: 'sticky', left: '200px', zIndex: 9, backgroundColor: '#1e2139' }}>Ventas Martina</td>
                                    {mesesReferencia.map((mes, mIdx) => {
                                      const desglose = mes.desglose || [];
                                      const empresaData = desglose.find(e => e.empresa === empresaCodigo);
                                      
                                      if (!empresaData) {
                                        return (
                                          <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                            <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(0)}</div>
                                          </td>
                                        );
                                      }
                                      
                                      // Sumar datos de todos los talleres con este nombre
                                      const talleresConEsteNombre = empresaData.talleres.filter(t => {
                                        const nombreT = (t.tallerNombre || `Taller ${t.taller}`).trim();
                                        return nombreT === tallerInfo.nombre;
                                      });
                                      
                                      const bot = talleresConEsteNombre.reduce((sum, t) => sum + t.bot, 0);
                                      const botExtra = talleresConEsteNombre.reduce((sum, t) => sum + t.botExtra, 0);
                                      const porcentajeExtra = bot > 0 ? ((botExtra / bot) * 100).toFixed(1) : '0.0';
                                      
                                      return (
                                        <td key={mIdx} className="text-center py-2 px-1 text-sm" style={{ color: '#ffffff' }}>
                                          <div className="font-medium" style={{ color: '#ffffff' }}>{formatNumber(botExtra)} <span style={{ color: '#ffffff' }}>({porcentajeExtra}%)</span></div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </React.Fragment>
                              );
                            });
                          })()}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">
                No hay datos mensuales disponibles
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Verifica que las citas tengan fechas válidas en el campo "Fecha cr"
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Estadisticas;

