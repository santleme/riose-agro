# ADR 0009: Isolate Scenario Editor scene history

- Status: Accepted
- Date: 2026-10-14

## Context

The Scenario Editor Composer owns the current scene and its UI, but its undo bookkeeping was also held in module-level `history` and `historyIndex` variables. Snapshot serialization, duplicate suppression, truncation after undo, and the 40-entry cap were mixed into the UI orchestration. The editor currently supports undo through Ctrl+Z, with no redo command.

## Decision

Put scene snapshot bookkeeping in `src/client/scenario-editor/scene-history.js`. Its `createSceneHistory` interface supports resetting to a scene, committing a changed scene, and undoing one step. It owns serialized snapshots, duplicate suppression, and the bounded history. The Composer remains responsible for the active scene, rebuilding the UI after undo, and persisting drafts.

Keep the 40-snapshot limit and the existing Ctrl+Z behavior. Do not add redo or change persistence as part of this boundary.

## Consequences

- History rules can be understood without loading the Composer's DOM and renderer orchestration.
- The Editor keeps scene ownership and presentation behavior in the Composer.
- `scene-history.js` has no dependency on browser APIs or editor UI.
- Undo remains session-local; draft persistence continues to be managed by the Composer.
