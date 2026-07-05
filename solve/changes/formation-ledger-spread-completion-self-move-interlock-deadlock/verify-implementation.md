# Implementation verification — legs A + C (READ-ONLY, adversarial)

Reviewer stance: assume a mistake exists; try to break it. Cited against source read
this session. Diff = 3 src files + 1 new DT.

## Summary of what was implemented (matches AMENDED DESIGN)

- Leg A: `ensureOperationLedgerSelfMoveSerialized` disruptive branch now resolves the
  blocker via `resolveDisruptiveSelfMoveConflict(liveOperations, partitionId)`
  (ledger-interlock-admission.js:161-164). That method re-verifies a SAME-ledger-partition
  self-move blocker via `isStaleTerminalLedgerSelfMoveGhost` →
  `queryAuthoritativeOperationVisibilityObservation(opId, {requireOwnerRpcRead:true})`
  (new coordinator proxy, operation-read-methods.js:42-48).
- Leg C: both count-increasing-ADD deferral guards changed from
  `deficitEffectiveCount >= target` to `Math.max(deficitEffectiveCount, occupiedCount) >= target`
  (move-planner-move-calculation-methods.js:560-566, :628-634).

---

## 1. LEG A CORRECTNESS — cache bypass actually achieved — CORRECT

The vet's decisive break was that `queryOperationById` is cache-first
(replica-operation-repository-read-methods.js:257-261: `getReplicaOperationRowFromCache`
FIRST, returns the cached STOPPING ghost, never issues SQL). The implemented read is a
DIFFERENT method:

- Coordinator proxy `queryAuthoritativeOperationVisibilityObservation`
  (rebalance-coordinator-operation-read-methods.js:42-48) delegates to
  `this.repository.queryAuthoritativeOperationVisibilityObservation`.
- Repository method (replica-operation-repository-read-methods.js:284-411) NEVER calls
  `getReplicaOperationRowFromCache`. Its FIRST action is `executeReplicaOperationsRead(
  SELECT_OPERATION_BY_ID, [id], {...readQueryOptions, retryOnRetryableFailure:true})`.
- With `requireOwnerRpcRead:true` the read mode is `REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS`
  (:307-311), which is `OWNER_RPC_REQUIRED` (repository.js:415-418).
- `executeReplicaOperationsRead` (:50-128) goes straight to
  `readAuthoritativeControlPlaneRows(controlPlaneSystemTableGateway, …)` — no
  `systemTableCache` consultation anywhere in that path.

So the read is genuinely cache-bypassing by construction, and OWNER_RPC_REQUIRED also
covers H2 (unreplicated-terminal on the inheriting node), satisfying vet amendments 1+2.
The vet's decisive break is FIXED, not relocated. Return shape `{operation, deferredOutcome}`
confirmed (repository :366-369 null path, :407-410 success path).

## 2. LEG A SAFETY (run-20) — CORRECT

`resolveDisruptiveSelfMoveConflict` (ledger-interlock-admission.js:236-260):
- Genuine in-flight same-partition self-move: authoritative read returns non-terminal →
  `isStaleTerminalLedgerSelfMoveGhost` returns false → the op is RETURNED (blocks). Test
  "run-20 preserved" (authoritative:'nonTerminal') → WAITING. PASS.
- Same-partition scoping is triple-guarded: `isDisruptiveOperationLedgerSelfMove(type,
  partitionId)` (requires REPLACE/REMOVE + `isOperationLedgerPartitionTable`) AND trimmed
  `partitionId` string-equality AND `normalizedSelfMovePartitionId.length > 0`.
- Normalization mismatch cannot wrongly-drop: if the moving partition id is missing,
  `normalizedSelfMovePartitionId=''` → length 0 → `isSamePartitionSelfMove=false` → EVERY
  op is returned (blocks). Fully conservative. An undefined/empty blocker partitionId
  likewise mismatches a non-empty moving id → blocks. No `undefined vs '' vs whitespace`
  path drops a dependent.
- Dependent (other partition / non-ledger type) NEVER matches → always returned. Tests
  "different ledger partition p2" and "dependent" → WAITING. PASS.
