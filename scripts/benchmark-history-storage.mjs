import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
  console.log(JSON.stringify({animals: count, hours, repetitions, historyEntries: objectRing.historyEntries, snapshotsIdentical, objectRing, typedColumns}));
}
