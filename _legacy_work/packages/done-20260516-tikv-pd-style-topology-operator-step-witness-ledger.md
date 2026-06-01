# TiKV PD Style Topology Operator Step Witness Ledger

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "topology_operator_step_witnesses",
  "dominantReason": "topology_work_lacks_step_witness_contract",
  "currentState": "Topology work currently exposes some next actions and workflow-progress witnesses, but publication, recovery, and repair progress can still collapse into timeout-only or generic pending evidence. This package adds a shared operator-step witness contract.",
  "nextAction": "Represent publication, recovery, and repair progress as owner operators with explicit steps, current step, witness source, next legal action, and heartbeat or retry evidence.",
  "proof": [
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-3.js"
  ],
  "writeScope": [
    "work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/distributed/harness/cluster-segment-3.js",
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
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/distributed/harness/cluster-segment-3.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/distributed/harness/cluster-segment-3.js",
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
  },
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true
}
-->

## Why

TiKV/PD represents scheduling work as operators with ordered steps. PD sends
operators through heartbeat responses and monitors later heartbeats to see
which step completed. The local analogue is not PD scheduling architecture.
The useful idea is step witnesses: topology work should say which owner step is
in progress, what evidence will advance it, and what legal action follows.

This package gives publication, recovery, and repair work the same shape so the
release gate stops learning progress only from timeouts or scattered booleans.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, topology workflow stabilization and
failure simulations. External reference: TiKV scheduling docs,
`https://tikv.org/docs/7.1/reference/architecture/scheduling/`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: one owner-boundary contract is added for
  topology operator progress and consumed by diagnostics/harness surfaces.
- Escalation trigger to a heavier lane: the package tries to change scheduling
  policy, partition placement policy, or more than one runtime owner at once.

## Shared Boundary Contract

- Semantic owner: `operation_workflow_owner` for workflow progress; publication
  owner surfaces may emit compatible operator witness records but do not own
  workflow transitions.
- Canonical evidence inputs: operation row, actuation state, durable
  publication row, active-gate handoff, retry/wake event, and follow-up
  snapshot observation.
- Canonical state vocabulary: `planned`, `dispatched`, `observed`,
  `retry_scheduled`, `blocked`, `terminal`.
- Allowed consumers: causal model, topology convergence graph, failure bundle,
  active-gate progress formatter, and focused owner tests.
- Forbidden reinterpretations: consumers must not reconstruct current step from
  log strings, elapsed time, or local helper booleans.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Define a `topologyOperatorWitness` record with: `operatorId`, `owner`,
   `boundary`, `kind`, `partitionId`, `targetNodeId`, `steps`,
   `currentStepId`, `currentStepState`, `witnessSource`, `nextAction`,
   `deadlineMs`, and `lastObservedAtMs`.
2. Map existing workflow-progress states into the record without changing
   runtime behavior first.
3. Add owner tests proving dispatch-pending, owner-retry, publication ACK, and
   active-gate reconcile cases produce one current step and one next action.
4. Update topology convergence and failure-bundle consumers to prefer the
   witness record over timeout-only classification when present.
5. Keep one in-flight execution per owner key; this package must not create a
   second progression path.

## Out Of Scope

1. New scheduling policy.
2. New partition placement behavior.
3. Broad workflow rewrites.
4. Treating diagnostics as the owner of progress.

## Subagent Sequencing Ledger

Required before implementation because this is a runtime-owner-boundary
package. The review subagent must review
`work/packages/done-20260516-etcd-style-active-gate-admission-catchup-fence.md`
and this package's active metadata before implementation starts.

- [x] Review subagent recorded: Agent Boyle (019e304f-f7eb-75a0-82c0-ee87d9627f54) reviewed work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md; result clean
- [x] Fix subagent recorded or explicitly not needed: not-needed
- [x] Implementation subagent recorded: Agent Volta (019e3053-82d5-7d82-8d84-5c128e17f1a8) implemented work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md

## Borrowing Details

What is borrowed:

1. Work is represented as an operator with ordered steps.
2. Later observations advance or block the current step.
3. The controller reports status, current step, and pending influence.

What is not borrowed:

1. PD scheduling algorithms.
2. Region/Store heartbeat protocol.
3. Raft peer placement mechanics.

Local implementation shape:

1. Add a small normalizer for topology operator witness records.
2. Emit the record from the existing operation owner decision snapshot first.
3. Add optional publication/active-gate witness adapters only after the
   operation-owner path is proven.
4. Extend harness progress formatting to include current step and next action.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: this package file until activation; candidate runtime files may
  be promoted only after owner-files proof selects the operator-witness path.
- Forbidden files: non-candidate runtime files, broad scheduler rewrites,
  placement policy changes, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-3.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
2. node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
3. node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-3.js
4. npm run audit:guideline:literals -- src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-shared.js src/diagnostics/topology-convergence-graph.js
5. npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-shared.js src/diagnostics/topology-convergence-graph.js
6. npm run guard:guideline:constant-names:file -- src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-shared.js src/diagnostics/topology-convergence-graph.js
7. node --test test/diagnostics/topology-convergence-graph.test.js

## Commit And Push Ledger

1. Focused package commit: cebcaf499222de50595cfd20d7a7fc3ef1c5a7fa
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
