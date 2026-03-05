import { useEffect, useState } from 'react';
import { getConfigVentas, updateConfigVentas, procesarVentas } from '../services/api';
import PageHeader from '../components/PageHeader';
import { FaSave, FaInfoCircle, FaFileExcel, FaFolder, FaSync } from 'react-icons/fa';

const ConfigVentas = () => {
  const [config, setConfig] = useState({
    rutaCtasPV: '',
    rutaBalances: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await getConfigVentas();
      
      if (response.data.success) {
        setConfig({
          rutaCtasPV: response.data.rutaCtasPV || '',
          rutaBalances: response.data.rutaBalances || ''
        });
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      setMessage('Error cargando configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');

      await updateConfigVentas({
        rutaCtasPV: config.rutaCtasPV.trim(),
        rutaBalances: config.rutaBalances.trim()
      });

      setMessage('Configuración guardada exitosamente');
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error guardando configuración:', error);
      setMessage('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleProcesar = async () => {
    try {
      setProcesando(true);
      setMessage('');

      const response = await procesarVentas();
      
      if (response.data.success) {
        const { procesados, errores } = response.data.data;
        setMessage(`Procesamiento completado: ${procesados} meses procesados, ${errores} errores`);
      } else {
        setMessage('Error en el procesamiento');
      }
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Error procesando ventas:', error);
      setMessage('Error procesando ventas: ' + (error.response?.data?.message || error.message));
    } finally {
      setProcesando(false);
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
    setMessage(''); // Limpiar mensaje al cambiar
  };

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader title="Parámetros Ventas" />
        <div className="bg-background-card border border-gray-700 rounded-lg p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-400">Cargando configuración...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader 
        title="Parámetros Ventas" 
        subtitle="Configuración de archivos Excel para procesamiento de ventas"
      />

      <div className="bg-background-card border border-gray-700 rounded-lg p-6">
        <div className="max-w-2xl mx-auto">
          {/* Información general */}
          <div className="mb-8">
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <FaInfoCircle className="text-blue-400 mt-1 flex-shrink-0" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-2">¿Cómo funciona el procesamiento de ventas?</p>
                <ul className="space-y-1 text-blue-200">
                  <li>• Se lee el archivo Ctas_PV.xlsx que contiene las cuentas contables del área de postventa</li>
                  <li>• Se procesan los archivos balance mensuales (formato: MM_YYYY.xlsx, ej: 10_2025.xlsx)</li>
                  <li>• Se conectan por el campo CM (Ctas_PV) = Cuenta mayor (balance)</li>
                  <li>• Se agrupan los saldos por Tipo_cta (Venta, Descuento, Costo) y se invierten signos según reglas</li>
                  <li>• Los datos se actualizan automáticamente cada vez que se ejecuta la importación</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Configuración principal */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <FaFileExcel className="text-green-400" />
                Ruta del archivo Ctas_PV.xlsx
              </label>
              <input
                type="text"
                value={config.rutaCtasPV}
                onChange={(e) => handleChange('rutaCtasPV', e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="C:\ruta\al\archivo\Ctas_PV.xlsx"
              />
              <p className="text-sm text-gray-400 mt-2">
                Archivo Excel que contiene la tabla de cuentas contables del área de postventa.
                <br />
                Debe contener las columnas: CM, Tipo_cta, y otras columnas descriptivas.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <FaFolder className="text-blue-400" />
                Ruta de la carpeta de balances mensuales
              </label>
              <input
                type="text"
                value={config.rutaBalances}
                onChange={(e) => handleChange('rutaBalances', e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="C:\ruta\a\carpeta\balances"
              />
              <p className="text-sm text-gray-400 mt-2">
                Carpeta que contiene los archivos balance Excel por mes.
                <br />
                Formato de archivos: MM_YYYY.xlsx (ejemplo: 10_2025.xlsx para octubre 2025)
                <br />
                Cada archivo debe contener las columnas: Cuenta mayor, Titulo, Saldo mes
              </p>
            </div>

            {/* Mensaje de estado */}
            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('Error') 
                  ? 'bg-red-900/20 border border-red-500/30 text-red-300' 
                  : 'bg-green-900/20 border border-green-500/30 text-green-300'
              }`}>
                {message}
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleProcesar}
                disabled={procesando || !config.rutaCtasPV.trim() || !config.rutaBalances.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {procesando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <FaSync />
                    <span>Procesar Ventas Ahora</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !config.rutaCtasPV.trim() || !config.rutaBalances.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <FaSave />
                    <span>Guardar Configuración</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Información adicional */}
          <div className="mt-8 p-4 bg-gray-800/50 border border-gray-600 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Configuración Actual</h4>
            <div className="text-sm text-gray-400 space-y-1">
              <p>• Archivo Ctas_PV: <span className="text-white font-mono text-xs">{config.rutaCtasPV || 'No configurado'}</span></p>
              <p>• Carpeta balances: <span className="text-white font-mono text-xs">{config.rutaBalances || 'No configurado'}</span></p>
              <p className="mt-2 text-yellow-400">• Los datos se procesarán automáticamente en la próxima importación</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigVentas;

