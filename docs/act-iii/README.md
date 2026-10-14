# ACT III submission visuals

This index contains screenshots from the current Product page and an implementation-based architecture diagram for `release/amd-act-iii`.

## Screenshots

- [Product scenario](screenshots/product-scenario.png): 24-animal farm view with the supported climate, diet, and supplement adjustment visible in the Product interaction.
- [Scenario comparison](screenshots/scenario-comparison.png): fixed 30-day pasture-versus-confinement comparison, chart, result cards, and the Product's illustrative-model disclaimers.

Both captures use the same 1440 × 1400 CSS-pixel viewport at 1× scale and were taken from the running Product page at `http://127.0.0.1:8000/product.html` in Microsoft Edge 155.0.4283.45. The server was a local Python static HTTP server. The comparison therefore used the browser JavaScript path; it did not use the app's loopback native Rust runner, explanation endpoint, or an AMD device.

Capture source: branch `release/amd-act-iii`, SHA `0581f6574bc05547a02a88bd95ed4292a0c9b9e5`.

### Shown scenarios

- Product: `Set climate to hot, balanced diet, supplement 1`. The UI confirms hot climate, balanced feed, and 1 kg dry matter supplement per animal per day. The app also states that these conditions are not calibrated forecasts.
- Comparison: `Compare 30 days`. Product compared the same simulated snapshot and model rules for pasture and confinement over 30 days. At capture, the modeled mean weight was 380.7 kg/animal in both sides; modeled forage stock was 9,600 kg MS in confinement versus 5,458 kg MS on pasture, and modeled feed cost was R$ 3,862.28 higher in confinement. All result values are illustrative outputs of the current engine, not measurements or real-world predictions.

The Product comparison dialog uses the reviewed heading “COMPARAÇÃO DE CENÁRIOS” and states that results are demonstrative, not measurements or evidence of causal effect. Release source SHA includes the merged #146 scientific-claims review.

## Architecture

See [ACT III architecture](architecture/act-iii-architecture.svg). The diagram shows the browser Worker and JavaScript default, optional Rust/WASM metabolism batch and fallback, conditional local native Rust comparison endpoint and JS fallback, separate explanation endpoint, isolated AMD vector service, and unverified hosted deployment status. AMD is explicitly marked pending #137/#138 and is not shown as a Product execution path.

## Visual audit

The older root `screenshots/product-desktop.png`, `screenshots/product-selected.png`, and `screenshots/product-desktop-first-screen.png` are stale for the current Product UI. `docs/screenshots/riose-lot-comparison-results.png` is also a stale comparison UI capture. These historical files remain in their existing locations; this submission index uses the two current captures above. Production/product visual assets under the isolated `graphics-poc/` are not evidence of the default Product renderer.

No hosted URL was used because the ACT III deployment-to-SHA binding remains unverified. No AMD screenshot is provided: `AMD_VISUAL_PENDING_#137/#138`. The separate AMD service's `scale_vector` operation is not integrated into the Product simulation or comparison flow.
