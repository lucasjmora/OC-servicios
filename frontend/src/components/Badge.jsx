const Badge = ({ status, children }) => {
  const getStatusColors = () => {
    const statusLower = status?.toLowerCase() || '';
    
    // Estados comunes en español
    if (statusLower.includes('aceptado') || statusLower.includes('completado')) {
      return 'bg-status-success text-white';
    }
    if (statusLower.includes('espera') || statusLower.includes('pendiente')) {
      return 'bg-status-warning text-white';
    }
    if (statusLower.includes('alerta') || statusLower.includes('rechazado') || statusLower.includes('cancelado')) {
      return 'bg-status-danger text-white';
    }
    
    // Color por defecto
    return 'bg-gray-600 text-white';
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColors()}`}>
      {children || status}
    </span>
  );
};

export default Badge;




