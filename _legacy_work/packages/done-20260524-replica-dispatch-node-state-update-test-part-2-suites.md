# Split replica-dispatch-node-state-update test-part-2 below file-size limit

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-24",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "test_quality_owner",
    "boundary": "replica_dispatch_node_state_update_suites",
    "currentState": "Split test-part-2 (2518 lines) into test-part-2 (1365 lines) and new test-part-6 (1402 lines); npm run audit:file-size reports 0/60 over 1500, and npx tap across the two files passes 62/62.",
    "nextAction": "Close package after closure validation and commit the split.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
      "src/rebalancer/operation-workflow-owner-segment-6.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2.js",
      "test/control-plane/membership-publication-coordinator.test.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js",
      "src/rebalancer/operation-workflow-observed-state.js",
      "src/rebalancer/operation-workflow-priority-recovery-errors.js",
      "src/rebalancer/operation-workflow-remove-safety-evaluator.js",
      "src/rebalancer/operation-workflow-remove-safety-membership.js",
      "src/rebalancer/operation-workflow-replace-replay.js",
      "src/rebalancer/operation-workflow-replacement-leader-resolution.js",
      "src/rebalancer/operation-workflow-replacement-leader-state.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2b.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2c.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-6.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
      "src/rebalancer/operation-workflow-owner-segment-6.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2.js",
      "test/control-plane/membership-publication-coordinator.test.js",
      "test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js",
      "src/rebalancer/operation-workflow-observed-state.js",
      "src/rebalancer/operation-workflow-priority-recovery-errors.js",
      "src/rebalancer/operation-workflow-remove-safety-evaluator.js",
      "src/rebalancer/operation-workflow-remove-safety-membership.js",
      "src/rebalancer/operation-workflow-replace-replay.js",
      "src/rebalancer/operation-workflow-replacement-leader-resolution.js",
      "src/rebalancer/operation-workflow-replacement-leader-state.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2b.js",
      "test/control-plane/membership-publication-coordinator-main-stage-2c.js",
      "work/packages/active-20260524-replica-dispatch-node-state-update-test-part-2-suites.md",
      "test/control-plane/replica-dispatch-node-state-update.test-part-6.js"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package advances the active sprint goal and current first frontier.",
    "stabilityCredit": "local-proof-only"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:file-size -- test/control-plane/replica-dispatch-node-state-update.test-part-2.js"
      ]
    }
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `test_quality_owner`
- Route boundary: `replica_dispatch_node_state_update_suites`
- Route dominant reason: `oversized_file_ratchet`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. test/control-plane/replica-dispatch-node-state-update.test-part-2.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:file-size -- test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: test_quality_owner; files-changed: test/control-plane/replica-dispatch-node-state-update.test-part-2.js, test/control-plane/replica-dispatch-node-state-update.test-part-6.js; validation: `npm run audit:file-size -- test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-6.js` reports 0/60 over 1500 lines; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: test_quality_owner; files-changed: none; validation: `npx tap test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-6.js --disable-coverage` reports 62/62 passing; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

theory ledger: no ledger update

## Validation

1. npm run audit:file-size -- test/control-plane/replica-dispatch-node-state-update.test-part-2.js

