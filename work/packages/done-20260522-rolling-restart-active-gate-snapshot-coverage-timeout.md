# Rolling Restart Active Gate Snapshot Coverage Timeout

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused admin/harness proof and static guardrails are green. The selected-source retry budget is bounded and the active-gate snapshot projection consumer now accepts wait_owner_recovery pendingRecoveryNodeIds, but the fresh rolling-restart representative still returns active_gate_snapshot_coverage with snapshotCoverage=0/5, selectedSnapshotError after 50ms, repair_deferred/retry evidence, pendingRecoveryNodeIds=11601fe0-72d6-5853-8590-ec2881853e72, publication convergence ready, and runtimePromotionAllowed=false.",
  "nextAction": "Stop local runtime patching for this package and open architecture analysis for the unchanged active_gate_snapshot_coverage frontier.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "The package exhausted the one bounded wait_owner_recovery consumer fix allowed by the max progress bound. The fresh representative still has the same owner, boundary, dominant reason, snapshotCoverage=0/5, and a bounded selected timeout, so the highest-leverage next step is architecture analysis of the active-gate snapshot owner boundary rather than another local retry, timeout, or promotion change.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json && npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json --handoff-probe",
    "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-retry-budget-fix-20260522T212138Z.report.json --verbose",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --verbose"
  ],
  "writeScope": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "work/packages/done-20260522-rolling-restart-active-gate-snapshot-coverage-timeout.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json",
    "test-output/reports/rolling-restart-active-gate-snapshot-budget-fix-20260522T210103Z.report.json",
    "test-output/reports/rolling-restart-selected-retry-budget-fix-20260522T212138Z.report.json",
    "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "work/packages/done-20260522-rolling-restart-active-gate-snapshot-coverage-timeout.md",
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
      "a frozen decision must be reopened",
      "representative evidence migrates owner or boundary",
      "focused probe contradicts the timeout-budget hypothesis"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The admin repair sub-timeout is now bounded, but selected-source retry still starts with a fresh full startup probe budget after timeout/transport-closure evidence, so active-gate snapshot coverage consumes the polling window before a recovered snapshot can be observed.",
    "hypothesisDiscriminator": "H1 is proven if selected-source retry receives a bounded nested retry timeout derived from the caller probe budget and still emits a repair_deferred owner outcome on exhaustion. H2 is proven if focused probes already bound retry budget and the remaining block is outside selected-source retry. H3 is proven if representative rerun migrates to another owner despite focused proof.",
    "expectedMetric": "selected retry timeout is less than the full startup probe retry timeout while deferred selected-source outcomes keep runtimePromotionAllowed=false; representative route becomes green, reduced, or migrates to a named next frontier.",
    "inheritsFrom": "work/packages/done-20260522-rolling-restart-owner-recovery-queue-outcome-contract.md",
    "timebox": "24h",
    "mergeRequirement": "focused failing regression, admin/harness proof, static guardrails, verifier-fixer, and representative rolling-restart route",
    "killRule": "If focused proof cannot reproduce the nested budget edge or the representative returns same-frontier with no metric movement, stop for an architecture experiment instead of widening timeouts, bypassing repair, or promoting degraded coverage."
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open architecture analysis; do not add another local retry, timeout increase, or active-gate promotion change."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate snapshot timeout is a nested budget ownership bug: the admin snapshot owner starts authoritative discovery cache repair with the full caller budget, so pressure/participant failure produces timeout-only silence instead of a structured repair_deferred snapshot response.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json, the focused admin/harness regressions, static guardrails, and route the representative rerun. The representative preserved runtimePromotionAllowed=false without increasing scenario or product timeouts, but remained same-frontier with snapshotCoverage=0/5 after the bounded wait_owner_recovery consumer fix, so stop local runtime patching and open architecture analysis.",
    "expectedCausalModelChange": "Control-snapshot repair and selected-source retry observe the active-gate caller budget and reserve response/fallback time for owner-deferred snapshot outcomes under pressure.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The authoritative repair and selected retry budget fixes bounded selected-source failure to 50ms and preserved typed repair_deferred evidence. The wait_owner_recovery consumer fix is green in focused tests, but the latest representative still reports publication convergence ready, owner recovery evidence pending/write_deferred, pendingRecoveryNodeIds=11601fe0-72d6-5853-8590-ec2881853e72, snapshotCoverage=0/5, selected_snapshot_source_timeout, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Keep the edit inside admin control-snapshot budget ownership. Do not edit publication convergence, startup readiness, admission, priority recovery, harness scenario timeouts, or active-gate runtime promotion unless fresh canonical evidence migrates owner/boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage selected admin snapshot timeout",
    "phaseChain": [
      "publication convergence is ready in the fresh representative",
      "owner-recovery queue/outcome evidence is observed/write_deferred and runtimePromotionAllowed=false",
      "selected admin snapshot source is admin_health ready but selected-source retry returns repair_deferred selected_timeout after the bounded 50ms budget",
      "canonical route remains startup_active_gate_owner / snapshot_coverage / active_gate_timed_out"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "The selected snapshot producer emits wait_owner_recovery with pendingRecoveryNodeIds and the focused consumer proof is green, but the representative still does not convert that deferred owner-recovery evidence into snapshot coverage progress.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "boundedProgressProof": "The startup active-gate harness test must prove wait_owner_recovery pendingRecoveryNodeIds resolves the same deferred owner evidence path as owner-reconcile handoff while preserving runtimePromotionAllowed=false and diagnostic debt.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "expectedObservableTransition": "active-gate snapshot projection consumes pending owner recovery evidence instead of treating it as zero-coverage timeout-only debt; representative route becomes green, reduced, or migrates to a named next frontier.",
    "maxProgressBound": "one bounded wait_owner_recovery consumer fix before another architecture experiment if unchanged",
    "sameFrontierFallback": "If representative proof returns the same active_gate_snapshot_coverage timeout without metric movement, stop for architecture analysis rather than adding retries, raising timeouts, or changing promotion gates.",
    "expectedNextFrontier": "architecture analysis of why pending owner-recovery evidence still leaves snapshotCoverage=0/5",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260522-rolling-restart-load-readiness-snapshot-force-repair / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260522-rolling-restart-selected-timeout-handoff-contract / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260522-rolling-restart-owner-recovery-queue-outcome-contract / startup_active_gate_owner / owner_recovery_queue_outcome_contract / reduced",
      "fresh representative after wait_owner_recovery consumer remains active_gate_snapshot_coverage with selected_snapshot_source_timeout and snapshotCoverage=0/5"
    ],
    "oscillationCheck": "frontier oscillation acknowledged; causal-escalation lane selected and this package proves the cross-step budget handoff before another local runtime patch",
    "handoffInvariant": "Degraded selected-source or repair-deferred evidence may return a structured deferred snapshot and schedule owner work, but must not promote the active gate while snapshot coverage is incomplete."
  },
  "recentFrontierHistory": [
    "startup_active_gate_owner / snapshot_coverage returned after owner-recovery queue/outcome reduction",
    "topology_publication_owner / publication_convergence is ready in the latest artifact",
    "startup_readiness_owner remains downstream inherited support evidence only"
  ],
  "oscillationCheck": "causal-escalation selected; the producer-consumer budget edge and wait_owner_recovery consumer are now proven locally, and the unchanged representative requires architecture analysis before another local patch.",
  "handoffInvariant": "Caller query budgets own nested repair budgets; repair pressure may defer but must return one typed owner outcome and must not allow runtime promotion from degraded coverage.",
  "requiredPreImplProbe": {
    "command": "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json && npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json --handoff-probe",
    "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json",
    "reason": "Canonical extractors keep owner/boundary at active_gate_snapshot_coverage and show owner recovery evidence reduced; raw log inspection was only used because the extractors do not expose per-node repair timing or selected-source repair call budget."
  },
  "observablePrediction": {
    "metric": "non-forced authoritative repair queryTimeoutMs, selected retry timeoutMs, repairDeferred snapshot outcome, snapshotCoverageNodeCount, and representative route",
    "predicted": "Focused regressions will show non-forced repair and selected-source retry receive bounded nested budgets; representative rerun will either pass rolling-restart or move past the full-budget selected retry failure.",
    "observed": "Focused regressions passed and the selected retry budget dropped to 50ms, but the fresh representative still reports active_gate_snapshot_coverage with snapshotCoverage=0/5, selected_snapshot_source_timeout, repair_deferred/retry evidence, pendingRecoveryNodeIds present, and runtimePromotionAllowed=false.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --handoff-probe",
    "metricDelta": 0
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "architecture-package",
    "triggerEvidence": [
      "Fresh route remains startup_active_gate_owner / snapshot_coverage.",
      "The owner-recovery queue/outcome absence has been reduced to observed diagnostic evidence.",
      "The selected-source retry budget and wait_owner_recovery consumer focused proofs are green.",
      "The fresh representative remains same-frontier with snapshotCoverage=0/5 and no coverage metric movement."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Proceed with a bounded admin snapshot budget handoff proof.",
        "route": "continue-local-proof",
        "proof": [
          "focused admin and harness regressions",
          "static guardrails",
          "representative rolling-restart rerun"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use if focused proof cannot distinguish the nested budget edge or representative proof returns same-frontier/no-reduction.",
        "route": "architecture-package",
        "proof": [
          "work:evidence-summary",
          "analyze:topology-convergence --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory evidence, missing artifacts, or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "canonical route or tool failure evidence"
        ]
      }
    ],
    "nextAction": "Open architecture analysis for active-gate snapshot coverage instead of adding another local retry, timeout, or promotion change."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-timeout-20260522T204916Z.report.json --handoff-probe"
    ],
    "decisionRecord": "Record whether the representative becomes green, reduced, migrated, same-frontier, architecture-gap, or contradictory before closure.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Runtime promotion remains blocked while snapshot coverage is incomplete; this package may only reserve nested repair budget and preserve typed deferred outcomes."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "The fresh representative stayed same-frontier with snapshotCoverage=0/5 after the bounded consumer fix; open architecture analysis.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker snapshot",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl",
      "npm run work:validate -- --closure"
    ]
  },
  "representativeRerunCadence": "scheduled-rerun-command",
  "codeQualityAdmission": {
    "reason": "preserves-owner-outcomes",
    "evidence": "The change preserves typed repair_deferred owner outcomes under pressure instead of allowing timeout-only selected snapshot failure or degraded active-gate promotion."
  },
  "validationTier": "cross-owner",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded causal-escalation execution after selected local-proof route",
    "safeToExecuteWhen": [
      "the write scope stays within admin control-snapshot budget ownership and its focused regression",
      "the fix does not widen timeouts, bypass authoritative repair, or allow degraded active-gate promotion",
      "the representative rerun is routed before closure"
    ],
    "splitTriggers": [
      "proof needs publication, readiness, priority recovery, admission, or harness timeout edits",
      "focused evidence contradicts the nested budget hypothesis",
      "representative rerun returns same-frontier with no metric movement"
    ],
    "childPackageCandidates": [
      "Use a separate architecture experiment if the budget edge is disproven.",
      "Use a successor runtime-owner-boundary package only if representative evidence migrates to a new concrete owner/boundary."
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-rolling-restart-active-gate-snapshot-architecture-analysis.md"
}
-->

