# Risks

| ID | Risk | Impact | Mitigation | Status |
|---|---|---|---|---|
| RSK-V3-001 | FarmEngine visuals may imply validated prediction. | Users make decisions from demo dynamics. | Persistent illustrative label at config, results, export and AI layers. | OPEN |
| RSK-V3-002 | Multi-arm replay multiplies work and memory. | Long runs/UI stalls or unbounded payload. | Worker execution, shared compact baseline, cancellation and measured bounds. | OPEN |
| RSK-V3-003 | BR-CORTE GMD can be mistaken for a forecast. | False gain/DMI interpretation. | Require user input, mark it as assumption, omit gain trajectory. | OPEN |
| RSK-V3-004 | Scaling representative-animal output to 200 head hides heterogeneity. | False precision. | Explicit representative input or user-supplied weight distribution; show arithmetic aggregation. | OPEN |
| RSK-V3-005 | Cost arithmetic may be treated as profit. | Economic overclaim. | Require DM price/currency; call output supplement expenditure only, exclude total profit. | OPEN |
| RSK-V3-006 | Published range/table fit may be mistaken for independent Riose validation. | Premature paid decisions. | Separate commercial readiness gate and expert review. | OPEN |
| RSK-V3-007 | Provider costs and output claims are not aggregate-budgeted across workers. | Unbounded expense or ungrounded explanation. | Keep paid AI gated on BEH-016; retrieval-backed explanation only. | OPEN |
| RSK-V3-008 | Existing persisted V2 history may be broken by multi-arm changes. | Loss of replay compatibility. | New schema version; retain V2 reader and fixtures; test mixed histories. | OPEN |
