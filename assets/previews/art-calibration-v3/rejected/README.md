# Art calibration v3 — farmhouse style-transfer rejection

This is one edit-mode calibration test, not a production sprite. The existing farmhouse retest was used as the edit target; `docs/assets/pixel-art-urban-reference.png` was the style authority. The built-in image generator was asked to redraw the farmhouse with a 2:1 ground projection, fine selective outlines, controlled flat tones, architectural microdetails and true transparency. The original output is preserved unchanged as `farmhouse-style-transfer-v1.png`; `farmhouse-style-transfer-v1-alpha-check.png` is only a checkerboard review composite.

## Decision

**Reject.** The edit preserves a readable Brazilian farmhouse and stepped edges, but still has an overly heavy continuous outline, large repetitive roof-tile clusters, broad warm volume shading and coarser detail hierarchy than the urban master. It does not pass the visual style gate.

## Technical evidence

- Original size: 1341×1173 RGBA.
- Alpha counts: 730,660 transparent; 841,820 partially transparent; 513 fully opaque.
- Alpha content bounds: `(0, 9, 1325, 1149)`, touching the left canvas edge.
- SHA-256: `a88f3c27d65250965c5b1c70402ad2c8288e493c64689ddfd538a6970bd97007`.
- Result: the sprite body is overwhelmingly fractional alpha and does not satisfy the hard-edge export contract. No thresholding or other corrective filtering was applied.

This edit-mode test did not provide a viable new authoring path. Keep the candidate rejected and do not use it in the semantic manifest, an atlas, or a runtime scene.
