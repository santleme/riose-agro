# ACT III owner-publication readiness review

Review date: 15 October 2026

## Verified release gate

- Repository: `santleme/riose-agro`; current visibility is private.
- `release/amd-act-iii`: `acb5cdf6e3bc23d7e48026bc736da05427f89907`.
- Issue #139 is closed; its final comment records `PUBLIC_REPO_SECURITY_PASS` for that exact release SHA. That audit covers the release tree and its reviewed history.
- Issue #140 is closed with `#140_RUNTIME_ASSETS_RELEASE_CLEARED`; the report records 60 runtime assets released and the #98 gate with zero manifest issues.
- The release ref includes a root Apache-2.0 `LICENSE`, `THIRD-PARTY-NOTICES.md`, README, and `docs/evidence/actiii-public-repo-audit-2026-10-15.md`.

## Current-main blockers

This readiness preparation is based on `main` at `fcd4254b1568a4f1fab3078c1beaff8f3f3dec95`. Compared with the release ref, `main` and `release/amd-act-iii` have diverged: main is 46 commits ahead of their merge base `0d79e416a5297b846274001d3b3281a1e674c674`; release is 33 commits ahead of that base. The release audit does not establish that the main-only commits or all repository refs are clear for publication.

Before making the repository public, resolve these items:

1. **XGain dataset rights:** current `main` contains the source ZIP and derived Parquet for `data/xgain-cattle-behavior`. Its manifest records CC BY 4.0 in the Zenodo record but CC BY-NC in the archive README and marks reuse conditional. Obtain authoritative terms or remove the dataset and derived files from every ref intended for publication; review reachable history for continued redistribution exposure.
2. **Audit the publication surface:** re-run the #139 security, privacy, license, data-rights, and history review against the final intended `main` SHA and every ref that will become public. Record the scanned commit/ref scope and results. Do not treat the release-only #139 pass as covering the 46 main-only commits.
3. **Align release and deployment:** confirm which exact `main` SHA is deployed and submitted, then reconcile it with the audited release. The currently divergent branches are not interchangeable.
4. **Finish public checks after owner publication:** when the owner decides the prior gates pass, change visibility manually and test the repository, README, source, LICENSE, notices, and audit/runtime evidence from an unauthenticated session. Record tested URLs and SHA in #141. Close #141 only after those checks succeed.

## Prepared in this PR

- Add the already selected Apache-2.0 project license and the release branch's third-party notices to `main`.
- Add the XGain conflict as an explicit publication blocker; these notices do not grant a new right or clear the dataset.
- Link this review from the root README.

## Decision

`PUBLIC_REPO_READY_FOR_OWNER_PUBLICATION` is **not yet satisfied**. The owner publication step must remain gated until the current-main XGain rights conflict and the expanded audit scope are resolved and documented. This PR prepares the documentation but does not make the repository public.
