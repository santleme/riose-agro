# Product and farm illustration review — 2026-10-15

Captured from the local Product and Manifesto routes with Chromium/Playwright. The Product execution used the deterministic local parser and the existing FarmEngine, with 200 animals, seed `20261015`, a 30-day comparison, and no LLM call.

## Review steps

| Step | Screenshot | Health | Finding |
| --- | --- | --- | --- |
| 1. Product start | [01-product-empty.png](./01-product-empty.png) | Good | Blank prompt, examples, and browser history remain distinct; there are no example values passed as user inputs. |
| 2. Experiment review | [02-product-review.png](./02-product-review.png) | Good | The reviewed summary is short; units, field origins, assumptions, and limitations are available under one disclosure. The run action is explicit. |
| 3. Product results, desktop | [03-product-results.png](./03-product-results.png) | Good | The real returned population appears as cells; aggregate outputs remain labeled demonstrative. Detail charts, animal inspection, and provenance are collapsed until requested. |
| 4. Product results, mobile | [04-product-workspace-mobile.png](./04-product-workspace-mobile.png) | Good | Conversation, population, and analysis stack vertically with no horizontal overflow. The page is longer and requires scrolling. |
| 5. Product start, mobile | [05-product-empty-mobile.png](./05-product-empty-mobile.png) | Good | Prompt and example actions remain usable at 390 px without horizontal overflow. |
| 6. Pixel farm, mobile | [06-manifesto-mobile.png](./06-manifesto-mobile.png) | Good | The farm stays within the viewport; cattle are separate sprites and the caption sits outside the illustration. |
| 7. Pixel farm, desktop | [07-manifesto-desktop.png](./07-manifesto-desktop.png) | Good | The artwork reads as a compact, outlined 16-bit diorama rather than a realistic miniature. |
| 8. Cow hover/focus | [08-manifesto-cow-hover.png](./08-manifesto-cow-hover.png) | Good | A focused or hovered cow switches between matched idle and grazing frames. The two frames replace each other instead of drawing two heads at once. |

## Interaction and accessibility checks

- All five decorative cattle are keyboard-focusable and have accessible labels.
- Hover and keyboard focus trigger the same short, finite pose change. There is no idle movement and no link to FarmEngine state.
- `prefers-reduced-motion: reduce` disables the sprite animation.
- The application E2E checks the review-before-run gate, updated-input re-review, population inspection, export, replay, and mobile overflow.
- This is not a complete accessibility audit: screen-reader behavior, browser zoom, automated contrast scans, and touch-device testing were not run.

## Evidence and limits

- `npm run test:e2e:product`: passed, including visual state and hover/focus/reduced-motion assertions.
- `npm test`: 525 passed, 0 failed.
- `git diff --check`: passed.
- The five small cattle in the Manifesto are decorative art, not a representation of simulated animals or an observation.
- Screenshots document appearance and tested interaction states; they do not establish scientific validity or production performance.
