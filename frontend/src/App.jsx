import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import ConfigTalleres from './pages/ConfigTalleres';
import ConfigUsuarios from './pages/ConfigUsuarios';
import ConfigCampos from './pages/ConfigCampos';
import ConfigAsistencia from './pages/ConfigAsistencia';
import ConfigOportunidades from './pages/ConfigOportunidades';
import ConfigAccesorios from './pages/ConfigAccesorios';
import Diagnostico from './pages/Diagnostico';
import BotAnalyzer from './pages/BotAnalyzer';
import BotConversation from './pages/BotConversation';
import Ventas from './pages/Ventas';
import ConfigVentas from './pages/ConfigVentas';
import Objetivos from './pages/Objetivos';
import ORsAbiertas from './pages/ORsAbiertas';
import Reservas from './pages/Reservas';
import Traspasos from './pages/Traspasos';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="objetivos" element={<Objetivos />} />
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
            <Route path="configuracion/talleres" element={<ConfigTalleres />} />
            <Route path="configuracion/usuarios" element={<ConfigUsuarios />} />
            <Route path="configuracion/campos" element={<ConfigCampos />} />
            <Route path="configuracion/asistencia" element={<ConfigAsistencia />} />
            <Route path="configuracion/oportunidades" element={<ConfigOportunidades />} />
            <Route path="configuracion/accesorios" element={<ConfigAccesorios />} />
            <Route path="configuracion/ventas" element={<ConfigVentas />} />
            <Route path="diagnostico" element={<Diagnostico />} />
            <Route path="bot-analyzer/:empresa" element={<BotAnalyzer />} />
            <Route path="bot-analyzer/:empresa/conversation/:sessionId" element={<BotConversation />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;


