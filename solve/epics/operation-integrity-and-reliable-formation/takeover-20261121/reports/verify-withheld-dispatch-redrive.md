# Verification: re-drive of a gate-withheld dispatch (dadbc11f0 red, cd177cba8 implementation)

Verifier: independent subagent, read-only (git show / diff / grep and lab files; nothing executed).
Subject: `work/integration-candidate-20261121` (head 487d12c91), commits dadbc11f0 and cd177cba8.
All `file:line` references are to the text at cd177cba8. The five subject files and the mirror test are
byte-identical at the head (`git diff --stat cd177cba8 487d12c91` over them is empty).

## Verdict

**APPROVE-WITH-CONDITIONS** for keeping cd177cba8 on the integration candidate.

The change is safe to keep: it adds no dispatch path of its own (the re-drive is the existing `dispatchOperation`
entry, which re-reads the operation and asks the gate again), and every lost-wake schedule below leaves the
operation exactly where it was before the change (withheld until another caller or the operation timeout).
It is not yet a reliable cure: the single edge-triggered wake is lost whenever the operation lane is held when the
verdict arrives (finding 1), and that includes the central schedule the change was written for. The three-node
acceptance run must not count on the re-drive until condition C1 holds.

## Findings

### 1. LOST WAKE, held lane: the re-drive is a plain lane submission (defect, VERIFIED by reading)

- `operation-workflow-withheld-dispatch.js:47-48` deletes the wait, then `:52` calls
  `owner.dispatchOperation(operationId)` with no options.
- `operation-workflow-dispatch-execution.js:236-259` routes it to `runOperationOwnerAction`, which without
  `ownerTurnPolicy: RETAIN` ends in `operationWorkflowRunExclusive(key, invokeAction)`
  (`operation-workflow-owner-execution-lane.js`, the last branch of `runOperationOwnerAction`).
- `src/workflow/durable-workflow-coordinator.js:492-493`: `runExclusive` returns the in-flight promise when the
  owner key is held and never runs the new factory.
