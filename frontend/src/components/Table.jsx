import React from 'react';

const Table = ({ columns, data, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-background-card border border-gray-700 rounded-lg p-8 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="mt-4 text-gray-400">Cargando datos...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background-card border border-gray-700 rounded-lg p-8 text-center">
        <p className="text-gray-400">No se encontraron resultados</p>
      </div>
    );
  }

  return (
    <div className="bg-background-card border border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-w-full scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        <table className="w-full min-w-max">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap"
                  style={column.width ? { width: column.width, minWidth: column.width, maxWidth: column.width } : {}}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-gray-800/50 transition-colors"
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-4 py-3 text-sm text-gray-300"
                    style={column.width ? { width: column.width, minWidth: column.width, maxWidth: column.width } : {}}
                  >
                    {column.render
                      ? column.render(row[column.key], row)
                      : row[column.key] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Table;


