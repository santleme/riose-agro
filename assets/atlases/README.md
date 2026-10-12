# Atlas packages

`public/assets/atlas/livestock-approved-atlas.png` is the first runtime atlas package. It contains the user-approved Nelore sprite and is described in `public/assets/manifest.json`. The semantic manifest remains the source of approval and provenance; runtime atlas frames remain separate graphics metadata.

Generated category sheets are also extracted into individual PNGs under `assets/candidates/` and packed into `*-review-atlas-v1.png` files. Those frames are available for map review while their art approval remains pending.

Pack additional generated assets as they are reviewed and cleaned. Keep original generation sheets under `assets/source/`.
