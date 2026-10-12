# Repository-wide branch and worktree audit

Read-only inventory refreshed on 2026-10-12 from the Architecture V2 worktree. No fetch, checkout, merge, rebase, reset, clean, stash apply, or edits to another worktree were performed. Remote refs are the locally available refs and may be stale.

## Worktrees

| Worktree | HEAD / branch | Working tree | Finding |
| --- | --- | --- | --- |
| `/home/lucas_coimbra/projects/hackhatons/riose-agro` | `764ead1` / `main` | Clean at inspection | Latest integrated application and scientific-data line. It contains the Scenario Studio comparison flow and current research integrations. |
| `/home/lucas_coimbra/.codex/worktrees/4bb3/riose-agro` | `279ae14` / `codex/architecture-v2` | Existing local `.codex/` data only | Most advanced committed simulation/performance line: Rust primitives, opt-in WASM metabolism, packed Worker view with stable transferred animal IDs, virtualized list and circular activity buffer. It now includes the isolated PixiJS graphics/Composer proof of concept and benchmark. |
| `/home/lucas_coimbra/.codex/worktrees/d99d/riose-agro` | `0a68113` / detached | Modified app/server/style/README plus extensive untracked assets, manifests and art pipeline | Latest visual-art/asset work. Treat as active, unfinished input; preserve the checkout as-is. It is still Canvas 2D and has no PixiJS package. |

Two existing stashes remain on the local repository (`codex-preserve-snapshot-work-before-merged-pr18` and `codex-preserve-local-work-before-merged-pr17`). They are recovery history, not current integration candidates.

## Branches and feature lineage

Ahead/behind counts below compare each ref with the current `main` commit and do not imply merge readiness.

| Ref | Relationship to current `main` | State and unique value | Integration assessment |
| --- | ---: | --- | --- |
| `codex/architecture-v2` (`279ae14`) | 2 main-only / 6 branch-only commits | Rust runtime primitives, metabolism WASM route, packed visual Worker messages with stable IDs, scenario compression, history ring, browser/history benchmarks, renderer-independent scene schema, PixiJS Composer POC and graphics comparisons | Preserve its JS engine compatibility path and compact view contract. Reconcile the 2 newer main commits explicitly when integrating; do not merge blindly. |
| `codex/scenario-studio-integration`, `codex/pr18-clean`, `origin/codex/scenario-studio-integration` (`012f582`) | 14 main-only / 4 branch-only commits | Scenario Studio farm-flow integration and UI tests | Its user-facing comparison flow was subsequently integrated and evolved on `main`; reference its tests, not as a parallel Composer implementation. |
| `codex/integrate-scenario-prs` (`4b87c67`) | 14 main-only / 4 branch-only commits | Alternate combined scenario/evidence/UI line | Overlaps later main behavior; not a clean merge target. |
| `codex/pr19-rebased`, `origin/codex/issue-14-provenance` (`943a441`) | 13 main-only / 1 branch-only commit | Evidence context for scenario comparisons | Later main history includes the evidence-presentation work; retain the result-status distinctions, not the old app diff. |
| `origin/pr-17` / `origin/codex/scenarios-explanations-replay` (`ca6a82d`) | 15 main-only / 15 ref-only commits | Scenario persistence/replay and optional explanations | Historical implementation family; main now includes later replay and explanation flows. Preserve manifest v1 semantics. |
| `origin/pr-18` (`196e402`), `backup/pr18-pre-rebase` (`c9e550c`) | 15/16 and 15/17 commits respectively | Earlier farm comparison integration and recovery variant | Overlaps the current Scenario Studio; backup is recovery-only. |
| `origin/pr-19` (`47990cf`) | 15 main-only / 16 ref-only commits | Evidence labels/context | Historical reference; current main has the later integration. |

`main` is at `764ead1` (`chore: ignore local Codex and Python cache files`) and includes `065dbc1` scientific cattle/pasture research after the Architecture V2 base `913b36b`. The active d99d checkout remains detached at `0a68113`, so its uncommitted art/asset work is not represented by a branch commit.

## Cross-worktree component matrix

