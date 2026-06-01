# Publication Recovery Machine Spec And Preflight Verification

## Why

The `rolling-restart` sprint keeps exposing publication recovery pressure
points through long harness runs: ACK-complete rows that should close,
ACK-pending rows that disagree with active-gate evidence, and priority recovery
states that are inferred from scattered code paths.

The core publication and active-gate decision logic should be expressed as a
declarative machine spec so it can be verified directly, reused by runtime
closure code, and consumed by the state-machine pressure preflight before a
long distributed rerun.

## Scope Basis

This is AGPL-scoped runtime stability work under the active publication-scoped
consistency and node-join closure sprint. It implements the already approved
state-machine pressure preflight direction and the current `rolling-restart`
dominant blocker.

## In Scope

1. Add a shared publication recovery machine spec for ACK closure, publication
   pressure, invariants, and liveness obligations.
2. Make membership publication metadata refresh and acknowledgement decisions
   consume the shared spec.
3. Make the state-machine pressure preflight consume the shared spec.
4. Add focused tests that prove the spec is declarative data and that the
   runtime/preflight consumers agree.
5. Continue the `rolling-restart` sprint with the repaired evidence.

## Out Of Scope

1. Rewriting every priority recovery or rebalancer decision table.
2. Pro or Enterprise feature work.
3. Broad distributed matrix reruns before the representative blocker migrates.
4. No-code confirmation rerun after the migrated restart-recovery blocker closes.

## Invariants

1. A non-terminal publication with every required ACK durably recorded must
   transition to `PUBLISHED`.
2. A `PUBLISHED` publication must not report pending ACK debt.
3. Active-gate pending ACK and missing-published evidence must not be hidden by
   a stale top-level publication summary.
4. Runtime closure, diagnostics, and preflight must use the same publication
   recovery grammar.

## Hotspots

1. `src/control-plane/publication-recovery-state-machine.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `test/distributed/harness/state-machine-pressure-preflight.js`
4. `test/distributed/harness/publication-evidence-contract.js`
5. `test/control-plane/membership-publication-coordinator.test.js`
6. `src/control-plane/replica-dispatch-service-segment-1.js`
7. `test/control-plane/replica-dispatch-node-state-update.test.js`

## Shared Boundary Contract

- Semantic owner: membership publication coordinator.
- Canonical contract shape / vocabulary: publication recovery machine spec with
  named evidence flags, transitions, invariants, liveness obligations, and
  action ids.
- Allowed consumers: membership publication runtime owner, state-machine
  pressure preflight, failure-bundle/publication-evidence diagnostics, focused
  control-plane tests.
- Prohibited reinterpretations: consumers must not infer ACK closure from local
  boolean piles or private predicate tables.
- Primary diagnostics / proof surfaces: publication recovery machine tests,
  membership publication coordinator tests, state-machine pressure preflight
  tests, heartbeat-only node-state update tests, runtime-grammar and guideline
  guardrails, representative `rolling-restart` rerun.
- Adjacent runtime owner touched by blocker migration: node-state publication
  ingestion in `ReplicaDispatchService`, limited to reviving stale stopped
  rows when a READY heartbeat-only recovery update is the canonical fresh
  evidence.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: runtime grammar, decision
      boundary, literal audit, state-machine pressure preflight.
- [x] Inherited repo-wide debt classified: literal audit has inherited debt;
      touched-file drift must not increase.
- [x] Inherited touched-file debt classified: existing publication and harness
      files already contain runtime grammar and diagnostic logic.
- [x] File-scoped or boundary-scoped baseline recorded from the active sprint
      before this slice: runtime grammar and decision-boundary audits passed;
      literal audit reported inherited debt only.

Closure:

- [x] Same guardrails rerun after the heartbeat-status revival and ACK refresh
      slices.
- [x] No relevant guardrail count increased after the latest slice.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Detection / Analysis Tasks

- [x] Build the concern inventory.
- [x] Build the semantic-question matrix.
- [x] Detect duplicate ownership.
- [x] Detect implicit state machines.
- [x] Detect branch lattices.

## Implementation Tasks

- [x] Add guardrail tests first.
- [x] Collapse publication closure and preflight decisions to one spec.
- [x] Cut runtime ACK metadata refresh through the spec.
- [x] Repair active-gate evidence normalization for preflight/failure bundles.
- [x] Preserve explicit active-gate pending-ACK and missing-published counts
      when node-id lists are stale or absent.
- [x] Repair READY heartbeat-only node-state recovery so stale stopped rows
      revive to active before membership publication repair runs.
- [x] Tighten static guardrails.

## Residual Closure Inventory

- [x] Owner-path cutovers are complete for publication recovery evidence and
      heartbeat-only READY status revival.
- [x] Tail consumers are cut over for preflight and failure-bundle publication
      evidence.
- [x] Diagnostics, admin, and reporting surfaces match the active-gate
      pending-ACK and missing-published contract.
- [x] Superseded paths, booleans, or vocabulary are deleted or explicitly
      left outside this package.
- [x] Required proof layers are complete.

## Blocker Migration Notes

1. The first representative rerun after the publication recovery evidence
   repair no longer reproduced the stale ACK contradiction. The active gate
   reported publication `PUBLISHED`, `pendingAck=0`, and priority recovery
   `none`.
2. The blocker migrated to one missing published active node. The April 26,
   2026 `test-output/report.json` artifact has active progress `5/5`,
   snapshot coverage `4/5`, publication epoch `6`, `publishedActive=4/5`,
   `missingPublished=1`, and missing node id
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
3. Direct node diagnostics showed the missing node as active/admin-ready, while
   the control-plane node row still carried stale `stopped` status alongside
   READY/fresh heartbeat evidence. Publication correctly excluded that stale
   stopped row.
4. The latest implementation slice fixes that migrated owner boundary by
   allowing READY heartbeat-only recovery updates to persist `active` status
   only when the existing durable node row is not already active. Normal
   heartbeat-only updates still avoid mutating resource and participation
   fields.
5. The post-fix representative `rolling-restart` rerun first exposed a stale
   terminal-cache ACK owner gap: the authoritative event stream showed epoch
   `14` `ACK_PENDING` with pending node
   `11601fe0-72d6-5853-8590-ec2881853e72`, while that node could see a
   terminal cached publication and skip the owner refresh. The ACK refresh
   decision now uses one evidence snapshot and a decision table that forces an
   authoritative read for terminal cache rows.
6. The focused regression for that gap is
   `acknowledgeMembershipPublicationForNode refreshes from authoritative when
   cache has terminal stale publication`.
7. The final representative rerun migrated out of this package. Publication
   recovery was closed: publication epoch `4` was `PUBLISHED`,
   `pendingAckCount=0`, `missingPublishedCount=0`, active-gate publication
   debt was absent, and priority recovery had no blocked or unresolved
   partitions.
8. The new blocker is restarted-node recovery readiness for
   `11601fe0-72d6-5853-8590-ec2881853e72`: the node remained reachable only by
   bootstrap health, `adminReady=false`, `controlPlaneRecoveryReady=false`,
   readiness phase `INIT`, and
   `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
   Surrounding logs show `control_plane_pressure_degraded` publication writes
   and `query:insert:control_plane_publications` delivery-source saturation,
   so the next owner boundary is restart-recovery control-plane pressure and
   admin reachability.

