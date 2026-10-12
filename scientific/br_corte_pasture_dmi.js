export const BR_CORTE_PASTURE_DMI = Object.freeze({
  id: 'br-corte-2023-eq-2.6',
  version: '2023',
  source: 'https://brcorte.com.br/assets/book2023/br/02.pdf',
  equation: 'DMI = -0.4684 + 0.7732 × supplement + 0.0742 × BW^0.75 + 0.7953 × ADG - 0.9047 × ADG²',
  rSquared: 0.638,
  validatedDomain: Object.freeze({
    bodyWeightKg: [133, 474],
    adgKgPerDay: [-0.18, 1.34],
    supplementKgDMPerDay: [0, 5.32],
    productionSystem: 'growing Zebu cattle grazing tropical pasture with supplementation'
  }),
  units: Object.freeze({bodyWeightKg: 'kg', adgKgPerDay: 'kg/day', supplementKgDMPerDay: 'kg DM/day', dmiKgDMPerDay: 'kg DM/day'})
});

const finite = value => Number.isFinite(value);

export function predictPastureDmi({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay}) {
  for (const [name, value] of Object.entries({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay})) {
    if (!finite(value)) throw new TypeError(`${name} must be a finite number`);
  }
  if (bodyWeightKg <= 0) throw new RangeError('bodyWeightKg must be greater than zero');
  if (supplementKgDMPerDay < 0) throw new RangeError('supplementKgDMPerDay cannot be negative');
  const metabolicWeight = bodyWeightKg ** 0.75;
  const totalDmi = -0.4684 + 0.7732 * supplementKgDMPerDay + 0.0742 * metabolicWeight + 0.7953 * adgKgPerDay - 0.9047 * adgKgPerDay ** 2;
  if (!finite(totalDmi) || totalDmi <= 0) throw new RangeError('BR-CORTE equation returned a non-positive or non-finite DMI');
  const {bodyWeightKg: bw, adgKgPerDay: adg, supplementKgDMPerDay: supplement} = BR_CORTE_PASTURE_DMI.validatedDomain;
  const inValidatedDomain = bodyWeightKg >= bw[0] && bodyWeightKg <= bw[1] && adgKgPerDay >= adg[0] && adgKgPerDay <= adg[1] && supplementKgDMPerDay >= supplement[0] && supplementKgDMPerDay <= supplement[1];
  return {
    totalDmiKgDMPerDay: totalDmi,
    supplementKgDMPerDay,
    residualForageDmiKgDMPerDay: Math.max(0, totalDmi - supplementKgDMPerDay),
    inValidatedDomain,
    evidenceStatus: inValidatedDomain ? 'within-independent-validation-ranges' : 'outside-independent-validation-ranges',
    adgRole: 'input-assumption; not predicted by this equation'
  };
}

