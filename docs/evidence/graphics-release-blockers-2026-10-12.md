# Runtime graphics release blockers — 2026-10-12

This snapshot records the actual main Composer runtime manifest at `public/assets/manifest.json`. Its per-asset review state and provenance are joined from the semantic registry, dairy module and Composer renderer manifest by `scripts/assets/runtime-asset-provenance.mjs`. Missing source status is represented as `UNRESOLVED`; no state is upgraded by the join. The atlas hashes are pinned in the runtime manifest and checked against the PNG bytes by the release gate.

## Current release decision

**NO-GO.** `npm run build:graphics-release` runs the release gate before generating release scenes. The current runtime manifest contains 76 assets: 30 `REVIEW` and 46 `UNRESOLVED`. Neither status is release eligible. Assets with no matching source record also have unknown rights and are blocked. The preview build does not invoke the release gate and remains usable with these visible status labels.

There are 10 pinned runtime atlases. Their PNG hashes, dimensions, and every runtime frame bounds are checked by the same gate.

## Blocked asset IDs

### REVIEW (30)

- `building-farmhouse-imagegen-v1`
- `building-shed-imagegen-v1`
- `building-workshop-imagegen-v1`
- `corral-wood-standard-imagegen-v1`
- `dairy-activity-collar`
- `dairy-barn`
- `dairy-girolando-cow`
- `dairy-heifer`
- `dairy-heifer-calf`
- `dairy-holstein-cow`
- `dairy-milk-chilling-tank`
- `dairy-milking-parlor`
- `dairy-waiting-pen`
- `feed-salt-roofed-imagegen-v1`
- `feed-trough-hay-imagegen-v1`
- `fence-gate-wood-imagegen-v1`
- `fence-wire-wood-post-imagegen-v1`
- `handling-chute-cattle-imagegen-v1`
- `livestock-nelore-calf-idle-imagegen-v1`
- `livestock-nelore-cow-idle-imagegen-v1`
- `livestock-nelore-heifer-idle-imagegen-v1`
- `technology-gateway-antenna-imagegen-v1`
- `technology-monitor-station-imagegen-v1`
- `technology-scale-electronic-full-imagegen-v1`
- `technology-traceability-system-imagegen-v1`
- `vegetation-tree-shade-imagegen-v1`
- `vehicle-pickup-rural-imagegen-v1`
- `vehicle-tractor-imagegen-v1`
- `water-pond-imagegen-v1`
- `water-trough-round-imagegen-v1`

### UNRESOLVED (46)

- `calf`
- `corral`
- `cow-beef`
- `cow-dairy`
- `farmhouse`
- `feed-trough`
- `fence-straight`
- `field-harvested`
- `field-irrigated`
- `field-maize-growing`
- `field-maize-mature`
- `field-prepared`
- `field-soybean-emerged`
- `field-soybean-growing`
- `field-soybean-mature`
- `fruit-tree`
- `gate`
- `grass-light`
- `grass-mid`
- `handling-alley-cattle-imagegen-v1`
- `livestock-angus-cow-idle-imagegen-v1`
- `livestock-crossbred-cow-idle-imagegen-v1`
- `livestock-nelore-bull-idle-imagegen-v1`
- `nelore-adult`
- `pasture-grass-native-imagegen-v1`
- `pickup`
- `pond`
- `road-rural-dirt-imagegen-v1`
- `road-straight`
- `road-turn`
- `shade-tree`
- `shed`
- `shrub`
- `silo`
- `soil-damp`
- `soil-dry`
- `technology-ear-tag-rfid-imagegen-v1`
- `technology-reader-handheld-imagegen-v1`
- `technology-scale-electronic-imagegen-v1`
- `terrain-mud-imagegen-v1`
- `terrain-soil-dry-imagegen-v1`
- `tractor`
- `utility-truck`
- `vehicle-livestock-truck-imagegen-v1`
- `water-reservoir-imagegen-v1`
- `water-trough`

These entries remain blocked pending asset-specific source, rights and review records. This report does not approve any asset.
