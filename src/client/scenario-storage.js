const encoder=new TextEncoder();
const decoder=new TextDecoder();

function toBase64(bytes){
  if(typeof btoa==='function'){
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value){
  if(typeof atob==='function'){
    const binary=atob(value),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value,'base64'));
}

export async function encodeScenarioSnapshot(snapshot){
  if(typeof CompressionStream!=='function')throw new Error('gzip compression is unavailable');
  const stream=new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeScenarioSnapshot(encoded){
  if(typeof DecompressionStream!=='function')throw new Error('gzip decompression is unavailable');
  const bytes=fromBase64(encoded),stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(decoder.decode(await new Response(stream).arrayBuffer()));
}