- Loop returns the FIRST genuine blocker; ghosts are `continue`d. Order-independent: a
  terminal ghost at any index is skipped, the first non-terminal/other blocker is returned.
  Dropping ALL candidates (all authoritatively terminal on the same partition) → null →
  admit, which is safe (no live config change exists). CORRECT.

## 3. LEG A error/deferred handling — CORRECT

`isStaleTerminalLedgerSelfMoveGhost` (ledger-interlock-admission.js:271-289):
- empty operationId → `return false` (keep blocking).
- read throws → `catch { return false }` (keep blocking) — mirrors `tryClear` :516-520.
- `observation.operation === null` (deferredOutcome/empty/retryable-failure paths at
  repository :366-369) → `return false` (keep blocking).
- terminal → true (drop); non-terminal → false (keep blocking).
No path silently admits on read failure or deferral. CORRECT.

## 4. LEG A async/TOCTOU — CORRECT

`resolveDisruptiveSelfMoveConflict` is async and correctly `await`ed at :161. It lives in
the ASYNC OBSERVATION lane. The SYNCHRONOUS co-admission gate
`runOperationLedgerInterlockAccountedCreate` (:437-483) is UNTOUCHED by the diff: it still
`assertOperationLedgerSelfMoveGateOpen` on entry (:447) and re-asserts after every await
(:466-470), and sets `state.selfMoveCreateInFlight=true` synchronously (:472) before
`executionFactory()`. The new await inside the observation lane cannot open a co-admission
hole because the actual create still passes the sync gate. CORRECT.

## 5. LEG C CORRECTNESS + SAFETY — CORRECT (one bounded RISK, non-blocking)

- `occupiedCount` (in-flight-aware-replica-count.js:22-27, 103-118, 152) counts committed
  placement rows in PENDING/CREATING/SYNCING/ACTIVE — genuinely includes the SYNCING
  learner replacement, closing the blind spot. Verified in the run-28 DT: 2 ACTIVE + 1
  SYNCING → occupiedCount=3, deficitEffectiveCount=2, `Math.max(2,3)=3>=3` → ADD suppressed.
  Test 5 (expects 0 ADDs) PASS; RED-on-revert holds (old `2>=3` false → ADD minted).
- Strictly additive: `Math.max(deficitEffectiveCount, occupiedCount) >= target` implies
  the old `deficitEffectiveCount >= target` case still evaluates true whenever it did
  before (Math.max ≥ each arg). NEVER removes an existing suppression. CORRECT.
- Guard 1 (:560-566) retains its `serializeCriticalReplace &&` gate → priority-scoped as
  before; only the threshold gained occupiedCount.
- Guard 2 (:628-634) is not priority-gated, but `occupiedCount` is computed once at :312
  from the same `currentReplicas` for every partition — identical meaning fleet-wide, NOT
  priority-gated (this is exactly why the amended form sidesteps vet C3, which was about
  hoisting the priority-gated `inFlightReplaceCount`). Fleet-wide it applies the SAME
  correct fix: suppress a count-increasing ADD only when target slots are already occupied
  by real rows; INCREASE-only ADDs are suppressed, non-increase/count-neutral moves
  retained (:636-637). Not harmful for normal partitions (if 3 slots occupied, minting a
  4th is over-target).
- RISK (bounded, non-blocking): a placement row genuinely stuck in SYNCING indefinitely
  WITHOUT transitioning to FAILED/REMOVED would keep occupiedCount high and keep the
  deficit ADD suppressed while active<target — a theoretical over-suppression/starvation,
  now fleet-wide via guard 2. This is materially weaker than the vet's C1 break (which was
  about trusting the in-flight-op CACHE): occupiedCount reads ACTUAL placement rows
  (ARCH-0080/0084), self-corrects the instant the row leaves the occupied statuses, and
  minting extra ADDs in a genuine learner-promotion deadlock does not help anyway. This is
  precisely the actuals-aligned tradeoff the vet demanded in place of C1/C3. Accept.
- No-starvation control (active=1, no occupied) still mints 2 ADDs. Test 6 PASS.

## 6. LEG C double-count / cap interaction — CORRECT

