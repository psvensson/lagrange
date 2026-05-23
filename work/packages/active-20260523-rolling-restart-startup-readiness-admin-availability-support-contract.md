# Rolling Restart Startup Readiness Admin Availability Support Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
  "playback": "none",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "readiness_probe_timeout",
  "currentState": "The predecessor architecture experiment selected H2: startup readiness/admin availability is now the owner boundary. Fresh evidence has active=2/5, snapshotCoverage=1/5, selected_snapshot_source_timeout still present, readiness_probe_timeout, and three admin_not_ready connection-refused inactive nodes.",
  "nextAction": "Implement explicit startup readiness/admin availability support evidence so admin_not_ready and readiness_probe_timeout inactive nodes produce a bounded owner outcome for active-gate coverage progression without runtime promotion or timeout widening.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The predecessor architecture experiment selected startup_readiness_owner / startup_support_evidence after a local active-gate snapshot projection produced no representative movement. Three inactive admin_not_ready nodes plus readiness_probe_timeout now need a first-class owner outcome before another active-gate patch can be justified.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused admin_availability_support_contract transition and active-gate consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "writeScope": [
    "test/distributed/harness/startup-readiness-evidence.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "test/distributed/harness/startup-readiness-evidence.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "work/packages/active-20260523-rolling-restart-startup-readiness-admin-availability-support-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Startup readiness/admin availability has no explicit bounded owner outcome for admin_not_ready/readiness_probe_timeout nodes, so active-gate coverage keeps treating those nodes as unresolved snapshot coverage debt.",
    "hypothesisDiscriminator": "If H2 is correct, focused proof will convert admin_not_ready/readiness_probe_timeout diagnostics into a named startup readiness support outcome consumed by active-gate projection while runtime promotion remains false; if H1 is still primary, selected snapshot timeout evidence will remain sufficient without readiness support; if H3 is true, publication and owner queue evidence will conflict with readiness diagnostics.",
    "expectedMetric": "Focused proof records an admin_availability_support_contract transition and the next representative reduces inactive_nodes below 3, migrates owner/boundary, or passes without timeout widening.",
    "inheritsFrom": "work/packages/done-20260523-rolling-restart-active-gate-snapshot-readiness-architecture-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "single-owner",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "frontier": "readiness_startup_support",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "nextAction": "Implement admin_availability_support_contract transition and active-gate consumer proof."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "The architecture experiment selected H2 because distributed failure names readiness_probe_timeout plus three admin_not_ready inactive nodes after local active-gate projection produced no representative movement.",
    "evidence": "work/packages/done-20260523-rolling-restart-active-gate-snapshot-readiness-architecture-experiment.md"
  },
  "causalGovernance": {
    "hypothesis": "Startup readiness/admin availability now owns the mixed active-gate residual: inactive admin_not_ready/readiness_probe_timeout nodes need a bounded support outcome before active-gate coverage can progress.",
    "stopConditionCheck": "Run `npm run analyze:causal-model`, the focused admin_availability_support_contract transition test, static guardrails, and a fresh rolling-restart representative before closure.",
    "expectedCausalModelChange": "Focused proof should add a named startup readiness support outcome consumed by active-gate projection; fresh representative should reduce inactive_nodes below 3, migrate owner/boundary, or pass without runtime promotion or timeout widening.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence has active=2/5, snapshotCoverage=1/5, selected_snapshot_source_timeout, readiness_probe_timeout, and three admin_not_ready connection-refused inactive nodes. Prior local active-gate projection proof stayed same-frontier, so readiness support must become explicit owner evidence.",
    "crossBoundaryReview": "Keep src/, scenario timeout budgets, runtime promotion, publication convergence, priority recovery, and selected-source retry policy frozen. This package may change startup readiness evidence and active-gate harness consumption only."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup readiness admin availability support contract",
    "phaseChain": [
      "publication convergence is closed with pendingAck=0",
      "priority recovery residuals are absent",
      "startup active-gate snapshot projection proof passed locally but representative stayed same-frontier",
      "fresh distributed failure names readiness_probe_timeout and three admin_not_ready connection-refused inactive nodes",
      "architecture experiment selected H2 startup_readiness_owner / startup_support_evidence"
    ],
    "currentFirstFrontier": "readiness_startup_support / startup_readiness_owner / startup_support_evidence / readiness_probe_timeout",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage remains incomplete until readiness/admin availability outcome is explicit",
      "runtime promotion remains unsafe while coverage is incomplete"
    ],
    "missingCausalEdge": "admin_not_ready and readiness_probe_timeout inactive nodes must emit a bounded startup readiness support outcome that active-gate coverage can consume without promoting runtime.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused admin_availability_support_contract transition and active-gate consumer proof",
    "falsifyingProbe": "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "boundedProgressProof": "Focused proof must show a bounded admin_availability_support_contract transition, retry/defer, or explicit owner-boundary migration for admin_not_ready/readiness_probe_timeout diagnostics.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "expectedObservableTransition": "Focused proof adds startup readiness support evidence and fresh representative reduces inactive_nodes below 3, migrates owner/boundary, or passes.",
    "maxProgressBound": "one causal-escalation runtime package before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence returns the same active_gate_snapshot_coverage frontier with no inactive-node reduction or owner migration, stop for architecture-gap before another local patch.",
    "expectedNextFrontier": "startup readiness support movement, owner/boundary migration, or rolling-restart green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-active-gate-snapshot-readiness-architecture-experiment / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is causal-escalation because the validator rejected a direct runtime-owner successor after repeated startup active-gate same-frontier movement.",
    "handoffInvariant": "Startup readiness support may explain inactive admin availability, but it must not imply runtime promotion or bypass snapshot coverage completion."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The predecessor architecture experiment selected H2 startup readiness/admin availability.",
      "Distributed failure names readiness_probe_timeout and three admin_not_ready inactive nodes.",
      "The previous local active-gate projection proof produced no representative metric movement."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the startup readiness admin availability support contract transition and active-gate consumer proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused admin_availability_support_contract transition and active-gate consumer proof"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use only if focused proof cannot name one bounded readiness/admin availability transition.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory canonical evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory evidence"
        ]
      }
    ],
    "nextAction": "Run focused admin_availability_support_contract proof before representative rerun."
  },
  "observablePrediction": {
    "metric": "inactive_nodes, admin_not_ready/readiness_probe_timeout owner outcome, active-gate frontier, and rolling-restart result",
    "predicted": "Focused proof records a bounded admin_availability_support_contract transition; fresh representative reduces inactive_nodes below 3, migrates owner/boundary, or passes without runtime promotion or timeout widening.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation",
    "metricDelta": 0
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
      "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
      "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused startup readiness admin availability fixture and active-gate consumer proof"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_probe_timeout",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Focused proof should classify admin_not_ready/readiness_probe_timeout inactive nodes as bounded startup readiness support evidence, let active-gate coverage progression observe that owner outcome, reduce inactive_nodes below 3, migrate owner/boundary, or pass rolling-restart without runtime promotion or timeout widening.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

The predecessor experiment selected startup readiness/admin availability as the next owner boundary after active-gate snapshot projection stayed same-frontier. This package owns the focused admin availability support contract that lets readiness evidence become explicit before active-gate coverage is reinterpreted again.

## Scope Basis

Active rolling-restart AGPL sprint package, bounded to startup readiness evidence, active-gate harness consumption, and focused fixture proof.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the validator rejected a direct runtime-owner successor after repeated active-gate frontier oscillation, so this package carries the cross-boundary handoff proof plus the focused runtime slice.
- Escalation trigger to a heavier lane: focused proof cannot name one bounded admin availability support transition or needs files outside the declared scope.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for readiness_probe_timeout.
- Inputs/signals: test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json; npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused startup readiness admin availability fixture and active-gate consumer proof; npm run audit:guideline:literals -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js; npm run audit:runtime-grammar:file -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps readiness_probe_timeout and route evidence to one emitted outcome: migrate_owner_boundary.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_probe_timeout | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Implement explicit admin_availability_support_contract evidence so admin_not_ready and readiness_probe_timeout inactive nodes produce a bounded owner outcome for active-gate coverage progression without runtime promotion or timeout widening. | Focused proof should classify admin_not_ready/readiness_probe_timeout inactive nodes as bounded startup readiness support evidence, let active-gate coverage progression observe that owner outcome, reduce inactive_nodes below 3, migrate owner/boundary, or pass rolling-restart without runtime promotion or timeout widening. | npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json |
| scope boundary | src/ | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`
- Competing explanations: At minimum compare readiness_probe_timeout against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_probe_timeout, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: readiness_probe_timeout is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`
- Success metrics: Focused proof should classify admin_not_ready/readiness_probe_timeout inactive nodes as bounded startup readiness support evidence, let active-gate coverage progression observe that owner outcome, reduce inactive_nodes below 3, migrate owner/boundary, or pass rolling-restart without runtime promotion or timeout widening.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Startup readiness/admin availability has no explicit bounded owner outcome for admin_not_ready/readiness_probe_timeout nodes, so active-gate coverage keeps treating those nodes as unresolved snapshot coverage debt.
- Hypothesis discriminator: If H2 is correct, focused proof will convert admin_not_ready/readiness_probe_timeout diagnostics into a named startup readiness support outcome consumed by active-gate projection while runtime promotion remains false; if H1 is still primary, selected snapshot timeout evidence will remain sufficient without readiness support; if H3 is true, publication and owner queue evidence will conflict with readiness diagnostics.
- Expected metric: Focused proof records an admin_availability_support_contract transition and the next representative reduces inactive_nodes below 3, migrates owner/boundary, or passes without timeout widening.
- Inherits from: `work/packages/done-20260523-rolling-restart-active-gate-snapshot-readiness-architecture-experiment.md`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`
- Expected delta: Focused proof should classify admin_not_ready/readiness_probe_timeout inactive nodes as bounded startup readiness support evidence, let active-gate coverage progression observe that owner outcome, reduce inactive_nodes below 3, migrate owner/boundary, or pass rolling-restart without runtime promotion or timeout widening.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_probe_timeout`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. test/distributed/harness/startup-readiness-evidence.js
2. test/distributed/harness/cluster-segment-7-class-4.js
3. test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js

## Out Of Scope

1. src/

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/startup-readiness-evidence.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json`, `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused admin_availability_support_contract transition and active-gate consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json
2. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-single-inactive-admin-probe-snapshot-residual-20260523T071500Z.report.json
3. npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # focused startup readiness admin availability fixture and active-gate consumer proof
4. npm run audit:guideline:literals -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js
5. npm run audit:guideline:decision-boundaries -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js
6. npm run audit:runtime-grammar:file -- test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-7-class-4.js