export function analyzePastureDmiSensitivity({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay}) {
  const baseline = predictPastureDmi({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay});
  const {bodyWeightKg: bwRange, adgKgPerDay: adgRange, supplementKgDMPerDay: supplementRange} = BR_CORTE_PASTURE_DMI.validatedDomain;
  const perturbations = [
    {input: 'bodyWeightKg', label: 'Peso corporal', delta: 10, range: bwRange},
    {input: 'adgKgPerDay', label: 'GMD assumido', delta: 0.1, range: adgRange},
    {input: 'supplementKgDMPerDay', label: 'Suplemento', delta: 0.5, range: supplementRange}
  ];
  const effects = perturbations.map(({input, label, delta, range}) => {
    const low = Math.max(range[0], ({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay})[input] - delta);
    const high = Math.min(range[1], ({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay})[input] + delta);
    const lower = predictPastureDmi({bodyWeightKg: input === 'bodyWeightKg' ? low : bodyWeightKg, adgKgPerDay: input === 'adgKgPerDay' ? low : adgKgPerDay, supplementKgDMPerDay: input === 'supplementKgDMPerDay' ? low : supplementKgDMPerDay});
    const upper = predictPastureDmi({bodyWeightKg: input === 'bodyWeightKg' ? high : bodyWeightKg, adgKgPerDay: input === 'adgKgPerDay' ? high : adgKgPerDay, supplementKgDMPerDay: input === 'supplementKgDMPerDay' ? high : supplementKgDMPerDay});
    const lowEffect = lower.totalDmiKgDMPerDay - baseline.totalDmiKgDMPerDay, highEffect = upper.totalDmiKgDMPerDay - baseline.totalDmiKgDMPerDay;
    return {input, label, testedInputRange: [low, high], dmiAtLowInputKgDMPerDay: lower.totalDmiKgDMPerDay, dmiAtHighInputKgDMPerDay: upper.totalDmiKgDMPerDay, dmiRangeKgDMPerDay: [Math.min(lower.totalDmiKgDMPerDay, upper.totalDmiKgDMPerDay), Math.max(lower.totalDmiKgDMPerDay, upper.totalDmiKgDMPerDay)], deltaFromBaselineKgDMPerDay: [Math.min(lowEffect, highEffect), Math.max(lowEffect, highEffect)], meaning: 'deterministic one-at-a-time sensitivity; not a prediction interval'};
  });
  return {model: BR_CORTE_PASTURE_DMI.id, baselineKgDMPerDay: baseline.totalDmiKgDMPerDay, baselineInValidatedDomain: baseline.inValidatedDomain, perturbationBasis: '±10 kg BW, ±0.1 kg/day ADG input, ±0.5 kg DM/day supplement, clipped to independent-validation ranges', evidenceType: 'equation sensitivity only; no Riose empirical calibration', predictionInterval: null, effects};
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
}