## Why

Rolling-restart is still blocked by active-gate snapshot coverage after the
owner-recovery queue/outcome contract was made visible. The latest canonical
evidence keeps the first frontier at `startup_active_gate_owner /
snapshot_coverage`; the selected-source retry budget is now bounded and the
`wait_owner_recovery` consumer proof is green, but the representative still has
`snapshotCoverage=0/5` and no coverage metric movement. This package therefore
stops local runtime patching and hands off to architecture analysis.

## Scope Basis

This package follows the AGPL roadmap release-gate workflow for the existing
rolling-restart scenario. It is a causal-escalation slice because the same
frontier returned after prior reductions.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the owner and boundary are stable, but the
  repeated frontier requires a focused producer-consumer proof before another
  runtime edit.
- Escalation trigger: any need to edit publication, readiness, priority
  recovery, admission, scenario timeout policy, or active-gate promotion.

## Core Logic Brief

- Canonical outcome: control-snapshot repair and selected-source retry both
  derive nested timeouts from the active-gate caller budget and return one
  typed deferred owner outcome under pressure or transient transport closure.
- Inputs/signals: fresh representative artifact, handoff probe, selected retry
  timeout budget, selected transport-closed error, repair pressure cause chain,
  focused admin and harness regressions.
- State model or invariant: repair pressure or selected-source transport
  closure may defer and schedule owner work; incomplete snapshot coverage must
  never promote the active gate.