| Component | Branch/worktree | State | Implementation observed | Impact on V2 |
| --- | --- | --- | --- | --- |
| Simulation engine | `main` and `codex/architecture-v2` | JS domain engine on main; optimized Worker transport and a narrow opt-in Rust/WASM kernel on Architecture V2 | `FarmEngine` remains authoritative for behavior, pasture, intake, cost, snapshots and replay. Worker ticks in V2 send transferable numeric view arrays; JS remains default. | Integrate the V2 Worker boundary around the main engine only after preserving the main-only scientific edits, deterministic RNG and snapshot/replay behavior. The renderer consumes a view packet and never imports engine internals. |
| Scientific modules | Current `main` | Integrated research/data contracts with explicit observed, demonstrative, review-pending and validated distinctions | Current branch introduces adult cattle/pasture research and source audits. The demonstration engine is still not a calibrated or validated dairy model. | Scene contract carries module ID, version and scientific status as metadata. The view layer cannot turn art states into evidence, observations or causal claims. |
| Animal and environment assets | Dirty detached `d99d` worktree | Active pipeline; broad runtime atlas plus a semantic manifest, mostly review-only | `public/assets/manifest.json` has 67 runtime frame IDs. `assets/manifests/manifest.json` has 47 semantic assets, of which one Nelore sprite is individually `APPROVED`; most entries remain `REVIEW`. Review-state atlas presence is not asset approval. | Reuse the approved Nelore with its provenance. Use the environment atlas in the PoC only as a runtime-integration/performance input; keep its individual approval status unresolved. Do not import or release the full atlas as approved art. |
| Dairy module | Dirty `d99d` worktree | `assets/modules/livestock-dairy/catalog.json` is `in-progress`; authored images and previews exist but are not a released package | Catalog references shared beef/core assets, several review candidates and a farm reference scene. It does not constitute a dairy simulation model. | Define module/version references now. Keep the dairy renderer path representable but disable/label simulation until the scientific module and dairy asset package pass their own gates. |
| Scenario Studio | Current `main` | Integrated | Saved scenarios, comparison manifest v1, controlled comparison, replay, evidence context and result review are part of the farm flow. | Keep its JSON manifests renderer-independent. The graphics POC stores layout JSON separately from the simulation snapshot and comparison manifest. |
| Scenario Composer | d99d candidate docs and Architecture V2 PoC | No existing interactive layout Composer found in main or d99d | d99d has static Python composition scripts and JSON design recipes. Those are review/planning artifacts, not a user editor or simulator runtime. Architecture V2 adds isolated Canvas/Pixi editing with snapping, footprint collision checks, zones, deterministic tree distribution, selection and JSON export. | Integrate editing as a new scene-layout capability that reads/writes the shared scene schema; do not fork the existing comparison Studio or its simulation manifest. |
| Renderer | `main`, `d99d`, `codex/architecture-v2` | Main and d99d use Canvas 2D; Architecture V2 adds an experimental PixiJS 8 proof | No PixiJS runtime existed in main or d99d. Current PoC bundles PixiJS 8.22.0 and uses the same scene/view data with Canvas 2D. | Keep Canvas as the current product renderer until same-browser measurements and asset-release status support a progressive migration. Avoid React/TypeScript rewrite. |
| Tests and benchmarks | Current main plus Architecture V2 | Main has broad node tests and research audits; V2 has Rust/WASM equivalence and 100–10,000 browser/history harnesses | The graphics benchmark compares both backends in Chromium at identical camera, scene, Worker and population counts, with two fresh-page repetitions and isolated post-GC heap measurements. | Preserve all test families; add renderer tests without replacing the existing engine and scientific regression suites. |

## Contracts and integration order

1. Preserve current `farm-snapshot` and comparison manifest v1 as domain/reproducibility inputs. Do not add camera, atlas coordinates, Pixi display objects or frame rate to either format.
2. Use `schemas/visual-scene.schema.json` for renderer-independent layout: domain module/version/status, deterministic run seed/population, stable entities and positions, isometric grid, zones and ground transitions, asset IDs, prefab footprints/states, layer order, events and optional snapshot reference. Keep live Worker arrays aligned by explicit transferred animal IDs.
3. Resolve semantic asset IDs through a versioned visual manifest. Atlas frame rectangles, GPU textures, renderer object pools and culling are adapter/build details.
4. Treat a renderer adapter as a read-only consumer of Worker view packets. Selection and edit commands return stable entity/prefab/zone IDs; display coordinates are projected from scene coordinates and never write simulation state.
5. Integrate only individually approved/released asset revisions into production. Keep d99d review files and uncommitted edits untouched until that work is committed and reviewed.
6. Keep beef demo and dairy models as separate versioned scientific modules. A dairy scene can be authored under the same layout contract, but no dairy results are displayed as simulated until a reviewed model is executable.
7. Compare Canvas 2D and PixiJS in the same Chromium session at 100, 1,000 and 10,000 simulated entities, with the same visible camera viewport. Use observed performance, not library preference, to choose migration scope.

No merges were performed. The d99d worktree's assets and edits remain unchanged. The only copied art in the current worktree is the atlas file used as an explicitly review-state integration input and the individually approved Nelore PNG, with source/hash metadata recorded in `graphics-poc/asset-sources.json`.
