---
audience: development
documentClass: current
---

# Completion behavior baseline

The unchanged source checkpoint is
`fefc75988807f2e89733ebaf2bc3a844d8ca311f`, descended from the sealed
`92ae06ef40df6610cb2163edd7d6476cd65bb3ef`. Its source tree is identical to
that base; only reviewed witnesses, this Quest and generated metadata were
added. Normal commit hooks ran without overrides or baseline changes.

The locked `adams-gamla` run used the exact commit, matching dependencies and
`LAGRANGE_RETRY_FAILED_ONCE=0`. The retained baseline input, controller output,
result and per-file ledger are in `baseline/`. All three files passed. The
runner counts 14 TAP case assertions: six declared fresh CREATE cases, seven
seed projection cases and one distinct-cohort case. Individual `node:assert`
calls inside those cases are not counted separately. No test skips or early
return replaces a case. New fixture cleanup rethrows the sole primary failure
or combines primary and cleanup failures; its error-identity control is one
of the six fresh cases.

| Entry | Exercised current behavior | Evidence ceiling |
| --- | --- | --- |
| Seed release cohorts | Actual fresh-seed authorization, client route, original deadline/token, first diagnostics, invalid/zero/nonleader delays, deadline-boundary and failed-wait behavior | Routed reply fixture; no consensus or native cutover claim |
| Fresh CREATE release | Actual recovery entry, token owner and release client; original answer/token/deadline, no seed diagnostic reads, timing and prerequisite branches | MATERIALIZED create admission and replies are labelled fixture seams |
| Distinct seed cohorts | Control-first deduplicated partition intents and one shared pass budget | Intent multiplicity; receiver owns replica census and cutover |

The safe positive delay exceeding the remaining budget stops before wait
preparation. If the guard passes but the preparation read reaches D, seed
executes a zero wait and fresh CREATE stops. If an executed wait ends at D,
both entries perform the final actual client call, which refuses dispatch at
D. A zero delay with a clock that never advances has no asserted finite
liveness bound.

The first exact baseline passed but its adapter requested an unwritten
results path, so only its controller log was retained. The corrected exact
repeat returned the canonical per-file ledger; neither result was overwritten.
A prior mistyped commit argument was refused before placement, as recorded in
`baseline/preflight-refusal.txt`. One already-submitted supplemental fresh-only
run retrieved `baseline/fresh-named-cases.tap`; no seed-only repetition was
needed after source-to-case correspondence was confirmed.

Before implementation, the decision audit reported `local_retry_loop` in
both original caller bodies. Its raw report also included an inherited seed
cache/SQL finding; this unit does not waive or repair that separate concern.
The original raw audit report remains preserved in the task's test-output
packet for external archival. This baseline establishes behavior to preserve,
not completion ownership, automatic retained-startup admission, U1 acceptance
or release certification. The Quest remains RED until its remaining gates
are measured and independently reviewed.
