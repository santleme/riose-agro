import {BR_CORTE_PASTURE_DMI, predictPastureDmi} from './br_corte_pasture_dmi.js';
import {defineScientificModel} from './model-contract.js';

export const BR_CORTE_PASTURE_DMI_MODEL = defineScientificModel({
  id: BR_CORTE_PASTURE_DMI.id,
  version: BR_CORTE_PASTURE_DMI.version,
  inputs: {
    bodyWeightKg: 'number',
    adgKgPerDay: 'number',
    supplementKgDMPerDay: 'number'
  },
  outputs: {
    totalDmiKgDMPerDay: 'number',
    supplementKgDMPerDay: 'number',
    residualForageDmiKgDMPerDay: 'number',
    inValidatedDomain: 'boolean',
    evidenceStatus: 'string',
    adgRole: 'string'
  },
  evidence: {
    source: BR_CORTE_PASTURE_DMI.source,
    sourceVersion: BR_CORTE_PASTURE_DMI.version,
    evidenceType: 'published-equation-with-independent-validation-ranges',
    validationRanges: BR_CORTE_PASTURE_DMI.validatedDomain,
    limitation: 'Published ranges do not constitute calibration or validation against Riose observations.'
  },
  run: predictPastureDmi
});
