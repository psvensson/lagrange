# Rolling Restart Startup Join Contacting Seed Bootstrap Readiness Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap readiness stall and stale selected-snapshot coverage",
  "boundary": "Startup join / contacting-seed bootstrap readiness",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The epoch-4 priority-recovery rebalancer-handoff seam is closed. The representative rerun now reaches epoch 3 PUBLISHED with steady_published recovery and no unresolved priority-recovery blocker classes, but startup still times out because joiners ebc4... and 8be8... remain in INIT/contacting_seed with BOOTSTRAP_PHASE_INCOMPLETE, SQL_ENGINE_UNAVAILABLE, LEADER_METADATA_INCOMPLETE, BOOTSTRAP_NOT_READY, and PRIORITY_CONTROL_PLANE_RECOVERY_PENDING. The selected stale-usable snapshot on 11601... reports only 2/5 observed nodes and selected missing published nodes 11601...|35a891...|8be8...|ebc4..., so the live owner must be separated between a real seed-contact/bootstrap stall and stale selected-snapshot coverage debt.",
  "nextAction": "Extract the 211047Z join/contacting-seed fixture, decide whether the blocking owner is seed bootstrap request timeout, infrastructure/connect-websocket stall, or stale selected-snapshot coverage consumption, then repair only that startup owner path.",
  "proof": [
    "Focused 211047Z join/contacting-seed fixture",
    "Owner regression for startup bootstrap stall versus stale selected snapshot",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/connect-websocket-phase.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/node-joining-service.test-part-4.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Priority Recovery Rebalancer Handoff Stall Reentry](./done-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md)
closed by migration. The representative rerun no longer terminates on
priority-recovery handoff or stale retained no-progress debt. Publication now
reaches epoch `3` `PUBLISHED` with steady-published recovery, but startup
still times out because two late joiners stay pinned before runtime
infrastructure becomes available.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z/rolling-restart/`.
3. Result: failed after `132.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Failure class: `startup_recovery_blocked`.
7. Dominant reason: `BOOTSTRAP_PHASE_INCOMPLETE`.
8. Publication debt is now subordinate context for this boundary: durable
   publication state is epoch `3` `PUBLISHED`, pending ACK count `0`, missing
   published count `0`, and recovery protocol state `steady_published`.
9. Current startup active-gate progress stalls at active `2/5`, snapshot
   coverage `2/5`, selected snapshot node `11601fe0-72d6-5853-8590-ec2881853e72`,
   and blocker signature `inactive_nodes=3|snapshot_coverage=2/5`.
10. The selected stale-usable snapshot reports observation reason codes
    `cache_stale_watermark`, `discovery_node_coverage_gap`, and
    `stale_replica_operations_in_flight`; selected observed nodes
    `11601...|7493...`; and selected missing published nodes
    `11601...|35a891...|8be8...|ebc4...`.
11. Joiners `ebc4...` and `8be8...` remain blocked in bootstrap phase `INIT`
    with reasons `BOOTSTRAP_PHASE_INCOMPLETE`, `SQL_ENGINE_UNAVAILABLE`,
    `LEADER_METADATA_INCOMPLETE`, `BOOTSTRAP_NOT_READY`, and
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, plus lane-probe
    `admin_not_ready` ECONNREFUSED on `:8081`.
12. Truncated node-log tails show the current run reaches
    `Joining existing cluster` and `contacting_seed`, then never records a
    later bootstrap phase before the representative timeout.
13. The selected priority-recovery view is no longer the owner seam:
    unresolved blocker-class count is `0`, `sql_transaction_participants-p1`
    and `sql_transactions-p1` are both `spread_satisfied_in_flight`, and
    `sql_write_operations-p1` is absent from the current blocked set.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `211047Z` startup fixture for the joiners that never move
   beyond `contacting_seed` / bootstrap `INIT`.
2. Decide whether the live owner is seed bootstrap request timeout,
   infrastructure/connect-websocket stall, or stale selected-snapshot
   coverage consumption in active-gate reporting.
3. Repair only the selected startup owner path.
4. Preserve the closed retained-terminal serial-wait carrier regression.

## Out Of Scope

1. Reopening the closed priority-recovery handoff package unless the same
   `priority_recovery_rebalancer_handoff_stalled` contradiction re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. The current startup blocker is owned by the join/bootstrap path for nodes
   that never advance past `contacting_seed` and never bring up local admin or
   SQL runtime.
2. Selected stale-usable snapshot coverage may preserve disagreement evidence,
   but it must not replace a newer direct startup stall when two joiners never
   progress into runtime infrastructure.
3. Priority recovery remains supporting evidence only while its unresolved
   blocker-class set stays empty.

Canonical contract shape:

1. Active-gate progress and failure classification must agree that the current
   representative owner is startup join/bootstrap debt rather than
   priority-recovery handoff.
2. If the seed-contact/bootstrap path is the true owner, the replayable proof
   must show which bounded phase does not complete: bootstrap HTTP contact,
   websocket infrastructure, or membership/query handoff.
3. If stale selected-snapshot coverage becomes the true owner instead, the
   proof must show that the joiners actually advanced beyond the blocked
   startup phase and only the consumer view remained stale.

## Residual Closure Inventory

- [ ] Extract the `211047Z` join/contacting-seed fixture.
- [ ] Decide the owner boundary: bootstrap request timeout,
      connect-websocket/infrastructure stall, or stale selected snapshot.
- [ ] Add the focused regression and repair the selected startup path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Progress Notes

May 6 migration from the priority-recovery handoff package:

1. The retained terminal serial-wait carrier regression now keeps removed
   follower snapshots subordinate to the source workflow instead of allowing a
   stale `rebalancer_handoff` fallback.
2. Focused owner proof, failure-bundle proof, and touched-file guardrails
   passed after the stage-3 repair.
3. Representative rerun
   `rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z`
   failed by migration: startup active-gate progress no longer exposes
   unresolved priority-recovery blocker classes, but the live representative
   seam moved earlier into join/bootstrap readiness.
4. The new contraction package must decide whether the joiners are blocked by
   seed bootstrap request timing, websocket/infrastructure setup, or stale
   selected-snapshot coverage consumption.

## Validation

1. Focused `211047Z` join/contacting-seed fixture passes.
2. Focused startup owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/contacting-seed bootstrap-readiness boundary with
   replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