export function simulateNelorePastureScenario(config = {}) {
  const {
    seed = 2026,
    animalCount = 100,
    initialWeightKg = 330,
    initialWeightSpreadKg = 0,
    assumedAdgKgPerDay = 0.5,
    supplementKgDMPerAnimalPerDay = 1.6,
    days = 30,
    initialPastureKgDMByPaddock = [16000, 16000, 16000, 16000],
    waterAvailableByPaddock = [true, true, true, true]
  } = config;
  if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
  if (!Number.isInteger(animalCount) || animalCount < 1 || animalCount > 10000) throw new RangeError('animalCount must be from 1 to 10000');
  if (!Number.isInteger(days) || ![30, 60, 90].includes(days)) throw new RangeError('days must be 30, 60, or 90');
  if (!finite(initialWeightKg) || initialWeightKg <= 0 || !finite(initialWeightSpreadKg) || initialWeightSpreadKg < 0) throw new RangeError('invalid initial weight settings');
  if (!finite(assumedAdgKgPerDay) || !finite(supplementKgDMPerAnimalPerDay)) throw new TypeError('ADG and supplement must be finite numbers');
  if (!Array.isArray(initialPastureKgDMByPaddock) || initialPastureKgDMByPaddock.length !== 4 || initialPastureKgDMByPaddock.some(x => !finite(x) || x < 0)) throw new RangeError('four non-negative initial pasture stocks are required');
  if (!Array.isArray(waterAvailableByPaddock) || waterAvailableByPaddock.length !== 4 || waterAvailableByPaddock.some(x => typeof x !== 'boolean')) throw new TypeError('waterAvailableByPaddock must contain four booleans');
  if (supplementKgDMPerAnimalPerDay < 0 || supplementKgDMPerAnimalPerDay > 5.32) throw new RangeError('supplement must be within the published validation range 0–5.32 kg DM/head/day');
  if (assumedAdgKgPerDay < -0.18 || assumedAdgKgPerDay > 1.34) throw new RangeError('ADG input must be within the published validation range −0.18–1.34 kg/day');
  if (!waterAvailableByPaddock.some(Boolean)) throw new RangeError('at least one paddock must have water available');

  const random = seededRandom(seed);
  const eligiblePaddocks = waterAvailableByPaddock.map((available, index) => available ? index : -1).filter(index => index >= 0);
  const animals = Array.from({length: animalCount}, (_, index) => {
    const centered = animalCount === 1 ? 0 : (random() * 2 - 1) * initialWeightSpreadKg;
    const patch = eligiblePaddocks[index % eligiblePaddocks.length];
    return {id: index + 1, name: `Nelore ${String(index + 1).padStart(3, '0')}`, initialWeightKg: initialWeightKg + centered, weightKg: initialWeightKg + centered, paddock: patch};
  });
  if (animals.some(animal => animal.initialWeightKg < 133 || animal.initialWeightKg > 474)) throw new RangeError('all starting weights must remain within the independently validated 133–474 kg range');
  const pasture = [...initialPastureKgDMByPaddock];
  const rows = [{day: 0, meanWeightKg: animals.reduce((sum, animal) => sum + animal.weightKg, 0) / animalCount, totalDmiKgDM: 0, supplementKgDM: 0, forageDemandKgDM: 0, forageConsumedKgDM: 0, forageShortfallKgDM: 0, pastureKgDMByPaddock: [...pasture]}];
  let outsideDomainDays = 0;
  for (let day = 1; day <= days; day++) {
    let totalDmi = 0, supplement = 0, forageDemand = 0, forageConsumed = 0, forageShortfall = 0;
    for (const animal of animals) {
      if (animal.weightKg < 133 || animal.weightKg > 474) throw new RangeError(`animal ${animal.id} leaves the independently validated BW range on day ${day}`);
      const prediction = predictPastureDmi({bodyWeightKg: animal.weightKg, adgKgPerDay: assumedAdgKgPerDay, supplementKgDMPerDay: supplementKgDMPerAnimalPerDay});
      if (!prediction.inValidatedDomain) outsideDomainDays++;
      const requestedForage = prediction.residualForageDmiKgDMPerDay;
      const available = pasture[animal.paddock];
      const consumedForage = Math.min(requestedForage, available);
      pasture[animal.paddock] -= consumedForage;
      totalDmi += prediction.totalDmiKgDMPerDay;
      supplement += supplementKgDMPerAnimalPerDay;
      forageDemand += requestedForage;
      forageConsumed += consumedForage;
      forageShortfall += requestedForage - consumedForage;
      // Weight follows the explicitly supplied ADG scenario; Eq. 2.6 does not predict gain.
      animal.weightKg += assumedAdgKgPerDay;
      if (animal.weightKg < 133 || animal.weightKg > 474) throw new RangeError(`assumed weight trajectory leaves the independently validated BW range on day ${day}`);
    }
    const meanWeightKg = animals.reduce((sum, animal) => sum + animal.weightKg, 0) / animalCount;
    rows.push({day, meanWeightKg, totalDmiKgDM: totalDmi, supplementKgDM: supplement, forageDemandKgDM: forageDemand, forageConsumedKgDM: forageConsumed, forageShortfallKgDM: forageShortfall, pastureKgDMByPaddock: [...pasture]});
  }
  return {
    model: BR_CORTE_PASTURE_DMI.id,
    source: BR_CORTE_PASTURE_DMI.source,
    seed: seed >>> 0,
    animalCount,
    days,
    assumptions: {breed: 'Nelore (Zebu)', initialWeightKg, initialWeightSpreadKg, assumedAdgKgPerDay, supplementKgDMPerAnimalPerDay, pastureRegrowthKgDMPerDay: 0, waterEffectOnIntake: 'not-modeled'},
    limitations: ['ADG is a supplied scenario input used both in Eq. 2.6 and as the weight trajectory; the model does not independently predict weight gain.', 'Pasture draw is total DMI minus supplement as a dry-matter balance; this residual is not a separately validated forage-intake equation.', 'Pasture regrowth, forage quality, area, water intake, heat, energy/protein balance, and the effect of water access on intake or ADG are not modeled.', 'When forage stock is insufficient, actual forage draw is capped and the ADG trajectory remains an assumption; the shortfall is reported.'],
    evidence: {rSquared: BR_CORTE_PASTURE_DMI.rSquared, validationAnimalUnits: 174, validationRanges: BR_CORTE_PASTURE_DMI.validatedDomain, outsideDomainDays},
    animals,
    rows,
    final: rows.at(-1)
  };
}
