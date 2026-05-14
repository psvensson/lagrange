# Topology Bounded Progress Budgets

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "progress_budget_taxonomy",
  "dominantReason": "retryable_waits_lack_terminal_bounds",
  "currentState": "Critical topology diagnostics still expose unknown or unbounded progress budgets in paths that can affect release-gate closure.",
  "nextAction": "Require bounded retry timeout reconcile and terminal classifications for critical topology workflows",
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
  },
  "predecessor": "work/packages/done-20260513-topology-anti-entropy-reconciler.md"
}
-->

## Why

Critical topology workflows should never remain classified only as retryable
or event-driven. This package owns the shared budget and terminal-state
taxonomy that makes wake, retry, timeout, reconcile, and degraded outcomes
observable and bounded.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  for critical topology progress budgets and terminal states.
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

1. Standardize retry windows, next-attempt timestamps, attempt counters,
   terminal degraded classifications, and diagnostic reasons for critical
   topology workflows.
2. Teach diagnostics/analyzers to keep retryable evidence active unless a
   bounded progress mechanism is present.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Timeout stretching to hide failures.
2. Replacing focused owner proof with classification-only closure.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: none selected before activation; activation must name exact
  runtime write scope and forbidden files.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. `git diff --check -- <files>`
