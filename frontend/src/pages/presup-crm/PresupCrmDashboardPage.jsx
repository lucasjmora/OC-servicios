import PresupCrmDashboardPanel from './PresupCrmDashboardPanel';

/** Vista completa alineada a OC Presup CRM (cabecera incluida en el panel). */
export default function PresupCrmDashboardPage() {
  return (
    <div className="w-full min-w-0 max-w-none box-border px-4 sm:px-6 xl:px-10 py-6">
      <PresupCrmDashboardPanel />
    </div>
  );
}
