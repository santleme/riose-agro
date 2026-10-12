export const FACTOR_CATEGORIES = Object.freeze({
  EXTERNAL: 'external',
  MANAGEMENT: 'management',
  PARTIALLY_CONTROLLABLE: 'partially_controllable',
});

export const ACTIVE_FACTOR_CATEGORIES = Object.freeze([
  FACTOR_CATEGORIES.EXTERNAL,
  FACTOR_CATEGORIES.MANAGEMENT,
]);

export const VALID_FACTOR_CATEGORIES = Object.freeze([
  ...ACTIVE_FACTOR_CATEGORIES,
  FACTOR_CATEGORIES.PARTIALLY_CONTROLLABLE,
]);

const factorCategoryByKey = new Map([
  ['temperature', FACTOR_CATEGORIES.EXTERNAL],
  ['humidity', FACTOR_CATEGORIES.EXTERNAL],
  ['rain', FACTOR_CATEGORIES.EXTERNAL],
  ['rainfall', FACTOR_CATEGORIES.EXTERNAL],
  ['wind', FACTOR_CATEGORIES.EXTERNAL],
  ['environment', FACTOR_CATEGORIES.EXTERNAL],
  ['weather', FACTOR_CATEGORIES.EXTERNAL],
  ['climate', FACTOR_CATEGORIES.EXTERNAL],
  ['temperatura', FACTOR_CATEGORIES.EXTERNAL],
  ['umidade', FACTOR_CATEGORIES.EXTERNAL],
  ['chuva', FACTOR_CATEGORIES.EXTERNAL],
  ['vento', FACTOR_CATEGORIES.EXTERNAL],
  ['ambiente', FACTOR_CATEGORIES.EXTERNAL],
  ['clima', FACTOR_CATEGORIES.EXTERNAL],
  ['diet', FACTOR_CATEGORIES.MANAGEMENT],
  ['feed', FACTOR_CATEGORIES.MANAGEMENT],
  ['offeredfeed', FACTOR_CATEGORIES.MANAGEMENT],
  ['feedingfrequency', FACTOR_CATEGORIES.MANAGEMENT],
  ['feedingschedule', FACTOR_CATEGORIES.MANAGEMENT],
  ['trough', FACTOR_CATEGORIES.MANAGEMENT],
  ['water', FACTOR_CATEGORIES.MANAGEMENT],
  ['shade', FACTOR_CATEGORIES.MANAGEMENT],
  ['ventilation', FACTOR_CATEGORIES.MANAGEMENT],
  ['cleaning', FACTOR_CATEGORIES.MANAGEMENT],
  ['housing', FACTOR_CATEGORIES.MANAGEMENT],
  ['supplement', FACTOR_CATEGORIES.MANAGEMENT],
  ['dieta', FACTOR_CATEGORIES.MANAGEMENT],
  ['alimentoofertado', FACTOR_CATEGORIES.MANAGEMENT],
  ['frequencia', FACTOR_CATEGORIES.MANAGEMENT],
  ['horarios', FACTOR_CATEGORIES.MANAGEMENT],
  ['cocho', FACTOR_CATEGORIES.MANAGEMENT],
  ['agua', FACTOR_CATEGORIES.MANAGEMENT],
  ['sombra', FACTOR_CATEGORIES.MANAGEMENT],
  ['ventilacao', FACTOR_CATEGORIES.MANAGEMENT],
  ['limpeza', FACTOR_CATEGORIES.MANAGEMENT],
  ['alojamento', FACTOR_CATEGORIES.MANAGEMENT],
  ['suplemento', FACTOR_CATEGORIES.MANAGEMENT],
]);

const normalizeFactorKey = key => String(key)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLocaleLowerCase('en')
  .replace(/[^a-z0-9]/g, '');

const getFactorKey = factor => {
  if (typeof factor === 'string') return factor;
  if (!factor || typeof factor !== 'object' || Array.isArray(factor)) {
    throw new TypeError('Fator precisa ser uma chave ou um objeto com key, id ou path.');
  }
  const key = factor.key ?? factor.id ?? factor.path;
  if (typeof key !== 'string' || !key.trim()) {
    throw new TypeError('Fator precisa informar uma chave não vazia.');
  }
  return key;
};

const getDeclaredCategory = factor => {
  if (typeof factor === 'string' || factor.category === undefined || factor.category === null) return undefined;
  if (!VALID_FACTOR_CATEGORIES.includes(factor.category)) {
    throw new TypeError(`Categoria de fator inválida: ${factor.category}`);
  }
  return factor.category;
};

export function isFactorCategory(category) {
  return VALID_FACTOR_CATEGORIES.includes(category);
}

export function classifyFactor(factor) {
  const key = getFactorKey(factor);
  const declaredCategory = getDeclaredCategory(factor);
  if (declaredCategory !== undefined) return declaredCategory;

  const leafKey = key.split(/[./]/).filter(Boolean).at(-1) ?? key;
  return factorCategoryByKey.get(normalizeFactorKey(leafKey)) ?? null;
}

export function classifyConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new TypeError('Configuração precisa ser um objeto.');
  }

  return Object.entries(configuration).map(([key, value]) => ({
    key,
    value,
    category: classifyFactor(key),
  }));
}
