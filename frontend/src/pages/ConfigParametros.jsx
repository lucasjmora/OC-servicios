import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaCheckCircle,
  FaLightbulb,
  FaFileAlt,
  FaSlidersH
} from 'react-icons/fa';
import ConfigAsistencia from './ConfigAsistencia';
import ConfigOportunidades from './ConfigOportunidades';
import ConfigAccesorios from './ConfigAccesorios';
import PresupCrmConfigGeneral from './presup-crm/PresupCrmConfigGeneral';

const VALID_TABS = ['asistencia', 'oportunidades', 'accesorios', 'presupuestos'];

function tabFromSearchParams(sp) {
  const t = sp.get('tab');
  if (t && VALID_TABS.includes(t)) return t;
  return 'asistencia';
}

const ConfigParametros = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => tabFromSearchParams(searchParams), [searchParams]);

  const selectTab = useCallback(
    (tab) => {
      if (tab === 'asistencia') setSearchParams({});
      else setSearchParams({ tab });
    },
    [setSearchParams]
  );

  return (
    <div className="p-8">
      <div className="flex items-start gap-3 mb-6">
        <FaSlidersH className="text-primary text-3xl mt-1 flex-shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Parámetros</h1>
          <p className="text-gray-400 mt-1">
            Asistencia, oportunidades, accesorios y presupuestos (Presup CRM). Las rutas de ventas (Ctas_PV y balances)
            se definen en el <code className="text-gray-500">.env</code> del servidor y se procesan al importar desde
            Actualización de datos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-700">
        <button
          type="button"
          onClick={() => selectTab('asistencia')}
          className={`px-5 py-3 font-semibold transition-colors text-sm ${
            activeTab === 'asistencia'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <FaCheckCircle className="text-xs" />
            Asistencia
          </span>
        </button>
        <button
          type="button"
          onClick={() => selectTab('oportunidades')}
          className={`px-5 py-3 font-semibold transition-colors text-sm ${
            activeTab === 'oportunidades'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <FaLightbulb className="text-xs" />
            Oportunidades
          </span>
        </button>
        <button
          type="button"
          onClick={() => selectTab('accesorios')}
          className={`px-5 py-3 font-semibold transition-colors text-sm ${
            activeTab === 'accesorios'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <FaCheckCircle className="text-xs" />
            Accesorios
          </span>
        </button>
        <button
          type="button"
          onClick={() => selectTab('presupuestos')}
          className={`px-5 py-3 font-semibold transition-colors text-sm ${
            activeTab === 'presupuestos'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <FaFileAlt className="text-xs" />
            Presupuestos
          </span>
        </button>
      </div>

      <div className="min-h-[200px]">
        {activeTab === 'asistencia' && <ConfigAsistencia embedded />}
        {activeTab === 'oportunidades' && <ConfigOportunidades embedded />}
        {activeTab === 'accesorios' && <ConfigAccesorios embedded />}
        {activeTab === 'presupuestos' && <PresupCrmConfigGeneral embedded />}
      </div>
    </div>
  );
};

export default ConfigParametros;
