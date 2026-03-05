import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Configuracion from '../models/Configuracion.js';

// Crear storage dinámico basado en configuración
const getStorage = async () => {
  try {
    const config = await Configuracion.findOne({ singleton: true });
    const rutaAdjuntos = config?.legales?.rutaAdjuntos || 'C:\\legales\\adjuntos';

    // Crear directorio si no existe
    if (!fs.existsSync(rutaAdjuntos)) {
      fs.mkdirSync(rutaAdjuntos, { recursive: true });
    }

    return multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, rutaAdjuntos);
      },
      filename: (req, file, cb) => {
        // Generar nombre único: timestamp-nombreOriginal
        const uniqueName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        cb(null, uniqueName);
      }
    });
  } catch (error) {
    console.error('Error configurando storage:', error);
    // Fallback a directorio por defecto
    const defaultPath = path.join(process.cwd(), 'uploads', 'legales');
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }
    return multer.diskStorage({
      destination: defaultPath,
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        cb(null, uniqueName);
      }
    });
  }
};

// Crear middleware de multer
const createUploadMiddleware = async () => {
  const storage = await getStorage();
  return multer({ 
    storage: storage,
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB máximo
    }
  });
};

export default createUploadMiddleware;




















