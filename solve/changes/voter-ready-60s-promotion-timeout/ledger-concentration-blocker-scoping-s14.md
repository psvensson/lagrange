# The actual demo-binding blocker — bootstrap ledger quorum-concentration (s14 scoping)

Scoped in parallel with the voter-surplus design (session s14). All three s14
affinity-demo runs abort at step [2/4] (ratings load) with the same error, and
**runs 1 & 3 hit it with zero voter-ready timeouts** — so this is a blocker
distinct from, and not downstream of, the voter-surplus / voter-ready-60s work.

## The chain (file:line, source-verified)

1. **Emit** — `operation_ledger_quorum_concentrated`
   (`rebalance-coordinator-ledger-interlock-admission.js:37-38`, fired at
   `:315-338`). On the NON-self-move branch of `ensureOperationLedgerSelfMoveSerialized`
   (`:201-213`): even with no live ledger self-move, if the ledger's voter quorum
   is concentrated AND spreadable, it defers dependent admission.
2. **Concentrated predicate** — `operation-ledger-quorum-concentration.js:130`:
   `totalVoters - maxVotersOnOneNode >= majority` is FALSE → the voters outside
   the single hottest node cannot form a majority (no quorum without the hot
   node). Voters counted by status ∈ {ACTIVE, REMOVING} ∧ raft_role voter
   (`:24-55`). Engages only when `spreadActionable` (`:154`): a ready node with no
   replica exists, or the partition is over target.
3. **→ provisionable=0** — for a CREATE TABLE, each candidate node is probed via
   `checkProvisioningAdmission`
   (`sql-query-engine-initial-partition-provisioning.js:296`); every node returns
   the same cluster-wide hold → `admittedTargetNodeIds=[]` →
   `maximumPrecheckedProvisionableReplicaCount = 0` (`:339-340`). The
   transient-shortfall fallback (`:358-385`) is guarded by `> 0` (`:360`), so a
   zero can't be rescued → `else` throws (`:386-398`,
   `throwProvisioningInsufficientTargets`,
   `sql-query-engine-provisioning-admission-methods.js:280-314`). This is a
   DOCUMENTED OWNED RESIDUAL (admission-methods `:16-20`).
4. **Why a `tbl-*` create is blocked by control-plane concentration**: the hold is
   a cluster-wide serialization on the shared `replica_operations` ledger, not a
   per-partition check. Every op persists progress into `replica_operations`;
   while its quorum is concentrated, all dependent admissions are deferred.

## Live binding value (run 3, node-0)

`replica_operations-p1`: `totalVoters:3, maxVotersOnOneNode:3, hottestNodeId=seed
(d9a13e72), feasibleTargetNodeId=2d3213d8, overTarget:false, spreadActionable:true`.
All three ledger voters colocated on the seed from formation. This is a
**placement concentration (3 legitimate voters on the seed)**, NOT a voter
surplus (no 4th voter). `overTarget:false` at the binding snapshot affirmatively
decouples it from the over-creation / voter-surplus mechanism.

The cure is a ledger self-move REPLACE of a voter off the seed. Exactly ONE was
dispatched (`replica_operations-p1-r1`, seed→2d3213d8, 08:31:54) and the spread
did not reach ≤1 voter/node before the demo's ~76s CREATE-TABLE budget expired
(the tbl convergence waited only ~10.7s before probing provisionable=0).

## Not a new root — an already-quested tail

- Gate built by `formation-ledger-quorum-spread-first` (SOLVED).
- `provisionable=0` fail-fast is the owned residual of
  `provisioning-admission-ledger-hold-transient-wait` (SOLVED; run24 failure on
  record).
- Stuck-spread maps to `formation-ledger-spread-window-follow-up-latency` (SOLVED)
  or `formation-ledger-post-spread-voter-visibility-latency` (**EXHAUSTED** — the
  hold staying engaged after physical spread completes; closest live match if the
  REPLACE physically completed but the hold didn't observe it).

## Honest causation gap + the decisive experiment

Provable: the abort is the quorum-spread hold on a bootstrap-concentrated ledger
whose single spread REPLACE didn't complete in the CREATE-TABLE budget.
NOT provable from logs: WHY that REPLACE didn't finish — (i) slow new-voter
catch-up, (ii) a genuinely wedged remove-leg, or (iii) the budget is simply
shorter than a correct serialized spread.

**Recommended next diagnostic (cheap, decisive):** re-run the affinity demo with
an EXTENDED CREATE-TABLE convergence budget (raise
`tablePartitionTargetNodeConvergenceTimeoutMs` well past 76s), DIAGNOSTIC ONLY:
- greens → root is spread-window latency / budget-too-short (tractable tune);
- still aborts, ledger still concentrated → the spread REPLACE is genuinely
  wedged → route to `formation-ledger-spread-completion-…` / the EXHAUSTED
  post-spread-visibility quest.

Optionally fold in an info-level probe around
`evaluateLedgerPartitionConcentration` (`operation-ledger-quorum-concentration.js:117`)
dumping per-voter {node_id,status,raft_role} each evaluation, to see whether the
physical spread ever reached ≤1 voter/node (→ post-spread visibility) or stayed
concentrated (→ REPLACE non-completion).

**Key files**: `rebalance-coordinator-ledger-interlock-admission.js:201-338`;
`operation-ledger-quorum-concentration.js:117-209`;
`sql-query-engine-provisioning-admission-methods.js:7-24,256-314`;
`sql-query-engine-initial-partition-provisioning.js:339-398`;
`query-constants.js:145-146`.
