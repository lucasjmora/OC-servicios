import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Citas from './pages/Citas';
import Ingresos from './pages/Ingresos';
import Asistencia from './pages/Asistencia';
import Oportunidades from './pages/Oportunidades';
import Accesorios from './pages/Accesorios';
import UnidadesParadas from './pages/UnidadesParadas';
import Legales from './pages/Legales';
import Estadisticas from './pages/Estadisticas';
import ConfigActualizacion from './pages/ConfigActualizacion';
import ConfigCampos from './pages/ConfigCampos';
import ConfigParametros from './pages/ConfigParametros';
import BotAnalyzer from './pages/BotAnalyzer';
import BotConversation from './pages/BotConversation';
import Ventas from './pages/Ventas';
import Objetivos from './pages/Objetivos';
import ListaPrecios from './pages/ListaPrecios';
import ORsAbiertas from './pages/ORsAbiertas';
import Reservas from './pages/Reservas';
import Traspasos from './pages/Traspasos';
import PresupCrmDashboardPage from './pages/presup-crm/PresupCrmDashboardPage';
import PresupCrmPresupuestos from './pages/presup-crm/PresupCrmPresupuestos';
import PresupCrmPresupuestoDetallePage from './pages/presup-crm/PresupCrmPresupuestoDetallePage';
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="objetivos" element={<Objetivos />} />
            <Route path="lista-precios" element={<ListaPrecios />} />
            <Route path="citas" element={<Citas />} />
            <Route path="ingresos" element={<Ingresos key="ingresos" />} />
            <Route path="mkt/db" element={<Ingresos key="mkt-db" onlyEstadC />} />
            <Route path="asistencia" element={<Asistencia />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="accesorios" element={<Accesorios />} />
            <Route path="unidades-paradas" element={<UnidadesParadas />} />
            <Route path="legales" element={<Legales />} />
            <Route path="ors-abiertas" element={<ORsAbiertas />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="traspasos" element={<Traspasos />} />
            <Route path="estadisticas" element={<Estadisticas />} />
            <Route path="configuracion/actualizacion" element={<ConfigActualizacion />} />
            <Route
              path="configuracion/talleres"
              element={<Navigate to="/configuracion/campos?tab=gestion-talleres" replace />}
            />
            <Route
              path="configuracion/usuarios"
              element={<Navigate to="/configuracion/campos?tab=gestion-usuarios" replace />}
            />
            <Route path="configuracion/campos" element={<ConfigCampos />} />
            <Route path="configuracion/parametros" element={<ConfigParametros />} />
            <Route
              path="configuracion/asistencia"
              element={<Navigate to="/configuracion/parametros?tab=asistencia" replace />}
            />
            <Route
              path="configuracion/oportunidades"
              element={<Navigate to="/configuracion/parametros?tab=oportunidades" replace />}
            />
            <Route
              path="configuracion/accesorios"
              element={<Navigate to="/configuracion/parametros?tab=accesorios" replace />}
            />
            <Route
              path="configuracion/ventas"
              element={<Navigate to="/configuracion/actualizacion" replace />}
            />
            <Route path="bot-analyzer/:empresa" element={<BotAnalyzer />} />
            <Route path="bot-analyzer/:empresa/conversation/:sessionId" element={<BotConversation />} />
            <Route path="presup-crm/dashboard" element={<PresupCrmDashboardPage />} />
            <Route path="presup-crm/presupuesto/:referencia" element={<PresupCrmPresupuestoDetallePage />} />
            <Route path="presup-crm/presupuestos" element={<PresupCrmPresupuestos />} />
            <Route
              path="presup-crm/config/carga"
              element={<Navigate to="/configuracion/actualizacion" replace />}
            />
            <Route
              path="presup-crm/config/talleres"
              element={<Navigate to="/configuracion/campos?tab=talleres-presup" replace />}
            />
            <Route
              path="presup-crm/config/aceites"
              element={<Navigate to="/configuracion/parametros?tab=presupuestos" replace />}
            />
            <Route
              path="presup-crm/config/general"
              element={<Navigate to="/configuracion/parametros?tab=presupuestos" replace />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;


