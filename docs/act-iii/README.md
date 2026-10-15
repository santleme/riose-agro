# ACT III submission visuals

This index holds the current submission screenshots and the implementation-based architecture diagram for release/amd-act-iii.

## Screenshots

- [Product scenario](screenshots/product-scenario.png): the 24-animal farm, hot climate, balanced feed, 1 kg DM supplement, and CPU-default selector/status. The AMD/ROCm choice is available in Product, but this capture shows CPU and is not AMD execution evidence.
- [Scenario comparison chart](screenshots/scenario-comparison.png): 30-day pasture-versus-confinement comparison, chart, modeled weight and consumption cards, and per-card illustrative-model labels.
- [Scenario comparison results](screenshots/scenario-comparison-details.png): modeled forage and feed-cost differences with per-card “demonstrative, not validated” wording.

All three screenshots were captured from the running local Product page at http://127.0.0.1:8000/product.html from branch release/amd-act-iii, SHA 5c5f07095bf1c8bddb652eb02342ff15b5cc0d56. Capture environment: Codex In-app Browser, 1280 × 720 CSS-pixel visible viewport, 1×; local Node Product server. The scenario screenshot shows the Product paused on day 4 after applying hot climate, balanced feed, and 1 kg DM supplement per animal/day. The comparison uses that same 24-animal snapshot and deterministic seed for a 30-day pasture-versus-confinement run. Comparison results remain the Product’s JavaScript path, not the AMD or native Rust path.

The modeled comparison showed 395.7 kg/animal mean weight in both conditions; modeled forage stock was 9,600 kg MS in confinement versus 4,917 kg MS on pasture (+4,682.93 kg MS), and modeled feed cost was R$ 6,529 versus R$ 3,370 (+R$ 3,159.67 per lot). These are outputs of the current rules, not measurements or real-world predictions.

## Architecture

See [ACT III architecture](architecture/act-iii-architecture.svg). It reflects release SHA 5c5f070: the Product UI and Worker use JavaScript/CPU by default; #137 adds an explicitly selected AMD/ROCm metabolism route through the Product server proxy, with parity checks and backend/device reporting. Product does not commit a CPU fallback result under an AMD selection. Native Rust configured comparison remains lab-only, and the Rust/WASM metabolism selector remains on the separate lab app. The optional explanation endpoint returns text and does not modify simulation state.

## Evidence still pending

- **AMD:** #137 is integrated into the release, but #138 remains open. No physical AMD/ROCm run is verified; AMD_VISUAL_PENDING_#138. Do not treat the CPU capture or mocked adapter tests as GPU evidence.
- **Deployment:** #142 remains open. The public deployment’s binding to the current release SHA is unverified; no hosted URL or hosted screenshot is claimed.
- **Scientific claims:** the Product labels outputs exploratory/illustrative and not calibrated or validated for farm-level prediction or management advice. The comparison is explicitly demonstrative and not causal evidence, measurements, or nutrition guidance.

The older root screenshots/product-desktop.png, screenshots/product-selected.png, screenshots/product-desktop-first-screen.png, and docs/screenshots/riose-lot-comparison-results.png are stale historical captures. They remain in place; this index uses the current captures above. Assets under isolated graphics-poc/ are not evidence of the default Product renderer.