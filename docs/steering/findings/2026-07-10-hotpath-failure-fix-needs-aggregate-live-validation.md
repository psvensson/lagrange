---
source: operator-directive#hotpath-live-ab
---

NEVER ship a change to a hot failure-handling path (retry, recovery, failure-classification, backoff) without a controlled live A/B: N≥2 runs fixed vs N≥2 reverted, comparing aggregate error counts and outcome.

You MUST NOT convert a defer/backoff on a hot failure path into advance-now work (extra reads, re-inserts) without that live A/B proof — a defer during churn is often the load-shedding that lets prerequisites settle.

Why: a unit-correct, DT-red-on-revert-proven, adversarially verified fix can still regress the live cluster through aggregate read/write amplification a single-firing deterministic test cannot sample. Witness: `1ce80391` (unit-green + DT-proven + 5417 tests green) caused a ~14x participant-failure storm and aborted 2/2 live runs; reverted `692c9dbb`. Hot path = code invoked per transient error under formation churn or retry storms. The A/B runs are back-to-back on the same machine, and the error counts compared are on the touched path specifically.
