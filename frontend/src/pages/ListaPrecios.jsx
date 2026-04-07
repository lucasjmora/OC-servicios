import React from 'react';
import PageHeader from '../components/PageHeader';
import { FaTags, FaTools } from 'react-icons/fa';

const ListaPrecios = () => {
  return (
    <div className="p-8">
      <PageHeader
        title="Lista de precios"
        subtitle="Consulta y gestión de precios"
        icon={FaTags}
      />

      <div className="mt-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="bg-background-card border border-gray-700 rounded-lg p-12 text-center max-w-md">
          <FaTools className="text-6xl text-gray-500 mx-auto mb-6" />
          <h2 className="text-2xl font-semibold text-white mb-4">
            En construcción
          </h2>
          <p className="text-gray-400">
            Esta sección está en desarrollo y estará disponible próximamente.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ListaPrecios;
