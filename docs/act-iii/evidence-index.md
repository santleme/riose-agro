# ACT III evidence index

This index reflects `release/amd-act-iii` at source SHA `e897c53b2d99ae0ae4de9db31ece281375bf96b1`. This is the current source candidate reviewed for this README, not the exact release-tested SHA: the final technical gate in [#143](https://github.com/santleme/riose-agro/issues/143) remains open. `PRESENT` means an artifact exists and does not imply that the linked release gate is complete.

| Claim or gate | Evidence | Current status |
| --- | --- | --- |
| Product and deterministic scenario comparison | [`product.html`](../../product.html), [`src/client/engine.js`](../../src/client/engine.js), [`tests/scenarios/`](../../tests/scenarios/), [`npm run test:scenarios`](../../package.json) | Product and scenario harness are present; candidate rerun/sign-off pending [#143](https://github.com/santleme/riose-agro/issues/143). |
| Scientific scope and approved wording | [#146 claims review](../evidence/issue-146-scientific-claims-review.md), [parameter/source register](../parametros-e-fontes.md), [uncertainty policy](../politica-incerteza.md) | Review issue [#146](https://github.com/santleme/riose-agro/issues/146) is closed. Wording remains exploratory; complete-engine calibration and validation are not established. |
| AMD Product integration | [#137 integration report](../evidence/actiii-amd-integration-137.md), merged [PR #154](https://github.com/santleme/riose-agro/pull/154), [`src/client/amd-metabolism.js`](../../src/client/amd-metabolism.js), [`src/server/compute_service.py`](../../src/server/compute_service.py) | `AMD_PRODUCT_PATH_FUNCTIONAL`; #137 is closed. This confirms Product integration and CPU fallback, not physical AMD execution. |
| Real AMD/ROCm execution | [#137 integration report](../evidence/actiii-amd-integration-137.md), [captured-host no-go report](../evidence/amd-metabolism-benchmark-no-go-2026-10.md) | No physical device execution, output parity on hardware, or AMD timing is recorded. Captured WSL2 host had no usable ROCm device; [#138](https://github.com/santleme/riose-agro/issues/138) remains open. |
| CPU fallback and backend identity | [#137 integration report](../evidence/actiii-amd-integration-137.md), [`src/client/worker.js`](../../src/client/worker.js), [`src/client/amd-metabolism.js`](../../src/client/amd-metabolism.js) | CPU remains default. Requested AMD execution fails visibly if service/device is unavailable. Final candidate exercise is pending [#143](https://github.com/santleme/riose-agro/issues/143). |
| Public repository security | [Refreshed #139 audit checkpoint](https://github.com/santleme/riose-agro/issues/139#issuecomment-6181654090) | `PUBLIC_REPO_SECURITY_BLOCKED`: root `LICENSE` is absent and requires an owner decision; XG-AIN terms conflict; grazing-ingestive-behavior-RDGV and Perea reuse terms are missing or unclear; scans against the current release head were not completed. Repository remains private. |
| Runtime asset rights | [#140](https://github.com/santleme/riose-agro/issues/140) | Pending: issue remains open with no final asset-clearance report; shipped asset rights are not cleared. |
| Judge-accessible repository | [#141](https://github.com/santleme/riose-agro/issues/141), dependent on #139 and #140 | Pending: repository is private and clean-session judge access is unverified. |
| Hosted demo URL and deployed SHA | [#142 verification record](../evidence/actiii-deploy-issue-142-2026-10-14.md), [#142](https://github.com/santleme/riose-agro/issues/142) | `#142_BLOCKED_UNKNOWN_DEPLOY_REVISION`: no public URL/deployed SHA has been verified for the current candidate. No deployment URL is published in the README. |
| Submission screenshots and architecture | [Visual index](README.md), [scenario screenshot](screenshots/product-scenario.png), [comparison screenshot](screenshots/scenario-comparison.png), [comparison details](screenshots/scenario-comparison-details.png), [architecture diagram](architecture/act-iii-architecture.svg), merged [PR #155](https://github.com/santleme/riose-agro/pull/155) | `SUBMISSION_VISUALS_READY`; #144 is closed. Captures are based on `5c5f07095bf1c8bddb652eb02342ff15b5cc0d56`, show CPU/browser behavior, and do not claim AMD execution or hosted deployment. |
| Exact release-tested SHA and final gate | [#143](https://github.com/santleme/riose-agro/issues/143) | Pending. Current source candidate SHA is `e897c53b2d99ae0ae4de9db31ece281375bf96b1`; full release checks/sign-off and exact tested SHA are not recorded. |

## Finalization blockers

Issue [#145](https://github.com/santleme/riose-agro/issues/145) requires completion after #138, #141, #142, and #143. The additional publication prerequisites #139 and #140 also remain incomplete. At this checkpoint:

- **#138:** `AMD_EXECUTION_VERIFIED` is pending and frozen until real AMD/ROCm hardware is available; no device execution, hardware parity, or AMD timing is recorded.
- **#139:** `PUBLIC_REPO_SECURITY_BLOCKED`; choose/add a root license, resolve or remove datasets with conflicting/missing reuse terms, then complete fresh current-candidate security scans.
- **#140:** `RUNTIME_ASSETS_RELEASE_CLEARED` is pending; no final shipped-asset rights report or #98 manifest validation is recorded.
- **#141:** `PUBLIC_REPO_ACCESSIBLE` is pending; the repository remains private and judge access is unverified. #139 and #140 must clear first.
- **#142:** `PUBLIC_DEMO_VERIFIED` is pending; no verified public URL or deployment SHA exists for the candidate, so the README publishes no deployment URL.
- **#143:** `RELEASE_GATE_PASS` is not recorded; final candidate checks and exact tested release SHA are pending.

Issue #137's Product integration is closed as `AMD_PRODUCT_PATH_FUNCTIONAL`, and #144 is closed as `SUBMISSION_VISUALS_READY`. These do not substitute for #138 hardware evidence. Keep #145 open until its required gates are complete.
