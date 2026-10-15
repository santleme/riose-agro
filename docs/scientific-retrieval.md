# Local scientific retrieval

Run a deterministic lexical search over the scientific manifests, evidence reports, and selected documentation already in the repository:

```sh
node scripts/science/scientific-retrieval.js --query "grazing intake" --top-k 5
```

The JSON result includes the exact snippet, repository-relative `source_id`, file path and line range, and a score. The score is the fraction of unique normalized query terms present in the snippet; `matched_terms` shows the terms counted. Ties are resolved by source path and line range, then by source ID and snippet for otherwise identical locations. Diacritics and letter case are normalized. Empty or unmatched queries return an empty result list.

The corpus is loaded from existing `data/*/manifest.json`, `data/*/README.md`, scientific evidence JSON under `docs/evidence/`, and a short list of scientific documentation files. No index or evidence registry is written. A `source_id` identifies the local artifact containing the excerpt; DOI, license, and citations remain the exact text in that artifact. Retrieval does not infer or create citations and does not call a network service or an LLM.

The exported `loadScientificCorpus(root)` and `searchScientificSources(query, corpus, {topK})` functions can also be used directly. Add new files to the discovered existing paths to make them searchable; update `SCIENTIFIC_DOCS` only when adding a new scientific documentation page outside those paths.
