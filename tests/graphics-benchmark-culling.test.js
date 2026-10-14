import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../graphics-poc/app.js', import.meta.url), 'utf8');
const refreshScene = app.slice(app.indexOf('function refreshScene()'), app.indexOf('function drawCanvas('));
const recordFrame = app.slice(app.indexOf('function recordFrame('), app.indexOf('async function initPixi('));
const frameStats = app.slice(app.indexOf('function frameStats()'), app.indexOf('function pixiFrame('));
const benchmark = app.slice(app.indexOf('async function runGraphicsBenchmark('), app.indexOf('async function initialize('));
const control = app.slice(app.indexOf('window.__graphicsControl = {'), app.indexOf('};', app.indexOf('window.__graphicsControl = {')) + 2);
const harness = await readFile(new URL('../scripts/benchmark-graphics-poc.mjs', import.meta.url), 'utf8');

test('culling timing is recorded once per actual scene refresh, never once per render frame', () => {
  assert.match(refreshScene, /state\.cullingMs = performance\.now\(\) - cullingStarted;\s*state\.cullingTimes\.push\(state\.cullingMs\);/);
  assert.doesNotMatch(recordFrame, /cullingTimes\.push/);
  assert.equal([...app.matchAll(/cullingTimes\.push\(/g)].length, 1);
});

test('benchmark stats expose real culling executions separately from render-frame samples', () => {
  assert.match(frameStats, /renderFrameSampleCount:\s*framesMs\.length/);
  assert.match(frameStats, /cullingExecutionCount:\s*cullingMs\.length/);
  assert.match(frameStats, /cullingSamplesMs:\s*cullingMs/);
  assert.match(benchmark, /state\.cullingTimes = \[\][\s\S]*?refreshScene\(\);\s*const frames = await captureFrames\(durationMs\)/);
  assert.match(control, /refreshScene: \(\) => refreshScene\(\)/);
  assert.match(harness, /__graphicsControl\.clearStats\(\)[\s\S]*?__graphicsControl\.refreshScene\(\)/);
});
