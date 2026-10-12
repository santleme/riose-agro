# Precision livestock visual reference

**Purpose:** define how Riose may depict livestock technology and communicate its evidence/maturity without turning visual assets into scientific claims. This is a visual/domain reference, not a product specification, regulatory determination, or change to the simulator.

## 0. Reference source audit

Follow the project’s two reference authorities when producing any technology art: `docs/assets/pixel-art-urban-reference.png` is the original 1257×850 RGBA urban master and is the dominant authority for pixel-art style; `docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png` is the original-matching 1525×1031 RGB farm V7 scene designated approved by the master brief for rural content, composition, and scale. The urban `*-clean.png` image is a crop used for convenient comparisons, not the master. V7 approval applies to the scene as a rural reference; it does not individually approve any tag, reader, machine, building, animal, or other sprite appearing in it. Technology sprites still require individual visual, technical, provenance, and maturity review.

## 1. Separate representation from measurement

The simulator remains the source of truth for available observations and model outputs. An asset depicts an object or interface state; it does not measure an animal, certify a device, prove a connection, or establish location. Rendering may display a state supplied by the application, but must not infer that state from the mere presence or appearance of a sprite.

Keep these concepts distinct in names, metadata, and UX:

| Concept | What it can communicate | What it does not establish by itself |
|---|---|---|
| Identification | An animal/device identity association or an event that a reader detected an identifier. | Continuous tracking, exact position, or regulatory acceptance. |
| Traceability | Recorded identity and movement/event history when supported by source records. | Live location or completeness of the history. |
| Radio communication | A message/event, link status, or last reception supplied by the system. | Position, range, delivery guarantee, or continuous contact. |
| Estimated location | A position estimate plus time and uncertainty supplied by a supported method. | Ground-truth position or a universal accuracy radius. |
| Telemetry | A named observation with unit, source, time, quality, and availability. | A health diagnosis or a measurement not provided by the sensor. |
| Simulation/forecast | A model output with model/version and explicit hypothetical or predictive status. | A directly observed fact or causal conclusion. |

For example, passive RFID may be shown as an identifier read at a reader/portal event. Do not portray a passive ear tag as continuously broadcasting GPS-like movement. A visible tag, gateway, antenna, reader, camera, or scale must not create a reading in the data model.

## 2. Maturity classification for technology depictions

Every technology family and each materially different feature must carry one of these maturity classes. This class is separate from the asset production state (`planned`, `review`, `approved`, `released`) and source provenance (`human-authored`, `ai-generated`, `ai-assisted`, `derived`, `unknown`).

| Class | Label | Minimum basis | Permitted presentation |
|---|---|---|---|
| `A` | Established use | Dated, attributable evidence that the relevant technology/function is used commercially in a comparable context. The exact capability depicted must be supported; evidence for a product category does not prove every feature. | Neutral depiction of an in-use class. Do not imply that a fictional Riose device is certified, endorsed, or equivalent to a named product. |
| `B` | Research, pilot, or limited adoption | Dated source identifying a research effort, trial, pilot, or bounded deployment, with scope and limitations recorded. | Mark as pilot/research/limited; communicate that deployment and performance are context-specific. |
| `C` | Conceptual or proposed | A Riose concept, proposed architecture, future capability, or unverified design. | Label as concept/experimental/hypothetical. Never present as installed, validated, available, or effective. |
| `U` | Unverified | Insufficient, conflicting, or absent evidence to place the capability in A, B, or C. | Internal research only. Block factual product claims and production communication until reviewed. |

Classify by capability, not by the object silhouette. A commercially common scale can be class A while an unvalidated automated identity-to-weight workflow attached to it is class B, C, or U. Store the evidence URL/document, author/organization, publication or access date, scope, quoted claim summary in original words (not unsupported paraphrase), and reviewer. Recheck time-sensitive claims before a public release.

