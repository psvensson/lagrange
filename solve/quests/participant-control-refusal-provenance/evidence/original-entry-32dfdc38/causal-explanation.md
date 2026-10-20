---
audience: development
documentClass: evidence
---

# Original-entry measurement at 32dfdc38

Date: 2026-10-20. Candidate:
`32dfdc388cf80c695b70207e1b659bce8d5d6ad5`.
Independent interpretation: `subagent:/root/control_source_review`.
Status: **startup/recovery unresolved**.

One declared measurement ran the original five-case test entry with passive
instrumentation through the locked lab runner on adam-laptop, retries disabled.
The original assertions and 3,000 ms shared release budget were preserved. The source
repair and the focused controls had been independently reviewed first.

The [lossless raw lab record](lab.txt.json) reports two passing and three failing cases.
The full trace was copied from its unique remote temporary directory,
hash-checked, uploaded by Solver, downloaded again and hash-verified:
[complete trace](https://github.com/psvensson/lagrange/releases/download/solve-evidence/participant-control-refusal-provenance--original-entry-32dfdc38-trace.json).
Its SHA-256 is
`0c699ca94a218acd1913f022c5e407dcc3647c5c70bd039edce999bc3952b97f`;
size is 4,088,846 bytes.

One installation produced 1,515 uniquely completed records, zero dropped
records, zero capture errors and zero incomplete records. There are 123
RELEASE calls: all 82 control calls returned `cut_over`; the 41 non-control
calls returned 40 `cut_over` answers and one deadline refusal. There is no
`current_control_owner_fact` answer. The complete trace is authoritative;
[critical records](critical-records.json) and the existing summarizer's
[census](summary.json) are derived navigation.

## The actual terminal operation

For `sql_transaction_participants-p1`, let
`D = 1792518062677` be the request's shared deadline.
Call ordinals include other router traffic and are not array indexes.

| Event | Call / completion | Time relative to D | Actual result |
| --- | --- | --- | --- |
| Dependent RELEASE starts | 22722 / 1515 | -39 ms | Original request with the existing shared deadline |
| Nested control RELEASE settles | 22723 / 1507 | -16 ms | `cut_over` |
| Three dependent INSPECTs settle | 22733-22735 / 1508-1510 | -14 ms | `observed`, origin null |
| Three dependent PAUSEs settle | 22736-22738 / 1511-1513 | -10 ms | `observed`, origin null |
| Dependent ENABLE dispatches | 22739 / 1514 | -10 ms | Delivered to the actual leader |
| ENABLE settles | 22739 / 1514 | +10 ms | `observed`, origin index 2 / term 1; local applied, commit and last indexes 2 |
| Outer RELEASE settles | 22722 / 1515 | +11 ms | `release_fact_unavailable`, phase `observe_applied_position`, missing fact `release_deadline` |

There is no target `observe_applied_position` or `resume` dispatch. The
bootstrap projection reports ordinal 42/46, 41 completed cohorts and
elapsed 3,011 ms against budget 3,000 ms. Projection cohort counts and router
RELEASE counts are distinct observations.

The precise refusal is the specialized observation-budget branch in
`src/node/participant-release-client.js:77-94`. It returns a prepared answer;
`askParticipantRelease` returns that answer at lines 107-110, before transport
dispatch at line 117. This is not the generic line-112 deadline guard, and
not a native recipient rejecting an applied-position observation.
`enableAndObserveCohort` in
`src/node/replica-handler-participant-cutover.js:70-78` propagates it through
`runPausedCutover` at lines 339-341.

The returned origin corresponds to the existing committed application
boundary. The apply owner records it at
`src/partition/partition-participant-transaction-apply.js:554-579`;
proposer completion is an after-commit effect at lines 116-125.
`src/raft/raft-rs-application-transaction-owner.js:61-98` couples application
and applied progress. This is source correspondence to a real native answer,
not a separate post-shutdown database inspection or a cross-host durability
certificate.

## Obligation and limits

The trigger is the actual seed cohort release. Current control and dependent
facts permit ENABLE before the deadline; its durable effect can complete
after that deadline. The original attempt then cannot dispatch the next
observation, so it reaches neither the final census nor RESUME. Timeout
does not cancel the already reported origin.

Native/store owners retain the committed fact. The existing release recovery
and startup failure/cleanup owners must account for what happens next.
This trace does not establish follower application, crash/storage-loss
durability, eventual recovery or retained resource custody after startup
cleanup. The separate A witness demonstrates one retained-origin recovery
schedule, not this startup's continuation.

The earlier preserved measurement expired before ENABLE on a different
cohort. This run crossed the deadline during ENABLE. Neither can be used to
invent a circular control dependency or explain the historical nested-control
refusal. No repeated run or altered wait was used to seek that old outcome.

The other two red cases, one-durable-log and retained-store restart, receive
`partition_write_cutover_paused` for their writes. Those test-contract and
release-integration obligations remain recorded. They were also failing in
the earlier preserved measurement; no new regression or clean-suite claim
follows from their age or repetition.
