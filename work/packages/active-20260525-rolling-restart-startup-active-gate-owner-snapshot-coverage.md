# Artifact Triage - startup_active_gate_owner - snapshot_coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-25",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Latest rolling-restart evidence after the resume brief routes to active_gate_snapshot_coverage with startup_active_gate_owner / snapshot_coverage / active_gate_timed_out. Priority-recovery witnesses are zero; the selected snapshot source is transport-closed with owner_reconcile_pending and snapshot_repair_deferred.",
  "nextAction": "Run an autonomous architecture experiment to distinguish selected transport closure, owner recovery wake, repair execution, or projection refresh before another runtime patch.",
  "proof": [
    "falsifier: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
    "supporting: causal route proof npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-rolling-restart-resume-activation-brief.md",
    "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-publication-handoff.js",
    "src/control-plane/publication-active-gate-handoff-contract-decision.js",
    "src/control-plane/publication-active-gate-handoff-contract-fence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js",
    "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js"
  ],
  "commitScope": [
    "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
    "work/sprints/active-2026-q2-rolling-restart-resume-activation.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "architecture-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-owner-discriminator/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 3
  },
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "architecture-stop-reason",
  "whyHighestLeverageNow": "Latest rolling-restart evidence has zero priority-recovery witnesses and exactly one first frontier: startup_active_gate_owner / snapshot_coverage. Frontier oscillation rules require an autonomous architecture experiment before another local runtime patch.",
  "causalGovernance": {
    "hypothesis": "The current active-gate snapshot coverage blocker is selected transport closure or repair-deferred owner recovery, not priority-recovery operation progress.",
    "stopConditionCheck": "Use scenario-route, active_gate_snapshot_coverage topology explanation, and `npm run analyze:causal-model` proof before any runtime files move into write scope.",
    "expectedCausalModelChange": "The experiment names exactly one selected snapshot refresh, owner recovery wake, repair execution, projection refresh, or architecture stop.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh route reports active_gate_snapshot_coverage blocked with snapshotCoverageNodeCount 1/5, active_gate_timed_out, selected_transport_closed, owner_reconcile_pending, and snapshot_repair_deferred.",
    "crossBoundaryReview": "Startup readiness remains downstream; runtime files stay candidate-only during this experiment."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage architecture discriminator",
    "phaseChain": [
      "latest rolling-restart route completed",
      "priority-recovery witnesses are zero",
      "active_gate_snapshot_coverage remains first frontier",
      "architecture discriminator selects or rejects a runtime successor"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate coverage"
    ],
    "missingCausalEdge": "Whether selected_transport_closed needs selected snapshot refresh, owner recovery wake, repair execution, or projection refresh.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The architecture experiment names one bounded owner transition such as wake, retry, repair execution, or projection refresh, or stops before runtime edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "expectedObservableTransition": "selected successor contract, owner-boundary migration, or architecture-stop decision",
    "maxProgressBound": "one architecture discriminator",
    "sameFrontierFallback": "Do not open another runtime patch; keep architecture experiment active until it selects one concrete transition.",
    "expectedNextFrontier": "selected active-gate runtime contract or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260525-tell-tale-scenario-suite-promotion-gate.md / release_gate_owner / tell_tale_suite_repeatability / same-frontier"
    ],
    "oscillationCheck": "Frontier returned to startup_active_gate_owner / snapshot_coverage after a related runtime successor, so this package is an architecture discriminator.",
    "handoffInvariant": "Startup readiness stays downstream until active-gate snapshot coverage clears, reduces, migrates, or selects a runtime contract."
  },
  "boundedExperiment": {
    "hypothesis": "H1 selected transport closure needs selected snapshot refresh; H2 owner_reconcile_pending needs an owner recovery wake; H3 snapshot_repair_deferred needs repair execution; H4 projection refresh is stale or instrumentation-only.",
    "hypothesisDiscriminator": "Topology explanation and causal route proof must select one mechanism or classify the evidence as architecture-gap before runtime promotion.",
    "expectedMetric": "selected mechanism, reason-set reduction target, owner-boundary migration, or architecture-stop result",
    "inheritsFrom": "work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md",
    "timebox": "24h",
    "mergeRequirement": "canonical route, topology explanation, causal model proof, and one selected successor or explicit architecture stop",
    "killRule": "Runtime files remain out of write scope until the experiment names one concrete wake, retry, repair, projection, or refresh transition."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected successor mechanism plus active_gate_snapshot_coverage reason set and snapshotCoverageNodeCount",
    "predicted": "one active-gate transition is selected before runtime promotion",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Run this architecture discriminator before any further startup_active_gate_owner / snapshot_coverage runtime patch.",
    "triggerEvidence": [
      "Latest route has zero priority-recovery witnesses and active_gate_snapshot_coverage as first frontier.",
      "A related active-gate runtime successor already closed with reduced evidence.",
      "The current route still has selected_transport_closed, owner_reconcile_pending, and snapshot_repair_deferred."
    ],
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Select one active-gate transition before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
        ]
      }
    ]
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Select the owner transition that moves selected_transport_closed plus repair_deferred evidence toward snapshotCoverageNodeCount=5/5, or stop before runtime edits.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

