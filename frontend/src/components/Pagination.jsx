import React from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems }) => {
  const hasTotalCount = totalItems !== undefined && totalItems !== null;
  const tp = Number(totalPages);
  const displayTotalPages =
    Number.isFinite(tp) && tp >= 1 ? tp : 1;
  const showNav = displayTotalPages > 1;

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < displayTotalPages;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(displayTotalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  if (!hasTotalCount && displayTotalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background-card border border-gray-700 rounded-lg mt-4">
      <div className="text-sm text-gray-400">
        Mostrando página <span className="font-semibold text-white">{currentPage}</span> de{' '}
        <span className="font-semibold text-white">{displayTotalPages}</span>
        {hasTotalCount && (
          <span className="ml-2">
            ({totalItems} registros totales)
          </span>
        )}
      </div>
      
      {showNav ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrev}
            className="px-3 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <FaChevronLeft className="text-xs" />
            Anterior
          </button>
          
          <div className="flex gap-1">
            {getPageNumbers().map(page => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-2 rounded transition-colors ${
                  page === currentPage
                    ? 'bg-primary text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            className="px-3 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Siguiente
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default Pagination;