## Validation

1. `node --test test/control-plane/publication-recovery-state-machine.test.js`
2. `node --test test/control-plane/membership-publication-coordinator.test.js`
3. `node --test test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js`
4. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
5. `node --test test/control-plane/replica-dispatch-node-state-update.test.js`
6. `npm run audit:state-machine-pressure`
7. `npm run audit:runtime-grammar`
8. `npm run audit:guideline:decision-boundaries`
9. `npm run audit:guideline:literals`
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

Executed proof:

1. `node --test test/control-plane/publication-recovery-state-machine.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
   passed, `103/103`.
2. `node --test test/control-plane/active-node-projection.test.js test/control-plane/membership-publication-coordinator.test.js`
   passed, `261/261`.
3. `node --test test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
   passed, `62/62`.
4. `node --test test/control-plane/replica-dispatch-node-state-update.test.js`
   passed, `97/97`.
5. The pre-revival representative `rolling-restart --fast-local` rerun failed
   with the migrated missing-published active-node blocker described above.
6. `npm run audit:state-machine-pressure`
   passed, `ready=true static=7 snapshots=0: issues=0`.
7. `npm run audit:runtime-grammar`
   passed with `0` runtime grammar violations.
8. `npm run audit:guideline:decision-boundaries`
   passed with `0` violations across `882` JavaScript files.
9. `npm run audit:guideline:literals`
   passed with `0` new violations and `6191` inherited baseline violations.
10. The post-revival representative `rolling-restart --fast-local` rerun
    failed after `269.1s`, but migrated to the restart-recovery pressure/admin
    reachability blocker described above.

Pending proof:

1. A no-code representative confirmation rerun only after the new active
   restart-recovery blocker closes.

## Done When

1. The shared publication recovery machine spec is the canonical decision
   owner for ACK closure.
2. Runtime and preflight consumers agree on publication pressure outcomes.
3. Focused proof and guardrails pass.
4. The post-revival representative `rolling-restart` rerun either passes or
   migrates to a newly named blocker recorded in this package and the active
   sprint.
