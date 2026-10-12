# Resuming scenario-directory batches

Run the existing scenario runner with `--resume` to persist a versioned batch plan, JSONL run records, and a separate error journal:

```sh
npm run test:scenarios -- --resume
```

Optional positional paths still select the scenario and result directories. The plan is written before a run starts. Each status update rewrites the manifest via a same-directory temporary file and atomic rename. A completed result is appended as one JSONL record before its manifest entry is marked completed. If a process stops between those writes, the entry remains incomplete and runs again on the next invocation.

At restart, the runner verifies manifest identity, result record digests, and each per-scenario result file digest. It skips only a completed run with both verified records. Corrupt/truncated JSONL rows are discarded during streaming compaction; corrupt or missing per-scenario files cause that run to be retried. A failed run is recorded in `batch-results.jsonl.errors.jsonl`; other runs continue. The in-memory result return is capped at 100 records while all durable rows remain in JSONL. The engine build digest covers `engine.js`, metabolism, environment and feeding source modules, and is recomputed for each invocation.

The runner rejects a resume if a scenario digest, seed, engine build identity, input, dataset/evidence link, or model identity differs. Start a new result directory for a changed experiment plan. Existing non-resumable invocation and `.result.json` output shape remain available.

## Overhead measurement

`node --expose-gc scripts/benchmark-resumable-journal.mjs` runs five synthetic batches of 25 records with zero and 2 ms simulated execution per run:

| Simulated run duration | Batch median | Approximate journal overhead | Heap after batch |
| ---: | ---: | ---: | ---: |
| 0 ms | 40.63 ms | 40.63 ms total, 1.63 ms/run | 6.4 MB |
| 2 ms | 91.94 ms | 41.94 ms total, 1.68 ms/run | 6.6 MB |

This measurement isolates filesystem and manifest work; actual result size and simulation runtime will change the ratio. Heap is sampled after forced GC where available and excludes peak RSS. Raw report: `docs/evidence/resumable-journal-benchmark-2026-10.json`.
