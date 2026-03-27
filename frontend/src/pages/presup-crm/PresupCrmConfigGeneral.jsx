import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import {
  getPresupCrmGeneral,
  updatePresupCrmGeneral,
  getPresupCrmAceites,
  updatePresupCrmAceites
} from '../../services/presupCrmApi';
import { FaInfoCircle, FaOilCan } from 'react-icons/fa';

const DEFAULT_GENERAL = {
  periodoDiasPendiente: 7,
  directorioAdjuntos: ''
};

export default function PresupCrmConfigGeneral({ embedded = false }) {
  const [general, setGeneral] = useState(DEFAULT_GENERAL);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [msgAceites, setMsgAceites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAceites, setSavingAceites] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: g }, { data: a }] = await Promise.all([
          getPresupCrmGeneral(),
          getPresupCrmAceites()
        ]);
        setGeneral({ ...DEFAULT_GENERAL, ...(g.general || {}) });
        setRows(a.aceites?.length ? a.aceites : [{ codigo: '', descripcion: '', precio: 0 }]);
      } catch (e) {
        setMsg({ type: 'err', text: e.response?.data?.error || e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveGeneral = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const dias = Math.min(365, Math.max(1, parseInt(general.periodoDiasPendiente, 10) || 7));
      const { data: latest } = await getPresupCrmGeneral();
      const payload = {
        ...(latest.general || {}),
        ...general,
        periodoDiasPendiente: dias,
        directorioAdjuntos: String(general.directorioAdjuntos || '').trim()
      };
      await updatePresupCrmGeneral(payload);
      setGeneral({ ...DEFAULT_GENERAL, ...payload });
      setMsg({ type: 'ok', text: 'Configuración general guardada correctamente.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  };

  const saveAceites = async () => {
    try {
      setSavingAceites(true);
      setMsgAceites(null);
      await updatePresupCrmAceites(rows.filter((r) => r.codigo || r.descripcion));
      setMsgAceites({ type: 'ok', text: 'Listado de aceites guardado correctamente.' });
    } catch (e) {
      setMsgAceites({ type: 'err', text: e.response?.data?.error || e.message });
    } finally {
      setSavingAceites(false);
    }
  };

  const addAceiteRow = () => setRows([...rows, { codigo: '', descripcion: '', precio: 0 }]);

  const dias = Math.min(365, Math.max(1, parseInt(general.periodoDiasPendiente, 10) || 7));
  const horas = dias * 24;

  if (loading) {
    return (
      <div className={embedded ? 'text-gray-400 py-4' : 'p-8 text-gray-400'}>Cargando…</div>
    );
  }

  return (
    <div className={embedded ? 'max-w-4xl' : 'p-8 max-w-4xl'}>
      {!embedded && (
        <PageHeader
          title="Parámetros de presupuestos"
          subtitle="Subestados, archivos adjuntos y catálogo de aceites (Presup CRM)"
        />
      )}

      {msg && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            msg.type === 'err' ? 'bg-red-900/40 text-red-200' : 'bg-green-900/40 text-green-200'
          }`}
        >
          {typeof msg === 'string' ? msg : msg.text}
        </div>
      )}

      <div className="space-y-10">
        {/* —— General: subestados y adjuntos —— */}
        <div className="space-y-8">
          <h2 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">
            Configuración general
          </h2>

          {/* Subestados */}
          <section className="bg-background-card border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Configuración de Subestados</h3>
            <div className="max-w-md">
              <label className="block text-sm text-gray-400 mb-2">
                Periodo para cambio a &quot;Pendiente&quot; (días)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={general.periodoDiasPendiente ?? 7}
                onChange={(e) =>
                  setGeneral((g) => ({ ...g, periodoDiasPendiente: parseInt(e.target.value, 10) || 1 }))
                }
                className="w-32 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg text-sm text-gray-300">
              <div className="flex gap-2 font-medium text-blue-200 mb-2">
                <FaInfoCircle className="mt-0.5 flex-shrink-0" />
                Información sobre Subestados
              </div>
              <p className="text-gray-400 leading-relaxed">
                La referencia temporal es el <strong className="text-gray-300">máximo</strong> entre la fecha de
                creación del presupuesto y la fecha del último comentario CRM. Si la diferencia en días de
                calendario (local) respecto a hoy es <strong className="text-gray-300">mayor o igual</strong> al
                periodo configurado, el subestado bajo &quot;abierto&quot; es{' '}
                <strong className="text-gray-300">Pendiente</strong>
                (SLA); en caso contrario <strong className="text-gray-300">En espera</strong>. Por defecto 7 días.
              </p>
            </div>
          </section>

          {/* Adjuntos */}
          <section className="bg-background-card border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Configuración de Archivos Adjuntos</h3>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Directorio de almacenamiento</label>
              <input
                type="text"
                value={general.directorioAdjuntos || ''}
                onChange={(e) => setGeneral((g) => ({ ...g, directorioAdjuntos: e.target.value }))}
                placeholder="C:\ruta\carpeta\attachments"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono"
              />
            </div>
            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg text-sm text-gray-300">
              <div className="flex gap-2 font-medium text-blue-200 mb-2">
                <FaInfoCircle className="mt-0.5 flex-shrink-0" />
                Información sobre Archivos Adjuntos
              </div>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>Tipos habituales: PDF, imágenes (JPG, PNG); tamaño máximo recomendado 50 MB por archivo.</li>
                <li>El servidor debe tener permisos de lectura/escritura en la ruta indicada.</li>
                <li>En entornos multiusuario, use una carpeta de red o OneDrive compartido coherente con el backend.</li>
              </ul>
            </div>
          </section>

          {/* Resumen */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4">Resumen</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800/80 border border-gray-600 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Periodo para Pendiente</p>
                <p className="text-white font-semibold">
                  {dias} días ({horas} horas)
                </p>
              </div>
              <div className="bg-gray-800/80 border border-gray-600 rounded-lg p-4 md:col-span-1">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Directorio adjuntos</p>
                <p className="text-gray-200 text-sm break-all font-mono">
                  {general.directorioAdjuntos?.trim() || '— (no configurado)'}
                </p>
              </div>
              <div className="bg-gray-800/80 border border-gray-600 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Estado del sistema</p>
                <p className="text-green-400 font-semibold">Activo</p>
                <p className="text-xs text-gray-500 mt-1">Configuración aplicada al guardar</p>
              </div>
            </div>
          </section>

          <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg text-sm text-amber-100/90">
            <strong className="text-amber-200">Importante:</strong> los cambios de esta sección se aplican al
            pulsar Guardar y afectan al módulo de presupuestos integrado en OC Servicios. Revise la ruta de
            adjuntos en el servidor donde corre el backend.
          </div>

          <button
            type="button"
            onClick={saveGeneral}
            disabled={saving}
            className="px-8 py-3 bg-primary rounded-lg text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar configuración general'}
          </button>
        </div>

        {/* —— Listado aceites —— */}
        <div className="space-y-4 border-t border-gray-700 pt-10">
          <div className="flex items-center gap-2 text-white">
            <FaOilCan className="text-primary" />
            <h2 className="text-xl font-semibold">Listado de aceites</h2>
          </div>
          <p className="text-sm text-gray-400">
            Catálogo de códigos y precios utilizado en presupuestos. Guarde los cambios con el botón inferior.
          </p>

          {msgAceites && (
            <div
              className={`p-3 rounded text-sm ${
                msgAceites.type === 'err' ? 'bg-red-900/40 text-red-200' : 'bg-green-900/40 text-green-200'
              }`}
            >
              {typeof msgAceites === 'string' ? msgAceites : msgAceites.text}
            </div>
          )}

          <div className="bg-background-card border border-gray-700 rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <input
                    placeholder="Código"
                    value={r.codigo}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], codigo: e.target.value };
                      setRows(n);
                    }}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm w-28"
                  />
                  <input
                    placeholder="Descripción"
                    value={r.descripcion}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], descripcion: e.target.value };
                      setRows(n);
                    }}
                    className="flex-1 min-w-[200px] bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Precio"
                    value={r.precio}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], precio: parseFloat(e.target.value) || 0 };
                      setRows(n);
                    }}
                    className="w-28 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={addAceiteRow}
                className="px-4 py-2 bg-gray-700 rounded text-white text-sm hover:bg-gray-600"
              >
                Agregar fila
              </button>
              <button
                type="button"
                onClick={saveAceites}
                disabled={savingAceites}
                className="px-4 py-2 bg-primary rounded text-white text-sm hover:opacity-90 disabled:opacity-50"
              >
                {savingAceites ? 'Guardando…' : 'Guardar listado de aceites'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