Do not treat the brief's categories as proof. In particular, the “Riose ear tag” and RF localization without GPS are project concepts until their specific design and performance are substantiated. Do not invent range, precision, battery life, availability, certification, animal-welfare outcome, or commercial adoption.

## 3. Technology families and visual limits

The following are candidate families, not a commitment that the simulator already supports them. Each family needs a source-backed maturity record before public claims or an in-world state mapping.

### 3.1 Identity and traceability

Candidate assets: visual ID tag, electronic ear tag, button tag, handheld reader, fixed reader, portal/antenna, field terminal, and movement/event marker. Keep physical tag, electronic identifier, read event, identity record, movement record, and location estimate as separate concepts.

Brazilian programs or standards such as PNIB and SISBOV may be relevant to future depictions. Do not label an invented Riose tag “PNIB/SISBOV compliant,” “certified,” or “approved.” Any compatibility/regulatory statement must be checked against current official sources and the exact device/process before release. A generic yellow tag is only a visual material choice and must not imply program affiliation.

### 3.2 Connectivity and location

Candidate assets: gateway, radio station, antenna, pole/tower, weatherproof cabinet, solar panel, stationary battery, local network equipment, field sensor, reader near a corral, and reader in a handling lane. Keep infrastructure footprints, anchors, cables, power state, and installation context plausible and consistent.

Overlays may show a last-received event, unavailable link, delayed data, estimated position, illustrative coverage, or uncertainty only when the corresponding state is supplied by the application and the meaning is explicit. A decorative coverage region is not a guarantee of radio range. Do not equate “connected to gateway” with “animal location known.” Do not present RF-based positioning without GPS as validated until a specific method, evidence, uncertainty, and operational limits are documented.

### 3.3 Weighing and handling

Candidate assets: conventional/electronic scale, walk-over platform, handling lane, reader, sensors, antenna, terminal, indicator, and power. Visual states may include idle, animal entering, read in progress, completed, invalid, maintenance, or offline when those states exist in the data contract.

Do not derive a weight from body appearance, movement, feed intake, or sensor presence. Do not infer average daily gain (ADG) without appropriate dated weight observations and a defined calculation. The accepted observational ADG/pasture use case remains observational; visual scene changes must not imply causal treatment effects.

### 3.4 Animal and environmental monitoring

Candidate assets: activity/rumination/temperature sensor, instrumented tag or collar, fixed observation camera, water meter, and environmental station. Distinguish device status from measured value, and measured value from interpretation. Use states such as reading available, recent/stale, unavailable, not validated, observational alert, or maintenance only when the application has a source for them.

An indicator or alert is not a veterinary diagnosis. Do not draw a green/red “healthy/sick” animal state unless a validated product decision and supporting evidence explicitly authorize that communication. Prefer neutral labels such as “observation,” “signal,” “data delayed,” or “review needed.”

### 3.5 Automation and proposed systems

Candidate concepts include virtual fencing, automated gates, drones, autonomous inspection vehicles, computer-vision identification, water-quality sensing, low-power networks, autonomous stations, and digital pasture/property models. Record the maturity for each function. A conceptual illustration is allowed only with explicit conceptual labeling and no implied efficacy.

For virtual boundaries, differentiate a digital boundary overlay from a physical fence. Do not imply animal-welfare safety or a routine aversive procedure. A drone sprite indicates only the depicted scene state (parked/in flight/base); it does not imply continuous observation or perfect identification. Digital maps and property models are representations and do not become measured ground truth merely because they are rendered.

## 4. UI and overlay contract

Keep technical UI overlays separate from the pixel-art sprite and map atlas. Reuse the same scene for:

- **Immersive:** few or no labels; no unearned claims.
- **Operational:** IDs and essential device/data states supplied by the app.
- **Scientific:** time, source, trajectory, uncertainty, quality, and model/observation distinction when available.

