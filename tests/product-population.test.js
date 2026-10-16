import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FarmEngine,compareConfiguredScenarios} from '../src/client/engine.js';
import {amendmentFromPrompt,expandActivityHistory,interpretExperimentPrompt,runPopulationComparison,validateExperimentSpecification} from '../src/client/population-experiment.js';
import {decodeWorkerCommand,normalizeWorkerResponse,WORKER_PROTOCOL_VERSION} from '../src/client/worker-protocol.js';

const prompt='Tenho 200 bovinos Nelore a pasto, durante 30 dias, em condições de calor. Quero saber o que acontece se aumentar a suplementação de 0,5 para 1,5 kg por animal.';

test('retired Experiments page points to Product instead of exposing the legacy dashboard',()=>{
  const page=readFileSync(new URL('../experiments.html',import.meta.url),'utf8');
  assert.match(page,/url=product\.html/);
  assert.match(page,/location\.replace\(new URL\('product\.html'/);
  assert.doesNotMatch(page,/id="experiment-form"|id="sensitivity-form"/);
});

test('deterministic intent parser extracts the supported Portuguese supplement experiment and its origins',()=>{
  const spec=interpretExperimentPrompt(prompt);
  assert.equal(spec.version,'riose-experiment-intent/v1');
  assert.deepEqual(spec.population,{count:200,breed:'Nelore'});
  assert.equal(spec.duration.days,30);
  assert.equal(spec.baseline.weather,'hot');
  assert.equal(spec.baseline.supplement,.5);
  assert.equal(spec.intervention.supplement,1.5);
  assert.equal(spec.missing_inputs.length,0);
  assert.equal(spec.unsupported_requests.length,0);
  assert.equal(spec.assumptions.find(item=>item.field==='duration.days').origin,'user prompt');
  assert.equal(validateExperimentSpecification(spec),true);
  const english=interpretExperimentPrompt('Compare a pasture herd of 200 Nelore cattle over 30 days in hot weather, changing supplementation from 0.5 to 1.5 kg DM per animal per day.');
  assert.equal(english.population.count,200);
});

test('the two built-in supplement comparison prompts parse without AI configuration',()=>{
  const examples=[
    ['I have 100 cattle on pasture for 15 days. Compare 0.5 with 1.0 kg of supplement per animal per day.',.5,1],
    ['Compare 24 cattle on pasture for 7 days with 0 versus 1 kg supplement per animal per day.',0,1]
  ];
  for(const [prompt,baseline,intervention] of examples){
    const spec=interpretExperimentPrompt(prompt);
    assert.equal(spec.baseline.supplement,baseline);
    assert.equal(spec.intervention.supplement,intervention);
    assert.equal(spec.missing_inputs.length,0);
  }
});

test('ambiguous requests ask for an intervention and unsupported outputs are explicit',()=>{
  const spec=interpretExperimentPrompt('I have 50 cattle for 10 days. Predict their ADG with confidence intervals.');
  assert.ok(spec.missing_inputs.some(item=>item.includes('supplement intervention')));
  assert.ok(spec.unsupported_requests.length>=1);
  assert.throws(()=>validateExperimentSpecification({...spec,unexpected:true}),/unknown or missing fields/);
});

test('an amendment updates structured inputs without silently executing',()=>{
  const spec=interpretExperimentPrompt(prompt);
  const changed=amendmentFromPrompt(spec,'Make it 15 days and 100 cattle');
  assert.equal(changed.duration.days,15);
  assert.equal(changed.population.count,100);
  assert.equal(changed.intervention.supplement,1.5);
  assert.throws(()=>amendmentFromPrompt(spec,'make them more productive'),/can update population size/);
});

test('an amendment clears resolved supplement questions and keeps equal arms blocked',()=>{
  const unresolved=interpretExperimentPrompt('I have 50 cattle for 10 days.');
  const resolved=amendmentFromPrompt(unresolved,'Use 1.5 kg supplement per animal per day');
  assert.equal(resolved.intervention.supplement,1.5);
  assert.equal(resolved.missing_inputs.length,0);
  assert.equal(validateExperimentSpecification(resolved),true);
  const sameAsBaseline=amendmentFromPrompt(unresolved,'Use 0 kg supplement per animal per day');
  assert.ok(sameAsBaseline.missing_inputs.some(item=>item.includes('differs from the baseline')));
});

test('population comparison returns deterministic animal states at named checkpoints from matched starts',()=>{
  const spec=interpretExperimentPrompt(prompt);
  const engine=new FarmEngine(20261015,spec.population.count);engine.configure(spec.baseline);
  const first=runPopulationComparison(engine.snapshot(),{days:30,referenceConfig:spec.baseline,scenarioConfig:spec.intervention});
  const second=runPopulationComparison(engine.snapshot(),{days:30,referenceConfig:spec.baseline,scenarioConfig:spec.intervention});
  assert.deepEqual(first,second);
  assert.deepEqual(first.timeline.map(point=>point.day),[0,1,7,15,30]);
  assert.equal(first.timeline.at(-1).scenario.length,200);
  assert.equal(first.timeline[0].scenario[0].weight,first.timeline[0].reference[0].weight);
  assert.ok(first.timeline.at(-1).scenario[0].history.length>0);
  assert.equal(expandActivityHistory(first.timeline.at(-1).scenario[0].history).at(-1).action,'drinking');
  assert.match(first.observationFormat,/compact-history/);
  assert.equal(first.individualIntakeAvailable,false);
  assert.deepEqual(first.comparison,compareConfiguredScenarios(engine.snapshot(),{days:30,referenceConfig:spec.baseline,scenarioConfig:spec.intervention}));
  assert.equal(first.comparison.rows.at(-1).scenarioWeight,
    first.timeline.at(-1).scenario.reduce((sum,animal)=>sum+animal.weight,0)/200);
});

test('population replay tolerates the existing history projection that omits display names',()=>{
  const spec=interpretExperimentPrompt(prompt);const engine=new FarmEngine(20261015,3);engine.configure(spec.baseline);
  const snapshot=engine.snapshot();for(const animal of snapshot.animals)delete animal.name;
  const result=runPopulationComparison(snapshot,{days:7,referenceConfig:spec.baseline,scenarioConfig:spec.intervention});
  assert.deepEqual(result.timeline.at(-1).scenario.map(animal=>animal.name),['Animal 1','Animal 2','Animal 3']);
  assert.equal(result.comparison.rows.at(-1).scenarioWeight,result.timeline.at(-1).scenario.reduce((sum,animal)=>sum+animal.weight,0)/3);
});

test('worker protocol accepts bounded population comparison commands and observations',()=>{
  const spec=interpretExperimentPrompt(prompt);const engine=new FarmEngine(20261015,2);engine.configure(spec.baseline);
  const command={protocolVersion:WORKER_PROTOCOL_VERSION,type:'populationCompare',snapshot:engine.snapshot(),days:7,referenceConfig:spec.baseline,scenarioConfig:spec.intervention};
  assert.equal(decodeWorkerCommand(command).command.type,'populationCompare');
  assert.throws(()=>decodeWorkerCommand({...command,days:0}),/between 1 and 365/);
  const result={protocolVersion:WORKER_PROTOCOL_VERSION,type:'population',data:{comparison:{},timeline:[]},engineImplementation:'javascript-population-observations'};
  assert.equal(normalizeWorkerResponse(result).type,'population');
  assert.equal(normalizeWorkerResponse({protocolVersion:WORKER_PROTOCOL_VERSION,type:'progress',day:3,days:7,engineImplementation:'javascript-population-observations'}).day,3);
  assert.throws(()=>normalizeWorkerResponse({protocolVersion:WORKER_PROTOCOL_VERSION,type:'progress',day:8,days:7,engineImplementation:'javascript-population-observations'}),/bounded day/);
});
