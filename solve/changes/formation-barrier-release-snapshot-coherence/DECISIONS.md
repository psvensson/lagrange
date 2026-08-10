# Decisions: formation-barrier-release-snapshot-coherence

Quest: `formation-barrier-release-snapshot-coherence` (sealed). Parent:
`formation-barrier-spread-release-oscillation`. Diagnosis recorded BEFORE
design, per the sealed instruction. HEAD at diagnosis: working tree over
`c0c73cb06` (quest drafted at `a754867c0`).

## The exact incoherence (code + live evidence)

All line references: `src/bootstrap/node-joining-operation-ledger-formation-readiness.js`
(pre-change numbering).

### F1 — Verdict-source flapping with silent stale-cache substitution

`getOperationLedgerFormationBarrierSnapshot` (:209-300) reads the joiner's
LOCAL cache lane first (`getOperationLedgerQuorumObservation` +
`isLedgerQuorumConcentratedPartition`, :220-228) and consults the owner-RPC
placement lane ONLY when the cache lane looks bad
(`!observation.complete || concentrated`, :243-244). When the RPC read fails
or the view is missing, the verdict silently falls back to the stale cache
(`spreadProofComplete = observation.complete`,
`spreadConcentrated = concentrated`, :257-262) — a partial verdict from a
different world at a different instant, not a typed defer.

A joining node's cache never converges during the barrier (it captured
3-voters-on-seed at join). Live runs
`public-path-multinode-baseline-20260810T154716Z/155045Z`
(`test-output/reports/.playback/<run>/.full-logs/`): every logged iteration
has cache `observationComplete:true, concentrated:true` while the RPC lane
alternates between failing (`authoritativePlacementComplete:false`,
counts 0) and answering. The state therefore flaps:

- RPC fails -> cache verdict `spreadProofComplete:true` + concentrated ->
  `waiting_for_ledger_spread`;
- RPC answers unspread -> `spreadProofComplete:false` (note the conflation:
  the PROOF is complete, the VERDICT is unspread) ->
  `waiting_for_ledger_observation`.

14 <-> 13 transitions over 135s, both joiners, both runs. The flap is purely
lane availability, not placement change.

### F2 — Terminal ghost REMOVING row deadlocks the two release legs

