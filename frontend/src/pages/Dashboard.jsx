import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  FaCalendarAlt, 
  FaClipboardList, 
  FaDatabase,
  FaCheckCircle,
  FaExclamationTriangle
} from 'react-icons/fa';
import PageHeader from '../components/PageHeader';
import { getImportStatus, getCitas, getIngresos } from '../services/api';
import { safeFormatDateTime } from '../utils/dateUtils';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCitas: 0,
    totalIngresos: 0
  });
  const [lastImport, setLastImport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Obtener estadísticas
      const [citasRes, ingresosRes, importRes] = await Promise.all([
        getCitas({ page: 1, limit: 1 }),
        getIngresos({ page: 1, limit: 1 }),
        getImportStatus()
      ]);
      
      setStats({
        totalCitas: citasRes.data.pagination.total,
        totalIngresos: ingresosRes.data.pagination.total
      });
      
      setLastImport(importRes.data.lastImport);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, color, link }) => (
    <Link
      to={link}
      className="bg-background-card border border-gray-700 rounded-lg p-6 hover:border-primary transition-all duration-200 fade-in"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">
            {loading ? '...' : value.toLocaleString()}
          </p>
        </div>
        <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="text-white text-xl" />
        </div>
      </div>
    </Link>
  );

  return (
    <div className="p-8">
      <PageHeader 
        title="Dashboard" 
        subtitle="Resumen de OC Servicios"
      />

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={FaCalendarAlt}
          title="Total Citas"
          value={stats.totalCitas}
          color="bg-primary"
          link="/citas"
        />
        
        <StatCard
          icon={FaClipboardList}
          title="Total Ingresos"
          value={stats.totalIngresos}
          color="bg-status-info"
          link="/ingresos"
        />
        
        <div className="bg-background-card border border-gray-700 rounded-lg p-6 fade-in">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Última Importación</p>
              {lastImport ? (
                <>
                  <p className="text-lg font-semibold text-white mt-2">
                    {safeFormatDateTime(lastImport.timestamp)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {lastImport.status === 'success' ? (
                      <FaCheckCircle className="text-status-success" />
                    ) : (
                      <FaExclamationTriangle className="text-status-warning" />
                    )}
                    <span className="text-sm text-gray-400">
                      {lastImport.status === 'success' ? 'Exitosa' : 'Con errores'}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-white mt-2">No disponible</p>
              )}
            </div>
            <div className="w-12 h-12 rounded-lg bg-status-success flex items-center justify-center">
              <FaDatabase className="text-white text-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Último resumen de importación */}
      {lastImport && lastImport.summary && (
        <div className="bg-background-card border border-gray-700 rounded-lg p-6 fade-in">
          <h3 className="text-lg font-semibold text-white mb-4">
            Resumen de Última Importación
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Citas Nuevas</p>
              <p className="text-2xl font-bold text-status-success mt-1">
                {lastImport.summary.citasNuevas}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Citas Actualizadas</p>
              <p className="text-2xl font-bold text-status-info mt-1">
                {lastImport.summary.citasActualizadas}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Ingresos Nuevos</p>
              <p className="text-2xl font-bold text-status-success mt-1">
                {lastImport.summary.ingresosNuevos}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Ingresos Actualizados</p>
              <p className="text-2xl font-bold text-status-info mt-1">
                {lastImport.summary.ingresosActualizados}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Enlaces rápidos */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4">Accesos Rápidos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/configuracion/actualizacion"
            className="bg-background-card border border-gray-700 rounded-lg p-4 hover:border-primary transition-all duration-200 flex items-center gap-4"
          >
            <FaDatabase className="text-primary text-2xl" />
            <div>
              <p className="font-semibold text-white">Actualizar Datos</p>
              <p className="text-sm text-gray-400">Importar archivos Excel</p>
            </div>
          </Link>
          
          <Link
            to="/configuracion/talleres"
            className="bg-background-card border border-gray-700 rounded-lg p-4 hover:border-primary transition-all duration-200 flex items-center gap-4"
          >
            <FaDatabase className="text-primary text-2xl" />
            <div>
              <p className="font-semibold text-white">Gestión Talleres</p>
              <p className="text-sm text-gray-400">Configurar mapeos</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


