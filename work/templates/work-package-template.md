# Title

Lite templates: use `doc-only-package.md`, `single-file-maintenance-package.md`,
or `lightweight-maintenance-package.md` when the lane fits before starting from
this full template.

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "YYYY-MM-DD",
    "lane": "mechanical-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "owner",
    "boundary": "boundary",
    "dominantReason": "reason",
    "currentState": "state",
    "nextAction": "action"
  },
  "scope": {
    "writeScope": [
      "path/to/file"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "path/to/file",
      "work/packages/active-package.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": [
      "falsifier: falsifier command",
      "regression: regression command",
      "supporting: supporting command"
    ]
  }
}
-->

## Why

Describe the problem being solved.

## Scope

In scope:
1. Item

Out of scope:
1. Item

## Discovery Gate

- Status: `not-needed` when owner, boundary, route, do-not-edit scope, and proof
  are already explicit.
- Symptom / decision question:
- Current evidence:
- Candidate owners / boundaries:
- Competing hypotheses:
- Cheapest discriminator:
- Do not edit yet:
- Selected route:
- Promotion rule:

## Core Logic Brief

- Status: `not-needed` or brief description.

## Proof Ladder

- Proof commands and verification.

## Execution Evidence

- [ ] implementation: status: `running`; evidence: <proof>; next: validation.

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
