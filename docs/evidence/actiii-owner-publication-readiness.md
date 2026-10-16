# ACT III owner-publication readiness review

Review date: 15 October 2026

This is a historical review of the `main` and release snapshots listed below; the release audit is not a publication clearance for later `main` commits.

## Verified release gate

- Repository: `santleme/riose-agro`; current visibility is private.
- `release/amd-act-iii`: `acb5cdf6e3bc23d7e48026bc736da05427f89907`.
- Issue #139 is closed; its final comment records `PUBLIC_REPO_SECURITY_PASS` for that exact release SHA. That audit covers the release tree and its reviewed history.
- Issue #140 is closed with `#140_RUNTIME_ASSETS_RELEASE_CLEARED`; the report records 60 runtime assets released and the #98 gate with zero manifest issues.
- The release ref includes a root Apache-2.0 `LICENSE`, `THIRD-PARTY-NOTICES.md`, README, and `docs/evidence/actiii-public-repo-audit-2026-10-15.md`.

## Findings for the reviewed `main` snapshot

This readiness preparation is based on `main` at `fcd4254b1568a4f1fab3078c1beaff8f3f3dec95`. Compared with the release ref, `main` and `release/amd-act-iii` have diverged: main is 46 commits ahead of their merge base `0d79e416a5297b846274001d3b3281a1e674c674`; release is 33 commits ahead of that base. The release audit does not establish that the main-only commits or all repository refs are clear for publication.

Before making the repository public from that snapshot, resolve these items:

1. **XGain dataset rights:** the integration tree removes the source ZIP, derived Parquet, manifest, quality artifact, processor, and active readiness entries because the Zenodo record declares CC BY 4.0 while the embedded README says CC BY-NC. No reuse right is claimed. Earlier commits and other refs may still contain the files; review every ref intended for publication and its reachable history, then resolve any remaining redistribution exposure before publication.
2. **Audit the publication surface:** re-run the #139 security, privacy, license, data-rights, and history review against the final intended `main` SHA and every ref that will become public. Record the scanned commit/ref scope and results. Do not treat the release-only #139 pass as covering the main-only commits.
3. **Align release and deployment:** confirm which exact `main` SHA is deployed and submitted, then reconcile it with the audited release. The currently divergent branches are not interchangeable.
4. **Finish public checks after owner publication:** when the owner decides the prior gates pass, change visibility manually and test the repository, README, source, LICENSE, notices, and audit/runtime evidence from an unauthenticated session. Record tested URLs and SHA in #141. Close #141 only after those checks succeed.

## Integration update — 16 October 2026

- The integration worktree starts from `main` at `ae3bb1f880c7fb84762e1ea911d23bafc51b05a8` and reviews `release/amd-act-iii` at `f76b7df0b075ca3a6d0186504e7ce6cead6607cc`. These refs have diverged from their common base; the release audit does not cover the 149 main-only commits or all intended publication refs.
- The current integration tree removes the XGain source archive, derived data, manifest, quality artifact, processor, and active readiness entries because its license statements conflict. No redistribution or reuse right is claimed. Earlier commits and other refs may still contain the files; review their reachable history before publication.
- The repository remains private. Re-run the security, privacy, rights, and history audit against the final synchronized `main` and every ref intended for publication; then verify the exact deployment and public surface.

## Decision

`PUBLIC_REPO_READY_FOR_OWNER_PUBLICATION` was **not satisfied** for the reviewed 15 October snapshot and remains unverified for the 16 October integration tree. The active tree no longer contains the XGain data, but reachable history and other refs still need review. This change does not make the repository public.
