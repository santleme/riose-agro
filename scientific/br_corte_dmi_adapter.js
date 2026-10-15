import {BR_CORTE_PASTURE_DMI, BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE, predictPastureDmi} from './br_corte_pasture_dmi.js';
import {defineScientificModel, registerScientificModel} from './model-contract.js';

export const BR_CORTE_PASTURE_DMI_MODEL = defineScientificModel({
  id: BR_CORTE_PASTURE_DMI.id,
  version: BR_CORTE_PASTURE_DMI.version,
  inputs: {
    bodyWeightKg: 'number',
    adgKgPerDay: 'number',
    supplementKgDMPerDay: 'number'
  },
  units: {
    bodyWeightKg: 'kg',
    adgKgPerDay: 'kg/day',
    supplementKgDMPerDay: 'kg DM/day'
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
    status: 'published-equation-with-external-validation; no Riose-specific calibration',
    sourceVersion: BR_CORTE_PASTURE_DMI.version,
    evidenceType: 'published-equation-with-independent-validation-ranges',
    validationRanges: BR_CORTE_PASTURE_DMI.validatedDomain,
    limitation: 'Published ranges do not constitute calibration or validation against Riose observations.'
  },
  implementationSource: BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE,
  run: predictPastureDmi
});

registerScientificModel(BR_CORTE_PASTURE_DMI_MODEL);
