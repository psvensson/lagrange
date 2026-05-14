# Topology Membership Epoch Fencing

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_membership_owner",
  "boundary": "membership_epoch",
  "dominantReason": "membership_topology_epoch_missing",
  "currentState": "Boot, join, rejoin, failure detection, placement, and gates do not yet share one explicit monotonic membership/topology epoch contract.",
  "nextAction": "Introduce a monotonic membership and topology epoch consumed by join rejoin failure placement and gates",
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

Boot, join, rejoin, failure detection, placement, and active-gate checks need
one monotonic membership/topology generation so stale observations cannot
drive placement or readiness decisions. This package owns the epoch and
fencing vocabulary before downstream repair packages depend on it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/todo-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  and the fenced consumers named in scope.
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

1. Introduce or formalize the monotonic membership/topology epoch consumed by
   boot, join, rejoin, failure detection, placement, active-gate, and
   rebalancer decisions.
2. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.
3. Define stale-observation fencing and diagnostics vocabulary.

## Out Of Scope

1. Failure repair intent implementation beyond epoch consumption hooks.
2. Partition descriptor epoch implementation unless explicitly split into this
   package.
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
