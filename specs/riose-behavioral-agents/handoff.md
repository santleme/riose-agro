# Behavioral SDD session handoff

Date: 2026-10-15
Active PR: https://github.com/santleme/riose-agro/pull/191
Base PR: https://github.com/santleme/riose-agro/pull/190 (head `983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc`)

Last verified commit: `5cea0cf` (`feat: expose registered behavior no-go diagnostic`); full suite passed on the source tree represented by this commit before commit creation.
Current branch: `codex/behavioral-agents-sdd` (was ahead of origin by 13 commits at session start; do not push or rewrite those commits).
Completed tasks: BEH-000 through BEH-005; BEH-009 diagnostic replay; BEH-010 versioned component interfaces; BEH-011 external-data/provider source audit; BEH-012 read-only NO-GO explanation tool.
Task in progress: none.
Files changed: reproducible Perea NO-GO diagnostic protocol/script/report/tests; versioned behavioral component schema/validator/tests; external-data and official provider API audit plus access plan; assistant read-only NO-GO tool and security contract; SDD task, decision, risk, progress, and handoff records; package scripts.
Tests executed: `npm run test:perea-no-go-diagnostics` (3/3); `npm run test:behavior-component-contracts` (5/5); `npm run test:behavior-research-assistant` (14/14); full `npm test` (465/465).
Passing checks: diagnostic JSON regenerated reproducibly with SHA-256 `6ab0c9fe59d386dafa0ea947f4ac93e80b90944cfa5996c05df6833f58f0e0db`; frozen gate arithmetic reconciles to BEH-004; cross-component schema and timestamp/offset consistency; all existing regression tests pass; `git diff --check`.
Known failures: confirmatory semi-Markov candidate remains NO-GO on composition MAE, persistence-relative transition-TV margin, and RU class error. Do not change thresholds or tune on the inspected holdout.
Scientific limitations: Perea has no complete 24-hour windows; high source run-boundary censoring, especially RU; only one complete RU interior run in held-out data; 4 held-out animals from the same source; no intervention outcomes or causal supplement evidence. Tabapuã microdata are unavailable and commercial-use rights are unconfirmed. USDA Richmond archive contents could not be verified. The diagnostic is post hoc and does not establish latent behavior or biological implausibility.
Visual limitations: no UI changes in this research continuation; no visual review required.
Next action: none is READY. Continue only if independent, appropriately licensed temporally labeled pasture data or a justified non-holdout dataset becomes available. Freeze a new candidate-specific protocol before evaluation; otherwise continue data-access/evaluation infrastructure.
Blocked dependencies: BEH-006 Product behavior integration (NO-GO); BEH-013 Tabapuã data access and commercial-use permission; BEH-014 justified new candidate and independent evaluation data; BEH-015 model promotion/intervention evidence; BEH-016 shared persistent provider spend ceiling. BEH-007/008 remain blocked under the prior queue.

No candidate was selected, no model was promoted, FarmEngine defaults were not changed, no author was contacted, no paid provider was called, and no push, merge, or deploy was performed. The deterministic assistant may explain only the fixed local NO-GO artifact; provider adapters remain optional and require deployment-level budget controls before paid production use.
