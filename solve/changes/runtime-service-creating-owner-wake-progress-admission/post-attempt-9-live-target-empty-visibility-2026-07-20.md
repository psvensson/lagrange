# Post-attempt 9 live target visibility boundary

## Ordered-gate result

Checkpoint `c4d5d1fa` passed the ordered five-probe gate. Demo 1 then passed
schema and load admission, loaded 100000 ratings, spread all three data
partitions across five nodes, returned 1682 distributed SQL rows, placed two
ACTIVE runtime replicas, produced two learned-attribution rows, executed a
bounded two-partial reduce, and returned the exact top 10. It stopped after
weighted locality remained `0.5` for 300 seconds without a subsequent
placement move.

Report:
`test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T05-23-33-693Z.report.json`

## First divergent runtime boundary

The two runtime operations were:

- `7d0317fd-a6a2-42b1-9c26-501958161a21`
- `e4376c7f-ff72-4032-a892-d90914e1acf5`

The first source operation entered SENDING at `05:17:39.398Z`, its target
completed runtime creation at `05:17:39.441Z`, and the source committed
CREATING at `05:17:39.709Z.`

The second source operation entered SENDING at `05:17:39.740Z`, its target
completed runtime creation at `05:17:39.757Z`, and the source committed
CREATING at `05:17:39.769Z`.

The target logs contain the runtime handler CREATE and ACTIVE completion for
each operation but no target-side `replica_operations` CDC visibility for
either operation. The source reported operation-cache visibility deferral for
both dispatches, while node 3 reported empty `replica_operations` CDC reads
around both target completions. At terminal capture, all three canonical
operation databases agreed both operations remained CREATING, while the exact
runtime services rows were ACTIVE on their target nodes.

The production owner path currently treats a fresh EMPTY visibility result as
retryable only for `REPLICA_CREATE_CREATING`, `REPLICA_CREATE_SYNCING`, and
`REPLICA_CREATE_ACTIVE`. The distinct
`RUNTIME_SERVICE_CREATE_ACTIVE` outcome therefore resolves EMPTY to
SKIP_OUTCOME, clears its retained payload, and never reaches the existing
remote-owner handoff classifier.

The existing bounded mechanism is sufficient: the one-minute fresh-outcome
window, retained payload, exponential timer, and owner-key redrive already
cover the generic replica-create outcome. The missing runtime type should join
that set. No new timer, queue, owner, timeout, or target-side workflow write is
needed.

## Adjacent ordering boundary

Once visibility recovers, the first visible remote row may still be SENDING.
The source ingress contract already canonically admits runtime target-progress
wakes for SENDING and CREATING, but the producer-side remote handoff predicate
still admits only CREATING and SYNCING. The producer must consume the canonical
`RUNTIME_TARGET_PROGRESS_WAKE_WORKFLOW_STEPS` set so the same early ordering is
covered on both sides of the handoff.

## Independent verification

Verifier `verify_runtime_progress_attempt7` approved the fresh-EMPTY
attribution and identified the producer-side SENDING mismatch independently.
It traced EMPTY to SKIP before remote-owner routing, confirmed the generic
replica-create retry as the exact precedent, and passed 191 assertions across
three relevant test files without edits. Its evidence caveat is that INFO logs
do not directly print the target visibility classification; the combined
cache-deferral, empty-CDC, timing, and durable-state evidence makes fresh EMPTY
the best discriminating theory. A deterministic test must therefore start at
fresh EMPTY, expose an independently cloned SENDING row on retry, and prove the
canonical target-to-source handoff reaches exact-target ACTIVE.

## Deterministic correction evidence

The production-seam test now starts with fresh EMPTY target visibility, retains
one existing bounded outcome retry, exposes a separately cloned SENDING runtime
operation on the retry read, sends one canonical target-progress wake to the
source ingress, and terminates the source-owned row only from the exact ACTIVE
runtime services row on the target.

`dt:prove` is green/red/green (`0/1/0`) across all three source owners:

`solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T05-42-41-153Z.json`

Focused results:

- runtime target-progress production seam: 28/28 assertions
- coordinator-created remote target outcome: 43/43 assertions
- executor outcome routing: 81/81 assertions
- executor outcome retained-payload retry owner: 4/4 assertions
- runtime service handler: 29/29 tests
- model contracts: passed
- scoped ESLint, runtime grammar, literal, constant-name, decision-boundary,
  boundary-mode, operation-progress-authority, file-size, and owner-segment
  gates: passed
- the modified producer predicate no longer exceeds the cyclomatic threshold
- canonical step-owner drift improves from the inherited count 2 to count 1

`rebalance-coordinator-owner-path-convergence.test.js` remains 28/32 on both
the changed tree and an isolated detached `c4d5d1fa` worktree. Its four
services-cache progression failures are unchanged checkpoint debt and are not
caused by this executor-outcome visibility/handoff correction.
