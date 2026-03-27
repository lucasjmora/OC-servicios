import { useEffect, useState } from 'react';
import { getMappings, updateMappings, getUniqueValues } from '../services/api';
import { FaUsers, FaCheckCircle, FaExclamationTriangle, FaSave, FaSearch } from 'react-icons/fa';

/**
 * Mapeo código de usuario (campo Usuario en citas) → nombre legible.
 * Usado dentro de Mapeo de Campos (solapa) o redirección desde /configuracion/usuarios.
 */
export default function ConfigUsuariosPanel({ embedded = false }) {
  const [usuariosCodigos, setUsuariosCodigos] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [citasRes, mappingsRes] = await Promise.all([
          getUniqueValues('citas', 'Usuario'),
          getMappings('usuarios')
        ]);
        if (cancelled) return;
        setUsuariosCodigos((citasRes.data || []).sort());
        setMappings(mappingsRes.data || {});
      } catch (error) {
        console.error('Error cargando usuarios:', error);
        if (!cancelled) setMessage({ type: 'error', text: 'Error cargando datos de usuarios' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMappingChange = (codigo, nombre) => {
    setMappings((prev) => ({
      ...prev,
      [codigo]: nombre
    }));
  };

  const handleSaveMappings = async () => {
    try {
      setSaving(true);
      await updateMappings('usuarios', mappings);
      setMessage({ type: 'success', text: 'Mapeos de usuarios guardados correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Error guardando mapeos' });
    } finally {
      setSaving(false);
    }
  };

  const configurados = usuariosCodigos.filter((codigo) => mappings[codigo]);
  const sinConfigurar = usuariosCodigos.filter((codigo) => !mappings[codigo]);

  const filteredCodigos = usuariosCodigos.filter((codigo) => {
    if (!searchTerm) return true;
    const codigoStr = String(codigo).toLowerCase();
    const nombre = mappings[codigo]?.toLowerCase() || '';
    return codigoStr.includes(searchTerm.toLowerCase()) || nombre.includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className={embedded ? 'py-8' : 'p-8'}>
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
          <p className="mt-4 text-gray-400">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-8'}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestión de Usuarios</h1>
            <p className="text-gray-400 mt-1">Configura los códigos y nombres de los usuarios</p>
          </div>
          <button
            type="button"
            onClick={handleSaveMappings}
            disabled={saving}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
          >
            <FaSave />
            {saving ? 'Guardando...' : 'Guardar Todos'}
          </button>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <p className="text-sm text-gray-400 max-w-3xl">
            Códigos del campo <strong className="text-gray-300">Usuario</strong> en la colección{' '}
            <strong className="text-gray-300">citas</strong>. El nombre se usa en listados, dashboard (p. ej. Martina)
            y métricas.
          </p>
          <button
            type="button"
            onClick={handleSaveMappings}
            disabled={saving}
            className="shrink-0 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
          >
            <FaSave />
            {saving ? 'Guardando...' : 'Guardar usuarios'}
          </button>
        </div>
      )}

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border fade-in ${
            message.type === 'success'
              ? 'bg-status-success/10 border-status-success text-status-success'
              : 'bg-status-danger/10 border-status-danger text-status-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Códigos</p>
              <p className="text-3xl font-bold text-white mt-2">{usuariosCodigos.length}</p>
            </div>
            <FaUsers className="text-4xl text-primary" />
          </div>
        </div>

        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Configurados</p>
              <p className="text-3xl font-bold text-status-success mt-2">{configurados.length}</p>
            </div>
            <FaCheckCircle className="text-4xl text-status-success" />
          </div>
        </div>

        <div className="bg-background-card border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Sin Configurar</p>
              <p className="text-3xl font-bold text-status-warning mt-2">{sinConfigurar.length}</p>
            </div>
            <FaExclamationTriangle className="text-4xl text-status-warning" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-1/4">
                  Código de Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Nombre del Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider w-32">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCodigos.map((codigo) => (
                <tr key={codigo} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-primary font-semibold">{codigo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={mappings[codigo] || ''}
                      onChange={(e) => handleMappingChange(codigo, e.target.value)}
                      placeholder="Ingrese el nombre del usuario..."
                      className="w-full"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {mappings[codigo] ? (
                      <span className="inline-flex items-center gap-1 text-status-success text-sm">
                        <FaCheckCircle />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-status-warning text-sm">
                        <FaExclamationTriangle />
                        Sin configurar
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCodigos.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No se encontraron usuarios con los criterios de búsqueda
        </div>
      )}
    </div>
  );
}
