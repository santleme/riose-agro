import {summarizeSamples} from './benchmark-report.mjs';

const REQUIRED_SAMPLE_WIN_RATE=0.8;

export function evaluateAnimalLayoutDecision(rows){
  if(!Array.isArray(rows)||rows.length===0)throw new Error('Animal-layout decision requires measured rows');
  const comparisons=rows.map(row=>{
    const aos=row.measurements?.aosEndToEnd?.observations;
    const soa=row.measurements?.typedColumnsEndToEnd?.observations;
    const order=row.pairedComparison?.orderBySample;
    if(!Array.isArray(aos)||!Array.isArray(soa)||aos.length<3||aos.length!==soa.length||![...aos,...soa].every(Number.isFinite)){
      throw new Error(`Animal-layout row ${row.animals}/${row.hour} requires equally sized finite AoS and SoA samples (at least 3)`);
    }
    if(row.pairedComparison?.paired!==true||!Array.isArray(order)||order.length!==aos.length||order.some((value,index)=>
      !['AoS-then-SoA','SoA-then-AoS'].includes(value)||(index>0&&value===order[index-1]))){
      throw new Error(`Animal-layout row ${row.animals}/${row.hour} requires counterbalanced paired sample order`);
    }
    const aosMedian=summarizeSamples(aos).median;
    const soaMedian=summarizeSamples(soa).median;
    const sampleWinRate=soa.reduce((wins,value,index)=>wins+(value<aos[index]?1:0),0)/soa.length;
    return {animals:row.animals,hour:row.hour,aosMedianMs:aosMedian,soaEndToEndMedianMs:soaMedian,medianGainRatio:aosMedian/soaMedian,sampleWinRate,repeatableNetWin:soaMedian<aosMedian&&sampleWinRate>=REQUIRED_SAMPLE_WIN_RATE};
  });
  const repeatableAcrossWorkloads=comparisons.every(result=>result.repeatableNetWin);
  return {
    rule:`Keep AoS unless SoA end-to-end median is lower in every measured population/hour and wins at least ${REQUIRED_SAMPLE_WIN_RATE*100}% of counterbalanced paired samples in every row.`,
    requiredSampleWinRate:REQUIRED_SAMPLE_WIN_RATE,
    repeatableAcrossWorkloads,
    comparisons,
    recommendation:repeatableAcrossWorkloads
      ?'SoA showed repeatable end-to-end gains across the measured workloads; review the prototype for a separate production change decision.'
      :'Keep object-per-animal production state; the measured SoA path did not show repeatable end-to-end gains across all workloads.',
  };
}
