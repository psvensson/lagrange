# Owner decision D2 (2026-09-25, binding): no timer-driven failure after durable source-removal intent

**Choice (option 1).** Once a REPLACE has durably entered the source-removal phase, no elapsed-time budget may mark it FAILED because the removal has not completed yet. The 60 s removal-step budget and the 300 s overall budget stop being failure authorities past that boundary. They remain diagnostics: alerts, operator visibility, escalation.

## The boundary
The boundary is durable removal intent: durable workflow state proves the REPLACE has entered the destructive phase and now owns completing the removal. "A REMOVE_PEER send was attempted" is not enough.

- **Before the boundary**, the existing timeout and failure policy may apply where it is safe.
- **After the boundary:**
  - no timeout makes the REPLACE FAILED;
  - no timeout authorizes the planner to clean up the target;
  - no timeout undoes or reinterprets the removal intent;
  - the REPLACE stays non-terminal and observable until authoritative state resolves it.

## Converging after the boundary
The owner converges on current reality, always from fresh authoritative state:

| Current state | Owner action |
|---|---|
| Source absent from effective committed voters | Proceed toward completion |
| Source still a voter, removal safe | Re-drive the removal, using the bounded attempt semantics |
| Removal temporarily unsafe | Wait visibly, and retry when relevant state changes |

Membership, readiness and leadership events only wake the owner; they decide nothing. No timer invents an outcome.

## Target death is a real premise change; elapsed time is not
- **Source still a voter:** if the target is authoritatively dead and the source removal has not committed, fail safely and retain the source. Never continue destructively.
- **Source already absent:** do not pretend the source can be restored by marking the REPLACE FAILED. Classify the topology from current authoritative state. The loss of the new replica is then a later availability or convergence problem, not a rollback. Never manufacture rollback semantics that Raft membership no longer permits.

## The planner stays out while the REPLACE is non-terminal
- The planner does not remove the target as surplus.
- The planner does not create a competing cleanup for the source.
- All progress stays under the REPLACE owner.
- Ordinary convergence takes over only once a genuinely terminal FAILED state is durably visible, under the separately defined FAILED ownership contract.

## Budgets become observability
- Removal pending more than 60 s, or a REPLACE older than 300 s, raises diagnostic severity and escalation. Neither changes operation state.
- The diagnostics expose:
  - the phase;
  - source and target;
  - how long the current phase has been waiting;
  - the current wait reason;
  - the last removal attempt;
  - whether that attempt's outcome is uncertain;
  - the current leader;
  - the current authoritative source membership.
- This state is bounded: no event is appended per retry.

## Re-driving is bounded even though waiting is not
- At most one logical membership-removal attempt is active or uncertain at a time.
- A wake-up triggers re-evaluation, never an automatic resubmission.
- Retry only when state shows another attempt is needed.
- A removal that succeeded but was not observed is discovered by rereading membership.
- A lost removal is eventually re-driven by an event, reconciliation or the backstop.

## Recovery preserves the phase
Test restart at each of these points:
1. intent recorded, first proposal not yet sent;
2. proposal sent, outcome unknown;
3. removal committed, event not yet observed;
4. timeout thresholds already exceeded;
5. target still alive after a long wait.

Each restart resumes the same owner and converges from authoritative membership, and never re-enables the timer-driven FAILED path.

## Witnesses
- **P4:** in any post-intent state with a healthy target, advancing time by 60 s, 300 s or more never produces FAILED on its own. A planted old timeout transition must fail this evidence.
- **P5:** given the same authoritative membership evolution, an immediate removal and a removal after every historical budget has passed converge to the same final result. Only diagnostics differ.
- **P6:** target death is handled from current membership. The three cases must be distinguished: target alive with slow membership; target dead with the source still a voter; target dead with the source already removed.

## Remove the conflicting failure paths as a class
Enumerate EVERY terminal transition reachable after durable intent. Classify each as a valid semantic failure based on authoritative state, or an obsolete timeout or heuristic failure to be removed. The final verifier checks that no route to FAILED based only on elapsed time remains after the boundary.

This is required for the invariant, not optional, and is finished together with D1 and the rest of the approved REPLACE owner work, before the single final acceptance gate.
