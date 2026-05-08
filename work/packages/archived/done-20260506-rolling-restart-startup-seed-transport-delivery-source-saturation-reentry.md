# Rolling Restart Startup Seed Transport Delivery-Source Saturation Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-seed-transport-fairness-20260506T155451Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-seed-transport-fairness-20260506T155451Z/rolling-restart/",
  "owner": "Seed outbound transport fairness for critical delivery sources",
  "boundary": "Startup seed transport delivery-source saturation",
  "dominantReason": "readiness_probe_timeout_fallback",
  "currentState": "Focused fairness proof removed the delivery-source saturation blocker; the representative path migrated to epoch 3 ACK_PENDING with priority recovery still open.",
  "nextAction": "Use successor publication ACK-pending priority-recovery reentry package for the current representative blocker.",
  "proof": [
    "Focused transport fairness test",
    "Discovery-repair fallback attribution proof",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/transport/message-router-shared.js",
    "test/transport/message-router.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-publication-ack-pending-owner-rpc-nodes-repair-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-priority-recovery-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Publication ACK-Pending Owner-RPC Nodes Repair Reentry](./done-20260506-rolling-restart-startup-publication-ack-pending-owner-rpc-nodes-repair-reentry.md)
closed by migration. The representative rerun no longer terminates on epoch
`4` `ACK_PENDING` publication debt or stale `owner_rpc_lane` `nodes` repair.
Publication now reaches epoch `5` `PUBLISHED` with pending ACK count `0`, but
startup still times out because seed `7493b0ab-a054-5fad-a91b-5e331db29304`
stays transport-backpressured: joiner
`8be8d30f-4499-5eed-865c-71b4d529a67a` remains in `contacting_seed`, selected
`nodes` repair on `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` fails through
`sql_query_engine` with participant failure on
`7493.../partition/nodes-p1-r3`, and seed logs show one hot critical delivery
source saturating outbound queue pending/in-flight capacity against
`11601.../partition/sql_transactions-p1-r4`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-authoritative-owner-rpc-sql-fallback-20260506T150932Z/rolling-restart/`.
3. Result: failed after `128.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Failure class: `startup_recovery_blocked`.
7. Dominant reason:
   `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`.
8. Publication debt is predecessor context for this boundary: durable
   publication state is epoch `5` `PUBLISHED`, pending ACK count `0`, and
   replayed recovery protocol state is `steady_published`.
9. Terminal active-gate progress still stalls at active `3/5`, but selected
   snapshot coverage improves to `4/5` on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, with selected missing published
   nodes `8be8...` and `ebc4...`.
10. Selected control-snapshot repair evidence now routes through the canonical
    fallback path: table `nodes` reports `readSource=sql_query_engine`,
    `errorCode=DISTRIBUTED_PARTICIPANT_FAILURE`, cause chain
    `query_participant_failure` / `control_plane_backpressure`, and first
    failed participant `7493.../partition/nodes-p1-r3`.
11. Seed-side transport pressure is explicit in runtime logs: node `7493...`
    emits repeated `Outbound queue saturated for node delivery` warnings with
    `backpressureScope=delivery_source`, hot source
    `target:11601.../partition/sql_transactions-p1-r4`, `pending=48`,
    `pendingSourceLimit=48`, `inFlightCritical=32`, and `criticalReserve=16`.
12. Joiner `8be8...` remains blocked on seed reachability under the same
    startup window, with repeated reconnect timeouts to `ws://172.19.0.2:8082`
    while still classified as `contacting_seed`.
13. The previous package is closed proof for the fallback handoff itself:
    authoritative `nodes` reads no longer stop at `owner_rpc_lane`; the live
    owner seam is now the transport fairness below that handoff.

## Closure Update

Closed by migration on May 6, 2026 after the focused transport fairness slice
landed and the representative rerun moved the blocker. The new report
`test-output/reports/rolling-restart-after-seed-transport-fairness-20260506T155451Z.report.json`
failed after `131.4s`, but no longer contains the seed delivery-source
saturation signature from the opening artifact. The terminal blocker is now
publication convergence again: epoch `3` remains `ACK_PENDING`, pending ACK
node is `11601fe0-72d6-5853-8590-ec2881853e72`, selected active-gate coverage
is `3/5`, priority spread is pending, and priority recovery reports
`sql_transactions-p1` under `operation_workflow_owner / workflow_progress`
while `sql_write_operations-p1` has re-entered `needs_operation` /
`eligible_but_no_operation_created`.

That successor boundary is tracked in
[Rolling Restart Publication ACK-Pending Priority Recovery Reentry](./done-20260506-rolling-restart-publication-ack-pending-priority-recovery-reentry.md).

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Trace whether one hot critical delivery source on seed `7493...`
   monopolizes effective pending or in-flight capacity needed for unrelated
   seed/join/control-plane traffic.
2. Add the smallest focused transport regression for the selected queue
   admission or dispatch-fairness seam.
3. Preserve the new canonical fallback attribution on discovery repair while
   fixing the transport owner path beneath it.
4. Record blocker migration immediately if the representative path moves again.

## Out Of Scope

1. Reopening closed publication, owner-RPC fallback, or serial-wait workflow
   packages unless the representative path re-enters those exact seams.
2. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
3. Harness-only timeout increases or startup-readiness exemptions.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Seed `7493...` outbound transport fairness for critical delivery sources
   under rolling-restart recovery load.
2. Startup seed reachability for joiner `8be8...` and selected `nodes` repair
   only as surfaced debt from that transport boundary.

Canonical contract shape:

1. One hot critical delivery source must not consume all effective pending or
   dispatch headroom needed for unrelated seed/join/control-plane traffic.
2. When authoritative discovery repair falls back to `sql_query_engine`, the
   surfaced participant failure must remain canonical transport evidence and
   must not collapse back into publication or owner-RPC debt.
3. Failure bundle, replay, and sprint bookkeeping must agree on one canonical
   startup transport blocker for this rerun.

## Residual Closure Inventory

- [x] Capture the exact queue admission or dispatch rule that lets
      `target:11601.../partition/sql_transactions-p1-r4` keep seed `7493...`
      transport-backpressured.
- [x] Prove whether unrelated critical seed/control-plane traffic still has
      insufficient pending or in-flight headroom under that hot source.
- [x] Add the smallest focused regression, then repair the selected transport
      fairness seam.
- [x] Rerun focused tests, touched-file guardrails, replay, and one
      representative `rolling-restart` scenario.

## Closing Evidence

1. Focused transport regression:
   `test/transport/message-router.test.js`.
2. Focused discovery-repair fallback proof:
   `test/cdc/authoritative-owner-rpc-sql-fallback.test.js`.
3. Failure-bundle attribution proof:
   `test/distributed/harness/__tests__/failure-bundle.test.js`.
4. Touched transport owner file:
   `src/transport/message-router-shared.js`.
5. Representative report:
   `test-output/reports/rolling-restart-after-seed-transport-fairness-20260506T155451Z.report.json`.
6. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-seed-transport-fairness-20260506T155451Z/rolling-restart/`.
7. Result: failed after `131.4s`.
8. Transport blocker status: migrated. The opening
   `delivery_source` saturation on
   `target:11601.../partition/sql_transactions-p1-r4` is absent from the new
   terminal classification, and the failure bundle now selects
   `publication_convergence_blocked`.
9. New dominant reason: `pending_ack_nodes`.
10. New owner boundary: publication ACK-pending priority recovery reentry,
    tracked by the successor package.

## Validation

1. Focused transport fairness tests pass.
2. Any focused discovery-repair attribution proof touched by the transport
   slice still passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. The representative path either clears the startup seed-transport blocker or
   migrates to a different named owner boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
