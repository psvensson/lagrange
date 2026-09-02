# S6a causal-trace findings (quest critical-placement-causal-trace, landed)

Measured on live three-node in-process formations through the production join
path; instrument in
`test/integration/critical-replica-placement-causal-trace.integration.test.js`
with the nine-stage classifier; sealed artifact
`solve/report/critical-placement-causal-trace-live.json`.

## Stable across every run

- Baseline reproduces the epic's founding measurement under authoritative
  instruments: all 45 critical partitions KNOWN_NOT_CONVERGED after all
  nodes READY, every one with valid persisted policy (RF 3, source
  partition_row), holders concentrated on the seed, membership epoch stamped.
- **First missing transition: `deficit_measured -> operation_recorded`** -
  zero add-like replica_operations rows for the measurement-chosen critical
  partition across the whole budget, every run.
- The ordinary user-plane control stalls the same way: CREATE TABLE succeeds
  but provisioning never yields a partitions row (typed
  `control_provisioning_stalled`) - starved before it can even acquire
  authoritative policy.
- The operation-ledger partition ITSELF fully converges (REPLACE -> ADD ->
  REMOVE complete, three distinct holders, KNOWN_CONVERGED, its lane missing
  nothing).

## The mechanism, named by the deciding code path

In the sealed run the active probe drove ONE evaluation of the traced
partition's own production rebalancer (real coordinator): the planner EMITS
a replace move and admission DEFERS it -
`admissionReason: operation_ledger_quorum_concentrated`,
`decisionType: deferred`. Meanwhile the hold-owner projection
(`evaluateOperationLedgerQuorumConcentration`) stayed engaged start-to-end:
`replica_operations-p1` reads `totalVoters 4 > targetReplicaCount 3` with
`feasibleTargetNodeIds []` (every node already holds a voter) - a lingering
fourth voter row keeps the release predicate unsatisfiable while the S3
evidence for the same partition says KNOWN_CONVERGED on 3 distinct holders.

Run-dependence, stated as fact: hold engagement varies between runs (engaged
start-to-end in most; observed releasing mid-trace in one run in which the
passive lane STILL recorded nothing within budget). The deferral mechanism is
directly witnessed; exhaustiveness of that single cause is not claimed.

## The S6b repair boundary

The hold-release <-> services-row-truth interaction: a completed REMOVE
leaves its voter row behind, and the hold predicate consumes raw voter-row
counts instead of authoritative placement evidence (which S3 now provides
for exactly this question). Connects to the parked
operation-ledger-self-move-hold quests (duplicate ledger self-move). The
separately-witnessed planner-target authority divergence (probe: persisted 5
vs table-policy fallback 3, wiring-alive control proving attribution)
remains S6b's second mandatory closure before S4 becomes authoritative.
