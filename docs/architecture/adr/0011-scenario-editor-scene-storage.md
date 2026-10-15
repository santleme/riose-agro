# ADR 0011: Centralize Scenario Editor scene storage

- Status: Accepted
- Date: 2026-10-14

## Context

The Scenario Editor used localStorage from several Composer paths: draft persistence, scene save, active-scene selection, custom-scene restoration, preset restoration and a legacy dairy-scene fallback. Key names, JSON parsing and write behavior were repeated in UI orchestration.

## Decision

Put the Scenario Editor's localStorage keys and scene read/write operations in `src/client/scenario-editor/scene-storage.js`. The module exposes active-scene lookup, scene reads with an optional legacy fallback, and writes that report storage failure. The Composer continues to choose which scene to load, validate it, and show save feedback or download JSON.

Preserve the current key names, custom and preset selection behavior, legacy dairy fallback and pretty JSON used by explicit save. Draft writes remain compact JSON.

## Consequences

- Storage policy has one implementation and can be inspected independently from editor UI.
- The browser localStorage API remains the persistence backend; this does not introduce a server or change the scene format.
- The module is specific to Scenario Editor scenes and does not own Product persistence.
