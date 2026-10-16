import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,interpretExperimentWithProvider,validateExperimentInterpretationRequest} from '../src/server/server.js';

function validIntent(){return {version:'riose-experiment-intent/v1',population:{count:200,breed:'Nelore'},duration:{days:30},baseline:{diet:'pasture',housing:'pasture',weather:'hot',supplement:.5},intervention:{diet:'pasture',housing:'pasture',weather:'hot',supplement:1.5},target_scope:'herd',requested_outputs:['population_states','mean_weight'],assumptions:[{field:'population.count',value:200,unit:null,origin:'user prompt',kind:'detected'}],missing_inputs:[],unsupported_requests:[]};}

test('intent API request rejects extra fields and oversized or empty prompts',()=>{
  assert.equal(validateExperimentInterpretationRequest({prompt:'Compare supplement'}),true);
  assert.equal(validateExperimentInterpretationRequest({prompt:' '}),false);
  assert.equal(validateExperimentInterpretationRequest({prompt:'x'.repeat(1201)}),false);
  assert.equal(validateExperimentInterpretationRequest({prompt:'ok',tools:['run code']}),false);
});

test('Product can show which assistant is truly configured without exposing credentials', async t => {
  const server=createServer({env:{LLM_PROVIDER:'groq',GROQ_MODEL:'safe-model',GROQ_API_KEY:'never-return-this'},fetchImpl:async()=>{throw new Error('status must not contact provider');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/assistant-status`);
  const text=await response.text();
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(text),{assistant:{available:true,provider:'groq',model:'safe-model'},localPlanner:true,laya:{available:false,status:'experimental-disabled'}});
  assert.doesNotMatch(text,/never-return-this/);
  const empty=createServer({env:{},fetchImpl:async()=>{throw new Error('status must not contact provider');}});
  await new Promise(resolve=>empty.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>empty.close(resolve)));
  const missing=await fetch(`http://127.0.0.1:${empty.address().port}/api/assistant-status`);
  assert.deepEqual(await missing.json(),{assistant:{available:false},localPlanner:true,laya:{available:false,status:'experimental-disabled'}});
});

test('server LLM adapter requests strict JSON and accepts only a validated experiment contract',async()=>{
  let sent;
  const spec=validIntent();
  const result=await interpretExperimentWithProvider('untrusted user text',{provider:'openai',apiKey:'server-only-test',fetchImpl:async(url,request)=>{sent={url,request};return {ok:true,json:async()=>({output_text:JSON.stringify(spec)})};}});
  assert.equal(result.available,true);assert.equal(result.source,'llm');assert.deepEqual(result.specification,spec);
  assert.equal(sent.url,'https://api.openai.com/v1/responses');
  assert.equal(sent.request.headers.authorization,'Bearer server-only-test');
  const body=JSON.parse(sent.request.body);
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);
  assert.match(body.instructions,/untrusted user text/);
  assert.equal(JSON.parse(body.input).prompt,'untrusted user text');
});

test('server LLM adapter fails closed on malformed, unsupported, or scientifically out-of-range output',async()=>{
  await assert.rejects(interpretExperimentWithProvider('prompt',{provider:'openai',apiKey:'k',fetchImpl:async()=>({ok:true,json:async()=>({output_text:'not json'})})}),/invalid_intent_provider_json/);
  const invalid=validIntent();invalid.intervention.supplement=4.1;
  await assert.rejects(interpretExperimentWithProvider('prompt',{provider:'openai',apiKey:'k',fetchImpl:async()=>({ok:true,json:async()=>({output_text:JSON.stringify(invalid)})})}),/invalid_intent_provider_contract/);
  const extra=validIntent();extra.tools=['execute'];
  await assert.rejects(interpretExperimentWithProvider('prompt',{provider:'openai',apiKey:'k',fetchImpl:async()=>({ok:true,json:async()=>({output_text:JSON.stringify(extra)})})}),/invalid_intent_provider_contract/);
});

test('interpret endpoint keeps no-key mode explicit and never returns server credentials',async t=>{
  const server=createServer({env:{LLM_PROVIDER:'openai'},fetchImpl:async()=>{throw new Error('must not contact provider without key');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const root=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(`${root}/api/interpret-experiment`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'Compare 0 versus 1 kg supplement per animal.'})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{available:false,source:'deterministic',reason:'provider_not_configured'});
  const invalid=await fetch(`${root}/api/interpret-experiment`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'x',tools:['shell']})});
  assert.equal(invalid.status,400);
});
