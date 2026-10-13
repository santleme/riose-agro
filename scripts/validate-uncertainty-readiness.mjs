import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateIssue15ReadinessContract, validateOutcomeUncertaintyClassifications} from './uncertainty-readiness-validation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inventoryPath=path.join(root,'docs/evidence/uncertainty-readiness-issue-15.json');
const inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
const errors=[];
const requireCondition=(condition,message)=>{if(!condition)errors.push(message);};

requireCondition(inventory.schemaVersion===1,'schemaVersion must be 1');
requireCondition(inventory.issue===15,'inventory must identify issue #15');
requireCondition(inventory.decision==='insufficient-evidence','decision must remain insufficient-evidence');
requireCondition(inventory.productState?.validated===false,'product validated state must remain false');
requireCondition(inventory.productState?.probabilisticIntervals==='unavailable','product intervals must remain unavailable');
requireCondition(inventory.productState?.displayLabel==='Sem calibração suficiente','display label must preserve the current non-calibrated state');
requireCondition(Array.isArray(inventory.sourcesOfUncertainty)&&inventory.sourcesOfUncertainty.length>0,'uncertainty source inventory is required');
requireCondition(Array.isArray(inventory.outcomes)&&inventory.outcomes.length>0,'outcome inventory is required');
for(const error of validateOutcomeUncertaintyClassifications(inventory.outcomes,inventory.sourcesOfUncertainty)) errors.push(error);
for(const error of validateIssue15ReadinessContract(inventory)) errors.push(error);

const seen=new Set();
for(const outcome of inventory.outcomes??[]){
  requireCondition(typeof outcome.id==='string'&&!seen.has(outcome.id),`outcome id missing or duplicated: ${outcome.id}`);
  seen.add(outcome.id);
  requireCondition(Array.isArray(outcome.engineOutputs)&&outcome.engineOutputs.length>0,`${outcome.id}: engine outputs are required`);
  requireCondition(Array.isArray(outcome.estimableNow)&&outcome.estimableNow.length>0,`${outcome.id}: estimable evidence must be stated`);
  requireCondition(Array.isArray(outcome.notEstimableNow)&&outcome.notEstimableNow.length>0,`${outcome.id}: non-estimable evidence must be stated`);
  requireCondition(outcome.predictionInterval===null,`${outcome.id}: do not store an interval in the readiness inventory`);
  requireCondition(outcome.intervalAuthorized===false,`${outcome.id}: interval must not be authorized`);
  requireCondition(Array.isArray(outcome.evidence)&&outcome.evidence.length>0,`${outcome.id}: evidence references are required`);
  for(const ref of outcome.evidence??[]){
    const resolved=path.resolve(path.dirname(inventoryPath),ref);
    const isEvidenceFile=resolved.startsWith(path.join(root,'docs/evidence')+path.sep);
    const isApprovedExperiment=resolved.startsWith(path.join(root,'experiments/diagnostics/adg')+path.sep)
      || resolved.startsWith(path.join(root,'experiments/diagnostics/biomass')+path.sep)
      || resolved.startsWith(path.join(root,'experiments/biomass')+path.sep);
    requireCondition(isEvidenceFile||isApprovedExperiment||resolved===path.join(root,'docs/politica-incerteza.md'),`${outcome.id}: evidence path escapes approved evidence directories: ${ref}`);
    requireCondition(existsSync(resolved),`${outcome.id}: evidence file not found: ${ref}`);
  }
}

for(const ref of inventory.references??[]){
  const resolved=path.resolve(path.dirname(inventoryPath),ref);
  requireCondition(existsSync(resolved),`reference file not found: ${ref}`);
}

const engine=await readFile(path.join(root,'src/client/engine.js'),'utf8');
const app=await readFile(path.join(root,'src/client/app.js'),'utf8');
const policy=await readFile(path.join(root,'docs/politica-incerteza.md'),'utf8');
requireCondition(/validated\s*:\s*false/.test(engine),'engine source no longer explicitly marks comparison output unvalidated');
requireCondition(app.includes("'demonstrativo_nao_validado','nao_disponivel_sem_calibracao'"),'comparison CSV no longer exports non-calibrated status');
requireCondition(policy.includes('Sem calibração suficiente'),'uncertainty policy no longer states the current non-calibrated label');

requireCondition(inventory.evaluationGate?.mustFreezeBeforeHoldout?.length>=4,'holdout freeze requirements are missing');
requireCondition(inventory.evaluationGate?.requiredReport?.includes('nominal and empirical coverage'),'interval coverage reporting requirement is missing');
requireCondition(typeof inventory.evaluationGate?.promotionRule==='string'&&inventory.evaluationGate.promotionRule.length>20,'interval promotion rule is missing');

if(errors.length){
  console.error('Issue #15 uncertainty readiness validation failed:');
  for(const error of errors)console.error(`- ${error}`);
  process.exitCode=1;
}else{
  console.log(`Issue #15 readiness valid: ${inventory.outcomes.length} outcomes, ${inventory.sourcesOfUncertainty.length} uncertainty sources; no probabilistic intervals authorized.`);
}
