# A1 implementation plan (pre-implementation, for verifier review)

Goal: stop a single-partition `replica_operations` ledger progress write from
opening a spurious 2PC participant `BEGIN IMMEDIATE` (which orphans on the
leaderless `sql_transaction_participants-p1` and freezes the durable watermark).
Vet verdict (`vet-A1-A2-fix-design.md`): SHIP A1 with an ENGINE-level,
post-mirror-count guard; A2 is a non-bug in RAFT mode (do not ship).

## Established facts (code-cited)
- Engine decides 2PC per write at `sql-query-engine-write-execution.js:246-285`:
  if `txState = getTransaction(sessionId)` is truthy → `enlistParticipants` +
  `recordWriteOperation` (opens the participant BEGIN IMMEDIATE + 2PC bookkeeping),
  then `executePlan` runs regardless (:314).
- Mirror participants (SPLIT_CUTOVER) are added at
  `sql-query-engine-table-routing-methods.js:423-453` ONLY when
  `parsePartitionTransition(tableInfo).state === SPLIT_CUTOVER_ACTIVE`. So AFTER
  `addTransitionMirrorParticipants` (:243), `writePartitions.length === 1` ⟺ the
  ledger table is NOT mid-split. This is the vet's post-mirror guard, and only the
  engine knows it (via `tableInfo`).
- The existing bypass path (`owner-execution-lane.js:711-716`) sets
  `disableSystemWriteSession:true` and deletes `sessionId`;
  `resolveSystemWriteSessionId` (`cdc-routed-mutation-readiness.js:284-295`)
  returns null → engine sees no session → plain write. It is gated on the OP's
  TARGET partition being priority (`shouldBypassTransitionExecutionTransaction`,
  `owner-execution-lane.js:696-699`) — so self-moves (target=ledger) are already
  bypassed, but data-partition ops (target=ratings-p*) are NOT, and their ledger
  progress write opens the spurious 2PC. NOTE: the existing early-strip bypass is
  itself SPLIT_CUTOVER-blind; the engine guard fixes that too.
- Commit of a zero-participant transaction is a clean no-op: `runCommitProtocol`
  (`distributed-transaction-protocol.js:187-246`) walks PREPARING→PREPARED→
  COMMITTING with an empty participant set → 0 prepare failures → success.

## Chosen design: engine-level skip, session-neutralized, post-mirror-guarded
A new query option `bypassSingleParticipantSystemWrite` set by the rebalancer on
its ledger progress write, honored ONLY in the engine and ONLY when post-mirror
`writePartitions.length === 1`.

### Change 1 — engine (`sql-query-engine-write-execution.js`, executeUpdate)
```
const bypassSingleParticipant =
  queryOptions?.bypassSingleParticipantSystemWrite === true &&
  writePartitions.length === 1;                    // post-mirror ⇒ not mid-split
if (txState && !bypassSingleParticipant) {
  // ...existing enlistParticipants + recordWriteOperation (unchanged)...
}
```
And when bypassing, neutralize the session on the write so the partition applies a
plain (auto-commit) routed write identical to the proven `disableSystemWriteSession`
path — build `writeExecutionOptions` with `sessionId: bypassSingleParticipant ? null : sessionId`.
The coordinator tx (if the workflow opened one) then commits empty (no-op).
Apply the SAME guard in the sibling INSERT/DELETE executors if they share the arm
(verify — executeUpdate is the ledger progress path; INSERT is create, DELETE n/a).

### Change 2 — rebalancer sets the flag on ledger progress writes
Thread `bypassSingleParticipantSystemWrite:true` from the transition persist path
(`replica-operation-repository-mutation-persistence-methods.js:161-193` gateway
options / `operation-workflow-transition-orchestration.js` persistOptions) down to
the engine `queryOptions`. Must reach `executeUpdate`'s `queryOptions` WITHOUT
stripping the session early (do NOT use `disableSystemWriteSession` for this — the
engine needs the session present to make the post-mirror decision). Verify the
threading path carries arbitrary flags to `executeUpdate` queryOptions.

### Invariants preserved
- `writePartitions.length > 1` (SPLIT_CUTOVER mirror) ⇒ `bypassSingleParticipant`
  false ⇒ full 2PC. Verified by the guard.
- Multi-statement application sessions (`sql-query-engine.js` app BEGIN) that
  accumulate several single-partition writes: the flag is set ONLY by the
  rebalancer's ledger progress write, so app/managed-split sessions are unaffected.
- No per-failure amplification: A1 REMOVES work (no BEGIN, no bookkeeping).

## DT (red-on-revert)
`test/rebalancer` (or `test/query`): drive a NON-priority-target op's transition
progress write to `replica_operations`; assert (a) NO participant `BEGIN IMMEDIATE`
opens on `replica_operations-p1` and the row is durably updated; (b) companion: a
`replica_operations` write while the table is SPLIT_CUTOVER_ACTIVE (post-mirror
length 2) STILL enlists 2PC. Red on unfixed head (BEGIN opens). Run
`npm run dt:prove --test <f> --src sql-query-engine-write-execution.js`.

## Live A/B (2-pre/2-post)
Signal: [2/4] load PASS + completions drain past 43; orphaned-hold rollbacks(×11)
and `transaction_hold`/`commit_durability_divergence` unfit events → ~0. Guardrail:
participant-failures on `replica_operations` must NOT rise.

## Threading chain (traced) + local/routed split (NEW finding)
- The spurious 2PC opens ONLY on the ROUTED path. The leader-LOCAL fast path
  `tryExecuteLocalSystemTableWrite` (`cdc-routed-mutation-readiness.js:501-508`)
  calls `partitionService.executeQuery(sql, params)` directly — no session, no
  enlist, plain write. So the fix targets ONLY the routed path
  (`sqlQueryEngine.executeQuery` → statement-execution.js:440 → executeUpdate → enlist).
- Flag threading mirrors the existing `disableSystemWriteSession` (explicitly
  forwarded per hop): rebalancer gateway options
  (`replica-operation-repository-mutation-persistence-methods.js:172-183`) →
  `replica-operation-repository-mutation-gateway-methods.js:509,522` →
  `cdc-integration-service-mutation-operations.js:259,419` →
  `cdc-integration-service-mutations.js:63,199` →
  `cdc-routed-mutation-readiness.js` `baseQueryOptions` (:457-459) →
  `sqlQueryEngine.executeQuery` queryOptions → `executeUpdate`.
  (Verify whether each hop spreads `...options` — then no per-hop edit — or copies
  explicit fields — then a 1-line forward per hop.)
- Rebalancer sets `bypassSingleParticipantSystemWrite:true` unconditionally on the
  ledger progress write; it is a NO-OP for the already-bypassed priority-target ops
  (they null the session, so no txState, so the engine never reaches the flag) and
  only takes effect for the currently-2PC'd data-partition ops.

## Open risks for the verifier to check
1. Does neutralizing `sessionId` on the write (Change 1) fully match the proven
   `disableSystemWriteSession` plain-write path, or is another field
   (transactionId, deliverySource) needed to avoid transactional apply?
2. Does the flag thread cleanly to `executeUpdate` queryOptions through the CDC
   routed-write layer, or is there no passthrough (then the design must move)?
3. Is `executeUpdate` the ONLY arm these progress writes take (vs a routed CDC
   `updateSystemTableRow` path that never reaches this enlist block)?
