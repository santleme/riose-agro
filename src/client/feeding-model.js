export function calculateFeeding({
  weight,
  housing,
  heatFactor,
  pastureAvailableKgDM,
  diet,
  supplementKgDMPerDay,
  assumptions
}) {
  const demand = assumptions.baseDemandKgDM * (weight / 360) * heatFactor / 24;
  let forage = 0;
  let barnBaseFeed = 0;
  let pastureAfterFeedingKgDM = pastureAvailableKgDM;
  let barnBaseCost = 0;

  if (housing === 'pasture') {
    forage = Math.min(demand, pastureAvailableKgDM);
    pastureAfterFeedingKgDM -= forage;
  } else {
    barnBaseFeed = demand;
    barnBaseCost = demand * 0.65;
  }

  const supplement = supplementKgDMPerDay / 24;
  const dietExtra = diet === 'pasture' ? 0 : diet === 'balanced' ? 1.8 / 24 : 3.2 / 24;
  const additionalFeedCost = supplement * assumptions.supplementPrice
    + dietExtra * (diet === 'balanced' ? assumptions.balancedPrice : assumptions.concentratePrice);
  const energyIntake = forage + barnBaseFeed + supplement * 1.2 + dietExtra * 1.35;

  return {
    forageKgDM: forage,
    barnBaseFeedKgDM: barnBaseFeed,
    supplementKgDM: supplement,
    dietExtraKgDM: dietExtra,
    pastureAfterFeedingKgDM,
    barnBaseCost,
    additionalFeedCost,
    energyIntakeKgDM: energyIntake
  };
}
