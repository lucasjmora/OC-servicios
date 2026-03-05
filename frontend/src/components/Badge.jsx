const Badge = ({ variant = 'default', size = 'md', children, status }) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'danger':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'default':
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-0.5 text-xs';
      case 'lg':
        return 'px-3 py-1 text-sm';
      case 'md':
      default:
        return 'px-2.5 py-0.5 text-xs';
    }
  };

  // Mantener compatibilidad con el sistema anterior basado en status
  const getStatusColors = () => {
    if (status) {
      const statusLower = status?.toLowerCase() || '';
      
      // Estados comunes en español
      if (statusLower.includes('aceptado') || statusLower.includes('completado')) {
        return 'bg-green-100 text-green-800 border border-green-200';
      }
      if (statusLower.includes('espera') || statusLower.includes('pendiente')) {
        return 'bg-red-100 text-red-800 border border-red-200';
      }
      if (statusLower.includes('alerta') || statusLower.includes('cerrado') || statusLower.includes('rechazado') || statusLower.includes('cancelado')) {
        return 'bg-red-100 text-red-800 border border-red-200';
      }
      if (statusLower.includes('abierto') || statusLower.includes('en proceso')) {
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      }
      
      // Color por defecto
      return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
    return '';
  };

  const classes = status ? getStatusColors() : getVariantClasses();
  const sizeClasses = getSizeClasses();

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${classes} ${sizeClasses}`}>
      {children || status}
    </span>
  );
};

export default Badge;




