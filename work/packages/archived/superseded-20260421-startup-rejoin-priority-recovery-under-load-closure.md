# Startup-Rejoin Priority-Recovery Under Load Closure

## Status

Superseded on 2026-04-21.

This package was correct while `rolling-restart` and `node-join-under-load`
still shared one startup/rejoin boundary.

It is superseded by:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
2. [Rolling-restart load-pressure follow-up](../todo-20260421-rolling-restart-load-pressure-follow-up.md)

This package supersedes:

1. [Node-join real convergence timeout follow-up](./superseded-20260421-node-join-real-convergence-timeout-follow-up.md)
2. [Rolling-restart recovery-ready timeout follow-up](./superseded-20260421-rolling-restart-recovery-ready-timeout-follow-up.md)

Original shared signal:

1. Under load, join and durable-rejoin nodes reach bootstrap intent but remain
   blocked behind `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` or
   `priority_spread_pending`.
2. Priority control-plane `REPLACE` work stays in flight while startup/runtime
   handoff does not converge.
3. Transport and owner-RPC/query pressure amplify the stall:
   - one priority control-plane replica delivery source saturates the outbound
     queue
   - owner-RPC/control snapshot reads time out or defer
   - the joining or restarted node never reaches recovery-ready/admin-ready in
     time

## Why

At the time, the failures looked like one unresolved middle-layer boundary
spanning:

1. startup/rejoin checkpoint progression and runtime handoff
2. priority-recovery completion and remove-safety semantics
3. transport policy for priority control-plane catch-up traffic under load

Continuing to treat `node-join-under-load` and `rolling-restart` as separate
bug packages would push the sprint back into tactical patching of one symptom at
a time.

## Original Scope

1. Make startup/rejoin under load consume one explicit recovery boundary for
   join and durable rejoin.
2. Keep priority-recovery completion, topology-settling, and remove-safety
   semantics on canonical owners rather than scenario-local interpretation.
3. Ensure priority control-plane catch-up traffic uses explicit transport
   policy instead of accidental starvation by generic queue/source fairness.
4. Add focused proof on the touched owners before scenario reruns.

## Relationship To Successor Sprint

This package overlaps and must precede:

1. [Startup checkpoint contract and orchestrator cutover](../todo-20260420-startup-checkpoint-contract-and-orchestrator-cutover.md)
2. [Join readiness snapshot, repair, and waiter owner split](../todo-20260420-join-readiness-snapshot-repair-and-waiter-owner-split.md)
3. [Rebalancer operation admission snapshot and lane unification](../todo-20260420-rebalancer-operation-admission-snapshot-and-lane-unification.md)
4. [Rebalancer plan, admission, and execution seam closure](../todo-20260420-rebalancer-plan-admission-and-execution-seam-closure.md)

## Validation

1. Focused startup/rejoin handoff and priority-recovery tests on touched
   owners
2. Focused transport/message-router tests if queue/source policy changes
3. `node-join-under-load`
4. `rolling-restart`
5. `npm run test:metrics`

## Done When

1. Startup/rejoin under load uses one coherent recovery boundary on the touched
   path.
2. No touched code depends on split local fallback meaning between startup
   handoff, priority-recovery completion, and transport pressure handling.
3. `node-join-under-load` and `rolling-restart` no longer fail on this shared
   boundary.
