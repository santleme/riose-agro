# Riose V4 — exploratory user-discovery protocol

**Status:** prepared, not executed. No participant has been contacted; no interview, demand, willingness-to-pay, or product-validation claim is recorded here.

## Purpose and boundaries

Explore whether professionals have a recurring decision to compare pasture supplementation levels using conditional dry-matter-intake estimates and transparent supplement-cost arithmetic. This studies workflow and perceived usefulness; it does not validate BR-CORTE, FarmEngine, a causal response, or commercial readiness. P3-008 remains blocked until its independent scientific/domain requirements are met.

## Falsifiable hypotheses

1. Target users recently compare at least two supplement options for a real grazing decision.
2. They can obtain or estimate the calculator's required representative inputs (BW, supplied ADG, supplement DM basis, herd count, period); the interviewer must not supply missing values.
3. Showing a conditional DMI equation result and explicit price arithmetic can improve their understanding of trade-offs enough to change a next step or prompt a useful follow-up.
4. Provenance, domain and “not gain prediction / not measured forage intake” limits are understandable without verbal coaching.

The interview is exploratory. A small sample cannot establish market size, willingness to pay, model validity, or customer readiness.

## Participant profile and sample

Initial qualitative round: 5–8 adults across farm decision makers, cattle nutritionists, and independent technical advisers who have participated in a pasture supplementation decision in the last 12 months. Seek role diversity. Do not treat multiple people from one organization as independent market samples. Do not collect farm names, exact locations, animal identifiers, confidential rations, or personal contact details in the research record.

## Consent and data handling

Before starting, explain the purpose, duration, voluntary nature, note-taking, and that the product is exploratory. Ask permission before recording; default to notes only. Use participant codes such as `U01`, store notes in approved private storage, remove names/organization identifiers, and let participants skip questions or stop. Do not upload interview content to an LLM or send it externally. No contact or recruitment occurs through this repository workflow.

## 30-minute session flow

1. **Consent and role (2 min):** confirm voluntary participation and broad role only.
2. **Recent decision recall (8 min):** ask about the last real decision, when it happened, who was involved, alternatives considered, data used, and what happened next.
3. **Current workflow (6 min):** tools/spreadsheets/advisers, time and direct costs, data availability, recurring bottlenecks, what is currently purchased or budgeted.
4. **Unprompted needs (3 min):** ask what would have made that specific decision easier before showing Riose.
5. **Neutral demonstration (7 min):** use the script in [`riose-v4-demo-script-2026-10.md`](riose-v4-demo-script-2026-10.md). Never enter invented participant data or a made-up price. If ADG or price is unavailable, leave the relevant result unavailable.
6. **Teach-back and next action (4 min):** ask the participant to explain what the number represents, what it does not represent, and what they would do next. Do not correct them until their interpretation is recorded.

## Non-leading questions

- “Tell me about the last time you chose or reviewed supplement levels for pasture cattle.”
- “What options did you consider, and how did you compare them?”
- “Which inputs did you actually have at the time? Where did each come from?”
- “What part took the most time or created the most uncertainty for you?”
- “What did you do after comparing the options?”
- “What would you expect this result to mean?” (after the demonstration)
- “Which part, if any, would you use in your next decision? What would you need first?”
- “What do you currently spend money or staff time on to answer this question? What budget or procurement process applies?”
- “What would make this output unusable or misleading for your work?”

Avoid asking a leading “Would you pay for this?” Record actual past purchases, existing budget, authority, procurement timing, and current alternatives. Any stated hypothetical price is a research response, not evidence of willingness to pay.

## Pre-committed exploratory readout

For a first batch of six completed, consented sessions (if six can be recruited), report counts with denominators and representative counterexamples:

- **Problem signal:** at least 4/6 independently describe a recent (within 90 days) supplementation/cost comparison before the demo. If fewer, reconsider the target problem.
- **Input feasibility:** at least 3/6 can identify a source for each required input for a real upcoming case, or clearly say which one is unavailable. Missing ADG/price must not be imputed.
- **Workflow value:** at least 3/6 identify a concrete next step that this comparison could change or accelerate. Record the step; do not equate stated interest with use.
- **Scientific comprehension:** at least 5/6 correctly teach back that Eq. 2.6 estimates conditional total DMI from supplied ADG, does not predict gain, and does not measure forage intake. Any misunderstanding is a product-clarity defect to fix, not an interview failure.
- **Commercial evidence:** summarize prior comparable spending, current alternatives, decision authority and procurement process. There is no pass threshold that grants paid-use or scientific approval.

If fewer than six sessions occur, provide raw counts and reasons; do not extrapolate. Report negative cases. Do not change these thresholds after seeing responses to claim success. An external domain reviewer remains responsible for scientific assessment.

## Output and stopping rule

Complete one copy of [`riose-v4-interview-record-template.md`](riose-v4-interview-record-template.md) per session, then a batch summary with counts and anonymized quotes only when the participant consented to quotation. Stop if input misunderstandings, privacy concerns, or product claims exceed what the model supports. Never write findings into the SDD as completed until real sessions have been conducted and records reviewed.
