# Rolling Restart Snapshot Coverage Owner Reconcile Membership Publication

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Causal-escalation proof selected one executable child route: startup_active_gate_owner / snapshot_coverage must make reconcile_owner_membership_publication bounded progress for pendingReconcileCount=1, pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], while runtimePromotionAllowed remains false.",
  "nextAction": "Close this escalation package as classification-only route selection and activate the runtime child for reconcile_owner_membership_publication bounded progress.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "This is the first canonical frontier after the selected retry-floor package produced concrete movement. The previous 50ms selected-timeout symptom is gone, snapshot coverage improved to 2/5, and the remaining owner-local handoff names one actionable reconcile path for one missing published node without allowing runtime promotion.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260523-rolling-restart-snapshot-coverage-owner-reconcile-membership-publication.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "work/packages/active-20260523-rolling-restart-snapshot-coverage-owner-reconcile-membership-publication.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
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
      "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Move pendingReconcileCount=1 / reconcile_owner_membership_publication for the remaining missing published node, increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Select the executable owner contract for reconcile_owner_membership_publication before another runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "After selected-source retry-floor movement, rolling-restart is blocked by a missing startup active-gate snapshot coverage contract: pendingReconcileCount=1 and reconcile_owner_membership_publication are visible, but the owner must select the concrete producer/consumer progress edge before runtime edits resume.",
    "stopConditionCheck": "Run npm run work:evidence-summary, npm run analyze:topology-convergence -- --handoff-probe, npm --silent run analyze:causal-model, and npm run work:scenario-route on the fresh representative; select a child runtime package only if those agree on one bounded progress mechanism.",
    "expectedCausalModelChange": "This escalation changes no runtime behavior; it must select an executable child package, owner-boundary migration, architecture-gap stop, or contradictory evidence stop.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh evidence has snapshotCoverageNodeCount 2/5, activeNodeCount 4/5, selectedSnapshotObservationMode scheduled_repair, selectedSnapshotObservationState stale_usable, selectedSnapshotObservationNextAction wait, pendingReconcileCount=1, pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], membershipPublicationHandoffOutcome=published_visible/enqueued=false/retryAfterMs=0, active_gate_timeout exhausted, and active_gate_attempts exhausted 3/3.",
    "crossBoundaryReview": "Keep selected-source retry floors, publication convergence, priority recovery, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen while selecting the owner contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after selected_snapshot_late_retry_floor_contract reduced the selected timeout path",
    "phaseChain": [
      "selected-source retry floor proof passed and representative selectedSnapshotTimeoutMs is 100",
      "snapshotCoverageNodeCount increased from 0/5 to 2/5",
      "activeNodeCount increased from 0/5 to 4/5",
      "publication convergence is published with pendingAckCount=0",
      "active-gate handoff reports pendingReconcileCount=1 and nextAction=reconcile_owner_membership_publication"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "The startup active-gate owner must select whether reconcile_owner_membership_publication progress belongs to selected snapshot coverage repair, publication handoff consumption, owner cohort reconcile scheduling, or an architecture gap.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe",
    "boundedProgressProof": "The escalation must name one executable child package for reconcile_owner_membership_publication bounded progress, reconcile scheduling, or drain/advance proof, or stop as architecture-gap/contradictory before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "expectedObservableTransition": "Canonical proof selects one child runtime owner proof for reconcile_owner_membership_publication, owner-boundary migration, or architecture-gap.",
    "maxProgressBound": "causal-escalation only; no runtime edits in this package",
    "sameFrontierFallback": "If the canonical proof cannot name one contract, close as architecture-gap instead of opening another same-frontier runtime patch.",
    "expectedNextFrontier": "selected child runtime-owner-boundary package or architecture-gap",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-selected-snapshot-late-retry-floor-contract / startup_active_gate_owner / selected_snapshot_late_retry_floor_contract / reduced to snapshot_coverage",
      "done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "The frontier returned to startup_active_gate_owner / snapshot_coverage after a local selected-retry proof, so this package is causal-escalation and not another local runtime patch.",
    "handoffInvariant": "Typed reconcile_owner_membership_publication evidence may only advance through a named bounded progress mechanism; runtimePromotionAllowed remains false while snapshot coverage is incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh representative moved metrics but returned to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.",
      "The remaining handoff names reconcile_owner_membership_publication with pendingReconcileCount=1 and runtimePromotionAllowed=false.",
      "Previous adjacent packages already touched selected retry floor and owner recovery reconcile evidence."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Open the bounded runtime child for startup_active_gate_owner / snapshot_coverage / reconcile_owner_membership_publication.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory canonical evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
        ]
      }
    ],
    "nextAction": "Open the selected runtime child package."
  },
  "observablePrediction": {
    "metric": "pendingReconcileCount, pendingReconcileNodeIds, selectedSnapshotObservation mode/state/nextAction, membershipPublicationHandoffOutcome state/enqueued/retryAfterMs, route owner/boundary, and active_gate budget state",
    "predicted": "Canonical evidence will select a child package for startup_active_gate_owner / snapshot_coverage / reconcile_owner_membership_publication unless it exposes an owner-boundary migration or architecture-gap.",
    "observed": "Canonical proof selected continue-local-proof: topology handoff reports pendingReconcileCount=1, pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], requiredProgressMechanism=reconcile, and runtimePromotionAllowed=false.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-coverage-owner-reconcile-membership-publication-20260523T004025Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Make reconcile_owner_membership_publication actionable for startup active-gate snapshot coverage so the remaining missing published node can reconcile before the active-gate budgets exhaust. | Move pendingReconcileCount=1 / reconcile_owner_membership_publication for the remaining missing published node, increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes. | npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`
- Success metrics: Move pendingReconcileCount=1 / reconcile_owner_membership_publication for the remaining missing published node, increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`
- Expected delta: Move pendingReconcileCount=1 / reconcile_owner_membership_publication for the remaining missing published node, increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`
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

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-coverage-owner-reconcile-membership-publication-20260523T004025Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown`
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

- [x] implementation: status: validated; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe`, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json` selected continue-local-proof for reconcile_owner_membership_publication; parent revalidated focused proof: yes; next: closure and selected runtime child.
- [x] verification-fix: status: validated; evidence: not required because this causal-escalation package made no code, test, script, runtime contract, or tracker-truth changes beyond package/current-blocker route selection; changed files: none; parent revalidated focused proof: yes; next: closure and selected runtime child.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after activation; next: closure validation.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-snapshot-coverage-owner-reconcile-membership-publication-20260523T004025Z.report.json --fast-local --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json
7. npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown
8. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown
