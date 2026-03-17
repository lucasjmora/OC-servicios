import React from 'react';
import { FaFilter, FaTimes } from 'react-icons/fa';

const Filters = ({ children, onClear, title = "Filtros", columns }) => {
  const gridClass = columns
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
  return (
    <div className="bg-background-card border border-gray-700 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaFilter className="text-gray-400" />
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <FaTimes />
            Limpiar filtros
          </button>
        )}
      </div>
      <div className={gridClass}>
        {children}
      </div>
    </div>
  );
};

const FilterItem = ({ label, children }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
};

Filters.Item = FilterItem;

export default Filters;



