import test from 'node:test';
import assert from 'node:assert/strict';
import {runAmdMetabolismBatch,runComputeMetabolismBatch} from '../src/client/amd-metabolism.js';
import {createServer} from '../src/server/server.js';

test('AMD metabolism adapter sends the ordered livestock batch and verifies actual backend identity', async()=>{
  const input=Float64Array.of(330,75,.4,0,360,98,1.2,1);
  let request;
  const result=await runAmdMetabolismBatch(input,2,async(url,options)=>{
    request={url,body:JSON.parse(options.body)};
    return {ok:true,json:async()=>({backend_requested:'amd',backend_used:'amd_rocm',fallback_used:false,
      result:{values:[330.0001,75,360.0002,100]},execution_metadata:{device_name:'AMD test device',rocm_version:'test'}})};
  });
  assert.equal(request.url,'/api/amd/metabolism-batch');
  assert.deepEqual(request.body,{count:2,values:[330,75,.4,0,360,98,1.2,1]});
  assert.deepEqual(Array.from(result.values),[330.0001,75,360.0002,100]);
  assert.equal(result.backend,'amd_rocm');
  assert.equal(result.device,'AMD test device');
});

test('AMD metabolism adapter rejects explicit CPU fallback', async()=>{
  await assert.rejects(runAmdMetabolismBatch(Float64Array.of(330,75,.4,0),1,async()=>({ok:true,json:async()=>({
    backend_requested:'amd',backend_used:'cpu',fallback_used:true,
    execution_metadata:{fallback_reason:'pytorch_rocm_unavailable'},result:{values:[330,75]},
  })})),/AMD execution was not used \(cpu: pytorch_rocm_unavailable\)/);
});

test('generic metabolism adapter reports a CPU fallback truthfully',async()=>{
  let request;
  const result=await runComputeMetabolismBatch(Float64Array.of(330,75,.4,0),1,'cuda',async(url,options)=>{
    request={url,body:JSON.parse(options.body)};
    return {ok:true,json:async()=>({backend_requested:'cuda',backend_used:'cpu',backend_selected:'cuda',fallback_used:true,
      backend_availability:{cuda:{available:false,reason:'device_unavailable'}},result:{values:[330,75]},
      execution_metadata:{fallback_reason:'device_unavailable',backend_selected:'cuda'}})};
  });
  assert.equal(request.url,'/api/compute/livestock-metabolism');
  assert.equal(request.body.backend,'cuda');
  assert.equal(result.backend,'cpu');
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.fallbackReason,'device_unavailable');
});

test('Product AMD endpoint forwards a validated metabolism request to the ROCm service',async t=>{
  let forwarded;
  const server=createServer({env:{COMPUTE_SERVICE_URL:'http://compute.test'},fetchImpl:async(url,options)=>{
    forwarded={url,body:JSON.parse(options.body)};
    return {status:200,json:async()=>({backend_requested:'amd',backend_used:'amd_rocm',fallback_used:false,
      result:{values:[330.0001,75]},execution_metadata:{device_name:'AMD test device'}})};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/amd/metabolism-batch`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({count:1,values:[330,75,.4,0]}),
  });
  assert.equal(response.status,200);
  assert.equal(forwarded.url,'http://compute.test/api/compute/v1');
  assert.equal(forwarded.body.operation,'livestock_metabolism_batch');
  assert.equal(forwarded.body.preferred_backend,'amd');
  assert.deepEqual((await response.json()).result.values,[330.0001,75]);
});

test('Product AMD endpoint rejects mis-sized batches before forwarding',async t=>{
  const server=createServer({fetchImpl:async()=>{throw new Error('must not forward invalid batch');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/amd/metabolism-batch`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({count:2,values:[330,75,.4,0]}),
  });
  assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:'invalid_metabolism_batch'});
});

test('generic Product compute endpoint forwards the requested backend',async t=>{
  let forwarded;
  const server=createServer({env:{COMPUTE_SERVICE_URL:'http://compute.test'},fetchImpl:async(url,options)=>{
    forwarded={url,body:JSON.parse(options.body)};
    return {status:200,json:async()=>({backend_requested:'cuda',backend_used:'cpu',fallback_used:true,
      result:{values:[330,75]},execution_metadata:{fallback_reason:'device_unavailable'}})};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/compute/livestock-metabolism`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({count:1,backend:'cuda',values:[330,75,.4,0]}),
  });
  assert.equal(response.status,200);
  assert.equal(forwarded.url,'http://compute.test/api/compute/v1');
  assert.equal(forwarded.body.preferred_backend,'cuda');
  assert.deepEqual((await response.json()).result.values,[330,75]);
});

test('Product compute availability endpoint proxies runtime metadata',async t=>{
  const availability={cpu:{available:true},cuda:{available:false,reason:'pytorch_unavailable'},
    rocm:{available:false,reason:'pytorch_unavailable'},auto_order:['cuda','rocm']};
  const server=createServer({env:{COMPUTE_SERVICE_URL:'http://compute.test'},fetchImpl:async url=>{
    assert.equal(url,'http://compute.test/api/compute/backends');
    return {status:200,json:async()=>availability};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/compute/backends`);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),availability);
});
