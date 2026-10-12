import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {benchmarkReport,measurement} from './benchmark-report.mjs';

const child = fileURLToPath(new URL('./benchmark-history-storage-child.mjs', import.meta.url));
const herds = (process.env.BENCH_HISTORY_HERDS ?? '1000,10000').split(',').map(Number);
const repetitions = Number(process.env.BENCH_REPETITIONS ?? 5), hours = Number(process.env.BENCH_HISTORY_HOURS ?? 720);

for (const count of herds) {
  const results = {};
  for (const variant of ['objectRing', 'typedColumns']) {
    const run = spawnSync(process.execPath, ['--expose-gc', child, variant, String(count), String(hours), String(repetitions)], {encoding: 'utf8'});
    if (run.status !== 0) throw new Error(run.stderr || `History benchmark child failed: ${variant}, exit ${run.status}`);
    results[variant] = JSON.parse(run.stdout.trim());
  }
  const {snapshotDigest: objectDigest, ...objectRing} = results.objectRing;
  const {snapshotDigest: columnsDigest, ...typedColumns} = results.typedColumns;
  const snapshotsIdentical = objectDigest === columnsDigest && objectRing.historyEntries === typedColumns.historyEntries;
  if (!snapshotsIdentical) throw new Error(`History representations diverged for ${count} animals`);
  const benchmarkResults={animals:count,hours,repetitions,historyEntries:objectRing.historyEntries,snapshotsIdentical,objectRing,typedColumns};
  const phases={
    engine:{status:'measured',measurements:[
      measurement('engine','tick','ms',objectRing.tickStatistics,{population:count,implementation:'objectRing',memory:{retainedHeapDeltaBytesMedian:objectRing.retainedHeapDeltaBytesMedian,retainedArrayBuffersDeltaBytesMedian:objectRing.retainedArrayBuffersDeltaBytesMedian,retainedRssBytesMedian:objectRing.retainedRssBytesMedian}}),
      measurement('engine','tick','ms',typedColumns.tickStatistics,{population:count,implementation:'typedColumns',memory:{retainedHeapDeltaBytesMedian:typedColumns.retainedHeapDeltaBytesMedian,retainedArrayBuffersDeltaBytesMedian:typedColumns.retainedArrayBuffersDeltaBytesMedian,retainedRssBytesMedian:typedColumns.retainedRssBytesMedian}}),
    ]},
    snapshot:{status:'measured',measurements:[
      measurement('snapshot','materialize','ms',objectRing.snapshotStatistics,{population:count,implementation:'objectRing',memory:{materializedHeapDeltaBytesMedian:objectRing.materializedHeapDeltaBytesMedian,materializedArrayBuffersDeltaBytesMedian:objectRing.materializedArrayBuffersDeltaBytesMedian,materializedRssBytesMedian:objectRing.materializedRssBytesMedian}}),
      measurement('snapshot','materialize','ms',typedColumns.snapshotStatistics,{population:count,implementation:'typedColumns',memory:{materializedHeapDeltaBytesMedian:typedColumns.materializedHeapDeltaBytesMedian,materializedArrayBuffersDeltaBytesMedian:typedColumns.materializedArrayBuffersDeltaBytesMedian,materializedRssBytesMedian:typedColumns.materializedRssBytesMedian}}),
    ]},
  };
  console.log(JSON.stringify(benchmarkReport({name:'history-storage-comparison',workload:{seed:20261012,populations:[{animals:count,scope:'FarmEngine',limit:'FarmEngine maximum 10000'}],hours},configuration:{warmupRuns:1,repetitions},phases,results:benchmarkResults})));
}
