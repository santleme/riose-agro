# Architectural and scientific decision log

- **ADR-BEH-001 (2026-10-15):** New SDD track branched from unmerged Product V2 #190. Do not directly change or merge main. Rationale: preserve a stable UI/conversation baseline.
- **ADR-BEH-002:** Generative behavior research is separate from observed behavior classification; neither validates weight/intake/heat intervention responses.
- **ADR-BEH-003:** First candidate is simple Markov / semi-Markov policy, not LLM-per-agent. Rationale: observable metrics, low computational cost, repeatability.
- **ADR-BEH-004:** Perea WA/GR/RE/RU ontology remains separate from FarmEngine actions. No implicit collapse, no fictitious drinking data.
- **ADR-BEH-005:** Holdout grouped by individual animal; no synthetic sequence regarded as new biological sample. Site/breed confounding remains visible.
- **ADR-BEH-006:** Groq and Hugging Face are optional orchestration/model artifact services, not an animal physiology simulation substrate. No provider key required for core features.
- **ADR-BEH-007:** Experimental behavior policy disabled by default, no predictive confidence or commercial deployment claim; independent external ground truth required to progress to population validity.
