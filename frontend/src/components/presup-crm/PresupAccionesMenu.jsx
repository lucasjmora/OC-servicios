import { FaCommentDots, FaEye } from 'react-icons/fa';

/**
 * Acciones por fila: ver detalle (ojo). El globo de comentarios solo muestra la cantidad (sin interacción).
 */
export default function PresupAccionesMenu({ referencia, comentariosCount = 0, onVerDetalle }) {
  const ref = referencia;

  return (
    <div className="inline-flex items-center justify-center gap-1">
      <button
        type="button"
        className="inline-flex items-center justify-center p-2 rounded-lg text-slate-200 hover:bg-slate-700/90 hover:text-white transition-colors"
        title="Ver detalle del presupuesto"
        aria-label={`Ver detalle del presupuesto ${ref}`}
        onClick={() => onVerDetalle(ref)}
      >
        <FaEye className="text-xl text-violet-400" />
      </button>
      {/* Solo indicador: capturamos eventos para que ningún padre (ni JS antiguo en caché) abra modales */}
      <span
        className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-400 text-xs tabular-nums cursor-default select-none pointer-events-auto"
        title="Cantidad de comentarios (Excel + CRM)"
        role="presentation"
        tabIndex={-1}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
      >
        <FaCommentDots className="text-lg text-sky-400/90 pointer-events-none" aria-hidden />
        <span className="font-medium text-slate-300 pointer-events-none">{comentariosCount ?? 0}</span>
      </span>
    </div>
  );
}
