# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: `b16d288` (`feat: add reproducible multi-scenario set contract`); P3-003/P3-005 source has now passed tests and awaits its commit.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest and deterministic replay; P3-003 Worker/UI; P3-005 cancellation.
Task in progress: none.
Files changed: Product V3 SDD bundle and audit; `src/client/scenario-set.js`; `src/client/worker.js`; Worker protocol; Product V3 page/styles/app; server static-file allowlist; public contract, Worker, app and browser E2E tests; desktop screenshots.
Tests executed: `npm run test:scenario-set` (8/8); `node --test tests/scenario-contract.test.js tests/scenario-goldens.test.js` (11/11); app/protocol/scenario tests (15/15); `npm run test:e2e:scenario-lab`; `npm run test:e2e:product`; full `npm test` (474/474); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints).
Passing checks: shared snapshot/seed multi-arm replay; input review before execution; Worker progress/results; export/import/replay; cancel without partial result; stable population IDs; mobile width; no browser console errors; Product V2 manifest/golden/E2E and existing JS/Rust trajectory parity.
Known failures: none in current slices. Large-population browser timing/memory/payload is not measured.
Scientific limitations: FarmEngine is illustrative; BR-CORTE Eq. 2.6 requires supplied ADG and only supports its published domain; no Riose independent full-use validation or paid-customer gate has passed.
Visual limitations: V3 scenario lab currently has desktop initial/results screenshots and a 390px mobile no-overflow check; broader browser/device and assistive-technology matrix remains.
Next action: commit P3-003/P3-005 UI and Worker slice; then start P3-004, the isolated BR-CORTE Eq. 2.6 calculator. Keep paid customer readiness blocked pending P3-008.
Blocked dependencies: Paid AI plan/explainer awaits BEH-016 shared spend ceiling; paid-customer decision use awaits P3-008 evidence review; large population parity/performance awaits P2-007/P2-008/P3-006.
