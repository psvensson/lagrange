# Rung 0 verification — the two open forensic items (c-research-first)

Base forensics: `../formation-ledger-post-spread-voter-visibility-latency/research-planner-spread-completion-defect.md`.
This doc VERIFIES its two open items with fresh code reading + deterministic probes
(the run-28 SQLite is gone; only gzipped node logs survive — a companion subagent
mines them for the live-row identity in `research-lingering-row-pin.md`).

REUSED / EXTENDED / NEW accounting is at the bottom.

## Probe substrate (deterministic, in-process)

- `probe-selfmove` (scratchpad): real `RebalanceCoordinator` (timeout-test-coordinator
  fixture), 4-voter/2-on-seed over-target(3) ledger placement, ONE injected lingering
  non-terminal `replica_operations` row, then `createOperation(<ledger self-move REPLACE>)`.
- `probe-planner` (scratchpad): real `UnifiedRebalancer.calculateMoves` on
  `replica_operations-p1` (priority control-plane partition), 2 ACTIVE seed voters + 1
  learner replacement + op-1 REPLACE in drain phase.

## Item (i) — which lingering row keeps the ledger non-idle (self-move blocked)

Empirical gate-signature map (probe-selfmove, one lingering row per run):

| Injected lingering non-terminal row (source_node = seed) | Rejection that fires |
| --- | --- |
| same-partition ledger **REPLACE** (op-1 drain tail, ACTIVE) | `conflicting_operation_in_flight` (the per-partition reconfiguration conflict gate — fires BEFORE the interlock) |
| ledger **ADD** (op-2, SYNCING) | **`operation_ledger_self_move_waiting_for_idle_ledger`** ✅ run-28 signature |
| dependent **REPLACE** (control_plane_publications-p1, SYNCING) | **`operation_ledger_self_move_waiting_for_idle_ledger`** ✅ |
| dependent **ADD** (movies-p1, CREATING) | **`operation_ledger_self_move_waiting_for_idle_ledger`** ✅ |

VERIFIED FACTS:
1. The `waiting_for_idle_ledger` interlock (`rebalance-coordinator-ledger-interlock-admission.js`
   `ensureOperationLedgerSelfMoveSerialized` :129-220) is NODE-scoped: ANY live incomplete
   op (any partition, non-terminal, not stale-past-step-timeout) blocks a disruptive ledger
   self-move.
2. A same-partition lingering REPLACE does NOT reach the interlock — it trips the earlier
   per-partition conflict gate (`conflicting_operation_in_flight`). So the run-28
   `waiting_for_idle_ledger` blocker is NOT a same-partition in-flight REPLACE. It is either
   **op-2 (the spurious ledger ADD)** or a **genuine dependent op on another partition**.
3. `queryIncompleteOperations` treats a REPLACE as incomplete through its ACTIVE step until
   source-drain terminalizes (`replica-operation-repository-incomplete-read-methods.js:260`);
   a priority-partition REPLACE/STOPPING-REMOVE is an owner-read INCLUDE candidate (:188-204).

KEY COUPLING: op-2 (the spurious ADD, leg ii) is itself a valid `waiting_for_idle_ledger`
producer. So the leg-(ii) over-target ADD and the leg-(i) admission deadlock share ONE root:
**withhold op-2 and both the over-target state AND (if op-2 was the blocker) the deadlock
disappear.** This matches the base forensics' own note ("if op-2 is withheld the ledger never
goes over target and options (a)/(b) are unnecessary"). Whether a *genuine dependent* also
lingers independently in run-28 is pinned by the companion log-mining subagent.

## Item (ii) — the over-target accounting read (deficit blind spot)

CONFIRMED empirically (probe-planner): with 2 ACTIVE seed voters + the op-1 REPLACE
replacement as a SYNCING **learner** (not ACTIVE-committed) + op-1 REPLACE **in drain phase**,
`calculateMoves` emits `{type:add, reason:increase_replica_count}` — the spurious
count-increasing ADD (= run-28 op-2). Over-target root reproduced deterministically.

MECHANISM (sharper than the base forensics):
- `computeInFlightAwareReplicaAccounting` (`in-flight-aware-replica-count.js:95`) is fed
  `getEntityTopologyBlockingInFlightOperations()` (move-planner-move-calculation-methods.js:314)
  — the **drain-EXCLUSIVE** set (`unified-rebalancer-replica-state.js:613-624`:
  REPLACE-in-remove-dispatch-phase is excluded).
- So once op-1's REPLACE reaches ACTIVE/STOPPING (source-removal phase), it is **excluded**
  from the accounting → `inFlightReplaceInCreationCount = 0`. Its replacement is still a
  learner → NOT in `activeCount`. The replacement therefore falls into a **blind spot**,
  counted by NEITHER `activeCount` NOR `inFlightReplaceInCreationCount`.
- `deficitEffectiveCount = activeCount + inFlightAddCount = 2 + 0 = 2 < target 3` → the
  count-increasing-ADD deferral guards (:560-563, :625-628) do NOT suppress → spurious ADD.
- `creationEffectiveCount` ALSO reads 2 here (drain-phase REPLACE excluded), so the naive
  "use creationEffectiveCount" fix does NOT close it.

DISTINGUISHING "learner that WILL promote" from "no replica" (the c-research-first ask):
- The serialization cap already computes the DRAIN-INCLUSIVE in-flight REPLACE count
  (`getEntityInFlightOperations().filter(REPLACE)`, :524-534) precisely because the
  drain phase is invisible to the topology-blocking view — proven here: `replaceCount`
  became 0 (min(1, 1-1)) so op-1's drain-phase REPLACE WAS counted there (=1).
- FIX DIRECTION (leg c): the deficit-suppression guards must count drain-inclusive
  in-flight REPLACEs: suppress the count-increasing ADD when
  `deficitEffectiveCount + <drain-inclusive in-flight REPLACE count> >= targetReplicaCount`
  (here 2 + 1 = 3 >= 3 → suppress). Each in-flight REPLACE guarantees a replacement that
  keeps the count; a REPLACE whose source already left `activeCount` (drain phase) is
  exactly the +1 the blind spot dropped.
- SAFE against genuine-deficit starvation: the estimate can only OVER-count (a creation-
  phase REPLACE whose source is still ACTIVE is counted in both activeCount and the REPLACE
  count) → errs toward SUPPRESSING a redundant ADD, never toward starving. If a replacement
  genuinely fails, its REPLACE op leaves the in-flight set (session-3 voter-ready timeout →
  failOperation), the count drops, and the deficit re-opens next tick → self-correcting.

## REUSED / EXTENDED / NEW

- REUSED: the drain-inclusive in-flight REPLACE count already computed by the serialization
  cap (`getEntityInFlightOperations().filter(REPLACE)`, :524-534); the accounting breakdown;
  the interlock's node-scoped `queryIncompleteOperations` observation.
- EXTENDED (fix c): the two count-increasing-ADD deferral guards to add the drain-inclusive
  in-flight REPLACE count to the deficit comparison.
- NEW: none anticipated for leg (c). Leg (a)/(b) (interlock narrowing / over-target drain
  REMOVE) is held pending the log-mining verdict on whether a genuine dependent lingers
  independently of op-2 — if op-2 is the sole blocker, leg (c) alone closes the wedge and no
  interlock change (run-20 regression surface) is taken.