Seed log, run 155045Z: the REMOVE of `replica_operations-p1-r3` COMPLETES at
15:52:51-52 ("Replica removal completed", coordinator "Operation completed",
op `97ad698a`). Physical placement from then on: 3 ACTIVE voters on 3
distinct nodes. Yet the r3 services row (status `removing`, voter raft role)
stays visible to the owner-RPC read until shutdown (15:54:03) — the seed's
own coordinator logs `totalVoters:4, maxVotersOnOneNode:2` at 15:53:24 and
15:53:55. The row is a terminal ghost (the services-row DELETE lagged under
churn; the normal ordering "service-row deletion precedes terminal REMOVED
persistence" inverted).

The shared predicate counts REMOVING rows as quorum voters (correct while a
removal is genuinely in flight — run-22 protection), so the placement leg
computes 4 voters / maxOnOne 2 -> concentrated -> `spreadComplete:false`
forever. The one leg that could prove the ghost terminal — the self-op drain
observation — is fetched only AFTER the spread verdict passes
(`spreadProofComplete && !spreadConcentrated`, :263-266). Each leg waits on
the other: the drain observation NEVER runs (`inFlightOperationCount:null`
in every logged iteration of both runs — it is never attempted, not
incomplete), and the barrier starves in a healthy busy cluster until the
120s timeout, then the join retries and starves again.

### F3 — Converse hole: cache-only release with zero owner proof

When the joiner cache happens to look good (`complete && !concentrated`) the
owner-RPC leg is skipped entirely (:243-256 gate) and
`spreadProofComplete`/`spreadConcentrated` come from the cache alone; the
drain leg then gates release. An engaged barrier can therefore release with
NO authoritative placement evidence. Proof this path is live: the
"real placement and coordinator owners" DT
(`dt-formation-priority-placement-before-active.test.js:367`) releases today
with a coordinator whose readiness service has no
`getAuthoritativeControlPlaneView` at all. Not observed in the red runs
(the joiner cache stays stale-concentrated) but it is the same mixed-lane
defect pointing in the unsafe direction.

### Answers to the sealed diagnostic questions

- Are the legs fetched from different sources at different instants and the
  verdict computed from a MIX? Yes. Cache read at T0 (sync), RPC awaited at
  T1 only under a cache-state gate, verdict substituting cache values on RPC
  failure, drain at T2 gated on the mixed verdict. Across iterations the
  verdict alternates SOURCES (owner vs stale cache), which is the flap.
- Is the drain observation ever completing? It is never ATTEMPTED
  (`inFlightOperationCount:null` = the F2 gate never opens). Not a deferral
  problem in the observed runs.
- Drain-observation scope verdict: NOT widened.
  `getEntityAuthoritativeOperationObservation(SERVICE_TYPE.PARTITION, 'replica_operations-p1')`
  -> repository `getOperationsByEntityAuthoritativeObservation`
  (`src/rebalancer/replica-operation-repository-entity-read-methods.js:145-228`)
  issues `SQL.SELECT_OPERATIONS_BY_ENTITY [entityType, entityId, entityId]`
  — strictly self-scoped; other partitions' churn is excluded by the entity
  predicate (the test coordinator mirrors the same predicate). Its
  AVAILABILITY can defer under owner pressure (`deferredOutcome`), which
  under the fix is a typed defer iteration bounded by the unchanged 120s
  timeout — not a scope fix.

## Design (bounded to the sealed statement)

Same `while(true)` loop, same poll, same timeout, no new timers or polling
machinery. All changes concentrate in the snapshot builder so that ONE
iteration = ONE coherent evidence unit. The state resolver's field contract
(`spreadProofComplete` / `spreadConcentrated` / `operationObservationComplete`
/ `inFlightOperationCount`) is kept so the mocked-snapshot DTs stay valid.

Engaged iterations (`observeOperationDrain: true`):

1. ALWAYS fetch the owner-RPC placement leg — the cache-state gate is
   removed. The stale-cache verdict substitution is removed: if the leg is
   unavailable this iteration, `spreadProofComplete = false` and the
   iteration is a typed defer (`waiting_for_ledger_observation`), never a
   cache verdict. This also closes F3: an engaged barrier can no longer
   release without an authoritative owner answer (fail-closed tightening).
2. From the SAME owner rows, compute two projections through the frozen
   shared predicate (`getAuthoritativeOperationLedgerPlacementObservation`,
   called twice — `src/rebalancer/operation-ledger-quorum-concentration.js`
   is landed/frozen and is not edited):
   - raw (ACTIVE + REMOVING voters — completeness/authority, unchanged);
   - settled (rows pre-filtered to ACTIVE status — the release-spread
     verdict: voters >= target, distinct nodes >= target, unconcentrated).
   `spreadProofComplete := raw.complete` (the owner answered with at least
   the target voter count). `spreadConcentrated := !settled.spreadComplete`.
3. The drain leg is fetched in the same pass, still only after the placement
   verdict passes (preserving the guard pin "operation drain is not queried
   before placement is proven",
   `dt-formation-priority-placement-before-active.test.js` matrix). Release
   (`SATISFIED`) requires drain complete AND zero in-flight self-ops. The
   REMOVING-ghost forgiveness is therefore JOINT, exactly the sealed release
   condition: settled spread (3/3/unconcentrated over ACTIVE voters) AND
   self-ops terminal. An in-flight REMOVE holds at
   `waiting_for_ledger_operation_drain` (run-22 protection intact, now
   provided by the leg that semantically owns it); an unavailable drain leg
   holds at `waiting_for_ledger_operation_observation` (typed defer).
4. Not-engaged iterations keep the cheap cache-only cohort snapshot
   (engagement latch, discovery, BYPASSED_INSUFFICIENT_COHORT unchanged);
   their release-evidence fields report proof-absent so the first engaged
   pass is a typed defer, not a cache verdict.
5. Fail-closed floor untouched: the 120s timeout still throws
   `OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT` (a permanently unavailable
   leg times out — never bypasses), durable-rejoin and snapshot-absent
   early returns, engagement latch, and the two-node/sequential-growth
   bypasses keep exact semantics.

No new barrier states, no new config, no changes under `src/rebalancer/**`
(frozen; the bootstrap file only calls its exported pure predicates).

### Prior art (named per the sealed instruction)

- Decision-table idiom: the ledger-hold policy's single declared release
  table `OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE`
  (`src/rebalancer/operation-ledger-hold-policy.js`) — one evidence tuple,
  one declared verdict per class. The barrier's engaged verdict is the same
  idiom: (placement evidence, settled spread, drain evidence) -> state, with
  UNAVAILABLE as a first-class evidence class instead of a fallback.
- The formation-barrier fixture (`test/convergence/formation-barrier-test-fixture.js`)
  and the oscillation DT
  (`test/convergence/dt-formation-barrier-spread-release-oscillation.test.js`)
  from the parent quest: real barrier loop + virtual clock + real owners;
  the new busy-healthy cases extend that file, no new test files.
- Ledger-hold policy precedent for the self-op scope: the hold policy keys
  on the ledger partition's OWN lifecycle evidence, not global churn — the
  drain leg already matches (entity-scoped read), verified above.

### Known residual risk (recorded)

If a REMOVING services row lingers with NO recorded self-op at all (orphan
cleanup debt, `removed-replica-cleanup-debt-owner` territory), the joint
rule releases once the ACTIVE voters are settled-spread and the drain proves
zero in-flight self-ops. The authoritative op-ledger read has just proven no
operation exists that needs the lingering replica's ack, the settled voters
form a spread majority on 3 distinct nodes, and the fail-closed timeout and
engagement semantics are unchanged — accepted as within the sealed release
definition ("its own self-operations are terminal").

### Test-compatibility deltas (intentional, named)

- `dt-formation-priority-placement-before-active.test.js:367` ("real
  placement and coordinator owners...") today releases via the F3 cache-only
  path. Under the fix it must provide the owner placement lane; the test
  gains a readiness-view stub serving the SAME live cache rows already used
  for the gateway's owner-RPC stub (:381-394) — an honest tightening: the
  release now consumes authoritative placement evidence.
- The oscillation DT's case-1 flap witness still sees both states:
  RPC-unavailable iterations -> `waiting_for_ledger_observation`,
  answered-but-unspread iterations -> `waiting_for_ledger_spread`.
