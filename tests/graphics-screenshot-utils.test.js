import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {comparePng,decodePng} from '../scripts/graphics-screenshot-utils.mjs';

function png(width,height,pixels){const chunk=(type,data)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);return Buffer.concat([head,data,Buffer.alloc(4)]);};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++){raw[y*(width*4+1)]=0;pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

test('PNG decoder reads Chromium-compatible RGBA files and tolerant comparison ignores small channel deltas',()=>{const baseline=decodePng(png(2,1,Buffer.from([10,20,30,255,50,60,70,255]))),near=decodePng(png(2,1,Buffer.from([20,20,30,255,50,60,70,255])));assert.deepEqual({width:baseline.width,height:baseline.height}, {width:2,height:1});assert.equal(comparePng(baseline,near,{channelTolerance:18,maxChangedRatio:0}).pass,true);});

test('PNG comparison fails a materially changed pixel and a viewport size change',()=>{const baseline=decodePng(png(2,1,Buffer.from([10,20,30,255,50,60,70,255]))),changed=decodePng(png(2,1,Buffer.from([80,20,30,255,50,60,70,255])));assert.equal(comparePng(baseline,changed,{channelTolerance:18,maxChangedRatio:.1}).pass,false);assert.equal(comparePng(baseline,decodePng(png(1,1,Buffer.from([10,20,30,255])))).reason,'dimensions');});

test('PNG comparison enforces the changed-pixel ratio boundary',()=>{const baselinePixels=Buffer.alloc(100*4*100,255),changedPixels=Buffer.from(baselinePixels);for(let i=0;i<50;i++)changedPixels[i*4]=0;const baseline=decodePng(png(100,100,baselinePixels)),changed=decodePng(png(100,100,changedPixels));assert.equal(comparePng(baseline,changed,{channelTolerance:18,maxChangedRatio:.005}).changedRatio,.005);assert.equal(comparePng(baseline,changed,{channelTolerance:18,maxChangedRatio:.005}).pass,true);changedPixels[50*4]=0;const over=decodePng(png(100,100,changedPixels));assert.equal(comparePng(baseline,over,{channelTolerance:18,maxChangedRatio:.005}).pass,false);});

test('PNG comparison detects visible alpha-channel changes',()=>{const baseline=decodePng(png(1,1,Buffer.from([40,50,60,255]))),transparent=decodePng(png(1,1,Buffer.from([40,50,60,220])));const diff=comparePng(baseline,transparent,{channelTolerance:18,maxChangedRatio:0});assert.equal(diff.pass,false);assert.equal(diff.maxChannelDelta,35);});
