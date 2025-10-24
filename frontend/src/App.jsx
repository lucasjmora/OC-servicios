import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Citas from './pages/Citas';
import Ingresos from './pages/Ingresos';
import Asistencia from './pages/Asistencia';
import Oportunidades from './pages/Oportunidades';
import ConfigActualizacion from './pages/ConfigActualizacion';
import ConfigTalleres from './pages/ConfigTalleres';
import ConfigUsuarios from './pages/ConfigUsuarios';
import ConfigCampos from './pages/ConfigCampos';
import ConfigAsistencia from './pages/ConfigAsistencia';
import ConfigOportunidades from './pages/ConfigOportunidades';
import Diagnostico from './pages/Diagnostico';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="citas" element={<Citas />} />
            <Route path="ingresos" element={<Ingresos />} />
            <Route path="asistencia" element={<Asistencia />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="configuracion/actualizacion" element={<ConfigActualizacion />} />
            <Route path="configuracion/talleres" element={<ConfigTalleres />} />
            <Route path="configuracion/usuarios" element={<ConfigUsuarios />} />
            <Route path="configuracion/campos" element={<ConfigCampos />} />
            <Route path="configuracion/asistencia" element={<ConfigAsistencia />} />
            <Route path="configuracion/oportunidades" element={<ConfigOportunidades />} />
            <Route path="diagnostico" element={<Diagnostico />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;


