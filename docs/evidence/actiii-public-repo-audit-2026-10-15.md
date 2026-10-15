# ACT III public repository release audit

Audit date: 15 October 2026
Audited release ref: `release/amd-act-iii` at `db741d77ed67fd4f4621ee7f56e05b3b6f595ecc`
Repository visibility: private (confirmed through GitHub repository metadata)
Issue #140: closed as completed; final issue comment records `#140_RUNTIME_ASSETS_RELEASE_CLEARED` and PR #156 at the audited release SHA.
Root license: canonical Apache License 2.0 is present at `LICENSE`; the owner decision is recorded in #140.

## Refreshed checks at the audited SHA

| Area | Result | Evidence |
|---|---|---|
| Secrets and credentials | PASS | Bounded deterministic scan across 1,659 tracked files. No high-confidence key, token, private-key, or bearer-credential match. Eleven broad credential-pattern hits are test sentinels in `tests/explanation.test.js` and `tests/run-history.test.js`, not credentials. No tracked `.env` or credential-named files. Dedicated scanners (gitleaks, trufflehog, detect-secrets, git-secrets) were unavailable in the execution environment. |
| Personal information | PASS | Email-pattern hits are a vendored Pixi copyright contact and a synthetic test identity; neither is a project-owner contact. |
| Local paths | FIXED IN THIS PR | The release tree had 30 absolute local-path occurrences in 24 evidence files under `docs/evidence/native-simd-2026-10-14/` and `docs/evidence/rea-*.json`. This PR uses shell-safe `$WORKSPACE` in replayable timing commands and the neutral `<workspace>` placeholder in static evidence while preserving path context. |
| Private endpoints | PASS | No RFC1918 IPv4 addresses found. Loopback references are confined to development/test contexts. |
| Generated and large artifacts | REVIEWED | Three tracked files exceed 5 MiB: NANP source archive (11,071,388 bytes; manifest records the USDA Ag Data Commons U.S. Public Domain label), precision-beef 90-second RF JSON gzip (8,915,606 bytes; generated fixture, decompressed JSON has no email or absolute-path matches), and MDPI Angus supplement (5,772,397 bytes; CC BY 4.0). These are documented dataset/experiment inputs, not build caches or private exports. |
| Dataset and third-party rights | PASS WITH EVIDENCE | All 24 current `data/**/manifest.json` files were enumerated and their source/license metadata reviewed. The existing #140 rights report records the resolved dataset actions and removal of the XGain files with conflicting grants. NANP and the MDPI Angus supplement are explicitly listed in `THIRD-PARTY-NOTICES.md`; their manifests and the MDPI README retain source, license, and attribution evidence. No new conflicting grant was identified. |
| Runtime assets | PASS | #140 is closed; its release comment records `RUNTIME_ASSETS_RELEASE_CLEARED`. Its report identifies 60 shipped runtime assets as `RELEASED` and the #98 gate as passing with zero manifest issues. |
| Root license and notices | PASS | Root `LICENSE` is Apache-2.0. `THIRD-PARTY-NOTICES.md` records third-party dataset terms independently from the project license. |
| Repository history | PASS, bounded | The prior #150 audit covered 397 earlier release commits. This refresh scanned the 29-commit delta from `0d79e416a5297b846274001d3b3281a1e674c674` to the audited SHA for high-confidence secret patterns; no matches. No history rewrite is indicated. |

The local-path fix changes evidence text only. It does not change product behavior or scientific results. PR #150’s historical privacy fixes remain in the release.

## Files reviewed

- All tracked paths (1,659 files), with targeted secret, credential, personal-contact, local-path, and private-IP scans.
- All 24 `data/**/manifest.json` files and the rights source notes identified by #140.
- `LICENSE`, `THIRD-PARTY-NOTICES.md`, and `docs/evidence/actiii-public-rights-140.md`.
- The three tracked artifacts larger than 5 MiB.
- The 29 commits since the previous #139 audit base, in addition to the earlier 397-commit history scope recorded by #150.

## Decision

`PUBLIC_REPO_SECURITY_BLOCKED` on the audited release tip until this PR's local-path redactions and notice additions are integrated into `release/amd-act-iii` and the targeted scans are confirmed on the new tip. The repository remains private. No history rewrite is needed. Issue #139 remains open.
