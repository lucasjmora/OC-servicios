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
  FaLightbulb
} from 'react-icons/fa';

const Sidebar = () => {
  const [configExpanded, setConfigExpanded] = useState(false);

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
        <NavLink to="/" className={navLinkClass}>
          <FaHome />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/oportunidades" className={navLinkClass}>
          <FaLightbulb />
          <span>Oportunidades</span>
        </NavLink>

        <NavLink to="/asistencia" className={navLinkClass}>
          <FaEye />
          <span>Asistencia</span>
        </NavLink>

        <NavLink to="/citas" className={navLinkClass}>
          <FaCalendarAlt />
          <span>Citas</span>
        </NavLink>

        <NavLink to="/ingresos" className={navLinkClass}>
          <FaClipboardList />
          <span>Ingresos Taller</span>
        </NavLink>

        {/* Configuración con submenú - Orden actualizado */}
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

              <NavLink to="/diagnostico" className={subNavLinkClass}>
                <FaStethoscope className="text-xs" />
                <span>Diagnóstico</span>
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


