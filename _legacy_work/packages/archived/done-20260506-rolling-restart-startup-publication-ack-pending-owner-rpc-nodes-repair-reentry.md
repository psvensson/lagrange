# Rolling Restart Startup Publication ACK-Pending Owner-RPC Nodes Repair Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z/rolling-restart/",
  "owner": "Owner-RPC authoritative discovery repair with SQL fallback",
  "boundary": "Startup publication ACK-pending owner-RPC nodes repair",
  "dominantReason": "pending_ack_nodes",
  "currentState": "Authoritative nodes reads now fall through to sql_query_engine; publication reaches epoch 5 PUBLISHED and pending ACK 0, then the blocker migrates to seed transport saturation.",
  "nextAction": "Use successor seed transport delivery-source saturation package for the current representative blocker.",
  "proof": [
    "Focused authoritative owner-RPC SQL fallback regression",
    "Discovery-repair attribution proof",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/cdc/cdc-integration-service-segment-1.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-priority-recovery-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Priority Recovery Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-priority-recovery-serial-wait-workflow-progress-reentry.md)
closed by migration. The representative rerun no longer terminates on
priority-recovery workflow progress. It now stalls on startup publication
convergence: epoch `4` remains `ACK_PENDING`, selected snapshot coverage falls
to `1/5`, and owner-RPC control-snapshot repair for table `nodes` remains
`repair_deferred` / `pressure_or_timeout` against seed
`7493b0ab-a054-5fad-a91b-5e331db29304`. The visible failure class is startup
publication convergence, but the blocking runtime seam is routed seed
reachability on the authoritative `nodes` repair path.

Closure update on May 6, 2026: the focused authoritative fallback repair now
keeps control-snapshot `nodes` reads off the stale `owner_rpc_lane` hard
failure and routes the representative rerun through the canonical SQL fallback
path. The representative rerun
`test-output/reports/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z.report.json`
no longer terminates on epoch `4` `ACK_PENDING` publication debt, and selected
snapshot coverage improves to `4/5` at epoch `5` `PUBLISHED`. The live
blocker migrated to startup seed transport readiness: the report now classifies
`startup_recovery_blocked` with dominant reason
`readiness_probe_timeout_fallback=Node readiness probe timed out for 7493...`,
joiner `8be8...` remains inactive in `contacting_seed`, and selected
control-snapshot repair for `nodes` now fails through `sql_query_engine` with
`DISTRIBUTED_PARTICIPANT_FAILURE` against participant
`7493.../partition/nodes-p1-r3`. That new representative boundary is tracked
in
[Rolling Restart Startup Seed Transport Delivery-Source Saturation Reentry](./done-20260506-rolling-restart-startup-seed-transport-delivery-source-saturation-reentry.md).

## Opening Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z/rolling-restart/`.
3. Result: failed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Dominant reason: `pending_ack_nodes`.
7. Failure class: `publication_convergence_blocked`.
8. Publication convergence is the live owner seam: epoch `4`
   `ACK_PENDING`, pending ACK node
   `11601fe0-72d6-5853-8590-ec2881853e72`, blocked node count `0`, and
   recovery protocol state `publication_pending`.
9. Terminal active-gate progress stalls at active `3/5`, selected snapshot
   coverage `1/5`, selected snapshot node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` admin-ready via `admin_health`,
   selected published active nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` /
   `7493b0ab-a054-5fad-a91b-5e331db29304`, and selected missing published
   nodes `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
10. Best progress before regression reaches active `4/5`, selected snapshot
    coverage `3/5`, selected snapshot node
    `8be8d30f-4499-5eed-865c-71b4d529a67a` via `admin_health`, and selected
    missing published nodes `8be8d30f-4499-5eed-865c-71b4d529a67a` /
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
11. Priority recovery is predecessor context for this boundary: replayed
    closure is `closure_satisfied_fresh`, all tracked priority partitions are
    `converged` or `spread_satisfied_in_flight`, and
    `sql_write_operations-p1` is terminal-completed on operation
    `b3d55d51-363f-46cf-9ff2-f4aecfcf3de0` with no serial-wait witnesses.
12. Selected snapshot repair evidence is explicit owner-contract context:
    selected observation is `available`, `repair_deferred`, and
    `stale_usable`, while replay reconstructs owner-RPC cache repair as
    `available` with failed table `nodes`, read source `owner_rpc_lane`,
    failure class `pressure_or_timeout`, and cause chain
    `control_plane_backpressure` / `query_timeout`.
13. Runtime log evidence keeps the repair seam concrete: `35a...` and `8be8...`
    both fail `control_snapshot` authoritative discovery repair on table
    `nodes`, reporting `ROUTER_CONNECTION_CLOSED` or `Message timeout`
    against seed `7493...`; joiner `8be8...` also times out reconnecting to
    `ws://172.19.0.2:8082`, and `ebc4...` remains blocked on
    `control_snapshot_authority_unavailable`.
