# ACT III evidence index

This index reflects `release/amd-act-iii` at source SHA `5c5f07095bf1c8bddb652eb02342ff15b5cc0d56`. This is the current source candidate reviewed for this README, not the exact release-tested SHA: the final technical gate in [#143](https://github.com/santleme/riose-agro/issues/143) remains open. `PRESENT` means an artifact exists and does not imply that the linked release gate is complete.

| Claim or gate | Evidence | Current status |
| --- | --- | --- |
| Product and deterministic scenario comparison | [`product.html`](../../product.html), [`src/client/engine.js`](../../src/client/engine.js), [`tests/scenarios/`](../../tests/scenarios/), [`npm run test:scenarios`](../../package.json) | Product and scenario harness are present; candidate rerun/sign-off pending [#143](https://github.com/santleme/riose-agro/issues/143). |
| Scientific scope and approved wording | [#146 claims review](../evidence/issue-146-scientific-claims-review.md), [parameter/source register](../parametros-e-fontes.md), [uncertainty policy](../politica-incerteza.md) | Review issue [#146](https://github.com/santleme/riose-agro/issues/146) is closed. Wording remains exploratory; complete-engine calibration and validation are not established. |
| AMD Product integration | [#137 integration report](../evidence/actiii-amd-integration-137.md), merged [PR #154](https://github.com/santleme/riose-agro/pull/154), [`src/client/amd-metabolism.js`](../../src/client/amd-metabolism.js), [`src/server/compute_service.py`](../../src/server/compute_service.py) | Experimental Product route and CPU fallback are present. #137 remains open, so its release acceptance gate is not marked complete. |
| Real AMD/ROCm execution | [#137 integration report](../evidence/actiii-amd-integration-137.md), [captured-host no-go report](../evidence/amd-metabolism-benchmark-no-go-2026-10.md) | No physical device execution, output parity on hardware, or AMD timing is recorded. Captured WSL2 host had no usable ROCm device; [#138](https://github.com/santleme/riose-agro/issues/138) remains open. |
| CPU fallback and backend identity | [#137 integration report](../evidence/actiii-amd-integration-137.md), [`src/client/worker.js`](../../src/client/worker.js), [`src/client/amd-metabolism.js`](../../src/client/amd-metabolism.js) | CPU remains default. Requested AMD execution fails visibly if service/device is unavailable. Final candidate exercise is pending [#143](https://github.com/santleme/riose-agro/issues/143). |
| Public repository security | [Refreshed #139 audit checkpoint](https://github.com/santleme/riose-agro/issues/139#issuecomment-6181654090) | `PUBLIC_REPO_SECURITY_BLOCKED`: root `LICENSE` is absent and requires an owner decision; dataset reuse terms remain unresolved; latest-head secret/path/artifact scans were not completed. Repository remains private. |
| Runtime asset rights | [#140](https://github.com/santleme/riose-agro/issues/140) | Pending: issue remains open with no final asset-clearance report; shipped asset rights are not cleared. |
| Judge-accessible repository | [#141](https://github.com/santleme/riose-agro/issues/141), dependent on #139 and #140 | Pending: repository is private and clean-session judge access is unverified. |
| Hosted demo URL and deployed SHA | [#142 verification record](../evidence/actiii-deploy-issue-142-2026-10-14.md), [#142](https://github.com/santleme/riose-agro/issues/142) | `#142_BLOCKED_UNKNOWN_DEPLOY_REVISION`: no public URL/deployed SHA has been verified for the current candidate. No deployment URL is published in the README. |
| Submission screenshots and architecture | [Visual index](README.md), [scenario screenshot](screenshots/product-scenario.png), [comparison screenshot](screenshots/scenario-comparison.png), [architecture diagram](architecture/act-iii-architecture.svg), merged [PR #153](https://github.com/santleme/riose-agro/pull/153) | Artifacts are present but were captured at source SHA `0581f6574bc05547a02a88bd95ed4292a0c9b9e5`, before AMD integration. They show CPU/browser behavior and are not final-candidate visuals; [#144](https://github.com/santleme/riose-agro/issues/144) remains open. |
| Exact release-tested SHA and final gate | [#143](https://github.com/santleme/riose-agro/issues/143) | Pending. Candidate source SHA is `5c5f07095bf1c8bddb652eb02342ff15b5cc0d56`; full release checks/sign-off are not recorded. |

## Finalization blockers

Issue [#145](https://github.com/santleme/riose-agro/issues/145) requires completion after #138, #141, #142, and #143. At this checkpoint:

- **#138:** no real-device ROCm run or hardware evidence.
- **#141:** repository remains private and judge access is unverified; #139 and #140 must clear first.
- **#142:** no verified public deployment URL or deployment SHA.
- **#143:** final candidate test gate and exact tested release SHA are not recorded.

Issue #137's Product integration has merged, but its issue remains open and does not substitute for #138 hardware evidence. Keep #145 open until its required gates are complete.
