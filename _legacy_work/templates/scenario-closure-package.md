# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "lane": "scenario-release-gate",
    "scenario": "scenario-name",
    "artifact": "path/to/latest.report.json",
    "playback": "path/to/playback",
    "owner": "current_semantic_owner",
    "boundary": "current_owner_boundary",
    "dominantReason": "current_dominant_reason",
    "currentState": "one-line current state",
    "nextAction": "focused missing-edge probe"
  },
  "scope": {
    "writeScope": [
      "src/example.js",
      "test/example.test.js"
    ],
    "handoffFiles": [
      "path/to/latest.report.json",
      "path/to/playback"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why"
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "causal model contradicts package hypothesis",
      "new owner boundary becomes dominant",
      "implementation requires unrelated owners"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": [
      "falsifier: missing-edge probe",
      "regression: focused owner tests",
      "supporting: affected presentation tests",
      "supporting: representative scenario rerun"
    ]
  },
  "parallelDiagnostics": {
    "mode": "read-only-scouts",
    "requiredCards": [
      "evidence-scout",
      "model-contract-scout",
      "source-map-scout"
    ],
    "reportDir": "work/agent-reports/active-YYYYMMDD-package",
    "coordinatorOnlyWrites": [
      "work/packages/",
      "work/sprints/current-blocker.json",
      "work/theory-ledger.md"
    ],
    "routeDecisionRequired": true,
    "trigger": "before opening a runtime successor from ambiguous representative evidence"
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
    "sameFrontierFallback": "open/select autonomous architecture experiment if no reduction or migration appears",
    "expectedNextFrontier": "expected next owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "most recent owner / boundary / result",
      "previous related owner / boundary / result"
    ],
    "oscillationCheck": "state whether the frontier returned to or alternated with a recently closed related boundary",
    "handoffInvariant": "producer outcome + consumer precondition + freshness/revision/ack edge"
  },
  "predecessor": "work/packages/done-predecessor.md"
  ,
  "modelTheory": {
    "modelKind": "state-model",
    "executableArtifact": "docs/specs/statecharts/example.json",
    "propertiesProven": [
      "the scenario lifecycle cannot close without one canonical evidence-backed transition"
    ],
    "assumptions": [
      "none"
    ],
    "counterExampleHandling": "Fail the package falsifier and route to architecture-gap analysis, owner migration, or a focused regression before implementation continues.",
    "linkedSystemTheoryRef": "architecture/contracts/example.md#contract-id"
  }
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

## Classification-Only Fast Path

Use when focused proof classifies the current edge and no runtime, test, script,
or report edit is justified.

- Metadata result: `classification-only`
- `writeScope` / `commitScope`: package, sprint, tracker, ledger, or handoff
  docs only
- Possible implementation files: `candidateRuntimeFiles`
- Proof cap: two or three canonical commands
- Subagents/static runtime guardrails: optional until implementation write
  scope is promoted
- Reuse of the same unchanged artifact: close and rerun evidence, or escalate
  if owner/boundary, package class, or stop condition did not change

## Expected Representative Delta

- Baseline artifact:
- Expected metric, owner, boundary, dominant reason, or route delta:
- Local proof class:
- Representative proof class:
- Stop if unchanged:
  open/select an autonomous architecture experiment before another local patch;
  use human escalation only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact:
- Route owner:
- Route boundary:
- Route dominant reason:
- Route causal outcome:
- Stop mode:
- Next lane:
- Required after rerun: route-after-rerun, Sprint Strategy Brief update,
  Current Edge Card update, `npm run work:current-blocker -- --write`, and
  `npm run work:validate -- --pre-impl`.

## Parallel Diagnostics

- Mode: `read-only-scouts` when representative evidence is ambiguous, stale,
  contradictory, or selecting a runtime successor.
- Report directory:
- Required cards:
- Coordinator-only writes:
- Route decision required:
- Trigger:
- Plan command:
  `npm run work:agent:plan -- --package work/packages/active-YYYYMMDD-package.md`
- Collection command:
  `npm run work:agent:collect -- --package work/packages/active-YYYYMMDD-package.md`

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

## Execution Evidence

Use one executor pass plus one separate verifier-fixer pass. The verifier-fixer
may fix in-scope problems directly, then reruns focused proof.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: verification.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.

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

- Push target: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
- Pushed: `<no>`
