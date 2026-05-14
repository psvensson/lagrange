# Topology Failure Scenario Gates

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "failure-gate-matrix",
  "artifact": "none",
  "playback": "none",
  "owner": "distributed_test_harness",
  "boundary": "failure_gate_matrix",
  "dominantReason": "missing_failure_detection_rebalance_gate_coverage",
  "currentState": "Failure detection, rejoin, remote handoff, and rebalance disruption paths need focused release-gate coverage after owner proof.",
  "nextAction": "Promote join rejoin failure remote handoff and rebalance disruptions into focused release gates",
  "proof": [],
  "writeScope": [],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

The runtime contracts in this sprint need release gates that exercise the
failure paths directly. This package owns the focused scenario matrix that
proves failure detection, rejoin, remote handoff, and rebalance disruptions
converge through durable owner outcomes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/todo-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package targets scenario gate coverage and
  must not implement runtime fixes discovered by those gates.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Promote focused gates for rolling restart, killed join, killed rejoin,
   killed replica-operation coordinator, missed remote handoff ACK, stale
   publication with durable truth ahead, and split/rebalance during node
   recovery.
2. Assert durable convergence, owner reasons, and epoch/fencing where
   applicable.
3. Update this package metadata before activation with exact write scope,
   generated files, commit scope, and required subagent proof.

## Out Of Scope

1. Runtime fixes discovered by the gates; those must become separate packages.
2. Harness timeout stretching without owner proof.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: runtime files unless a gate exposes a fresh owner-boundary
  runtime package; this package should own harness/test definitions.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. `git diff --check -- <files>`
