# Topology Owner Boundary File Size Reduction

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "topology_owner_file_size_debt",
  "dominantReason": "oversized_files_raise_release_gate_risk",
  "currentState": "The topology release-gate slice touches several oversized runtime and test files. Large files are not the root cause, but they increase review risk, make owner boundaries harder to see, and make repeated fixes more expensive.",
  "nextAction": "Extract one topology owner helper at a time from oversized runtime or test files without changing behavior.",
  "proof": [
    "npm run work:oversized-next -- --markdown",
    "npm run audit:owner-boundary-segments -- src/rebalancer/operation-workflow-owner-segment-2.js",
    "git diff --check -- src/rebalancer/operation-workflow-owner-segment-2.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "writeScope": [
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "handoffFiles": [
    "work/tracks/topology-convergence.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

The current sprint has useful owner-boundary discipline, but implementation
still lands in files that are already too large. This package creates a narrow
maintenance lane for extracting one helper boundary at a time without changing
runtime behavior.

## Scope Basis

Approved lightweight maintenance under the file-size ratchet and topology
track. Use `npm run work:oversized-next -- --markdown` before selecting the
exact extraction target.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: each slice is mechanical extraction with no
  runtime behavior, contract, or scenario classification change.
- Escalation trigger to a heavier lane: extraction needs to change an owner
  decision, public contract, or representative evidence.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run `npm run work:oversized-next -- --markdown` and select one current
   topology owner file.
2. Extract one named helper module or test fixture builder with the same
   behavior and same call path.
3. Do not combine extraction with runtime fixes.
4. Keep the commit limited to the extracted helper, import updates, tests, and
   package file.
5. Record whether source/test line count decreased or stayed neutral.

## Out Of Scope

1. Runtime ownership changes.
2. Scenario reruns as proof of a mechanical extraction.
3. Broad formatting churn.
4. Extracting several owner boundaries in one package.

## Borrowed Pattern Hook

- FoundationDB pattern: high-value testing infrastructure stays maintainable
  because replay/simulation code is treated as production-grade. Local
  analogue: topology harness and owner code should be small enough to review
  before it becomes release-gate evidence.
- TiKV/PD pattern: scheduling concepts are explicit structures rather than
  scattered code paths. Local analogue: extraction should move a coherent
  owner helper, not arbitrary line ranges.

## Acceptance

1. One file-size extraction candidate is selected from `work:oversized-next`.
2. Existing focused tests still pass.
3. Runtime grammar and decision-boundary guardrails remain green for touched
   runtime files.
4. No representative scenario classification changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `src/rebalancer/operation-workflow-owner-segment-2.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:oversized-next -- --markdown`, `npm run audit:owner-boundary-segments -- src/rebalancer/operation-workflow-owner-segment-2.js`, `git diff --check -- src/rebalancer/operation-workflow-owner-segment-2.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:oversized-next -- --markdown
2. npm run audit:owner-boundary-segments -- src/rebalancer/operation-workflow-owner-segment-2.js
3. git diff --check -- src/rebalancer/operation-workflow-owner-segment-2.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
