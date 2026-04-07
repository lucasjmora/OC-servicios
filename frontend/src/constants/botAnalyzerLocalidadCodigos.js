/**
 * Valor de `localidad` en query/API para listar solo conversaciones sin localidad resuelta.
 * Debe coincidir con `FILTRO_LOCALIDAD_SIN` en backend/services/botAnalyzerService.js
 */
export const FILTRO_BOT_ANALYZER_SIN_LOCALIDAD = '__sin_localidad__';

/** Catálogo BOT por empresa (alineado con Config y backend). */
export const LOCALIDADES_BOT_FORTECAR = ['JU', 'SN', 'CH', 'PE', 'TL', 'CS', 'OL', '9J'];

export const LOCALIDADES_BOT_GRANVILLE = ['TW', 'JU', 'SN', 'CO', 'PE', 'PM'];

export const LOCALIDADES_BOT_PAMPAWAGEN = ['SR', 'GP'];

export function codigosLocalidadBotPorEmpresa(emp) {
  const u = String(emp || '').toUpperCase();
  if (u === 'FC') return LOCALIDADES_BOT_FORTECAR;
  if (u === 'GV') return LOCALIDADES_BOT_GRANVILLE;
  if (u === 'PW') return LOCALIDADES_BOT_PAMPAWAGEN;
  return [];
}
