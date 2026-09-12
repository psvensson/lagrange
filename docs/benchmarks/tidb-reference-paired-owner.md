# TiDB/Lagrange paired benchmark owner — implementation sequence item 10

Status: required next step after the Lagrange OLTP adapter

This document is the acceptance contract for item 10 of
`tidb-reference-scenarios.md`: the open-loop paired comparison owner.

The paired owner must not publish comparative numbers merely because both
adapters can execute the same logical workload. Before a run is marked
`comparable: true`, it must preregister and enforce a database-independent
semantic profile covering visibility, conflicts, retries, timeout accounting,
and durable success.

## Scenario A semantic-equivalence gate

The first Scenario A paired owner must explicitly account for the current
transaction-model difference discovered while implementing the Lagrange OLTP
adapter:

- the TiDB SQL form uses ordinary transactional locking statements such as
  `SELECT ... FOR UPDATE` where appropriate;
- Lagrange currently provides epoch-based snapshot isolation with
  read-your-own-writes and first-committer-wins write-conflict detection at
  prepare;
- the current Lagrange PostgreSQL SELECT AST does not retain `FOR UPDATE` as a
  distinct locking semantic.

The benchmark must therefore compare required externally observable semantics,
not claim identical locking mechanisms.

Before the first paired performance sweep, item 10 must define and prove all of
the following:

1. the required visibility/isolation properties for each transaction family;
2. the forbidden anomalies and the independent checks that detect them;
3. the conflict/deadlock outcome classes on each system;
4. whether retries are allowed, and the same maximum retry budget on both sides;
5. retry time remaining inside the original request latency clock;
6. timeout and ambiguous-commit classification;
7. the durable condition that makes an operation successful;
8. a mapping from each product-specific conflict/abort result to the shared
   benchmark outcome vocabulary;
9. a deterministic contention proof showing the two adapters satisfy the same
   preregistered externally observable contract under conflicting operations;
10. explicit `comparable: false` evidence if equivalence cannot be demonstrated
    without weakening either system's correctness contract.

A product-specific mechanism such as `FOR UPDATE`, snapshot isolation, or a
particular database isolation-level name is evidence about how a system meets
the contract; it is not itself the benchmark contract.

## Retry owner

Retry behavior belongs to the paired benchmark owner, not to either database
adapter. An adapter may expose typed conflict/abort information, but it may not
silently retry a request on its own.

The paired owner must:

- start latency at the request's intended open-loop issue time;
- include every retry and retry backoff in that same latency sample;
- apply the same preregistered retry ceiling to both systems;
- retain abort/conflict/retry counts in evidence;
- fail closed on an unclassified conflict or ambiguous commit;
- prevent a retry policy change after results are observed.

### Preregistered Scenario A retry profile v1

The first paired Scenario A profile is fixed by
`test/distributed/harness/oltp-paired-retry-owner.js`:

- policy identity: `scenario-a-retry-v1`;
- only SQLSTATE `40001` is retryable;
- at most three retries after the first attempt;
- deterministic backoff: 5 ms, 10 ms, then 20 ms;
- the request clock starts at the intended open-loop issue time and is never
  reset by an attempt or retry;
- all retry delay remains inside that request-clock latency sample;
- transport errors, unknown errors, and ambiguous commits are terminal failures;
- database adapters may expose conflict details but may not own retry loops.

Changing this policy requires a new policy identity. An observed result must
never cause an in-place mutation of `scenario-a-retry-v1`.

## Evidence required before performance comparison

The semantic gate is deterministic and runs before expensive paired GCP sweeps.
Its evidence must identify:

- exact Lagrange commit and TiDB/TiKV versions;
- dataset and operation-plan digest;
- semantic-profile digest;
- adapter identities;
- transaction family and conflicting operation pair tested;
- expected shared outcome set;
- actual outcome and final-state invariant checks;
- retry count and total request-clock duration where a retry occurs.

Only after this gate is green may item 10 proceed to the open-loop offered-load
sweep, randomized/counter-balanced paired repetitions, SLO classification, and
statistical summaries described by the main scenario contract.

This is a fairness gate, not a request to change Lagrange core transaction
semantics as part of benchmark implementation. If the existing product semantics
cannot meet the shared contract, the benchmark records that fact and remains
non-comparative until the owning product roadmap changes it.