- Non-goals and forbidden interpretations: do not raise scenario/product
  timeouts, bypass repair, reinterpret publication readiness, or mark degraded
  coverage as ready.
- Proof mapping: focused admin test for the authoritative repair budget edge,
  focused harness tests for selected retry budget behavior, static guardrails,
  focused `wait_owner_recovery` consumer tests, then a fresh rolling-restart
  rerun.
- Wrong-slice trigger: if proof needs another owner or the representative stays
  unchanged with no reduction, stop for architecture instead of widening
  retries or timeouts.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| selected retry timeout | admin_health ready source returns deferred selected-source evidence with retryAfterMs `30000` | selected source can answer health but retry starts with a full startup probe budget | reserve selected retry budget and return typed deferred evidence sooner | full-budget retry failure moves or disappears | harness selected retry regression |
| repair pressure evidence | `query_participant_failure` / `control_plane_backpressure` with ready local transport | authoritative repair can defer safely without promotion | `repair_deferred` local snapshot | caller receives typed deferred outcome before full query timeout | admin/harness tests |
| active-gate coverage | `snapshotCoverage=0/5` | degraded evidence is not readiness evidence | `runtimePromotionAllowed=false` | no promotion while coverage incomplete | handoff probe and representative route |

- Anti-symptom rationale: the package changes nested budget ownership for the
  selected admin snapshot owner; it does not add retry count, increase
  timeouts, or change promotion rules.