An overlay data item should have a documented semantic contract with, as applicable: subject/entity ID; measurement or event type; value and unit; observed/estimated/simulated status; timestamp and freshness; source/device; quality/availability; uncertainty representation; and maturity/evidence reference. Missing values remain unavailable; do not substitute a plausible-looking value. Position overlays must declare their coordinate frame and whether the point is observed, estimated, or hypothetical.

Use restrained, readable UI marks at map zoom levels. Keep selection, identity, event, device status, uncertainty, and scenario hypothesis visually distinct. Do not embed IDs, numbers, status lights, or glows into the base sprite when they vary by runtime state; use separate overlays/components.

## 5. Visual asset metadata additions

For a technology asset, extend the general asset record with:

- `technologyClass`: `A`, `B`, `C`, or `U`;
- `capability`: narrowly named function represented, not a broad device label;
- `evidence`: source reference(s), source date/access date, scope, claim summary, and reviewer;
- `claimLimits`: what the visual must not imply (for example continuous location, exact range, diagnostic result, or certification);
- `depictionMode`: `physical-device`, `event`, `status-overlay`, `estimated-state`, `simulation`, or `concept`;
- `dataContract`: required upstream state(s), units/time fields where relevant, and unavailable behavior;
- `provenance`: artwork origin and AI/edit lineage, recorded independently from technology maturity;
- `review`: domain reviewer, art reviewer, technical reviewer, date, decision, and rationale.

For `C` and `U`, apply a visible/internal distinction: `C` may appear in a concept/demo view with an explicit experimental or hypothetical label; `U` remains internal research material. Never let maturity metadata be omitted from a released technology pack.

## 6. Research and claim review procedure

Before documenting a real-world capability as A or B:

1. Name the precise function and operating context; do not research only a device noun.
2. Find attributable, dated sources, preferring official program/regulatory material for compliance claims and primary technical or research sources for performance claims.
3. Record what the evidence does and does not support, including pilot limits, deployment context, device class, and uncertainty.
4. Separate product availability, certification, interoperability, measured performance, animal-welfare implications, and scientific validity; evidence for one does not prove the others.
5. Have a domain reviewer approve the classification and wording. Revisit time-sensitive evidence before release.

If evidence is absent or ambiguous, use `U` and make no factual external claim. This document intentionally makes no current certification, commercial availability, or performance claim about a specific product or regulation.

## 7. Examples of safe state-to-visual mapping

| Upstream state | Safe representation | Unsafe inference |
|---|---|---|
| Reader event for animal ID at time T | Brief read-event mark at the reader and an event record for that animal | A continuous trail between readers |
| Last gateway message age supplied | “Last received”/“delayed” marker with timestamp or freshness bucket | Current animal position or guaranteed coverage |
| Position estimate plus uncertainty supplied | Estimated marker and uncertainty display in the scientific view | Exact GPS-like point with no uncertainty |
| Scale reports a valid dated weight | Completed weighing event linked to ID if the system supplied that association | Weight inferred from the sprite or assumed from animal category |
| Sensor value supplied with unit and timestamp | Named observation and time/freshness | Diagnosis or causal explanation |
| Feature is a Riose proposal | Explicit “concept” state and visually plausible equipment | Commercially available or validated technology |

## 8. Current project boundary and readiness

The current code loads atlas images and semantic frame entries through the existing JSON manifest in `public/assets/manifest.json` and draws them through the existing JavaScript renderer. No new livestock-data schema, precision telemetry integration, PixiJS migration, or scientific model is introduced by this reference. The existing atlas and mixed-farm kit remain legacy/current assets and are not proof that the proposed precision-tech families exist.

The candidate cattle manifest currently describes planned work. Before any precision technology is represented as a production asset, the team still needs: approved style calibration; per-asset art and provenance records; source-backed maturity/evidence records for real capabilities; and a separately reviewed state contract if runtime behavior is later requested. Visual artwork may be prepared independently, but it cannot claim to implement an unavailable simulator state.
