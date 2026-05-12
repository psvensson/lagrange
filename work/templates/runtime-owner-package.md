# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "runtime-owner-boundary",
  "scenario": "scenario-or-none",
  "artifact": "path/to/artifact-or-none",
  "playback": "path/to/playback-or-none",
  "owner": "canonical_runtime_owner",
  "boundary": "owner_boundary",
  "dominantReason": "current_owner_reason",
  "currentState": "one-line current state",
  "nextAction": "focused owner-boundary action",
  "proof": [
    "focused owner-path test",
    "affected consumer proof",
    "static guardrails"
  ],
  "touchedFiles": [
    "src/example.js",
    "test/example.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "owner boundary changes",
      "proof requires unrelated runtime files",
      "representative scenario migrates to a new owner"
    ]
  }
}
-->

## Why

Describe the runtime owner-boundary problem.

## Lane

- Selected lane: runtime owner-boundary
- Primary owner:
- Primary boundary:
- Escalate to scenario lane if:

## Shared Boundary Contract

- Semantic owner:
- Canonical evidence inputs:
- Canonical state or outcome vocabulary:
- Allowed consumers:
- Forbidden reinterpretations:
- Operational authority:
- Diagnostics-only views:
- Owner-internal retained state:

## Scope

In scope:

1. Item

Out of scope:

1. Item

## Static Drift Ledger

Preflight:

- [ ] Decision-boundary guard recorded.
- [ ] Runtime-grammar guard recorded when runtime meaning changes.
- [ ] Metadata gateway guard recorded when system-table ingress changes.
- [ ] Scalar/literal guard recorded for materially edited runtime files.

Closure:

- [ ] Same guardrails rerun.
- [ ] No relevant guardrail count increased.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Subagent Sequencing Ledger

Required for this lane unless the user explicitly disables subagents.

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed <package>;
      result `<clean|fixes-required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed <package>, or `not-needed` only when
      review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented <this package>.

## Validation

1. Focused owner-path test:
2. Affected consumer proof:
3. Static guardrails:
4. Representative scenario or blocker probe, if scenario-driven:

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete.
- [ ] Tail consumers are cut over.
- [ ] Diagnostics, admin, harness, and reporting surfaces match the contract.
- [ ] Superseded paths, booleans, or vocabulary are deleted.
- [ ] Required proof layers are complete.

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
