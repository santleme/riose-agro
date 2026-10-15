# Hybrid compute v2 integration audit

Captured 2026-10-13 in the isolated `codex/hybrid-compute-performance` worktree. No main branch or PR branch was merged or modified.

## Compared revisions

| Line | Revision | Scope |
| --- | --- | --- |
| Main/base | `16fa6ec` | Shared starting point for the hybrid proof of concept and PR #116 integration work |
| Hybrid proof of concept | `a6c56bb` | Local-first JS/Rust/Modal contracts, reusable Rust scratch buffers, and isolated Modal metabolism adapter |
| Hybrid v2 source | `a6293fd` | Bounded scenario scheduler, resumable journal, exact-profile executor selection, and local hybrid benchmarks |
| PR #116 | `b7b03ef` | Separate open PR worktree at `/home/lucas_coimbra/.codex/worktrees/0bec/riose-agro` |

The locally cached `origin/pr/116` tracking ref was behind during the audit; `git ls-remote origin refs/pull/116/head` confirmed the current PR head is `b7b03efe08b3889774aaf7959adaa6d5d5f47b3a`. The separate worktree was clean after its test run.

## Conflict and preservation decisions

The hybrid proof of concept and PR #116 overlap in `crates/riose-core/src/simulation.rs`, `src/client/worker.js`, and `package.json`. The simulation overlap is substantive: hybrid retains reusable metabolism scratch buffers, while PR #116 adds configured-comparison APIs and result types. The worker overlap is also substantive: the hybrid branch preserves explicit backend policy and response identity; PR #116 adds configured comparison and replay messages. A blind merge would lose one of these sets of behavior.

This worktree keeps the hybrid implementation for those paths and imports the #108 scheduler/report helpers selectively from PR #116: `scenario-worker-pool.js`, the batch manifest and journal, dispatch validation, report schema and their tests. The existing resumable runner and benchmark variants were retained and extended rather than replaced with PR copies. The PR worktree, its configured comparison UI/run-history contract, BR-CORTE work, scientific tests and graphics work were left intact. No Scene Composer, mini-diorama or selective-rendering source files changed in the hybrid v2 commits.

Configured comparisons remain in PR #116's worktree and are not routed to a remote backend here. The PR's browser manifest (`riose-configured-comparison` v1) and Rust CLI request (`configured-comparison` v2) are different contracts; the hybrid batch harness currently accepts scenario-harness v1. They need explicit versioned dispatch and provenance mapping before they can share the hybrid executor. The UI continues to run interactive comparisons locally. This is the conflict boundary chosen for this reviewable infrastructure commit; it does not modify or close PR #116.

The local Rust CLI path now records the actual native engine version/build ID in each result, while the manifest marks a native engine build as unverified until the native result is returned. `scenarioScienceDigest` excludes runtime duration metadata so scientific outputs remain comparable; the full result digest still protects the complete saved record.

## Test suite comparison

| Checkout | JavaScript | Rust | Python | Notes |
| --- | ---: | ---: | ---: | --- |
| Hybrid v2 worktree | 388/388 passed | 44/44 passed | 32/32 passed | Includes the prior 331 JS checks plus 57 V2 additions; `cargo fmt --check` passed |
| PR #116 worktree (`b7b03ef`) | 566/566 passed | 54/54 passed | 101 passed, 7 import errors | The seven Python errors are missing environment packages: pandas (4 modules), scikit-learn, pyarrow and openpyxl. No PR files were changed. |

The 178 additional JS checks in PR #116 cover scientific, data and product work that was not copied into the narrower hybrid worktree. They remain available on the PR branch. Rust coverage grew from 44 to 54 there, including BR-CORTE/reference behavior. The current hybrid branch adds 57 JS tests for reports, manifests, journal recovery, Worker scheduling, executor choice and native-runner provenance. The hybrid branch's baseline Python suite passed in full; PR Python coverage could not fully import without the listed packages.

## Scheduler and executor evidence

The exact measurements live in [scenario-scheduler-100-v2.json](scenario-scheduler-100-v2.json); the generated exact-host profile is [executor-profile-v2.json](executor-profile-v2.json). Auto selection requires exact operation, scenario count, animal count, duration, CPU, platform, architecture and Node version, then selects the fastest parity-passed p95 inside memory/cost limits. The profile contains only local JS scheduler measurements. Local Rust is used for the separately measured headless 30-day housing comparison when explicitly requested; Modal has no candidate record because cold/warm and end-to-end measurements do not exist.

The worker cap is at most four and never exceeds the batch size. Worker old-generation size is limited to 128 MiB by default, but RSS polling is observational, not a hard process cap. The benchmark profile is specific to this WSL2 machine and is not evidence for another host. The five-sample p95s for 1,000 scenarios need more repetitions before a production SLA decision.

## Integrated PR worktree validation

After selective integration, automatic scheduler selection, and the journal checkpoint optimization, the isolated `codex/pr116-rust-integration` worktree passed 582/582 JavaScript tests, 54/54 Rust tests, and 164 Python tests plus 8 subtests. This includes the PR #116 scientific and product coverage and the added native-route, parity, replay, journal-recovery, benchmark-profile, and scheduler checks. The earlier PR audit's Python import errors were caused by a missing package set in that audit environment; the integrated validation used `/tmp/riose-scientific-audit-venv` and passed. The full benchmark and backend recommendation are in [`hybrid-v2-integration-results.md`](hybrid-v2-integration-results.md).

No Modal call, deployment, paid workload, remote token or cloud data transfer occurred. Modal remains an explicit opt-in candidate; local JavaScript is the fail-safe default. The browser and visual paths remain local.
