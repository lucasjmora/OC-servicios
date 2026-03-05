import { useState } from 'react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FaHome, 
  FaCalendarAlt, 
  FaClipboardList, 
  FaCog,
  FaChevronDown,
  FaChevronRight,
  FaDatabase,
  FaWarehouse,
  FaUsers,
  FaTags,
  FaStethoscope,
  FaEye,
  FaCheckCircle,
  FaLightbulb,
  FaChartBar,
  FaBan,
  FaGavel,
  FaRobot,
  FaDollarSign,
  FaBullseye,
  FaAddressBook,
  FaBriefcase,
  FaFileInvoice,
  FaCalendarCheck,
  FaExchangeAlt
} from 'react-icons/fa';

const Sidebar = () => {
  const [configExpanded, setConfigExpanded] = useState(false);
  const [botAnalyzerExpanded, setBotAnalyzerExpanded] = useState(false);
  const [crmExpanded, setCrmExpanded] = useState(false);
  const [mktExpanded, setMktExpanded] = useState(false);
  const [gestionCasosExpanded, setGestionCasosExpanded] = useState(false);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-primary text-white'
        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
    }`;

  const subNavLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2 pl-12 rounded-lg transition-all duration-200 text-sm ${
      isActive
        ? 'bg-primary/80 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;

  const subNavLinkClassNoBg = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2 pl-12 rounded-lg transition-all duration-200 text-sm ${
      isActive
        ? 'text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;

  const nestedSubNavLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2 pl-16 rounded-lg transition-all duration-200 text-sm ${
      isActive
        ? 'bg-primary/80 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;

  return (
    <div className="w-64 min-h-screen bg-background-sidebar border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <FaWarehouse className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">OC Servicios</h1>
            <p className="text-xs text-gray-400">Gestión de talleres</p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-4 space-y-2">
        <NavLink to="/ventas" className={navLinkClass}>
          <FaDollarSign />
          <span>Ventas</span>
        </NavLink>

        <NavLink to="/objetivos" className={navLinkClass}>
          <FaBullseye />
          <span>Objetivos</span>
        </NavLink>

        <NavLink to="/" className={navLinkClass}>
          <FaHome />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/estadisticas" className={navLinkClass}>
          <FaChartBar />
          <span>Estadísticas</span>
        </NavLink>

        {/* CRM con submenú */}
        <div>
          <button
            onClick={() => setCrmExpanded(!crmExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <FaAddressBook />
              <span>CRM</span>
            </div>
            {crmExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </button>

          {crmExpanded && (
            <div className="mt-1 space-y-1 fade-in">
              {/* BOT Analyzer dentro de CRM */}
              <div className="pl-8">
                <button
                  onClick={() => setBotAnalyzerExpanded(!botAnalyzerExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-all duration-200 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <FaRobot className="text-xs" />
                    <span>BOT Analyzer</span>
                  </div>
                  {botAnalyzerExpanded ? <FaChevronDown className="text-xs" /> : <FaChevronRight className="text-xs" />}
                </button>

                {botAnalyzerExpanded && (
                  <div className="mt-1 space-y-1 fade-in">
                    <NavLink to="/bot-analyzer/fc" className={nestedSubNavLinkClass}>
                      <FaRobot className="text-xs" />
                      <span>Fortecar (FC)</span>
                    </NavLink>

                    <NavLink to="/bot-analyzer/gv" className={nestedSubNavLinkClass}>
                      <FaRobot className="text-xs" />
                      <span>Granville (GV)</span>
                    </NavLink>

                    <NavLink to="/bot-analyzer/pw" className={nestedSubNavLinkClass}>
                      <FaRobot className="text-xs" />
                      <span>Pampawagen (PW)</span>
                    </NavLink>
                  </div>
                )}
              </div>

              <NavLink to="/asistencia" className={subNavLinkClass}>
                <FaEye className="text-xs" />
                <span>Asistencia</span>
              </NavLink>

              <NavLink to="/oportunidades" className={subNavLinkClass}>
                <FaLightbulb className="text-xs" />
                <span>Oportunidades 10k</span>
              </NavLink>

              <NavLink to="/accesorios" className={subNavLinkClass}>
                <FaCheckCircle className="text-xs" />
                <span>Accesorios</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Mkt con submenú - mismo esquema que Configuración */}
        <div>
          <button
            onClick={() => setMktExpanded(!mktExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <FaChartBar />
              <span>Mkt</span>
            </div>
            {mktExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </button>

          {mktExpanded && (
            <div className="mt-1 space-y-1 fade-in">
              <NavLink to="/mkt/db" className={subNavLinkClassNoBg}>
                <FaClipboardList className="text-xs" />
                <span>dB</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Gestión de casos con submenú */}
        <div>
          <button
            onClick={() => setGestionCasosExpanded(!gestionCasosExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <FaBriefcase />
              <span>Gestión de casos</span>
            </div>
            {gestionCasosExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </button>

          {gestionCasosExpanded && (
            <div className="mt-1 space-y-1 fade-in">
              <NavLink to="/unidades-paradas" className={subNavLinkClass}>
                <FaBan className="text-xs" />
                <span>Unidades Paradas</span>
              </NavLink>

              <NavLink to="/legales" className={subNavLinkClass}>
                <FaGavel className="text-xs" />
                <span>Casos Legales</span>
              </NavLink>

              <NavLink to="/ors-abiertas" className={subNavLinkClass}>
                <FaFileInvoice className="text-xs" />
                <span>ORs Abiertas</span>
              </NavLink>

              <NavLink to="/reservas" className={subNavLinkClass}>
                <FaCalendarCheck className="text-xs" />
                <span>Reservas</span>
              </NavLink>

              <NavLink to="/traspasos" className={subNavLinkClass}>
                <FaExchangeAlt className="text-xs" />
                <span>Traspasos</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Configuración con submenú */}
        <div>
          <button
            onClick={() => setConfigExpanded(!configExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <FaCog />
              <span>Configuración</span>
            </div>
            {configExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </button>

          {configExpanded && (
            <div className="mt-1 space-y-1 fade-in">
              <NavLink to="/configuracion/actualizacion" className={subNavLinkClass}>
                <FaDatabase className="text-xs" />
                <span>Actualización de datos</span>
              </NavLink>

              <NavLink to="/configuracion/talleres" className={subNavLinkClass}>
                <FaWarehouse className="text-xs" />
                <span>Gestión Talleres</span>
              </NavLink>

              <NavLink to="/configuracion/usuarios" className={subNavLinkClass}>
                <FaUsers className="text-xs" />
                <span>Gestión Usuarios</span>
              </NavLink>

              <NavLink to="/configuracion/campos" className={subNavLinkClass}>
                <FaTags className="text-xs" />
                <span>Mapeo de Campos</span>
              </NavLink>

              <NavLink to="/configuracion/asistencia" className={subNavLinkClass}>
                <FaCheckCircle className="text-xs" />
                <span>Parámetros de Asistencia</span>
              </NavLink>

              <NavLink to="/configuracion/oportunidades" className={subNavLinkClass}>
                <FaLightbulb className="text-xs" />
                <span>Parámetros de Oportunidades</span>
              </NavLink>

              <NavLink to="/configuracion/accesorios" className={subNavLinkClass}>
                <FaCheckCircle className="text-xs" />
                <span>Parámetros de Accesorios</span>
              </NavLink>

              <NavLink to="/configuracion/ventas" className={subNavLinkClass}>
                <FaDollarSign className="text-xs" />
                <span>Parámetros Ventas</span>
              </NavLink>

              <NavLink to="/diagnostico" className={subNavLinkClass}>
                <FaStethoscope className="text-xs" />
                <span>Diagnóstico</span>
              </NavLink>

              <NavLink to="/citas" className={subNavLinkClass}>
                <FaCalendarAlt className="text-xs" />
                <span>Citas</span>
              </NavLink>

              <NavLink to="/ingresos" className={subNavLinkClass}>
                <FaClipboardList className="text-xs" />
                <span>Ingresos Taller</span>
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 text-center">
          OC Servicios v1.0.0
        </p>
      </div>
    </div>
  );
};

export default Sidebar;


