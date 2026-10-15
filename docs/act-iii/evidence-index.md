# ACT III evidence index

This index describes the evidence present on release branch `release/amd-act-iii` at `5c5f07095bf1c8bddb652eb02342ff15b5cc0d56`. `PRESENT` means the referenced artifact is in the repository. `DOCUMENTED` means the source or method is described in tracked code or documentation; it does not claim a fresh execution. `PENDING` means the relevant release gate is still open.

| Claim or gate | Evidence | Status |
| --- | --- | --- |
| Working product interface | [`product.html`](../../product.html), [`src/client/product-app.js`](../../src/client/product-app.js), [product screenshot](../../screenshots/product-desktop-first-screen.png) | PRESENT; candidate runtime gate remains in [#143](https://github.com/santleme/riose-agro/issues/143) |
| Deterministic scenario comparison | [`src/client/engine.js`](../../src/client/engine.js), [`src/client/worker.js`](../../src/client/worker.js), [`tests/scenarios/`](../../tests/scenarios/), [`npm run test:scenarios`](../../package.json) | DOCUMENTED; release-candidate rerun pending [#143](https://github.com/santleme/riose-agro/issues/143) |
| CPU fallback | [`src/client/worker.js`](../../src/client/worker.js), [`src/client/metabolism-wasm.js`](../../src/client/metabolism-wasm.js), [Rust/WASM decision record](../architecture/adr/0002-rust-batch-metabolism-kernel.md) | DOCUMENTED in source; release-candidate exercise pending [#143](https://github.com/santleme/riose-agro/issues/143) |
| Release tests and CI | [CI commands](../ci.md); no status checks or workflow runs are recorded for the release SHA above | PENDING [#143](https://github.com/santleme/riose-agro/issues/143) |
| Public hosted demo bound to release SHA | The previously listed deployment served an older Agroville page and did not expose the release SHA; its deployed revision cannot be tied to the release branch | BLOCKED: `#142_BLOCKED_UNKNOWN_DEPLOY_REVISION` ([#142](https://github.com/santleme/riose-agro/issues/142)) |
| Public repository security | The [#139 audit](https://github.com/santleme/riose-agro/issues/139) records `PUBLIC_REPO_SECURITY_BLOCKED` for unresolved license and runtime-asset clearance | BLOCKED |
| Repository access for judges | [Repository URL](https://github.com/santleme/riose-agro) returned HTTP 404 without authentication during the audit; clean-session access is unverified | PENDING [#141](https://github.com/santleme/riose-agro/issues/141) |
| AMD product integration | Experimental Product AMD/ROCm metabolism route and explicit CPU fallback are present in [`src/client/amd-metabolism.js`](../../src/client/amd-metabolism.js), [`src/client/worker.js`](../../src/client/worker.js), and the [#137 integration report](../evidence/actiii-amd-integration-137.md) | IMPLEMENTED PATH; #137 remains open, so release acceptance is PENDING [#137](https://github.com/santleme/riose-agro/issues/137) |
| Real AMD/ROCm execution | [Accelerator no-go report](../evidence/amd-metabolism-benchmark-no-go-2026-10.md) and [machine-readable report](../evidence/amd-metabolism-benchmark-no-go-2026-10.json) record no usable ROCm device and no accelerator timing or speedup | NO-GO on the captured WSL2 host; real-device evidence pending [#138](https://github.com/santleme/riose-agro/issues/138) |
| Scientific limitations and uncertainty | [Parameter assumptions and sources](../parametros-e-fontes.md), [uncertainty policy](../politica-incerteza.md), and [module evaluation summary](../evidence/scientific-module-evaluations-2026-10-13.md) | DOCUMENTED; not full-engine validation |
| Scientific references | [Parameter and source register](../parametros-e-fontes.md) | DOCUMENTED as contextual references; no imported dataset calibrates the full engine |
| Scientific-claims review | The [#146 review report](../evidence/issue-146-scientific-claims-review.md) and its approved wording were merged in [PR #151](https://github.com/santleme/riose-agro/pull/151) | COMPLETE; review issue [#146](https://github.com/santleme/riose-agro/issues/146) is closed |
| Public screenshots | [Landing page](../../screenshots/manifesto-desktop-first-screen.png) and [product scenario](../../screenshots/product-desktop-first-screen.png) | PRESENT; screenshots illustrate the interface, not scientific or runtime validation |

## Interpretation

- No AMD execution result is available from the captured benchmark. Native CPU timings in that report are CPU-only measurements and are not evidence of GPU speedup.
- The previously listed deployment and repository access do not satisfy judge-ready demo or repository gates.
- NVIDIA-specific evidence does not establish AMD support.
- Component diagnostics on public datasets are scoped to their reported populations and outcomes; they do not validate the complete simulator.
- Scientific-claims review is complete. Final candidate checks, hosted demo SHA verification, #137 release acceptance, real AMD execution, and judge access remain separate open release dependencies.
