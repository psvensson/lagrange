# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "scenario-release-gate",
  "scenario": "scenario-name",
  "artifact": "path/to/latest.report.json",
  "playback": "path/to/playback",
  "owner": "current_semantic_owner",
  "boundary": "current_owner_boundary",
  "dominantReason": "current_dominant_reason",
  "currentState": "one-line current state",
  "nextAction": "focused missing-edge probe",
  "proof": [
    "missing-edge probe",
    "focused owner tests",
    "affected presentation tests",
    "representative scenario rerun"
  ],
  "touchedFiles": [
    "src/example.js",
    "test/example.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "causal model contradicts package hypothesis",
      "new owner boundary becomes dominant",
      "implementation requires unrelated owners"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If this package is correct, the named causal edge will reduce, migrate, or converge.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- path/to/latest.report.json",
    "expectedCausalModelChange": "edge disappears, reduced evidence, named migration, or contradiction",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "residual scenario debt",
    "crossBoundaryReview": "required-before-implementation"
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "named scenario or focused blocker probe",
    "phaseChain": [
      "phase one",
      "phase two"
    ],
    "currentFirstFrontier": "owner / boundary / reason",
    "knownDownstreamBlockers": [
      "downstream owner / boundary / reason"
    ],
    "missingCausalEdge": "unproven handoff, wake, retry, visibility, or budget edge",
    "missingCausalEdgeProbe": "npm test -- path/to/focused-probe.test.js",
    "boundedProgressProof": "focused proof of wake/retry/timeout/reconcile/drain progress",
    "boundedProgressProofArtifact": "path/to/focused-probe.test.js",
    "expectedObservableTransition": "before state -> after state or named classification",
    "maxProgressBound": "maximum retry/timer/dispatch bound before fallback",
    "sameFrontierFallback": "same-frontier action",
    "expectedNextFrontier": "expected next owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-predecessor.md"
}
-->

## Why

Describe the representative blocker and why this package owns the current first
frontier.

## Lane

- Selected lane: scenario/release-gate
- Representative scenario or blocker probe:
- Current owner:
- Current boundary:
- Current dominant reason:

## Scope

In scope:

1. Current missing causal edge.
2. Focused owner proof.
3. Affected presentation proof.
4. Representative proof after focused proof.

Out of scope:

1. Downstream blockers until the current first frontier reduces or migrates.
2. Presentation-only relabeling that hides owner-boundary evidence.
3. Pro or Enterprise behavior unless explicitly AGPL-scoped.

## Subagent Sequencing Ledger

Required before implementation starts.

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed <predecessor package>;
      result `<clean|fixes-required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed <predecessor package>, or `not-needed`
      only when review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented <this package>.

## Static Drift Ledger

Preflight:

- [ ] Relevant owner-boundary guardrails selected and recorded.
- [ ] Inherited touched-file debt classified.

Closure:

- [ ] Same guardrails rerun.
- [ ] No relevant guardrail count increased.

## Causal Governance

- Causal hypothesis:
- Stop-condition check:
- Expected causal-model change:
- Representative outcome:
- Causal debt:
- Cross-boundary review:

## Scenario Causal Closure

- Reference scenario/probe:
- Phase chain:
- Current first frontier:
- Known downstream blockers:
- Missing causal edge:
- Missing causal edge probe:
- Bounded progress proof:
- Bounded progress proof artifact:
- Expected observable transition:
- Max progress bound:
- Same-frontier fallback:
- Expected next frontier:
- Result classification:
- Stop condition:

## Validation

1. Evidence summary:
2. Causal model check:
3. Missing-edge probe:
4. Focused owner tests:
5. Affected presentation tests:
6. Static guardrails:
7. Representative scenario or blocker probe:

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
