# Message-Group Leader Identity And Strict CDC Forwarding Convergence

## Why

The shared control-plane snapshot owner cut moved the seven-node transaction
recovery checkpoint materially later, but the rerun is still red. The remaining
live boundary is no longer snapshot/read-side repair. It is message-group
forwarding convergence:

1. strict CDC forwarding can repair a message-group target address
2. the addressed replica can still reject the same payload as
   `leader unknown`
3. that leaves `nodes` and `partitions` CDC updates buffered
4. publication and `replica_operations` visibility then fall into
   `query_admission_deferred` and timeout pressure

This package closes that narrower loop instead of reopening the snapshot-owner
boundary.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Collapse message-group strict CDC forwarding onto one canonical local-versus-
   remote ingress decision for relayed convergence traffic.
2. Ensure addressed relayed strict CDC does not reopen leader-selection loops
   after bounded topology repair.
3. Keep message-group leader identity consistent across live raft hints,
   canonical owner rows, and forward-target selection.
4. Add focused regressions for the relayed addressed-target convergence case.

## Out Of Scope

1. Broad transport redesign.
2. Control-plane snapshot-owner logic.
3. General query routing or partition leader identity outside the message-group
   forwarding boundary.

## Invariants

1. A relayed strict CDC payload that has already reached an addressed replica
   must not loop indefinitely through stale competing targets.
2. Message-group forwarding must emit one canonical ingress decision with
   explicit state and reasons.
3. Bounded topology repair may refresh selection, but it must not leave the
   caller oscillating between repaired target selection and `leader unknown`
   rejection.
4. Fixes must preserve fail-closed behavior for non-relayed and non-convergence
   cases.

## Hotspots

1. `src/message-group/message-group-forwarding-owner.js`
2. `src/message-group/message-group-service.js`
3. `test/message-group/message-group-service.test.js`

## Validation

1. `node test/message-group/message-group-service.test.js`
2. `node test/message-group/cdc-non-leader-propagation.test.js`
3. `npm run test:distributed:boundary:transition`
4. one bounded seven-node transaction-recovery checkpoint rerun after focused
   surfaces are green

## Done When

1. The relayed addressed-target strict CDC case is covered by a focused
   regression and passes.
2. Message-group forwarding no longer repairs a target and then rejects the
   same relayed payload as `leader unknown`.
3. The remaining live failure, if any, is narrower than this forwarding
   boundary.

## Progress Notes

1. Message-group forward topology repair now runs through the shared
   control-plane workload taxonomy instead of a local interactive work-class
   default.
2. Forwarding decisions now preserve explicit leader-identity source/state for
   pending publication, persisted publication, cache-confirmed ownership, and
   live-local hints.
3. Focused coverage now proves join-convergence targeting and authoritative
   forward-topology repair both reuse those explicit leader-identity and
   workload contracts.
