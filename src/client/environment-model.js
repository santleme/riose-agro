export const DEFAULT_WEATHER = 'normal';
export const WEATHER_VALUES = Object.freeze(['normal', 'hot', 'rain']);

const WEATHER_RULES = Object.freeze({
  normal: Object.freeze({label: 'ameno', heatMultiplier: 1, pastureGrowthMultiplier: 1, thirstPerHour: 5}),
  hot: Object.freeze({label: 'calor', heatMultiplier: 0.8, pastureGrowthMultiplier: 0.65, thirstPerHour: 9}),
  rain: Object.freeze({label: 'chuva', heatMultiplier: 1, pastureGrowthMultiplier: 1.3, thirstPerHour: 5})
});

export function isWeather(value) {
  return WEATHER_VALUES.includes(value);
}

export function getWeatherRules(weather) {
  if (!Object.hasOwn(WEATHER_RULES, weather)) throw new Error('Invalid weather');
  return WEATHER_RULES[weather];
}

export function getEnvironmentalStress(weather, housing) {
  return weather === 'hot' ? 28 : housing === 'barn' ? 12 : 5;
}
