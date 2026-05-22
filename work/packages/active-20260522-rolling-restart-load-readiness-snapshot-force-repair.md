# Rolling Restart Load Readiness Snapshot Force Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_timeout",
  "currentState": "Focused load-readiness force-repair handoff proof passed, and the fresh rolling-restart representative no longer reports publication_ack_convergence first. It now fails earlier at startup active-gate snapshot coverage: publication convergence is satisfied, priority recovery invariants pass, 4/5 nodes are active, selectedSnapshotAdminReady=true via admin_health, selectedSnapshotError=snapshot_timeout, snapshotCoverage=0/5, and the selected snapshot observation is repair_deferred.",
  "nextAction": "Close this load-readiness handoff package as representative-migrated, then activate an architecture-contract successor for the selected snapshot timeout/admin_health handoff rather than another local timeout patch.",
  "stabilityCredit": "representative-migrated",
  "whyHighestLeverageNow": "The previous timeout-floor fix removed the startup active-gate timeout, but the fresh representative now fails in pre_load load-readiness because waitForLoadReadinessStability never enables forced snapshot repair. This is the narrowest owner boundary that can move snapshotCoverage from 0/5 without inflating timeouts or changing publication ownership.",
  "representativeRerunCadence": "fresh-representative-rerun",
  "proof": [
    "npm run work:validate -- --pre-impl work/packages/active-20260522-rolling-restart-load-readiness-snapshot-force-repair.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
    "PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js",
    "git diff --check"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
    "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js"
  ],
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond active-gate load-readiness snapshot coverage",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_timeout",
    "nextAction": "Use the existing snapshot/watch owner handoff-contract architecture route for selected_timeout/admin_health evidence before another local runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The fresh representative's publication_ack_convergence frontier is downstream of pre_load load-readiness snapshot coverage because waitForLoadReadinessStability never enables forced control-snapshot repair after repeated snapshot timeouts.",
    "stopConditionCheck": "Prove that load-readiness stability passes forceRepair=false before the configured repair threshold and forceRepair=true after the threshold; then run npm run analyze:causal-model and representative routing to verify snapshotCoverage moves above 0/5 or the frontier migrates.",
    "expectedCausalModelChange": "The source active-gate snapshot timeout no longer exhausts every control snapshot probe without entering the existing forced repair path.",
    "representativeOutcome": "migrated",
    "causalDebt": "The load-readiness handoff was missing and is now covered by focused proof, but the fresh representative did not reach pre_load. It migrated to startup active-gate snapshot coverage with selectedSnapshotAdminReady=true via admin_health, selectedSnapshotError=snapshot_timeout, selectedSnapshotObservation=repair_deferred, publication convergence satisfied, and runtime promotion still blocked.",
    "crossBoundaryReview": "The package-owned edge moved: publication_ack_convergence is no longer the first frontier, but active-gate snapshot coverage remains unresolved before load-readiness. Frontier oscillation and prior same-boundary packages require the snapshot/watch handoff-contract route before another local selected-source timeout patch."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The canonical first frontier is publication_ack_convergence, but the report shows publication evidence is unavailable because the pre_load active gate has snapshotCoverage=0/5, selectedSnapshotError=snapshot_timeout, selectedSnapshotAdminReady=true, and no query-success probe witnesses.",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json --handoff-probe; raw structured inspection after canonical tools showed all five snapshot probeWitnesses snapshotQuerySucceeded=false."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "Fresh representative passed the earlier startup active gate and reached pre_load load-readiness.",
      "pre_load waitForLoadReadinessStability made five load active-gate attempts.",
      "Every control snapshot witness failed while four nodes were reachable via admin_health.",
      "Publication convergence then emitted missing_published_nodes_present because publication evidence was unavailable."
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_timeout",
    "knownDownstreamBlockers": [
      "load-readiness forceRepair proof passed but fresh representative failed before pre_load",
      "publication convergence is now satisfied in the fresh representative",
      "selectedSnapshotError=snapshot_timeout with selectedSnapshotAdminReady=true",
      "selectedSnapshotObservation=repair_deferred with snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "waitForLoadReadinessStability does not pass forceRepair to _probeClusterActiveState after the configured active-wait repair threshold.",
    "missingCausalEdgeProbe": "PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
    "boundedProgressProof": "Focused retry/timer proof passed: waitForLoadReadinessStability calls _probeClusterActiveState with forceRepair=false before the active-wait repair threshold and forceRepair=true after the threshold, then closes the load-readiness stable stage on complete snapshot coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "expectedObservableTransition": "Focused probe observes _probeClusterActiveState forceRepair sequence [false,true], and representative rerun either improves snapshotCoverage above 0/5, supplies publication evidence, migrates frontier, or turns green.",
    "maxProgressBound": "one local active-gate load-readiness handoff fix",
    "sameFrontierFallback": "If a fresh representative rerun returns the same frontier with snapshotCoverage=0/5 and no forced-repair metric movement, stop and open an autonomous architecture experiment instead of another local patch.",
    "expectedNextFrontier": "snapshot/watch handoff contract route for selected_timeout/admin_health evidence, representative-green, representative-reduced, or architecture-gap stop",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260522-rolling-restart-websocket-closed-case-insensitivity-fix / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260522-rolling-restart-topology-publication-owner-publication-conve / topology_publication_owner / publication_convergence / reduced",
      "done-20260522-rolling-restart-topology-publication-owner-publication-conve-2 / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "frontier-oscillation acknowledged; causal-escalation lane selected before another local runtime edit",
    "handoffInvariant": "Publication convergence must consume owner evidence from active-gate snapshot coverage; this package may only cause load-readiness to enter the existing forced snapshot repair path, not reinterpret publication owner outcomes."
  },
  "observablePrediction": {
    "metric": "load-readiness forceRepair handoff",
    "predicted": "_probeClusterActiveState is called with forceRepair=false before the repair threshold and forceRepair=true after the threshold during waitForLoadReadinessStability.",
    "observed": "Focused test observed forceRepair sequence [false,true] during waitForLoadReadinessStability and a ready loadReadinessStableWindow after the forced repair probe. Fresh rolling-restart rerun migrated the first frontier from publication_ack_convergence to active_gate_snapshot_coverage before pre_load, with publication convergence satisfied but selectedSnapshotError=snapshot_timeout and snapshotCoverage=0/5.",
    "accuracy": "partial",
    "evidence": "PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --handoff-probe"
  },
  "requiredPreImplProbe": {
    "command": "PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js",
    "artifact": "test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
    "reason": "The oscillating frontier requires a focused producer-consumer handoff proof before runtime edits."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture beyond this selected causal-escalation handoff",
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
      "Keep the runtime change limited to the load-readiness active-gate handoff unless fresh proof changes owner or boundary."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json --handoff-probe",
      "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_timeout",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "architecture-gap-stop",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative migrated away from the load-readiness publication frontier and exposed the earlier selected_timeout/admin_health snapshot handoff; the next package should extend the snapshot/watch handoff contract before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_timeout",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

Rolling-restart now reaches `pre_load` but load-readiness stability exhausts
snapshot probes with `snapshotCoverage=0/5`. This package owns the producer
handoff that lets the existing active-gate repair path run during load-readiness
stability instead of waiting out the full representative timeout.

## Scope Basis

AGPL stability maintenance for the rolling-restart representative scenario.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: canonical routing emitted a publication frontier, but owner-boundary migration evidence shows the source blocker is pre_load active-gate snapshot coverage.
- Escalation trigger to a heavier lane: representative evidence returns the same snapshotCoverage=0/5 frontier with no forced-repair metric movement.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / snapshot_coverage` owns the producer gap behind the emitted `publication_ack_convergence` frontier.
- Inputs/signals: `test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json --handoff-probe`; `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`.
- State model or invariant: load-readiness stability must submit the same forced-repair intent to active-gate probes after the configured active-wait repair threshold that startup active waiting already uses.
- Non-goals and forbidden interpretations: Do not reinterpret publication owner outcomes, widen timeout budgets, or bypass snapshot coverage.
- Proof mapping: focused proof must show `forceRepair=false` before the threshold and `forceRepair=true` after it; representative proof must show green, migrated frontier, or concrete snapshot/publication evidence movement.
- Wrong-slice trigger: Stop if fresh representative evidence returns the same snapshotCoverage=0/5 source frontier with no forced-repair metric movement.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_timeout | active-gate snapshot coverage must produce usable control snapshot evidence before publication convergence can classify active nodes | Enable existing forced snapshot repair in the pre_load load-readiness active-gate probe loop. | focused forceRepair sequence [false,true]; representative green, frontier migration, or snapshotCoverage/publication evidence movement | npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes only the producer handoff from load-readiness stability to active-gate snapshot repair; it does not patch downstream publication symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`
- Competing explanations: Compare publication owner debt, downstream symptom lag, stale instrumentation, and wrong-owner routing against the pre_load snapshot timeout evidence before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does pre_load active-gate snapshot coverage own the producer failure behind the publication frontier, and can load-readiness enter the existing forced snapshot repair path without changing publication semantics?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: publication convergence is the true owner; active-gate snapshot coverage is the true producer blocker; instrumentation is stale or misleading; a different startup/load readiness boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`
- Success metrics: focused proof observes the forceRepair handoff; representative evidence turns green, migrates frontier, or shows concrete snapshotCoverage/publication evidence movement.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json --verbose`
- Kill rule: If fresh representative evidence returns the same snapshotCoverage=0/5 source shape with no forced-repair metric movement, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`
- Expected delta: rolling-restart turns green, migrates past pre_load snapshot timeout, or records concrete snapshotCoverage/publication evidence movement after forced repair becomes eligible.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same snapshotCoverage=0/5 source shape with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_timeout`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `fresh-representative-rerun`
- Runtime promotion rule: If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7.js`; `test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js`
- Forbidden files: files outside declared write scope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`; `npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json`
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

- [x] implementation: status: validated; evidence: added load-readiness active-gate forceRepair threshold handoff in `test/distributed/harness/cluster-segment-7.js` and focused coverage in `test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js`; `PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js` passed; `git diff --check` passed; parent revalidated focused proof: yes; next: fresh representative rerun.
- [x] guideline guardrail attempt: status: partial-unvalidated; evidence: `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js` and `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js` were attempted and failed on pre-existing whole-file violations in oversized touched files; new constants and the focused handoff were not the reported decision-boundary debt; next: do not use these failing whole-file scans as closure proof for this narrow runtime package.
- [x] verification-fix: status: validated; evidence: verified `waitForLoadReadinessStability` uses `_waitForAllActive`-aligned `activeWaitForceRepairAfter` threshold semantics and passes `_probeClusterActiveState(..., {forceRepair:false})` before threshold then `{forceRepair:true}` after threshold; confirmed no timeout widening or publication-gate bypass in the load-readiness loop; `PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js` passed (includes `Unit: waitForLoadReadinessStability enables force repair after snapshot timeout progress stalls`); `git diff --check` passed; changed files: `work/packages/active-20260522-rolling-restart-load-readiness-snapshot-force-repair.md`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: closure validation after representative rerun.

## Validation

1. npm run work:validate -- --pre-impl work/packages/active-20260522-rolling-restart-load-readiness-snapshot-force-repair.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-snapshot-source-contract-20260522T180652Z.report.json
4. PROOF=load-readiness-force-repair npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js
5. git diff --check
