# Rejected visual candidates

These files are retained for audit and must not be packed into the candidate atlas or runtime.

| File | Failure evidence | Decision |
| --- | --- | --- |
| `tree-medium-03-rejected.png` | The edit retained the same round, thick-outlined canopy. Alpha has 256 values and visible color fringe; its nontransparent bounds touch the canvas edge (`bbox=(0,0,1297,1207)`). | Reject. Do not alpha-threshold this painting into production; redraw with finer native pixel clusters and a clean cutout. |
| `tree-medium-04-rejected.png` | A style-crop-guided redraw repeated the large round clusters and heavy outline. Alpha still has 256 values and color fringe; bounds touch the canvas edge. | Reject. |
| `grass-light-cube-failed-v0.png` | Raised block pedestal breaks the ground-plane tile contract. | Reject. |
| `grass-light-seams-failed-v1.png` | Repeated 3×3 preview shows visible tile seams. | Reject. |
