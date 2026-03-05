/**
 * Verificación en navegador del Dashboard (sección Accesorios).
 * Ejecutar: node scripts/verify-dashboard-browser.js
 * Requiere: backend y frontend en marcha (puertos 5000 y 3000).
 */
import { chromium } from 'playwright';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:5000/api';

async function main() {
  let browser;
  const results = { ok: [], fail: [] };

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capturar respuesta del API de accesorios
    let accesoriosApiResponse = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('accesorios-dashboard') || url.includes('boletos/stats')) {
        try {
          const status = response.status();
          const body = await response.text();
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (_) {}
          accesoriosApiResponse = { status, body, json };
        } catch (e) {
          accesoriosApiResponse = { error: e.message };
        }
      }
    });

    console.log('1. Navegando al Dashboard:', FRONTEND_URL);
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

    // Esperar a que aparezca la sección Accesorios (título + tarjetas)
    console.log('2. Esperando sección Accesorios...');
    await page.waitForSelector('h2:has-text("Accesorios")', { timeout: 10000 });

    const section = await page.locator('h2:has-text("Accesorios")').first();
    const sectionVisible = await section.isVisible();
    if (sectionVisible) results.ok.push('Título "Accesorios" visible');
    else results.fail.push('Título "Accesorios" no visible');

    // Verificar que hay 3 tarjetas (Fortecar, Granville, Pampawagen) en la sección Accesorios
    const accesoriosSection = page.locator('div:has(h2:has-text("Accesorios"))').first();
    const cards = accesoriosSection.locator('a[href="/accesorios"]');
    const count = await cards.count();
    if (count >= 3) results.ok.push(`Tres tarjetas de Accesorios encontradas (${count} enlaces a /accesorios)`);
    else results.fail.push(`Se esperaban al menos 3 tarjetas, se encontraron: ${count}`);

    // Verificar nombres de empresas en las tarjetas
    const hasFortecar = await page.locator('text=Fortecar').count() > 0;
    const hasGranville = await page.locator('text=Granville').count() > 0;
    const hasPampawagen = await page.locator('text=Pampawagen').count() > 0;
    if (hasFortecar) results.ok.push('Nombre Fortecar presente');
    else results.fail.push('Nombre Fortecar no encontrado');
    if (hasGranville) results.ok.push('Nombre Granville presente');
    else results.fail.push('Nombre Granville no encontrado');
    if (hasPampawagen) results.ok.push('Nombre Pampawagen presente');
    else results.fail.push('Nombre Pampawagen no encontrado');

    // Dar tiempo a que llegue la respuesta del API si aún no está
    if (!accesoriosApiResponse) {
      await page.waitForTimeout(3000);
    }

    if (accesoriosApiResponse) {
      if (accesoriosApiResponse.status === 200) {
        results.ok.push('API GET /boletos/stats/accesorios-dashboard respondió 200');
        if (accesoriosApiResponse.json?.success && accesoriosApiResponse.json?.data) {
          results.ok.push('Respuesta API con success y data (FC, GV, PW)');
        } else {
          results.fail.push('Respuesta API sin success o data esperada');
        }
      } else {
        results.fail.push(`API accesorios-dashboard respondió ${accesoriosApiResponse.status}`);
      }
    } else {
      results.fail.push('No se capturó respuesta del API accesorios-dashboard (¿frontend llama a otro puerto?)');
    }

    console.log('\n--- Resultados ---');
    results.ok.forEach((m) => console.log('  OK:', m));
    results.fail.forEach((m) => console.log('  FALLO:', m));
    const exitCode = results.fail.length > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (err) {
    console.error('Error en verificación:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
