# Topology Systems Pattern Completion Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_convergence_owner",
  "boundary": "systems_pattern_contract_completion",
  "dominantReason": "pattern_contracts_not_fully_live_or_guarded",
  "currentState": "The closed systems-pattern sprint added the TiKV operator witness and Cockroach critical convergence contracts, but follow-up review found the witness is not proven through live emitted owner progress, broad admin tail consumers remain red, and tracker validation allows stale active references after package/sprint status renames.",
  "nextAction": "Make TiKV operator witnesses live through emitted progress, close Cockroach critical convergence tail-consumer proof, and add tracker validation for stale active package/sprint references before resuming the paused topology sprint.",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/done-20260516-topology-systems-pattern-completion-closure.md",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node --test test/diagnostics/topology-convergence-graph.test.js",
    "node test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "node --test test/admin/admin-control-snapshot.test.js",
    "node --test test/scripts/work-tracker-subagent-ledger.test.js",
    "npm run work:validate -- --closure work/packages/done-20260516-topology-systems-pattern-completion-closure.md"
  ],
  "writeScope": [
    "work/packages/done-20260516-topology-systems-pattern-completion-closure.md",
    "work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md",
    "scripts/work-tracker.js",
    "src/control-plane/topology-operator-witness.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-2.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-4.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot-tail-test-cases.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md",
    "work/packages/done-20260516-cockroach-style-control-plane-priority-convergence-class.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/topology-operator-witness.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-2.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-4.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-topology-systems-pattern-completion-closure.md",
    "work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md",
    "scripts/work-tracker.js",
    "src/control-plane/topology-operator-witness.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-2.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-4.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot-tail-test-cases.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
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

The closed systems-pattern sprint added the right contract vocabulary, but the
follow-up review found two completion risks that would make the paused topology
sprint harder to resume safely:

1. The TiKV/PD-style `topologyOperatorWitness` is proven by direct builder
   tests, but it is not yet proven through the live owner progress summary
   path that diagnostics and harness consumers read.
2. The Cockroach-style critical convergence class is focused-green, but the
   broad admin snapshot consumer remains red in touched priority-recovery tail
   assertions.

The same review also found tracker drift: active track/current-blocker text can
point at renamed `done-*` sprint/package files without validation failing. This
package closes those gaps together because a resumed topology sprint should be
able to trust both the live contracts and the handoff text.

## Scope Basis

Approved topology convergence stabilization under `roadmap.md` Phase 0.1 and
the closed systems-pattern sprint. This package is a completion slice for local
AGPL runtime contracts and workflow guardrails only.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the work completes existing owner contracts and
  affected consumers without changing user-visible topology behavior.
- Escalation trigger to a heavier lane: representative `rolling-restart`
  evidence changes owner/boundary, or the fix requires a new runtime owner
  outside operation workflow, topology publication, active-gate handoff, admin
  diagnostics, or tracker validation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Emit `topologyOperatorWitness` from the real operation workflow progress
   snapshot path and prove diagnostics/harness consumers prefer it when
   present.
2. Finish Cockroach critical convergence class proof through admin snapshot tail
   consumers, including the broad `test/admin/admin-control-snapshot.test.js`
   run.
3. Add tracker validation for stale active sprint/package references in track
   handoffs after files have been renamed.
4. Update `work/tracks/topology-convergence.md` and generated current-blocker
   files so the resumed paused sprint is not confused with the closed
   systems-pattern sprint.

## Out Of Scope

1. A broad representative `rolling-restart` rerun before focused local proof is
   green.
2. User-visible priority controls, operator-facing topology controls, Pro, or
   Enterprise behavior.
3. Changing scheduling or placement policy.

## Subagent Sequencing Ledger

Required for this runtime-owner-boundary package.

- [x] Review subagent recorded: Agent Fermat (019e30b0-3c61-7ab2-a963-a402dee09ce3) reviewed work/packages/done-20260516-topology-systems-pattern-completion-closure.md; result clean
- [x] Fix subagent recorded or explicitly not needed: `not-needed`.
- [x] Implementation subagent recorded: Agent Bernoulli (019e30b4-3cd8-7ee2-b3ad-5706e800fc4e) implemented work/packages/done-20260516-topology-systems-pattern-completion-closure.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-topology-systems-pattern-completion-closure.md`, `work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md`, `scripts/work-tracker.js`, `src/control-plane/topology-operator-witness.js`, `src/rebalancer/operation-workflow-owner-shared.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/diagnostics/topology-convergence-graph.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/membership-publication-coordinator-class-stage-3.js`, `src/control-plane/priority-recovery-snapshot-stage-10.js`, `src/control-plane/priority-recovery-observation-snapshot-stage-2.js`, `src/control-plane/priority-recovery-observation-snapshot-stage-4.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/distributed/harness/priority-recovery-summary-normalization.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/admin/admin-control-snapshot-tail-test-cases.js`, `test/admin/admin-control-snapshot.test.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: representative scenario timeout budgets, user-facing topology
  controls, placement policy, scheduler policy, Pro, and Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/done-20260516-topology-systems-pattern-completion-closure.md`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node --test test/diagnostics/topology-convergence-graph.test.js`, `node test/control-plane/membership-publication-coordinator-main-stage-2.js`, `node --test test/admin/admin-control-snapshot.test.js`, `node --test test/scripts/work-tracker-subagent-ledger.test.js`, `npm run work:validate -- --closure work/packages/done-20260516-topology-systems-pattern-completion-closure.md`
- Model ledger advisory: `escalate`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260516-topology-systems-pattern-completion-closure.md` - passed.
2. `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown` - passed.
3. `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown` - passed.
4. `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js` - passed.
5. `node --test test/diagnostics/topology-convergence-graph.test.js` - passed.
6. `node test/control-plane/membership-publication-coordinator-main-stage-2.js` - passed.
7. `node --test test/admin/admin-control-snapshot.test.js` - passed.
8. `node --test test/scripts/work-tracker-subagent-ledger.test.js` - passed.
9. `npm run work:validate -- --pre-impl work/packages/done-20260516-topology-systems-pattern-completion-closure.md` - passed.
10. `npm run work:model-ledger -- record --package work/packages/done-20260516-topology-systems-pattern-completion-closure.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated false --bailout-reason closure-blocked-subagent-authorization --outcome implemented --validation-status focused-green-closure-blocked-subagent-ledger --correction-loops 2 --review-findings 2 --notes topology-systems-pattern-completion-live-tikv-witness-cockroach-critical-convergence-admin-tail-and-tracker-active-reference-guard-focused-green` - recorded.
11. `npm run work:validate -- --closure work/packages/done-20260516-topology-systems-pattern-completion-closure.md` - passed after strict subagent proof update.

## Commit And Push Ledger

1. Focused package commit: 24a77f4b53e3cf3efd452a55400fb764952c0547
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
