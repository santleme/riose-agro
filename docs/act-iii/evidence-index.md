# ACT III evidence index

This index describes the evidence present on release branch `release/amd-act-iii` at `0d79e416a5297b846274001d3b3281a1e674c674`. `PRESENT` means the referenced artifact is in the repository. `DOCUMENTED` means the source or method is described in tracked code or documentation; it does not claim a fresh execution. `PENDING` means the relevant release gate is still open.

| Claim or gate | Evidence | Status |
| --- | --- | --- |
| Working product interface | [`product.html`](../../product.html), [`src/client/product-app.js`](../../src/client/product-app.js), [product screenshot](../../screenshots/product-desktop-first-screen.png) | PRESENT; candidate runtime gate remains in [#143](https://github.com/santleme/riose-agro/issues/143) |
| Deterministic scenario comparison | [`src/client/engine.js`](../../src/client/engine.js), [`src/client/worker.js`](../../src/client/worker.js), [`tests/scenarios/`](../../tests/scenarios/), [`npm run test:scenarios`](../../package.json) | DOCUMENTED; release-candidate rerun pending [#143](https://github.com/santleme/riose-agro/issues/143) |
| CPU fallback | [`src/client/worker.js`](../../src/client/worker.js), [`src/client/metabolism-wasm.js`](../../src/client/metabolism-wasm.js), [Rust/WASM decision record](../architecture/adr/0002-rust-batch-metabolism-kernel.md) | DOCUMENTED in source; release-candidate exercise pending [#143](https://github.com/santleme/riose-agro/issues/143) |
| Release tests and CI | [CI commands](../ci.md); no status checks or workflow runs are recorded for the release SHA above | PENDING [#143](https://github.com/santleme/riose-agro/issues/143) |
| Public hosted demo bound to release SHA | The [previously listed URL](https://agro-smallville-mvp.qwdqwdwqdqdqwdwwqqw.chatgpt.site) responds with an older Agroville page and does not expose the release SHA | PENDING [#142](https://github.com/santleme/riose-agro/issues/142) |
| Repository access for judges | [Repository URL](https://github.com/santleme/riose-agro) returned HTTP 404 without authentication during this audit; clean-session access is unverified | PENDING [#141](https://github.com/santleme/riose-agro/issues/141) |
| AMD product integration | The current product uses JavaScript and can use the local Rust comparison runner; the opt-in WASM metabolism path is in the legacy lab. No product workload is routed through AMD | PENDING [#137](https://github.com/santleme/riose-agro/issues/137) |
| Real AMD/ROCm execution | [Accelerator no-go report](../evidence/amd-metabolism-benchmark-no-go-2026-10.md) and [machine-readable report](../evidence/amd-metabolism-benchmark-no-go-2026-10.json) record no usable ROCm device and no accelerator timing or speedup | NO-GO on the captured WSL2 host; real-device evidence pending [#138](https://github.com/santleme/riose-agro/issues/138) |
| Scientific limitations and uncertainty | [Parameter assumptions and sources](../parametros-e-fontes.md), [uncertainty policy](../politica-incerteza.md), and [module evaluation summary](../evidence/scientific-module-evaluations-2026-10-13.md) | DOCUMENTED; not full-engine validation |
| Scientific references | [Parameter and source register](../parametros-e-fontes.md) | DOCUMENTED as contextual references; no imported dataset calibrates the full engine |
| Scientific-claims review | [Issue #146](https://github.com/santleme/riose-agro/issues/146) | PENDING final release-SHA review |
| Public screenshots | [Landing page](../../screenshots/manifesto-desktop-first-screen.png) and [product scenario](../../screenshots/product-desktop-first-screen.png) | PRESENT; screenshots illustrate the interface, not scientific or runtime validation |

## Interpretation

- No AMD execution result is available from the captured benchmark. Native CPU timings in that report are CPU-only measurements and are not evidence of GPU speedup.
- The old hosted URL and repository access do not satisfy judge-ready demo or repository gates.
- NVIDIA-specific evidence does not establish AMD support.
- Component diagnostics on public datasets are scoped to their reported populations and outcomes; they do not validate the complete simulator.
- The final test gate, hosted demo, AMD integration, real AMD execution, judge access, and scientific-claims review remain separate release dependencies.