14. Replay classification is `changed`: durable publication state remains epoch
    `4` `ACK_PENDING` with closure record `CL-003`, while replay keeps
    `publication_pending` on retained selected-snapshot evidence rather than
    reopening priority-recovery debt.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Trace why routed seed reachability fails on owner-RPC `nodes` repair after
   priority-recovery closure is already satisfied.
2. Explain whether pending ACK node
   `11601fe0-72d6-5853-8590-ec2881853e72` is direct publication debt or a
   consequence of stale selected snapshot coverage ownership.
3. Add focused owner-path regressions or fixtures for startup/publication
   convergence and authoritative discovery repair.
4. Record blocker migration immediately if the representative path moves again.

## Out Of Scope

1. Reopening the closed serial-wait workflow-progress package unless the
   representative path re-enters that exact owner seam.
2. Broad matrix continuation before the five-node representative path passes or
   migrates to a new named owner boundary.
3. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Routed seed reachability for authoritative discovery reads against
   `7493b0ab-a054-5fad-a91b-5e331db29304`.
2. Owner-RPC authoritative discovery repair for table `nodes`, with startup
   publication convergence and active-gate coverage only as the surfaced debt.

Canonical contract shape:

1. Once priority recovery closure is satisfied, epoch `ACK_PENDING` publication
   debt must either advance or emit one canonical routed-read owner reason for
   the pending ACK node.
2. Selected snapshot coverage must not regress to `1/5` on retained stale
   admin-health observations without one explicit owner-RPC repair contract
   explaining the missing nodes.
3. Failure bundle, replay, and sprint bookkeeping must agree on one canonical
   startup/publication blocker for this rerun.

## Residual Closure Inventory

- [x] Capture the owner path that keeps epoch `4` on pending ACK node
      `11601fe0-72d6-5853-8590-ec2881853e72`.
- [x] Explain why selected control-snapshot owner-RPC `nodes` repair remains
      `repair_deferred` / `pressure_or_timeout` against seed
      `7493b0ab-a054-5fad-a91b-5e331db29304`.
- [x] Prove whether `35a...` / `8be8...` stale selected snapshots are
      consequence, co-owner, or subordinate evidence for the pending ACK
      publication debt.
- [x] Add focused tests or fixtures, then run verification, replay, and one
      representative `rolling-restart` rerun.

## Validation

1. Focused startup/publication owner-path tests pass.
2. Touched-file guardrails are rerun and recorded.
3. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. The representative path either clears the `ACK_PENDING` / snapshot-coverage
   debt or migrates to a different named owner boundary with replayable
   evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.

## Closing Evidence

1. Focused fix:
   `src/cdc/cdc-integration-service-segment-1.js` now retries eligible
   owner-RPC authoritative read failures through the canonical SQL fallback
   path instead of returning the stale `owner_rpc_lane` transport failure.
2. Focused regression:
   `test/cdc/authoritative-owner-rpc-sql-fallback.test.js`.
3. Representative report:
   `test-output/reports/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z.report.json`.
4. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z/rolling-restart/`.
5. Result: failed after `128.9s`.
6. Structured failure class: `startup_recovery_blocked`.
7. Structured dominant reason:
   `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`.
8. Publication convergence is closed predecessor context for this boundary:
   durable state is epoch `5` `PUBLISHED`, pending ACK count `0`, and replayed
   recovery protocol state is `steady_published`.
9. Selected snapshot coverage improves to `4/5` on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, with selected missing published
   nodes `8be8...` and `ebc4...`.
10. Selected control-snapshot repair evidence is no longer owner-RPC-bound:
    `nodes` repair now reports `readSource=sql_query_engine`,
    `failureClass=pressure_or_timeout`, cause chain
    `query_participant_failure` / `control_plane_backpressure`, and first
    failed participant `7493.../partition/nodes-p1-r3`.
11. The live representative blocker migrated to startup seed transport
    readiness for joiner `8be8...`, now tracked by
    [Rolling Restart Startup Seed Transport Delivery-Source Saturation Reentry](./done-20260506-rolling-restart-startup-seed-transport-delivery-source-saturation-reentry.md).

Done on May 6, 2026 by migration. The owner-RPC `nodes` repair seam is closed;
the representative path now belongs to the seed transport saturation package.
