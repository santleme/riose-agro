import {inflateSync} from 'node:zlib';

// Chromium's PNG screenshots use 8-bit RGBA. Keep this intentionally dependency-free
// so the regression harness works with the repository's existing Node runtime.
export function decodePng(buffer) {
  if (buffer.toString('hex',0,8)!=='89504e470d0a1a0a') throw new Error('Invalid PNG signature.');
  let offset=8,width,height,bitDepth,colorType,interlace;const parts=[];
  while(offset<buffer.length){const length=buffer.readUInt32BE(offset);offset+=4;const type=buffer.toString('ascii',offset,offset+4);offset+=4;const data=buffer.subarray(offset,offset+length);offset+=length+4;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];}else if(type==='IDAT')parts.push(data);else if(type==='IEND')break;}
  if(bitDepth!==8||![2,6].includes(colorType)||interlace!==0)throw new Error(`Unsupported PNG format (depth=${bitDepth}, color=${colorType}, interlace=${interlace}).`);
  const channels=colorType===6?4:3,stride=width*channels,raw=inflateSync(Buffer.concat(parts)),pixels=Buffer.alloc(height*stride);let source=0;
  for(let y=0;y<height;y++){const filter=raw[source++],row=y*stride;for(let x=0;x<stride;x++){const value=raw[source++],left=x>=channels?pixels[row+x-channels]:0,above=y?pixels[row-stride+x]:0,upperLeft=y&&x>=channels?pixels[row-stride+x-channels]:0;let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=above;else if(filter===3)predictor=Math.floor((left+above)/2);else if(filter===4){const p=left+above-upperLeft,pa=Math.abs(p-left),pb=Math.abs(p-above),pc=Math.abs(p-upperLeft);predictor=pa<=pb&&pa<=pc?left:pb<=pc?above:upperLeft;}else if(filter!==0)throw new Error(`Unsupported PNG filter ${filter}.`);pixels[row+x]=(value+predictor)&255;}}
  if(colorType===2){const rgba=Buffer.alloc(width*height*4);for(let i=0,j=0;i<pixels.length;i+=3,j+=4){rgba[j]=pixels[i];rgba[j+1]=pixels[i+1];rgba[j+2]=pixels[i+2];rgba[j+3]=255;}return{width,height,pixels:rgba};}
  return{width,height,pixels};
}

export function comparePng(expected,actual,{channelTolerance=18,maxChangedRatio=.035}={}) {
  if(expected.width!==actual.width||expected.height!==actual.height) return {pass:false,reason:'dimensions',expected:{width:expected.width,height:expected.height},actual:{width:actual.width,height:actual.height},changedRatio:1,maxChannelDelta:255};
  let changed=0,maxChannelDelta=0;const total=expected.width*expected.height;
  for(let i=0;i<total;i++){let pixelDelta=0;for(let channel=0;channel<3;channel++){const delta=Math.abs(expected.pixels[i*4+channel]-actual.pixels[i*4+channel]);pixelDelta=Math.max(pixelDelta,delta);}maxChannelDelta=Math.max(maxChannelDelta,pixelDelta);if(pixelDelta>channelTolerance)changed++;}
  const changedRatio=changed/total;return{pass:changedRatio<=maxChangedRatio,changedPixels:changed,totalPixels:total,changedRatio,maxChannelDelta,channelTolerance,maxChangedRatio};
}
