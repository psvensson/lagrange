# Rolling Restart Fully Green Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "commitAndPushLedgerRequired": true,
  "intent": {
    "opened": "2026-05-25",
    "lane": "scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "currentState": "No active sprint existed after rolling-restart resume activation closed. This release-gate package starts the sprint whose success criterion is that rolling-restart is fully green.",
    "nextAction": "Run the rolling-restart representative gate and close this package only as representative-green; if the rerun is red, route the first frontier and open exactly one bounded successor while keeping the sprint active."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260525-rolling-restart-fully-green-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-fully-green.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260525-rolling-restart-fully-green-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-fully-green.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/tracks/topology-convergence.md",
      "work/releases/0.1-dependency-map.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "representativeRerunCadence": "scheduled-rerun-command",
    "whyHighestLeverageNow": "The user requested a sprint whose success criterion is rolling-restart fully green; this package creates the representative gate without authorizing runtime symptom work."
  },
  "opened": "2026-05-25",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "rolling_restart_fully_green_gate",
  "dominantReason": "representative_green_required",
  "currentState": "No active sprint existed after rolling-restart resume activation closed. This release-gate package starts the sprint whose success criterion is that rolling-restart is fully green.",
  "nextAction": "Run the rolling-restart representative gate and close this package only as representative-green; if the rerun is red, route the first frontier and open exactly one bounded successor while keeping the sprint active.",
  "proof": [
    "falsifier: contract transition fixture release_gate_owner rolling_restart_fully_green_gate representative_green_required node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose",
    "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required",
    "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
    "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/active-20260525-rolling-restart-fully-green-gate.md",
    "work/sprints/active-2026-q2-rolling-restart-fully-green.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260525-rolling-restart-fully-green-gate.md",
    "work/sprints/active-2026-q2-rolling-restart-fully-green.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md"
  ],
  "modelFit": {
    "packageClass": "scenario-release-gate",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "rolling-restart rerun is red and route requires runtime owner package",
      "representative evidence is contradictory or unavailable"
    ],
    "ambiguityScore": 2
  },
  "stabilityCredit": "local-proof-only",
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
    "frontier": "rolling_restart_fully_green_gate",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "nextAction": "Run the rolling-restart representative gate and close this package only as representative-green; if red, route the first frontier and open exactly one bounded successor while keeping the sprint active."
  },
  "representativeRerunCadence": "scheduled-rerun-command",
  "causalGovernance": {
    "hypothesis": "The sprint success criterion is full rolling-restart green; local reductions and owner-boundary migrations are insufficient for sprint closure.",
    "stopConditionCheck": "Run the representative scenario, route the artifact, evidence summary, and `npm run analyze:causal-model` before closure.",
    "expectedCausalModelChange": "The result is representative-green, or fresh evidence selects exactly one current first frontier successor while the sprint stays active.",
    "representativeOutcome": "migrated",
    "causalDebt": "The prior resume-activation sprint closed on migration/reduction evidence, not a fully green rolling-restart release gate.",
    "crossBoundaryReview": "This package performs no runtime edits; a red route must open a bounded owner/boundary successor instead of closing the sprint."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart fully green gate",
    "phaseChain": [
      "run fresh rolling-restart representative",
      "route the artifact",
      "prove representative-green or select one first frontier successor"
    ],
    "currentFirstFrontier": "release_gate_owner/rolling_restart_fully_green_gate",
    "knownDownstreamBlockers": [
      "unknown until fresh rerun routes the first frontier"
    ],
    "missingCausalEdge": "Representative-green proof is missing after the resume-activation sprint closed.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose",
    "boundedProgressProof": "The representative rerun must pass clean or use the bounded dispatch/advance route mechanism to select exactly one successor while the sprint remains active.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
    "expectedObservableTransition": "rolling-restart representative-green with active=5/5, snapshotCoverage=5/5, missingPublished=0, zero priority recovery residuals, and clean convergence",
    "maxProgressBound": "one representative rerun and canonical routing decision",
    "sameFrontierFallback": "A red rerun opens or selects one bounded successor; the sprint does not close.",
    "expectedNextFrontier": "green or one routed owner/boundary successor",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This sprint raises the closure bar to representative-green so migrated or reduced evidence is not treated as sprint completion.",
    "handoffInvariant": "The sprint cannot be marked done until rolling-restart is fully green."
  },
  "observablePrediction": {
    "metric": "rolling-restart exit status, representative route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0, priorityRecoveryWitnesses=0",
    "predicted": "fresh rerun either passes clean or routes to one first frontier successor without closing the sprint",
    "observed": "timed out and migrated to startup_active_gate_owner / snapshot_coverage with active_gate_timed_out",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json"
  },
  "whyHighestLeverageNow": "The user requested a sprint whose success criterion is rolling-restart fully green; this package creates the representative gate without authorizing runtime symptom work.",
  "boundedExperiment": {
    "hypothesis": "The current codebase can either pass rolling-restart cleanly or produce one fresh, routeable first frontier.",
    "hypothesisDiscriminator": "Representative-green requires clean scenario exit and canonical evidence with active=5/5, snapshotCoverage=5/5, missingPublished=0, zero priority recovery witnesses, and clean convergence; any red result must route to one successor.",
    "expectedMetric": "rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0, priorityRecoveryWitnesses=0",
    "inheritsFrom": "work/sprints/done-2026-q2-rolling-restart-resume-activation.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus canonical route and evidence summary",
    "killRule": "Do not close the sprint on reduced, migrated, same-frontier, classification-only, or architecture-gap evidence; open or select the one bounded successor instead."
  },
  "validationTier": "release-gate",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "release-gate routing and successor selection only",
    "safeToExecuteWhen": [
      "no runtime source edits are made in this package",
      "representative evidence is fresh and routeable",
      "a red rerun opens exactly one bounded successor before any implementation work"
    ],
    "splitTriggers": [
      "fresh evidence selects a runtime owner boundary",
      "proof requires source edits, timeout changes, or admission changes",
      "representative evidence is contradictory or unavailable"
    ],
    "childPackageCandidates": [
      "Use this package for the green gate and route decision.",
      "Create a runtime-owner-boundary child only after the route selects a concrete owner/boundary.",
      "Create an autonomous architecture experiment if same-frontier evidence repeats with no concrete reduction."
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
      "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
    ],
    "proof": {
      "commands": [
        "falsifier: contract transition fixture release_gate_owner rolling_restart_fully_green_gate representative_green_required node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
        "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json"
      ]
    }
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_fully_green_gate",
    "routeDominantReason": "representative_green_required",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Representative-green or one routed owner/boundary successor while the sprint remains active.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl work/packages/active-20260525-rolling-restart-fully-green-gate.md"
    ]
  }
}
-->

