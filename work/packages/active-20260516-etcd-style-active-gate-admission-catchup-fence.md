# Etcd Style Active Gate Admission Catchup Fence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "active_gate_admission_catchup_fence",
  "dominantReason": "admission_requires_durable_catchup_proof",
  "currentState": "Active-gate admission is strict today, but the gate has repeatedly needed patches around whether durable publication truth, active node projection, and snapshot coverage are caught up. This package turns that repeated implicit rule into one explicit catch-up fence.",
  "nextAction": "Add an explicit catch-up fence that keeps nodes out of active-gate success until durable publication and snapshot coverage prove the cohort is caught up.",
  "proof": [
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node --test test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js"
  ],
  "writeScope": [
    "work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/tracks/topology-convergence.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/follow-on",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

etcd adds a new member as a learner and promotes it only after it has caught up
to the leader's log. The local analogue is not etcd membership or quorum. The
useful idea is the promotion fence: a node may be present and progressing, but
it is not admitted as fully active until a durable catch-up condition is
proven.

This package applies that pattern to active-gate admission. A node can be
eligible, catching up, or blocked, but active-gate success requires a single
owner-owned proof that publication truth and snapshot coverage are compatible.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, topology workflow stabilization and
production guarantees. External reference: etcd runtime reconfiguration
learner promotion docs, `https://etcd.io/docs/v3.4/op-guide/runtime-configuration/`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: one owner boundary defines admission and
  promotion semantics; representative rerun is only a checkpoint after focused
  owner and consumer proof.
- Escalation trigger to a heavier lane: the fence requires publication owner
  write semantics, readiness owner semantics, or operation workflow semantics
  to change in the same package.

## Shared Boundary Contract

- Semantic owner: `startup_active_gate_owner`.
- Canonical evidence inputs: publication active-gate handoff contract, durable
  membership publication row, active node projection, snapshot coverage, and
  freshness/revision evidence.
- Canonical state vocabulary: `catchup_pending`, `catchup_ready`,
  `catchup_blocked`, `promotion_allowed`, `promotion_denied`.
- Allowed consumers: admin snapshot, readiness support evidence, topology
  convergence graph, and distributed harness reporting.
- Forbidden reinterpretations: consumers must not treat a stale publication
  row, empty missing-node list, or timeout exhaustion as promotion success.
- Diagnostics-only views: may report the fence state and missing proof but may
  not override it.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Add one active-gate catch-up fence object to the canonical handoff contract
   or its owner-owned successor. It must name target node ids, durable
   publication revision or epoch, snapshot coverage revision, missing proof
   reasons, and next legal action.
2. Replace any caller-local "is this active enough" logic in the touched path
   with consumption of that fence.
3. Preserve active-gate strictness while `runtimePromotionAllowed=false`.
4. Add focused tests:
   seed-only publication plus active target nodes gives `catchup_pending`;
   durable publication row without snapshot coverage stays denied;
   durable publication plus snapshot coverage allows promotion;
   stale cache evidence never promotes.
5. Update diagnostics/harness consumers to display the fence state without
   deriving a second state model.

## Out Of Scope

1. Replacing membership publication ownership.
2. Relaxing active-gate admission.
3. Raising timeouts to hide catch-up latency.
4. Implementing etcd membership/quorum behavior.

## Subagent Sequencing Ledger

Required before implementation because this is a runtime-owner-boundary
package. The review subagent must review
`work/packages/done-20260516-foundationdb-style-deterministic-missing-edge-replay.md`
and this package's active metadata before implementation starts.

- [x] Review subagent recorded: Agent Galileo (019e303a-092c-7b02-97ba-d5ca71be173e) reviewed work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed: Agent Beauvoir (019e303d-5d72-79a2-8e66-069549c6da7c) fixed work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md
- [x] Implementation subagent recorded: Agent Copernicus (019e3040-6181-7bd3-bc91-4a9c966f4894) implemented work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md

## Borrowing Details

What is borrowed:

1. Separate presence from promotion. A node may be known and processing but not
   admitted.
2. Promotion is owner-validated, not caller-inferred.
3. Failed promotion returns a typed reason and retry condition.

What is not borrowed:

1. Raft learner membership.
2. Voting/quorum mechanics.
3. Operator-facing membership commands.

Local implementation shape:

1. `resolvePublicationActiveGateMembershipPublicationTarget` or its successor
   emits a catch-up fence alongside the handoff target.
2. `AdminControlSnapshot` carries `activeGateCatchupFence` under control-plane
   diagnostics.
3. `topology-convergence-graph` consumes the fence as the canonical
   active-gate promotion evidence.
4. Tests assert state vocabulary, target node ids, revision/epoch fields, and
   next action.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: this package file until activation; candidate runtime files may
  be promoted only after owner-files proof selects the active-gate fence path.
- Forbidden files: non-candidate runtime files, timeout budgets, active-gate
  admission relaxation, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `node --test test/control-plane/publication-active-gate-handoff-contract.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js`
- Model ledger advisory: `escalate`

## Validation

1. [x] `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
   - Passed; owner file index loaded before code edits.
2. [x] `npm run work:package:doctor -- --suggest work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md`
   - Passed; package doctor reported validation ok and no deterministic suggestions.
3. [x] `npm run work:validate -- --pre-impl`
   - Passed before and after implementation; review/fix proof was accepted and implementation remained the next role.
4. [x] `node --test test/control-plane/publication-active-gate-handoff-contract.test.js`
   - Passed after implementation.
5. [x] `npm test -- --grep "AdminControlSnapshot exposes publication owner-truth active cohort" test/admin/admin-control-snapshot.test.js`
   - Passed; focused admin diagnostic carry-through proof.
6. [x] `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js`
   - Passed.
7. [x] `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-3.js`
   - Passed.
8. [x] `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-3.js`
   - Passed.
9. NOTE: `node --test test/admin/admin-control-snapshot.test.js` is not used
   as closure proof. The unfiltered file run still fails in existing
   priority-recovery/tail expectations outside this package's active-gate
   fence carry-through; the focused grep proof above passed.
10. [x] `git diff --check -- work/packages/active-20260516-etcd-style-active-gate-admission-catchup-fence.md src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot.test.js work/model-ledger.jsonl`
    - Passed.
11. [x] `npm run work:model-ledger -- record ...`
    - Recorded package evidence with outcome `implemented` and validation status `focused-green-broad-admin-red`.

## Implementation Evidence

- Added `activeGateCatchupFence` to `publicationActiveGateHandoff` and the
  projected `activeGateOwnerCohort`.
- The fence distinguishes target presence, durable publication catch-up, and
  promotion permission. Promotion remains denied unless durable publication
  covers the target cohort and non-stale snapshot coverage covers the same
  target cohort.
- Admin control snapshots now carry the owner fence under
  `controlPlaneDiagnostics.activeGateCatchupFence`, nested
  `publicationConvergence.activeGateCatchupFence`, and
  `activeGateOwnerCohort.activeGateCatchupFence` without deriving a second
  local promotion model.