- The codebase names this defect class twice: `operation-workflow-dispatch-rearm-evidence.js:620-626` ("A plain
  lane submission JOINS an in-flight holder and discards the new factory ... which lost 5 of 11 lab timer fires
  (BR2a)") and `operation-workflow-recovery-timeout.js:207-210` ("a held lane is waited out, never joined and lost").

Minimal schedule (the withheld turn itself is the holder):
1. Dispatch turn D1 holds lane L(op). Gate asks the retained owner; the authority read fails; record R arms its
   continuation (min delay 100 ms, `replica-operation-repository.js:231,485`), `callerAnswer = WITHHELD`.
2. Gate registers wait W (`operation-workflow-dispatch-reservation-gate.js:141`) and returns the skip.
3. D1, still holding L, runs `readSupersededDispatchReplay` (`operation-workflow-dispatch-execution.js:540-543`;
   `operation-workflow-placement-learner-retirement.js:63-68`): an OWNER_RPC_REQUIRED, leader-required read of the
   same ledger authority that just failed. It runs for every placement-admission operation.
4. R's continuation fires, its read succeeds, EXACT, `retireRetainedRepair` emits CONFIRMED.
5. `redriveWithheldDispatch`: W deleted; `dispatchOperation` joins D1 and inherits D1's skip.
6. D1 returns. R is retired, W is gone, nothing dispatched, nothing owed anywhere.

Any other holder of L at step 4 (a reconcile, a recovery turn, an enclosing creation/handoff turn that ran the
dispatch inline) gives the same loss. Mirror case 8 cannot see it: it awaits D1 to completion before advancing the
virtual clock, and its own "settle" step (`operationWorkflowRunExclusive(key, async () => {})`) relies on the
same coalescing to await the re-drive.

### 2. LOST WAKE, registration order: the wait is registered after the answer (structural, reachability INFERRED low)

`callerAnswer` is set at `replica-operation-repository-retained-placement-repair.js:90-91`; the gate registers W
only after the answer has crossed four async returns (`:68-69`, `operation-workflow-gate-operation-row-repair.js:17`,
gate `:138-141`). Nothing binds the two. If a hint was queued on R during the caller's decision, the drain
(`replica-operation-retained-repair-wake.js:112-124`) starts the next decision in the same microtask burst. If
that decision retires R before W exists: either no emission (`awaitingCallers` still 1 or `callerAnswer` not yet
set) or an emission answered NOT_WITHHELD; W is then registered and never served, although the row was CONFIRMED.
Needs a retained read that completes within about ten microtask hops. Production reads are RPC or leader reads
(I did not trace them to a macrotask boundary); the mirror fixture's reads are microtask-only, so a fixture can
reach it.

### 3. The stated residual (VERIFIED; functionally benign, a bounded leak)

Decisions that refuse the awaiting caller and retire in the same step: CHANGED (`:517-519`), a definite native
refusal (`:412-418`), a permanent committed refusal (`:461-463`). `awaitingCallers === 1` at `:279`, so no
emission; the gate registers W. Not in this set: an invalid row or shape (no timer, record stays,
`:290-297`), route unavailable, read failed. There is no retirement by replacement (records are only created when
absent, `:77-80`, ingress `:67-72`) and no deletion outside `retireRetainedRepair` except the shutdown clear
(`:557-565`, called only from `rebalance-coordinator.js:167`).
The missing verdict would have been UNCONFIRMED, whose whole effect is "delete W, log a warning" (finding 6), so
the operation's fate is unchanged: withheld until another dispatch caller arrives or the periodic timeout sweep
fails it (INFERRED: I did not read the sweep's handling of a withheld PENDING row). `wait.deadlineMs` is enforced
by nobody; it only makes a late verdict NOT_CURRENT. W is removed at proven terminal state
(`operation-workflow-transition-persistence.js:333`), shutdown, or the next verdict. An operation that ends on
another node leaves its W until shutdown: three numbers per entry, no size bound.

### 4. Stale wait: W is not cleared when the gate later passes (defect, low severity, VERIFIED)

Gate `:139` returns without deleting W. Schedule: gate withholds (W); a later dispatch turn is confirmed directly
and dispatches; later the second consumer of the retained owner
(`replica-operation-repository-mutation-update-methods.js:578`, the divergence re-insert) is refused on a new
record, which then retires EXACT and emits CONFIRMED with the same operationId and createdAt; W matches;
`dispatchOperation` re-enters an operation that is not withheld. Consequence: one spurious ordinary dispatch wake
(at SENDING it re-sends CREATE, as every dispatch wake does, `replica-operation-step-policy.js:99-104`). "Only a
dispatch the gate withheld is re-driven" does not hold.

### 5. Emission condition and the second consumer (INFERRED, low)

`awaitingCallers === 0` assumes every awaiting caller is the consumer that withheld. If the divergence re-insert
caller is the one awaiting when R retires EXACT, it hears `true` and the gate's W gets no verdict. Requires its
operation snapshot to be deep-equal to the record's (`:81`), which is unlikely. Related: a caller refused at `:81`
(snapshot differs) or by a throw (caught at `operation-workflow-gate-operation-row-repair.js:18-27`) is withheld
without `callerAnswer` being touched; against an INGRESS-origin record that means no verdict ever.
`RETAINED_REPAIR_RETIREMENT.TENURE_ENDED` can never be emitted (an ingress record never has
`callerAnswer === WITHHELD`): dead reason code.
Delegation: the sender's own CALLER record retires on the sender (own-row observation, SUBJECT read, EXACT), so
the verdict reaches the coordinator that withheld. INFERRED from reading; no witness.

### 6. UNCONFIRMED (VERIFIED)

Reasons a retirement can carry: a definite native refusal's `failureCode`, a permanent committed refusal's
`result.reason`, `row_changed`, `tenure_ended` (unreachable). No transient reason retires a record. The consumer
builds the `OPERATION_NOT_DISPATCHABLE` outcome and returns it to the port caller, which discards it (`:280`): the
operation is neither failed nor retried; the effect is a warning and the end of the wait. Open point for the
lead: `row_changed` means the record's snapshot is stale, not that the row is undispatchable; ending the wait
without re-entering the gate leaves a possibly dispatchable operation withheld (re-entry would be safe, the entry
re-reads the row).

### 7. Fence and deadline (VERIFIED)

Compared on arrival (`operation-workflow-withheld-dispatch.js:27-39`): operationId (map key), `createdAt`
equality, initialized and not shutting down, ownership fence epoch equality, `deadlineMs > now`.
- A verdict for an older incarnation of the id (other createdAt) answers NOT_WITHHELD and keeps W. Correct.
- The ownership fence epoch advances only at shutdown (`operation-workflow-owner-retry-registry.js:168-185`), so
  it does not fence a move of ownership to another coordinator; that is fenced inside the dispatch entry by
  `isOperationLocallyOwned` (`operation-workflow-dispatch-execution.js:532-537`). The epoch comparison is redundant
  with the shutdown flag and the shutdown clear.
- NOT_CURRENT (including a spent deadline) is silent: no log, no `wait_bound_spent`, unlike the sibling waits.

### 8. Double dispatch (VERIFIED by reading; not witnessed)

The re-drive has no fence of its own against "already dispatched by another path" (W survives, finding 4). What
prevents a second CREATE is the dispatch entry: lane single-flight, fresh read, local ownership, the gate again,
the PENDING to SENDING claim, the step check. "Exactly once" in case 8 is a property of the fixture (one verdict,
no competing path), not of a fence in the new code.

### 9. Deviation from the ruling (author's reason VERIFIED)

Every arm of the 953d705f8 entry sets a timer (`operation-workflow-observed-progress-retention.js:127-131,144-148`)
and its runner reconciles observed progress or a handoff, never the dispatch entry (`:365-371`). Using it would
mean polling or the wrong reconcile. The new map is a wait for a named event, a different concern from the
timer registries; closest prior art is `operationLedgerSelfMoveParkEvidenceByOperationId` (gate park evidence,
cleared on claim). The two do not double-drive: both go through the same lane. Layering note: the map is created
in `OperationWorkflowOwner` (`operation-workflow-owner.js:73`) but dereferenced unguarded in a base class
(`operation-workflow-transition-persistence.js:333`) and in the gate (`withheld-dispatch.js:20`).

### 10. Required port (VERIFIED)

One construction site in `src/` (`rebalance-coordinator-lifecycle.js:353`); the port is the fourth entry of
`RETAINED_REPAIR_PORTS`, validated by `createRetainedPlacementRepairPorts` (`:53-64`); no optional subscriber, no
probe in `src/`. The closure dereferences `this.workflowOwner` lazily and an injected `options.workflowOwner` or
`options.repository` bypasses validation (test seams only). A verdict into a shutting-down owner is answered
NOT_CURRENT and dropped without a log; the retained owner and the workflow owner shut down together.

## Evidence (lab files)

- Red, `lab/merger-2/C1-dadbc11f0-tv` (selection sha dadbc11f0126d..., tv-dator, exit status 1), mirror file:
  `not ok 8` (`0 !== 1`, "the withheld CREATE dispatch is re-driven exactly once"), `not ok 9`
  (`owner.repository.reportRetainedRepairVerdict is not a function`), `not ok 10` (`0 !== 1`, "the record that
  refused its caller settles once, visibly"); 1-7, 11, 12 ok. Both negatives are red because the seam does not
  exist, not on a dispatch count.
- Green, `lab/merger-2/C2-final132-tv` (selection sha cd177cba81b6..., tv-dator): mirror `ok`, 12 assertions,
  no failure line. The log has no per-case lines for passing files, so "1 / 0 / 0" is the file-level pass plus
  the assertions in the source (`deliveries.length` 1, 0, 0), not a per-case line.
- Same run: `replica-dispatch-reservation-identity` ok (27), `reservation-fail-closed-dispatch-gate` ok (78),
  `reservation-file-backed-restart` ok (39). This is at cd177cba8. There is NO run of these three at the
  candidate head 487d12c91; `E-8d897772b-tv-dator` (57 files) contains only the mirror (ok, 12). The head adds
  CDC, topology, cache and config changes only.
- The run as a whole exits 1 with 18 red files; the author attributes all to 78c40b57b. I spot-checked one:
  `placement-retained-continuation` case 23 ("a definite native refusal ... retires the record") is red with the
  same line at A-7a9f52e64, so it predates the change. It is the witness of one of the three retirements in
  finding 3 and it is red.

## Mechanisms with no witness (surviving mutants)

- `createdAt` comparison removed: survives (no test presents another incarnation).
- Ownership fence epoch comparison removed: survives (and is redundant in production).
- Deadline comparison removed: survives.
- Clear on shutdown removed: survives (case 10(ii) is also stopped by the shutdown flag, twice).
- `callerAnswer === WITHHELD` removed from the emission condition: survives.
- `awaitingCallers === 0` removed: survives.
- Throw on a missing port: no test anywhere references `RETAINED_REPAIR_PORT_REFUSAL`. (Dropping the port from
  the list is caught by case 8.)
- Witnessed: clear on terminal (case 10(i) would dispatch), "no wait, no re-drive" (case 9), the wiring (case 8).
- Not witnessed at all: a verdict while the lane is held (finding 1), UNCONFIRMED, a competing dispatch path.

## Conditions before the three-node acceptance run

- C1. The re-drive takes its own lane turn (the owner's retained turn, as the BR2a fix and the timeout sweep do),
  with a witness that delivers the verdict while the withheld dispatch turn still holds the lane.
- C2. The wait cannot miss or outlive its verdict: register it before asking (or do not register when no record
  remains after the answer), and clear it when the gate passes. This also removes the residual's leak.
- C3. Lead ruling on `row_changed`: end the wait, or re-enter the gate.
- C4. Witnesses for the `createdAt` fence and for UNCONFIRMED; the epoch comparison either witnessed or deleted.
- C5. The mirror and the three dispatch-gate files run on the lab at the actual candidate head.
- If the run proceeds before C1: a withheld CREATE that is never dispatched after a ledger read failure is the
  expected signature of finding 1, not a new defect.
