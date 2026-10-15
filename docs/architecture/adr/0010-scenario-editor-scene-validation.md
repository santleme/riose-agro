# ADR 0010: Isolate Scenario Editor grid-scene validation

- Status: Accepted
- Date: 2026-10-14

## Context

The Scenario Editor Composer validated imported and generated scenes before saving or opening them. The validation combined the grid-scene contract, layout diagnostics, asset and prefab references, layer IDs, and visual-group budgets in the same module as browser UI and renderer orchestration.

## Decision

Move grid-scene validation to `src/client/scenario-editor/scene-validation.js`. The validator receives the current prefab catalog, asset manifest, allowed layer IDs, and layout validator as explicit inputs. It returns the existing Portuguese error messages in their existing order. The Composer supplies these dependencies and continues to decide when to validate and how to present errors.

## Consequences

- Validation rules can be inspected independently from the editor's DOM and renderer code.
- The Composer remains responsible for loading current assets and prefab data and for save/open flows.
- The validator remains specific to the Scenario Editor grid-scene contract; it does not validate Product's irregular world format.
