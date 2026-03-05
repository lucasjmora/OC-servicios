import { useState } from 'react';
import { 
  createUnidadParada,
  getIngresoByReferencia
} from '../services/api';
import { FaTimes, FaTruck, FaSearch, FaPlus, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { safeFormatDate } from '../utils/dateUtils';

const NuevoUnidadParadaModal = ({ onClose, onSuccess }) => {
  const [referencia, setReferencia] = useState('');
  const [ingreso, setIngreso] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleBuscarIngreso = async () => {
    if (!referencia.trim()) {
      setError('Ingrese una referencia');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const response = await getIngresoByReferencia(referencia.trim());
      setIngreso(response.data.data); // Acceder al objeto data dentro de data
      setSuccess('Ingreso encontrado correctamente');
    } catch (error) {
      console.error('Error buscando ingreso:', error);
      if (error.response?.status === 404) {
        setError('No se encontró un ingreso con esa referencia');
      } else {
        setError('Error al buscar el ingreso');
      }
      setIngreso(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCrearCaso = async () => {
    if (!ingreso) {
      setError('Debe buscar un ingreso válido primero');
      return;
    }

    try {
      setSaving(true);
      setError('');
      
      await createUnidadParada({
        ingresoReferencia: referencia.trim()
      });

      setSuccess('Caso creado exitosamente');
      
      // Cerrar modal después de un breve delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }, 1500);
      
    } catch (error) {
      console.error('Error creando caso:', error);
      if (error.response?.status === 409) {
        setError('Ya existe una unidad parada con esa referencia');
      } else {
        setError('Error al crear el caso');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleBuscarIngreso();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaTruck className="text-2xl" />
            <div>
              <h2 className="text-xl font-bold">Nuevo Caso - Unidad Parada</h2>
              <p className="text-primary-light">Crear caso de unidad en taller</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 transition-colors"
          >
            <FaTimes className="text-xl" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Paso 1: Buscar Referencia */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-300">1. Buscar Referencia de OR</h3>
            
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ingrese la referencia de la orden de reparación"
                disabled={loading}
              />
              <button
                onClick={handleBuscarIngreso}
                disabled={loading || !referencia.trim()}
                className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Buscando...
                  </>
                ) : (
                  <>
                    <FaSearch />
                    Buscar
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500/30 text-red-300 px-4 py-3 rounded mb-4 flex items-center gap-2">
                <FaExclamationTriangle />
                {error}
              </div>
            )}

            {success && !ingreso && (
              <div className="bg-green-900/20 border border-green-500/30 text-green-300 px-4 py-3 rounded mb-4 flex items-center gap-2">
                <FaCheck />
                {success}
              </div>
            )}
          </div>

          {/* Paso 2: Mostrar Información del Ingreso */}
          {ingreso && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">2. Verificar Información</h3>
              
              <div className="bg-gray-800 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-300 mb-3">Datos del Ingreso</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-400">Referencia</label>
                    <p className="text-gray-300 font-mono">{ingreso.Referencia}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Cliente</label>
                    <p className="text-gray-300">{ingreso.CLIENTE || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Matrícula</label>
                    <p className="text-gray-300">{ingreso['Matrícula vehí'] || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Modelo</label>
                    <p className="text-gray-300">{ingreso.Modelo || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Taller</label>
                    <p className="text-gray-300">{ingreso['Nombre taller'] || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Fecha Apertura</label>
                    <p className="text-gray-300">{safeFormatDate(ingreso['Fecaper'])}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Fecha Cierre</label>
                    <p className="text-gray-300">{safeFormatDate(ingreso['F cierr']) || 'Abierto'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Estado</label>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      ingreso['F cierr'] 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {ingreso['F cierr'] ? 'Cerrado' : 'Abierto'}
                    </span>
                  </div>
                </div>
              </div>

              {success && ingreso && (
                <div className="bg-green-900/20 border border-green-500/30 text-green-300 px-4 py-3 rounded mb-4 flex items-center gap-2">
                  <FaCheck />
                  {success}
                </div>
              )}

              {/* Botón para crear caso */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearCaso}
                  disabled={saving}
                  className="bg-primary text-white px-6 py-2 rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creando...
                    </>
                  ) : (
                    <>
                      <FaPlus />
                      Crear Caso
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NuevoUnidadParadaModal;
