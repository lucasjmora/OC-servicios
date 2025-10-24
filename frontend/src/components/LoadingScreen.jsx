const LoadingScreen = ({ message = "Cargando..." }) => {
  return (
    <div className="min-h-screen bg-background-main flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
        <p className="text-gray-400 text-lg">{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;











