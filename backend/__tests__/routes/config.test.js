import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import configRouter from '../../routes/config.js';
import Configuracion from '../../models/Configuracion.js';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const app = express();
app.use(express.json());
app.use('/api/config', configRouter);

describe('Rutas de Configuración - Accesorios', () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/oc_servicios_test';
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000
      });
    } catch (error) {
      console.error('Error conectando a MongoDB:', error.message);
      throw error;
    }
  }, 60000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      if (mongoose.connection.db) {
        await mongoose.connection.db.dropDatabase();
      }
      await mongoose.connection.close();
    }
  }, 30000);

  beforeEach(async () => {
    await Configuracion.deleteMany({});
  });

  describe('GET /api/config/accesorios', () => {
    test('debe retornar configuración de accesorios', async () => {
      await Configuracion.create({
        singleton: true,
        accesorios: {
          diasEspera: 7
        }
      });

      const response = await request(app)
        .get('/api/config/accesorios');

      expect(response.status).toBe(200);
      expect(response.body.diasEspera).toBe(7);
    });

    test('debe retornar valor por defecto si no existe configuración', async () => {
      const response = await request(app)
        .get('/api/config/accesorios');

      expect(response.status).toBe(200);
      expect(response.body.diasEspera).toBe(7);
    });
  });

  describe('PUT /api/config/accesorios', () => {
    test('debe actualizar días de espera', async () => {
      await Configuracion.create({
        singleton: true,
        accesorios: {
          diasEspera: 7
        }
      });

      const response = await request(app)
        .put('/api/config/accesorios')
        .send({ diasEspera: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.diasEspera).toBe(10);

      const config = await Configuracion.findOne({ singleton: true });
      expect(config.accesorios.diasEspera).toBe(10);
    });

    test('debe crear configuración si no existe', async () => {
      const response = await request(app)
        .put('/api/config/accesorios')
        .send({ diasEspera: 14 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const config = await Configuracion.findOne({ singleton: true });
      expect(config.accesorios.diasEspera).toBe(14);
    });

    test('debe validar que diasEspera sea requerido', async () => {
      const response = await request(app)
        .put('/api/config/accesorios')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requerido');
    });

    test('debe validar que diasEspera sea un número entero entre 1 y 365', async () => {
      const testCases = [
        { diasEspera: 0, expectedStatus: 400 },
        { diasEspera: 366, expectedStatus: 400 },
        { diasEspera: -1, expectedStatus: 400 },
        { diasEspera: 1.5, expectedStatus: 400 },
        { diasEspera: 30, expectedStatus: 200 },
        { diasEspera: 365, expectedStatus: 200 }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .put('/api/config/accesorios')
          .send({ diasEspera: testCase.diasEspera });

        expect(response.status).toBe(testCase.expectedStatus);
      }
    });
  });
});

