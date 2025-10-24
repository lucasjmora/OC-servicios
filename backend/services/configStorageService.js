/**
 * Servicio de Almacenamiento de Configuración Local
 * Almacena la configuración de conexión en archivos JSON para persistencia
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de rutas
const CONFIG_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class ConfigStorageService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Inicializa el servicio
   */
  async initialize() {
    try {
      await this.ensureDirectory();
      await this.loadConfig();
      this.isInitialized = true;
      console.log('✅ Servicio de almacenamiento de configuración inicializado');
    } catch (error) {
      console.error('❌ Error inicializando almacenamiento de configuración:', error);
      throw error;
    }
  }

  /**
   * Asegura que el directorio de configuración exista
   */
  async ensureDirectory() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`📁 Directorio de configuración creado: ${CONFIG_DIR}`);
    }
  }

  /**
   * Carga la configuración desde el archivo JSON
   */
  async loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        this.config = JSON.parse(data);
        console.log('✅ Configuración cargada desde archivo local');
        return this.config;
      } else {
        // Crear archivo con configuración por defecto
        this.config = this.getDefaultConfig();
        await this.saveConfig();
        console.log('📄 Archivo de configuración creado con valores por defecto');
        return this.config;
      }
    } catch (error) {
      console.error('❌ Error cargando configuración:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  /**
   * Guarda la configuración en el archivo JSON
   */
  async saveConfig() {
    try {
      await this.ensureDirectory();
      
      const configData = {
        ...this.config,
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
      console.log('💾 Configuración guardada en archivo local');
      
      return configData;
    } catch (error) {
      console.error('❌ Error guardando configuración:', error);
      throw error;
    }
  }

  /**
   * Obtiene la configuración completa
   */
  getConfig() {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }
    return { ...this.config };
  }

  /**
   * Actualiza la configuración de MongoDB
   */
  async updateMongoConfig(mongoConfig) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.mongodb = {
      ...this.config.mongodb,
      ...mongoConfig
    };

    await this.saveConfig();
    console.log('✅ Configuración de MongoDB actualizada');
    return this.config;
  }

  /**
   * Actualiza las rutas de archivos Excel
   */
  async updateFilePaths(filePaths) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.filePaths = {
      ...this.config.filePaths,
      ...filePaths
    };

    await this.saveConfig();
    console.log('✅ Rutas de archivos Excel actualizadas');
    return this.config;
  }

  /**
   * Actualiza la configuración del scheduler
   */
  async updateScheduler(schedulerConfig) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.scheduler = {
      ...this.config.scheduler,
      ...schedulerConfig
    };

    await this.saveConfig();
    console.log('✅ Configuración del scheduler actualizada');
    return this.config;
  }

  /**
   * Actualiza los mapeos
   */
  async updateMappings(mappings) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.mappings = {
      ...this.config.mappings,
      ...mappings
    };

    await this.saveConfig();
    console.log('✅ Mapeos actualizados');
    return this.config;
  }

  /**
   * Actualiza la configuración de asistencia
   */
  async updateAsistencia(asistencia) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.asistencia = {
      ...this.config.asistencia,
      ...asistencia
    };

    await this.saveConfig();
    console.log('✅ Configuración de asistencia actualizada');
    return this.config;
  }

  /**
   * Actualiza la configuración de oportunidades
   */
  async updateOportunidades(oportunidades) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.oportunidades = {
      ...this.config.oportunidades,
      ...oportunidades
    };

    await this.saveConfig();
    console.log('✅ Configuración de oportunidades actualizada');
    return this.config;
  }

  /**
   * Obtiene la configuración por defecto
   */
  getDefaultConfig() {
    return {
      mongodb: {
        uri: 'mongodb+srv://lucasjmora:rUAhjnEbxWJXv9nY@lm-mongodb.mw28zss.mongodb.net/oc_servicios?retryWrites=true&w=majority',
        database: 'oc_servicios',
        collections: {
          citas: 'citas',
          ingresos: 'ingresos'
        }
      },
      filePaths: {
        citas: 'C:\\Users\\Lucas\\OneDrive - Grupo Opencars\\uipath\\PV_report_PBI\\source\\Citas\\citas.xlsx',
        ingresos: 'C:\\Users\\Lucas\\OneDrive - Grupo Opencars\\uipath\\PV_report_PBI\\source\\Citas\\u124.xlsx'
      },
      scheduler: {
        enabled: false,
        cronExpression: '0 0 */6 * *', // Cada 6 horas
        lastRun: null,
        nextRun: null
      },
      mappings: {
        talleres: [],
        usuarios: [],
        campos: {}
      },
      asistencia: {
        diasTolerancia: 3
      },
      oportunidades: {
        palabrasClave: '',
        mesesDesdeCierre: 3
      },
      lastImport: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Obtiene la URI de MongoDB
   */
  getMongoURI() {
    return this.config?.mongodb?.uri || null;
  }

  /**
   * Obtiene el nombre de la base de datos
   */
  getDatabaseName() {
    return this.config?.mongodb?.database || 'oc_servicios';
  }

  /**
   * Obtiene los nombres de las colecciones
   */
  getCollectionNames() {
    return this.config?.mongodb?.collections || {
      citas: 'citas',
      ingresos: 'ingresos'
    };
  }

  /**
   * Obtiene las rutas de archivos Excel
   */
  getFilePaths() {
    return this.config?.filePaths || {
      citas: '',
      ingresos: ''
    };
  }

  /**
   * Obtiene la configuración del scheduler
   */
  getSchedulerConfig() {
    return this.config?.scheduler || {
      enabled: false,
      cronExpression: '0 0 */6 * *',
      lastRun: null,
      nextRun: null
    };
  }

  /**
   * Obtiene los mapeos
   */
  getMappings() {
    return this.config?.mappings || {
      talleres: [],
      usuarios: [],
      campos: {}
    };
  }

  /**
   * Actualiza la información de la última importación
   */
  async updateLastImport(importInfo) {
    if (!this.isInitialized) {
      throw new Error('Servicio de configuración no inicializado');
    }

    this.config.lastImport = {
      ...importInfo,
      timestamp: new Date().toISOString()
    };

    await this.saveConfig();
    console.log('✅ Información de última importación actualizada');
    return this.config;
  }

  /**
   * Obtiene información del archivo de configuración
   */
  getConfigInfo() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const stats = fs.statSync(CONFIG_FILE);
        return {
          filePath: CONFIG_FILE,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          exists: true
        };
      } else {
        return {
          filePath: CONFIG_FILE,
          exists: false
        };
      }
    } catch (error) {
      console.error('❌ Error obteniendo información del archivo:', error);
      return { error: error.message };
    }
  }

  /**
   * Crea un respaldo de la configuración
   */
  async createBackup() {
    try {
      await this.ensureDirectory();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(CONFIG_DIR, `config_backup_${timestamp}.json`);
      
      const backupData = {
        ...this.config,
        backupTimestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`💾 Respaldo de configuración creado: ${path.basename(backupFile)}`);
      
      return {
        filePath: backupFile,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error creando respaldo:', error);
      throw error;
    }
  }

  /**
   * Restaura la configuración desde un respaldo
   */
  async restoreFromBackup(backupFilePath) {
    try {
      if (!fs.existsSync(backupFilePath)) {
        throw new Error('Archivo de respaldo no encontrado');
      }

      const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
      
      // Crear respaldo de la configuración actual antes de restaurar
      await this.createBackup();
      
      this.config = backupData;
      await this.saveConfig();
      
      console.log('✅ Configuración restaurada desde respaldo');
      return this.config;
    } catch (error) {
      console.error('❌ Error restaurando desde respaldo:', error);
      throw error;
    }
  }
}

// Crear instancia singleton
const configStorageService = new ConfigStorageService();

export default configStorageService;
