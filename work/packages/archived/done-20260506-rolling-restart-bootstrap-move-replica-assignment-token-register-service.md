# Rolling Restart Bootstrap Move Replica Assignment Token Register Service

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-assignment-token-register-service-20260506T131802Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-assignment-token-register-service-20260506T131802Z/rolling-restart/",
  "owner": "MoveReplicaAssignmentOwner and join-time register-service retry",
  "boundary": "Bootstrap MOVE_REPLICA assignment-token register-service handling",
  "dominantReason": "ASSIGNMENT_TOKEN_UNKNOWN",
  "currentState": "Transient assignment-token misses are absorbed by bounded join retry; the representative blocker migrated to priority recovery operation scheduling.",
  "nextAction": "Use successor priority recovery package for the current representative blocker.",
  "proof": [
    "Focused ASSIGNMENT_TOKEN_UNKNOWN join retry regression",
    "Touched-file guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/phases/contact-seed-phase.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-authority-topology-settling-cohort.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Authority Topology Settling Cohort](./done-20260506-rolling-restart-startup-authority-topology-settling-cohort.md)
closed by migration. The fresh representative rerun moved the live blocker out
of topology settling and into bootstrap join-time `MOVE_REPLICA`
assignment-token handling: one joiner fails `register-service` with
`ASSIGNMENT_TOKEN_UNKNOWN` while later logs show the same `mg-1-r2` replica
starting on another node and then being re-reserved for a third node.

Closure update on May 6, 2026: the focused join retry regression was corrected
to use the real token-bearing `MOVE_REPLICA` payload, and the representative
rerun
`test-output/reports/rolling-restart-after-bootstrap-assignment-token-register-service-20260506T131802Z.report.json`
no longer selected this bootstrap seam as the terminal blocker. `35a...`
reached `ACTIVE`, `mg-1-r2` became leader on `ebc4...`, and the representative
failure migrated to priority recovery operation scheduling, now tracked in
[Rolling Restart Priority Recovery Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-priority-recovery-serial-wait-workflow-progress-reentry.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-startup-authority-topology-settling-cohort-20260506T124254Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-startup-authority-topology-settling-cohort-20260506T124254Z/rolling-restart/`.
3. Terminal barrier:
   `Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts`.
4. Root cause class: `startup`.
5. Dominant reason: `pending_ack_nodes`.
6. Failure class: `publication_convergence_blocked`.
7. Publication state is now epoch `4`, `ACK_PENDING`, pending ACK count `2`,
   pending ACK nodes `35a...` / `8be8...`, blocked partitions
   `sql_transactions-p1` / `sql_write_operations-p1`, and selected snapshot
   coverage `2/5`.
8. Runtime log evidence on `35a...` shows join failure on the first
   `register-service` attempt for `mg-1-r2` with
   `HTTP 409 ... "code":"ASSIGNMENT_TOKEN_UNKNOWN"`.
9. Supporting runtime evidence on `8be8...` later starts `mg-1-r2` through
   `joining_hydration_handoff`, while `7493...` later reserves `mg-1-r2`
   again for `ebc4...`.
10. The live contradiction is therefore no longer startup-authority topology
    settling. It is bootstrap ownership and retry semantics around one
    `MOVE_REPLICA` assignment identity seen across `35a...`, `8be8...`, and
    `ebc4...`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Reduce the join-time `ASSIGNMENT_TOKEN_UNKNOWN` boundary to one explicit
   owner contract.
2. Decide whether the current artifact is a transient register-service retry
   miss or an upstream durable-rejoin assignment-owner contradiction.
3. Add focused regression coverage before the next representative rerun.
4. Record blocker migration immediately if the rerun moves beyond bootstrap
   assignment-token handling.

## Out Of Scope

1. Broad matrix continuation before the five-node representative path passes
   or migrates to a new named owner boundary.
2. Unrelated publication or topology-settling rework already closed by the
   predecessor package.
3. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `MoveReplicaAssignmentOwner` reserves and validates join-time
   `assignment_id` ownership.
2. `CreateMessageGroupPhase.registerMessageGroupService(...)` applies the
   bounded retry contract for join-time `/register-service`.

Canonical contract shape:

1. A transient `ASSIGNMENT_TOKEN_UNKNOWN` during join-time `register-service`
   must be handled coherently with the bounded join retry policy.
2. The representative rerun must determine whether retry resolves the current
   contradiction or exposes a deeper assignment-owner bug on the next pass.
3. Replay and package bookkeeping must keep this bootstrap boundary distinct
   from the closed topology-settling predecessor.

## Residual Closure Inventory

- [x] Add the focused `ASSIGNMENT_TOKEN_UNKNOWN` join retry regression.
- [x] Extend the join retry classifier so the representative artifact can
      distinguish transient token misses from terminal bootstrap conflicts.
- [x] Run focused tests, touched-file guardrails, and one representative
      `rolling-restart --fast-local` rerun.
- [x] Record whether the rerun closes this boundary or sharpens the upstream
      assignment-owner contradiction.

## Validation

1. Focused bootstrap join retry tests pass.
2. Touched-file guardrails are rerun and recorded.
3. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.
4. Residual risk remains only if this boundary re-enters: owner-side
   assignment lookup can still fail closed on `ASSIGNMENT_TOKEN_UNKNOWN`
   before reservation visibility catches up.

## Done When

1. The representative path either absorbs transient
   `ASSIGNMENT_TOKEN_UNKNOWN` misses and moves forward, or it sharpens to a
   new named upstream assignment-owner boundary with replayable evidence.
2. Sprint bookkeeping points to the correct current package without stale
   topology-settling references.