- Falsifying focused probe: `npm test --
  test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
  test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`.
- Competing explanations: wrong selected source, stale diagnostics, publication
  regression, readiness-only failure, or owner-recovery queue regression.
- Systemic interaction scan: admin snapshot repair, selected-source fallback,
  active-gate promotion guard, harness snapshot coverage, and reporting route.
- Ping-pong stop rule: unchanged same-frontier/no-reduction after proof opens
  an architecture experiment, not another local runtime patch.
- Oscillation guard: this is not another same-frontier symptom patch because
  the prior owner-recovery queue/outcome gap was reduced and this package
  proves one distinct budget handoff contract inside the selected owner
  boundary.

## Decision Experiment Gate

- Decision question: do bounded nested budgets for both authoritative repair
  and selected-source retry let the admin snapshot owner return deferred owner
  evidence without consuming the active-gate polling window?
- Architecture review: continue local proof only for owner
  `startup_active_gate_owner`, boundary `snapshot_coverage`, route
  `continue-local-proof`, and the admin/harness control-snapshot budget
  contract; all
  adjacent owners stay frozen unless a later architecture or human review is
  selected by canonical evidence.
- Competing hypotheses: nested selected-retry budget bug; selected-source
  choice bug; diagnostics-only classification gap; downstream readiness-only
  blocker.
- Pre-edit focused probe: `npm test --
  test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`.
- Success metrics: concrete metric reduction: focused regressions pass; repair
  and retry sub-budget counts are less than their full caller timeout counts;
  `selectedSnapshotTimeoutMs`/`retryAfterMs` dropping below `30000`; degraded
  coverage still does not promote; the representative route records
  representative-green, owner/boundary migration, count improvement, or a named
  frontier move.
- Representative rerun: `node test/distributed/run.js --config
  test/distributed/config/local.json --scenario rolling-restart --output
  test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json
  --verbose`.
- Kill rule: unchanged same-frontier/no-reduction stops for architecture;
  human escalation is only for contradictory evidence or blocked tooling.

## Execution Evidence

- [x] implementation: status: validated; evidence:
  focused proof passed 122/122, static guardrails passed, and representative
  `test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json`
  routed to `startup_active_gate_owner / snapshot_coverage /
  active_gate_timed_out` with `snapshotCoverage=0/5`, selected timeout `50ms`,
  `repair_deferred`, `wait_owner_recovery`, pending recovery node
  `11601fe0-72d6-5853-8590-ec2881853e72`, and
  `runtimePromotionAllowed=false`; parent revalidated focused proof: yes; next:
  open architecture analysis instead of another local runtime patch.
- [x] verification-fix: status: validated; evidence: Ptolemy
  (`019e51b0-ce11-7302-a47e-4926399f041e`) verified the class-4
  `wait_owner_recovery` consumer remains bounded to snapshot
  observation/projection and still requires `runtimePromotionAllowed !== true`,
  verified the class-5 selected retry budget uses a reduced nested retry
  timeout, reran focused proof 122/122, literal/decision-boundary/runtime
  grammar checks, and `git diff --check`; changed files: none; parent
  revalidated focused proof: yes; next: close this package as architecture
  handoff.
- [x] repair: status: validated; evidence: `npm run work:repair`,
  `npm run work:package:doctor -- --suggest
  work/packages/done-20260522-rolling-restart-active-gate-snapshot-coverage-timeout.md`,
  and `npm run work:validate -- --pre-impl` passed after the representative
  rerun evidence update; parent revalidated focused proof: yes; next: run
  closure validation and open architecture successor.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `src/admin/admin-control-snapshot-class-part-2.js`,
  `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`,
  `test/distributed/harness/cluster-segment-7-class-4.js`,
  `test/distributed/harness/cluster-segment-7-class-5.js`, focused harness
  tests, and this package.
- Forbidden files: publication convergence, startup readiness, priority
  recovery, admission, harness timeout policy, and active-gate promotion gates.
- Escalation triggers: proof needs another owner, focused probe contradicts the
  nested budget hypothesis, or representative rerun is unchanged same-frontier
  with no metric movement. The final trigger fired for the fresh representative,
  so no further local runtime patch belongs in this package.

## Validation

1. `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
2. `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
3. `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
4. `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/cluster-segment-7-class-5.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-retry-budget-fix-20260522T212138Z.report.json --verbose`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --verbose`
7. `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json`
8. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --handoff-probe`
9. `npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`

## Commit And Push Ledger

1. Focused package commit: d6a4a667553c43c8f23a80f50917fa138bdf073d
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
