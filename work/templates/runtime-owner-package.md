# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "YYYY-MM-DD",
    "lane": "runtime-owner-boundary",
    "scenario": "scenario-or-none",
    "artifact": "path/to/artifact-or-none",
    "playback": "path/to/playback-or-none",
    "owner": "canonical_runtime_owner",
    "boundary": "owner_boundary",
    "dominantReason": "current_owner_reason",
    "currentState": "one-line current state",
    "nextAction": "focused owner-boundary action"
  },
  "scope": {
    "writeScope": [
      "src/example.js",
      "test/example.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/example.js",
      "test/example.test.js",
      "work/packages/active-YYYYMMDD-package.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "owner boundary changes",
      "proof requires unrelated runtime files",
      "representative scenario migrates to a new owner"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-YYYYMMDD-short-slug"
    ],
    "theoryLoop": {
      "outcome": "inconclusive",
      "jointFalsifierCommand": ""
    },
    "proof": [
      "falsifier: focused owner-path test",
      "regression: affected consumer proof",
      "supporting: static guardrails"
    ]
  },
  "parallelDiagnostics": {
    "mode": "verify-only",
    "requiredCards": [
      "verifier"
    ],
    "reportDir": "work/agent-reports/active-YYYYMMDD-package",
    "coordinatorOnlyWrites": [
      "work/packages/",
      "work/sprints/current-blocker.json",
      "work/theory-ledger.md"
    ],
    "routeDecisionRequired": false,
    "trigger": "after implementation proof before closure"
  },
  "modelTheory": {
    "modelKind": "invariant-spec",
    "executableArtifact": "docs/specs/decision-tables/example.json",
    "propertiesProven": [
      "each owner-boundary input combination maps to one canonical runtime outcome"
    ],
    "assumptions": [
      "none"
    ],
    "counterExampleHandling": "Fail the package falsifier and convert the counterexample into a focused regression or contract update before implementation continues.",
    "linkedSystemTheoryRef": "architecture/contracts/example.md#contract-id"
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

## Mechanism Card

- Failure mechanism: <observation_gap | selection_gap | admission_gap | transition_gap | scheduling_gap | budget_gap | concurrency_gap | contract_gap | ownership_gap | downstream_symptom | coupled_invariants | emergent_oscillation | protocol_mismatch | feedback_amplification>
- Stable facts:
- Changed facts:
- Why not the alternatives:
- Owner who decides:
- Current code or workflow action:
- Missing transition or missing observation:
- Smallest falsifying probe:
- Expected movement:
- Negative result means:
- Escalation rule:

## Discovery Gate

- Status: required when owner, boundary, route, or proof ambiguity is material;
  otherwise `not-needed`.
- Symptom / decision question:
- Current evidence:
- Candidate owners / boundaries:
- Competing hypotheses:
- Cheapest discriminator:
- Do not edit yet:
- Selected route:
- Promotion rule:

## Parallel Diagnostics

- Mode: `verify-only` for implementation packages after proof, or
  `read-only-scouts` before implementation when owner/boundary route ambiguity is
  still material.
- Report directory:
- Required cards:
- Coordinator-only writes:
- Route decision required:
- Trigger:
- Collection command:
  `npm run work:agent:collect -- --package work/packages/active-YYYYMMDD-package.md`

## Core Logic Brief

- Canonical outcome:
- Inputs/signals:
- State model or invariant:
- Non-goals and forbidden interpretations:
- Proof mapping:
- Wrong-slice trigger:

## System Contract Binding

- Contract record:
- Failure class changed or bounded:
- Invariant preserved or strengthened:
- Runtime binding:
- Model binding:
- Counterexample handling:

## Expected Representative Delta

Required when a representative artifact selected this runtime package.

- Baseline artifact:
- Expected metric, owner, boundary, dominant reason, or route delta:
- Local proof class:
- Representative proof class:
- Stop if unchanged:

## Scope

In scope:

1. Item

Out of scope:

1. Item

## Execution Evidence

Use one executor pass plus one separate verifier-fixer pass. The verifier-fixer
may fix in-scope problems directly, then reruns focused proof.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: verification.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.

## Validation

1. Focused owner-path test:
2. Affected consumer proof:
3. Static guardrails:
4. Representative scenario or blocker probe, if scenario-driven:

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Push target: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
- Pushed: `<no>`