## Why

This package owns the release gate for the active sprint. The sprint success
criterion is full `rolling-restart` green, so reduced, migrated, or
classification-only evidence cannot close the sprint.

## Scope Basis

Approved stabilization workflow scope. This package changes only workflow
state, sprint ownership, and representative gate evidence. No ledger update.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package performs a fresh representative
  rerun and canonical routing decision without runtime source edits.
- Escalation trigger to a heavier lane: fresh evidence selects a concrete
  runtime owner/boundary or needs cross-owner architecture work.

## Core Logic Brief

- Canonical outcome: `release_gate_owner / rolling_restart_fully_green_gate`
  emits the package outcome for `representative_green_required`.
- Inputs/signals: fresh `rolling-restart` report, canonical route output,
  evidence summary, and causal model.
- State model or invariant: sprint closure is allowed only on
  representative-green evidence.
- Non-goals and forbidden interpretations: no runtime source edits, no timeout
  widening, no admission relaxation, and no sprint closure on migrated or
  reduced evidence.
- Proof mapping: the proof ladder must establish either representative-green or
  exactly one routed successor package.
- Wrong-slice trigger: if fresh evidence selects a runtime owner/boundary, split
  to a successor package before implementation.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | release_gate_owner / rolling_restart_fully_green_gate / representative_green_required | the release gate owns the sprint success decision | close only as representative-green, or keep the sprint active and route one successor | green or one selected first frontier | `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose` |
| scope boundary | workflow state and representative evidence only | runtime fixes require a successor package | stop, split, or migrate owner boundary | no source edits in this package | `npm run work:validate -- --pre-impl work/packages/active-20260525-rolling-restart-fully-green-gate.md` |

