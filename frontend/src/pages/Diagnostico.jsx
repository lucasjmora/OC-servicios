import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  Database, 
  FileText, 
  RefreshCw,
  Info
} from 'lucide-react';
import api from '../services/api.js';

export default function Diagnostico() {
  const [diagnostic, setDiagnostic] = useState(null);
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDiagnostic = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [diagnosticRes, filesRes] = await Promise.all([
        api.get('/diagnostic'),
        api.get('/diagnostic/files')
      ]);
      
      setDiagnostic(diagnosticRes.data);
      setFiles(filesRes.data);
    } catch (err) {
      console.error('Error cargando diagnóstico:', err);
      setError(err.response?.data?.error || 'Error cargando diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostic();
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('es-ES');
    } catch {
      return 'Fecha inválida';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span>Cargando diagnóstico...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Diagnóstico del Sistema
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Verificación del estado de la base de datos y archivos
          </p>
        </div>
        <button
          onClick={loadDiagnostic}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {diagnostic && (
        <div className="space-y-6">
          {/* Estado de MongoDB */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Database className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Estado de MongoDB
              </h2>
              {diagnostic.mongodb?.connected ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Estado:</span>
                <span className={`ml-2 ${diagnostic.mongodb?.connected ? 'text-green-600' : 'text-red-600'}`}>
                  {diagnostic.mongodb?.connected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Host:</span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {diagnostic.mongodb?.host || 'N/A'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Base de datos:</span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {diagnostic.mongodb?.name || 'N/A'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Ready State:</span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {diagnostic.mongodb?.readyState || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Estado de las colecciones */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Estado de las Colecciones
              </h2>
            </div>
            
            <div className="space-y-4">
              {diagnostic.collections && Object.entries(diagnostic.collections).map(([name, collection]) => (
                <div key={name} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900 dark:text-white capitalize">
                      {name}
                    </h3>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      collection.count > 0 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {collection.count} documentos
                    </span>
                  </div>
                  
                  {collection.sample && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Muestra de documento:
                      </p>
                      <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                        {JSON.stringify(collection.sample, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Errores */}
          {diagnostic.errors && diagnostic.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
              <div className="flex items-center space-x-2 mb-4">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
                  Errores Detectados
                </h2>
              </div>
              
              <ul className="space-y-2">
                {diagnostic.errors.map((error, index) => (
                  <li key={index} className="text-red-700 dark:text-red-300 text-sm">
                    • {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Configuración */}
          {diagnostic.config && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Info className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Configuración Actual
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">MongoDB URI:</span>
                  <p className="text-gray-600 dark:text-gray-400 break-all">
                    {diagnostic.config.mongodbUri ? 'Configurado' : 'No configurado'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Base de datos:</span>
                  <p className="text-gray-600 dark:text-gray-400">
                    {diagnostic.config.databaseName || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Última importación:</span>
                  <p className="text-gray-600 dark:text-gray-400">
                    {formatDate(diagnostic.config.lastImport?.timestamp)}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Scheduler activo:</span>
                  <p className="text-gray-600 dark:text-gray-400">
                    {diagnostic.config.scheduler?.enabled ? 'Sí' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado de archivos */}
      {files && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <FileText className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Estado de Archivos Excel
            </h2>
          </div>
          
          <div className="space-y-4">
            {files.files && Object.entries(files.files).map(([name, file]) => (
              <div key={name} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white capitalize">
                    {name}
                  </h3>
                  {file.exists ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                
                <div className="text-sm space-y-1">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Ruta:</span>
                    <p className="text-gray-600 dark:text-gray-400 break-all">{file.path}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Existe:</span>
                    <span className={`ml-2 ${file.exists ? 'text-green-600' : 'text-red-600'}`}>
                      {file.exists ? 'Sí' : 'No'}
                    </span>
                  </div>
                  {file.exists && (
                    <>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Tamaño:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Modificado:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {formatDate(file.lastModified)}
                        </span>
                      </div>
                    </>
                  )}
                  {file.error && (
                    <div className="text-red-600 dark:text-red-400">
                      Error: {file.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}