The resume activation brief was written for repeated priority-recovery
operation progress. Later rolling-restart proof made that path stale:
`test-output/reports/rolling-restart-tell-tale-green-gate.report.json` has zero
priority-recovery witnesses and routes to
`startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.

This package resumes the current sprint from the canonical active-gate
frontier, not from the obsolete operation-progress path.

## Scope Basis

Approved runtime owner-boundary follow-up for the 0.1 stabilization topology
convergence track.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: frontier oscillation requires an autonomous
  architecture discriminator before another local runtime patch. Runtime writes
  remain in `candidateRuntimeFiles` until this package names the exact owner
  transition.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / snapshot_coverage` chooses
  one bounded transition for selected transport-closed, repair-deferred
  snapshot evidence, or records an architecture-stop decision.
- Inputs/signals:
  `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`,
  `active_gate_snapshot_coverage`, `selected_transport_closed`,
  `owner_reconcile_pending`, `snapshot_repair_deferred`,
  `snapshotCoverageNodeCount=1/5`, and zero priority-recovery witnesses.
- State model or invariant: selected snapshot refresh, owner recovery, repair
  execution, or projection must advance through one owner-owned transition with
  a bounded retry/repair path; downstream startup readiness remains deferred.
- Non-goals and forbidden interpretations: do not edit startup readiness,
  publication convergence, operation workflow, timeout budgets, admission
  policy, Pro behavior, or Enterprise behavior from this package.
- Proof mapping: route, topology explanation, and causal model proof must
  select or reject a concrete transition before any runtime file moves into
  write scope.
- Wrong-slice trigger: stop if canonical route changes owner/boundary, if the
  focused proof cannot distinguish a transition, or if unchanged same-frontier
  evidence has no concrete metric movement.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns selected snapshot coverage before startup readiness consumes the failure | Select one owner transition: selected snapshot refresh, owner recovery wake, repair execution, or projection refresh | Named successor transition, owner-boundary migration, or architecture-stop result | npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Competing explanations: `selected_transport_closed` is the missing selected
  snapshot refresh; `owner_reconcile_pending` needs an owner recovery wake;
  `snapshot_repair_deferred` needs repair execution; the route is stale or
  instrumentation-only and should not trigger runtime edits.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Which active-gate owner transition moves the
  selected-transport-closed, repair-deferred snapshot path before startup
  readiness consumes the timeout?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Success metrics: selected successor mechanism, concrete count move target for
  `snapshotCoverageNodeCount` from `1/5` toward `5/5`, concrete reason-set
  reduction target that removes `selected_transport_closed`, owner-boundary
  migration, representative green, or a recorded architecture-experiment stop.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
- Expected delta: Select the bounded active-gate owner transition that can move
  selected transport-closed repair-deferred evidence, or record an
  architecture-stop result before runtime edits.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `architecture-experiment`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-owner-discriminator/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Candidate runtime files:
  `src/admin/admin-control-snapshot-publication-handoff.js`,
  `src/control-plane/publication-active-gate-handoff-contract-decision.js`,
  `src/control-plane/publication-active-gate-handoff-contract-fence.js`,
  `src/control-plane/publication-active-gate-handoff-contract.js`,
  `test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js`,
  `test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`
- Forbidden files: runtime files remain out of write scope until the package
  selects one bounded transition and passes pre-implementation validation.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [ ] action: implementation; owner: <owner>; files-changed: <paths or none>; validation: <focused proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: verification-fix; owner: <owner>; files-changed: <paths or none>; validation: <verification proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: <validated|not-needed>.

## Validation

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage`
3. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