- Anti-symptom rationale: this package sets the green gate and route decision;
  it does not patch downstream symptoms.
- Falsifying focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose`
- Competing explanations: fresh evidence may be green, repeat active-gate
  snapshot coverage, select operation workflow progress again, or expose a new
  owner boundary.
- Systemic interaction scan: review producer, consumer, admission/gating,
  retry/lifecycle, and evidence-generation effects before assigning a successor.
- Ping-pong stop rule: do not bounce between adjacent owners on unchanged
  evidence; require fresh route evidence before opening implementation work.
- Oscillation guard: if the same frontier repeats with no concrete reduction,
  select an autonomous architecture experiment rather than another local patch.

## Decision Experiment Gate

- Decision question: is `rolling-restart` fully green now, and if not, what
  exact owner/boundary is the first blocker?
- Architecture review: before runtime edits, classify the red result by owner,
  boundary, contract, architecture route, or human review for
  blocked/contradictory evidence.
- Competing hypotheses: the current build is green; active-gate snapshot
  coverage remains first; operation workflow progress remains first; a new
  route appears under fresh evidence.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose`
- Success metrics: clean scenario exit, canonical route green, `active=5/5`,
  `snapshotCoverage=5/5`, `missingPublished=0`, zero priority-recovery
  residual witnesses, and clean convergence.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
- Kill rule: unchanged same-frontier/no-reduction evidence must stop or escalate
  to an autonomous architecture route; changed red evidence keeps the sprint
  active and opens exactly one routed successor instead of closing the sprint.

## Bounded Experiment

- Hypothesis: the current codebase can either pass `rolling-restart` cleanly or
  produce one routeable first frontier for follow-up.
- Hypothesis discriminator: representative-green requires clean exit and
  canonical evidence with `active=5/5`, `snapshotCoverage=5/5`,
  `missingPublished=0`, zero priority-recovery witnesses, and clean convergence.
- Expected metric: exit status, route outcome, active coverage, snapshot
  coverage, publication gap, and priority-recovery residual count.
- Inherits from: `work/sprints/done-2026-q2-rolling-restart-resume-activation.md`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: fresh representative rerun plus canonical route and
  evidence summary.
- Kill rule: do not close on reduced, migrated, same-frontier,
  classification-only, or architecture-gap evidence.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Expected delta: representative-green, or one selected first frontier for a
  successor package while this sprint remains active.
- Local proof class: workflow-state proof only; it is not representative-green
  proof.
- Representative proof class: fresh `rolling-restart` rerun with canonical
  routing and evidence summary.
- Stop if unchanged: same-frontier with no concrete metric movement opens or
  selects an autonomous architecture experiment.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json`
- Route owner: `release_gate_owner`
- Route boundary: `rolling_restart_fully_green_gate`
- Route dominant reason: `representative_green_required`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current
  Edge Card update, current-blocker refresh, and validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: keep classification in this package unless route truth
  changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: only a stable routed owner/boundary moves to runtime
  work.

## In Scope

1. `work/packages/active-20260525-rolling-restart-fully-green-gate.md`
2. `work/sprints/active-2026-q2-rolling-restart-fully-green.md`
3. `work/sprints/current-blocker.json`
4. `work/sprints/current-blocker.md`
5. `work/tracks/topology-convergence.md`
6. `work/releases/0.1-dependency-map.md`

## Out Of Scope

1. Runtime source edits.
2. Timeout widening.
3. Admission relaxation.
4. Sprint closure before representative-green proof.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: release_gate_owner; files-changed: none; validation: fresh representative rerun plus canonical route and evidence summary, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: release_gate_owner; files-changed: none; validation: fresh representative rerun plus canonical route and evidence summary, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose`
2. `npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json`
5. `npm run work:validate -- --pre-impl work/packages/active-20260525-rolling-restart-fully-green-gate.md`
6. `npm run work:validate -- --closure work/packages/active-20260525-rolling-restart-fully-green-gate.md`

## Commit And Push Ledger

1. Focused package commit: 52ba252373d225c7cb91113d6fba5d527dc84aba
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
