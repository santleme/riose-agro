/**
 * Cattle temperature-humidity index (THI) from Mader, Davis & Brown-Brandl (2006).
 * THI = 0.8*T + RH/100*(T - 14.4) + 46.4
 * T is dry-bulb air temperature in °C, RH is relative humidity in percent.
 * This is a descriptive environmental index, not a physiological response model.
 */
export const THI_SOURCE = {
  title: 'Environmental factors influencing heat stress in feedlot cattle',
  authors: 'Mader, Davis & Brown-Brandl (2006)',
  journal: 'Journal of Animal Science 84:712–719',
  doi: 'https://doi.org/10.2527/2006.843712x'
};

export function calculateThi(temperatureC, relativeHumidityPct) {
  const numericInput = value => typeof value === 'number' || typeof value === 'string' && value.trim() !== '';
  const t = Number(temperatureC), rh = Number(relativeHumidityPct);
  if (temperatureC == null || temperatureC === '' || relativeHumidityPct == null || relativeHumidityPct === '') {
    return {available: false, reason: 'Temperatura e umidade relativa são necessárias.'};
  }
  if (!numericInput(temperatureC) || !Number.isFinite(t) || t < -40 || t > 60) {
    return {available: false, reason: 'Temperatura inválida; a entrada aceita de −40 a 60 °C.'};
  }
  if (!numericInput(relativeHumidityPct) || !Number.isFinite(rh) || rh < 0 || rh > 100) {
    return {available: false, reason: 'Umidade relativa inválida; informe de 0 a 100%.'};
  }
  return {available: true, value: 0.8 * t + (rh / 100) * (t - 14.4) + 46.4, unit: 'THI', formula: '0,8 × T + (UR/100) × (T − 14,4) + 46,4', source: THI_SOURCE};
}
