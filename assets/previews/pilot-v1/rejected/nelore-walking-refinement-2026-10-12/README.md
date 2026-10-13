# Nelore walking refinements — 2026-10-12

Two generation-from-scratch attempts using the urban master as style reference, the approved Nelore sprite for anatomy/scale, and farm V7 for rural context. Both outputs are preserved unchanged as rejection evidence and are not used in the library or scene.

| File | SHA-256 | Visual/alpha review |
|---|---|---|
| `walking-attempt-a.png` | `9910a081e7096cbc116466ec592177d1f166e198fe8faaea88232ee86d05c230` | A dark radial halo is baked around the subject; no fully opaque pixels (596,071 partial-alpha pixels); heavy continuous outline and broad painted volume; pose does not read clearly as walking. Reject. |
| `walking-attempt-b.png` | `da95cbf497c879d81314d027bdb463209d947be1eb48cfe1de70c1d2b81db16f` | Same halo and rendering pattern; no fully opaque pixels (536,695 partial-alpha pixels); silhouette is a static stand, not a distinct walking pose. Reject. |

Both rejected files are 1536×1024 RGBA and contain partially opaque backgrounds; their source PNGs remain intact above.

A third trial edited the approved sprite instead of generating from scratch. Its raw output is preserved at `assets/source/livestock/nelore-adult-walking-edit-v2-raw.png`; after visually inspecting it on high-contrast mattes, alpha was binarized at 128 without changing visible RGB. The resulting `assets/candidates/livestock/nelore-adult-walking-imagegen-v2.png` is now the manifest source for the walking pose, with technical status `pending` (alpha itself passes; color profile remains unverified) and art status `pending`. It remains a candidate, not an approval. The scene compositor uses this candidate and the approved idle sprite.
