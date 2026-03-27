import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { getPresupCrmTalleres, updatePresupCrmTalleres } from '../../services/presupCrmApi';

/**
 * @param {{ embedded?: boolean }} props — sin cabecera ni padding extra (solapa dentro de Mapeo de Campos)
 */
export default function PresupCrmConfigTalleres({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await getPresupCrmTalleres();
      setRows(data.talleres?.length ? data.talleres : [{ codigo: '', nombre: '', activo: true }]);
    } catch (e) {
      setMsg(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setMsg(null);
      await updatePresupCrmTalleres(rows.filter((r) => r.codigo || r.nombre));
      setMsg('Guardado');
    } catch (e) {
      setMsg(e.response?.data?.error || e.message);
    }
  };

  const add = () => setRows([...rows, { codigo: '', nombre: '', activo: true }]);

  if (loading) {
    return (
      <div className={embedded ? 'py-4 text-gray-400' : 'p-8 text-gray-400'}>
        Cargando…
      </div>
    );
  }

  const inner = (
    <>
      {!embedded && (
        <PageHeader
          title="Gestión talleres"
          subtitle="Colección MongoDB Presupuestos.talleres (misma conexión que presup_taller)"
        />
      )}
      {msg && <p className="mb-4 text-sm text-gray-400">{msg}</p>}
      <div className="space-y-2 mb-4">
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
              className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm w-32"
            />
            <input
              placeholder="Nombre"
              value={r.nombre}
              onChange={(e) => {
                const n = [...rows];
                n[i] = { ...n[i], nombre: e.target.value };
                setRows(n);
              }}
              className="flex-1 min-w-[200px] bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
            <label className="flex items-center gap-2 text-gray-300 text-sm">
              <input
                type="checkbox"
                checked={!!r.activo}
                onChange={(e) => {
                  const n = [...rows];
                  n[i] = { ...n[i], activo: e.target.checked };
                  setRows(n);
                }}
              />
              Activo
            </label>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={add} className="px-4 py-2 bg-gray-700 rounded text-white text-sm">
          Agregar fila
        </button>
        <button type="button" onClick={save} className="px-4 py-2 bg-primary rounded text-white text-sm">
          Guardar
        </button>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{inner}</div>;
  }

  return <div className="p-8">{inner}</div>;
}
