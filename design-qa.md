# Visual QA — Riose landing, Product, and Manifesto

final result: passed

## Evidence and comparison setup

- Source home visual: `docs/evidence/visual-review/reference-home-hero-1680x944.png` (user supplied; actual raster is 1672 × 941 px).
- Full comparison: `docs/evidence/visual-review/home-reference-vs-implementation.jpg`.
- Focused comparison of wordmark, cattle scene, and population inset: `docs/evidence/visual-review/home-focused-comparison.jpg`.
- Implementation capture: `docs/evidence/visual-review/home-desktop-1680x944.jpg`, Chromium viewport 1680 × 944 CSS px, device scale factor 1.
- The source image and implementation used the same light, initial home state. For comparison, the implementation raster was normalized from 1680 × 944 to 1672 × 941 px with Lanczos resampling; the source was not altered.
- Additional captures: desktop 1440 × 900, laptop 1280 × 800, tablet portrait 768 × 1024, mobile 390 × 844 and 320 × 720; Product desktop/mobile; Manifesto desktop/mobile. Files are in `docs/evidence/visual-review/`.
- Focused crop uses the same source and implementation rasters and the same crop coordinates. No device frame is present in either image.

## Findings and iteration history

### First responsive pass

- **P2 — Tablet portrait composition:** at 768 × 1024, the wordmark and cow had an overly large vertical gap. Moved the scene upward specifically for tablet portrait layouts. The final visible gap is about 73 CSS px by rendered geometry; title and scene remain separate.
- **P2 — Product mobile header clearance:** the Product eyebrow began above the fixed 60 px header boundary. Increased mobile welcome spacing to 72 px and added an E2E assertion. The final eyebrow starts at 72 px.
- **P2 — Retired Experiments E2E expectation:** the old E2E still expected the removed two-column Experiments page. Replaced that check with assertions for the 308 redirect to Product and verified the destination.

The affected screens were recaptured after each correction. Final captures show no horizontal overflow at any tested viewport, no browser page errors, and the cattle scene fully visible on mobile. No actionable P0, P1, or P2 visual findings remain.

## Fidelity surfaces

- **Typography:** retained the existing Archivo and IBM Plex Mono system. The large Riose wordmark stays above the cattle scene and uses the registered mark shown in the reference. Small metadata remains secondary.
- **Spacing and layout:** matched the supplied desktop composition at the same near-16:9 ratio. Checked 1680 × 944, 1440 × 900, 1280 × 800, 768 × 1024, 390 × 844, and 320 × 720. The tablet portrait breakpoint brings the title and animal scene closer. The footer and preview card have a clear edge relationship at desktop sizes.
- **Color and surfaces:** retained the warm off-white canvas and restrained olive/terracotta artwork. The preview remains a small card rather than a large dashboard panel.
- **Image fidelity:** restored the existing Riose pixel-art cow scene. Added an overhead pasture preview with four larger cow location icons and a compact 2.5D pixel-art farm for Manifesto. Both new assets are generated illustrations, explicitly marked illustrative and not treated as observations, a real map, or scientific output. Asset provenance is listed in `assets/visual-assets.md`.
- **Copy and navigation:** removed the obsolete Data top-level link. Product and Manifesto links use an animated underline for the active page and on hover/focus. The home page has no active section link. Product mobile review parameters remain user-entered; this change does not introduce defaults.
- **Accessibility and motion:** the farm illustration has descriptive alternative text; the decorative population inset is hidden from assistive technology. Keyboard focus reaches the Manifesto link. Chromium checks with `prefers-reduced-motion: reduce` reported zero transition duration for the active underline. All tested pages had no horizontal overflow.

## Tests and behavior inspected

- `npm test`: **525 passed, 0 failed**.
- `npm run test:e2e:product`: **passed**. Covers prompt/review/confirmed run, 200-animal population, inspection/export, revision/re-run, replay, retired route redirect, mobile header clearance, home assets, tablet portrait layout, and Manifesto asset/navigation.
- Chromium page-error checks: no errors on Home, Product, or Manifesto at tested sizes.
- Asset checks: historical cow, population map, and Manifesto farm all loaded successfully.
- Data navigation check: no Data link in the home header or Product navigation.

## Open questions and follow-up polish

- The generated farm is an original, lower-density interpretation of the supplied isometric pixel-art reference, not a recreation of its many structures. This matches the requested editorial illustration role; asset variations can be reviewed separately.
- Mobile behavior was checked in Chromium at 1× device scale, not on physical devices. Browser-specific font rasterization may differ slightly.
- The generated pasture illustration contains four illustrative icons; it does not encode a real population size or animal locations.