`Math.max` (not a sum) means no double counting between occupiedCount and
deficitEffectiveCount. The over-creation cap (:329-347, `activeCount > target`) reads
`activeCount` only — untouched by the occupiedCount change and fires on a disjoint
condition (surplus committed voters). The serialization cap (`replaceCount`, :535-540)
is independent. The vet's original leg-C ADD-a-sum form (double-count hazard) was
explicitly replaced by this Math.max form. CORRECT.

## 7. TEST FIDELITY — CORRECT (genuinely catches a cache-first/inert fix)

The Leg-A harness (runInterlock, :96-140) makes BOTH cache-first seams return the stale
non-terminal ghost (`queryIncompleteOperations` and `queryOperationById`) and ONLY
`queryAuthoritativeOperationVisibilityObservation` (when `requireOwnerRpcRead===true`)
returns the terminal twin. It drives the REAL `ensureOperationLedgerSelfMoveSerialized`
→ real `resolveDisruptiveSelfMoveConflict` → real `isStaleTerminalLedgerSelfMoveGhost`.
Therefore:
- A cache-first "fix" (reading `queryOperationById`) would see the non-terminal ghost →
  keep blocking → verdict WAITING ≠ ADMITTED → RED. Would be caught.
- The test also asserts `ownerRpcRequested` (the owner-RPC path was taken), so a fix that
  reads a cache-preferred mode would fail the second assertion.
Terminal predicate is real: terminalTwin (REPLACE @ REMOVED) → `isTerminalReplicaOperationRecord`
true (replica-operation-progress.js:561-586, REPLACE terminal steps include REMOVED/FAILED);
STOPPING ghost → non-terminal. Not a false-GREEN. Leg C drives the REAL
`MovePlanner.calculateMoves`. All 6 subtests PASS on the implemented tree; RED-on-revert
holds for both legs by construction.

## 8. Dead code / lint / style — CLEAN

`eslint` on all three touched files: no output (clean). New coordinator proxy is used by
`isStaleTerminalLedgerSelfMoveGhost`; the repository method pre-existed. `occupiedCount`
added to the guard-2 log payload (:646) is a real field. `rowToOperation` emits
`operationId`/`partitionId` camelCase (row-methods.js:15,17), matching the interlock's
field access, so the production live-op objects behave as the test fixtures do. No unused
vars, no dead code introduced.

---

## Residuals (all non-blocking, match accepted design scope)

- R1 (vet A5, accepted scope): a stale TERMINAL ghost of a DIFFERENT ledger partition
  still blocks (re-verify is same-partition-scoped). Over-conservative, not unsafe; matches
  the AMENDED DESIGN's explicit same-raft-group scope. Test 3 encodes this as intended.
- R2 (vet A5, out of run-28 scope): the "every other op defers" branch (:195-222) gets NO
  authoritative re-verify, so a node coordinating a DEPENDENT that sees a same-partition
  ghost would still defer via `liveLedgerSelfMove`. The ghost class remains half-fixed on
  the dependent side. Out of run-28 shape.
- R3 (Leg C, bounded): fleet-wide over-suppression if a placement row is stuck SYNCING
  indefinitely without failing (§5). Bounded by actuals liveness; self-corrects on row
  transition; the deliberate actuals-aligned replacement for the vet's C1/C3.

---

## OVERALL VERDICT: SHIP

Both legs implement the AMENDED DESIGN faithfully. Leg A's decisive cache-bypass break
(the reason the original design was refused) is genuinely fixed: the re-verify uses an
owner-RPC, cache-bypassing read path, keeps a genuine in-flight self-move blocking,
never drops a dependent, and defers/blocks on read failure. Leg C uses actuals-only
`occupiedCount` via `Math.max`, is strictly additive to existing suppression, is not
priority-gated (sidesteps vet C3), avoids the in-flight-cache trust the vet's C1 broke,
and does not starve a genuine deficit. Lint clean; the DT genuinely exercises the
cache-first-vs-authoritative divergence and is RED-on-revert for both legs.

Required fixes: NONE.
Recommended follow-ups (non-blocking): R2 (extend the authoritative re-verify to the
dependent-defer branch to fully close the ghost class) and an optional DT for R3 (a row
stuck SYNCING past a bound must not permanently suppress the deficit ADD) if a stuck-learner
starvation is ever observed in a gate run.
