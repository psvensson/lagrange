# Artifact Triage - startup_active_gate_owner - snapshot_coverage

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "evidence_missing",
    "currentState": "Control-plane activeGateSnapshotCoverage was present but the topology normalizer and handoff analyzer did not consume it as active-gate progress evidence.",
    "nextAction": "Migrate to startup_readiness_owner / startup_support_evidence / readiness_retryable after proving active-gate snapshot coverage is satisfied from control-plane evidence.",
    "closed": "2026-05-27",
    "successor": "work/packages/done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/superseded-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md",
      "scripts/analyze-topology-convergence.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-constants.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-constants.js",
      "scripts/analyze-topology-convergence.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ],
    "commitScope": [
      "work/packages/superseded-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md",
      "scripts/analyze-topology-convergence.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-constants.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
        "regression: node --test test/diagnostics/topology-convergence-graph.test.js",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
        "supporting: npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown"
      ]
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "representativeResidual": {
    "status": "classified",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "frontier": "startup_active_gate_owner / snapshot_coverage -> startup_readiness_owner / startup_support_evidence",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "evidence_missing",
    "nextAction": "Use the migrated startup readiness frontier as the next package boundary: startup_readiness_owner / startup_support_evidence / readiness_retryable."
  },
  "observablePrediction": {
    "metric": "active-gate snapshot coverage evidence attachment",
    "predicted": "Canonical route and topology extractors keep active_gate_snapshot_coverage as the first frontier with evidence_missing until the package identifies the missing producer, report attachment, or owner-boundary successor.",
    "observed": "The failed report carried complete control-plane activeGateSnapshotCoverage with 5/5 expected nodes; after normalizing that evidence, active_gate_snapshot_coverage became satisfied and the first frontier moved to readiness_startup_support.",
    "accuracy": "partial",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_retryable"
  },
  "causalGovernance": {
    "hypothesis": "Rolling restart remains blocked because active-gate snapshot coverage evidence is absent from the canonical report even though publication convergence and priority recovery are satisfied, preventing the route from proving whether startup readiness is the next real frontier.",
    "stopConditionCheck": "Canonical extractors including `npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` now route the first frontier to startup_readiness_owner / startup_support_evidence / readiness_retryable with owner_boundary_migration.",
    "expectedCausalModelChange": "The diagnostics fix consumes failureBundle.controlPlane.activeGateSnapshotCoverage as active-gate progress evidence, satisfying snapshot coverage and exposing startup readiness as the next true owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Rolling restart still fails with startup readiness support retryable after active-gate snapshot coverage is satisfied from the control-plane coverage bundle.",
    "crossBoundaryReview": "This package only repairs diagnostics/report consumption for active-gate snapshot coverage; startup readiness runtime work belongs to the successor package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage after seed-contact bounded progress fix",
    "phaseChain": [
      "bootstrap request pre-admission focused proof passed locally",
      "fresh rolling-restart still failed restarted-node recovery readiness",
      "canonical route initially migrated to active_gate_snapshot_coverage evidence_missing",
      "control-plane activeGateSnapshotCoverage was normalized as complete active-gate progress evidence",
      "canonical route migrated to startup readiness support after active-gate coverage became satisfied"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / readiness_retryable",
    "knownDownstreamBlockers": [
      "readiness_startup_support remains retryable after active-gate coverage",
      "restarted node remains reachable by bootstrap health but not admin-ready"
    ],
    "missingCausalEdge": "The topology normalizer and handoff analyzer must treat failureBundle.controlPlane.activeGateSnapshotCoverage as active-gate progress evidence so complete coverage can move the frontier to real startup readiness debt.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "boundedProgressProof": "Canonical route/evidence extractors now consume control-plane activeGateSnapshotCoverage, report snapshotCoverageComplete=true, snapshotCoverageNodeCount=5, expectedNodeCount=5, retain selected snapshot retry/deferred observation reason codes, and move the frontier to startup readiness.",
    "ownerBoundaryMigrationProof": "Migration from startup_active_gate_owner / snapshot_coverage / evidence_missing to startup_readiness_owner / startup_support_evidence / readiness_retryable is proved by topology convergence, evidence summary, scenario triage, causal model, and scenario-route output on the representative artifact after the diagnostics fix.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "Active-gate snapshot coverage evidence is attached and satisfied; the next executable slice owns startup_readiness_owner / startup_support_evidence / readiness_retryable.",
    "maxProgressBound": "one active-gate snapshot coverage classification slice before runtime promotion",
    "sameFrontierFallback": "If classification cannot find a concrete producer, report attachment, or owner-boundary successor, open an autonomous architecture experiment instead of another local runtime patch.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence / readiness_retryable",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-support.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "This package reduced the active-gate evidence_missing frontier by proving complete control-plane coverage; successor startup readiness work must explain readiness_retryable instead of returning to active-gate evidence_missing on the same artifact.",
    "handoffInvariant": "Do not change startup readiness runtime files from this package; migrate to a successor with explicit startup readiness scope."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "control-plane activeGateSnapshotCoverage satisfied snapshot coverage and exposed readiness_retryable as the first frontier",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_retryable"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_retryable",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Active-gate snapshot coverage evidence is satisfied from control-plane coverage, and the route migrates to startup_readiness_owner / startup_support_evidence / readiness_retryable.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_retryable",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for evidence_missing.
- Inputs/signals: test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps evidence_missing and route evidence to one emitted outcome: migrate_owner_boundary.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / evidence_missing | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Competing explanations: At minimum compare evidence_missing against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own evidence_missing, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: evidence_missing is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `evidence_missing`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

theory-ledger: not-needed

theory-ledger not-applicable: related active-gate theories are advisory for this artifact because the fresh representative route only proves missing active-gate snapshot coverage evidence, not a durable runtime contract; this package will record a new theory only after classification identifies a reusable owner-boundary rule or falsifies the evidence-capture route.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/analyze-topology-convergence.js,src/diagnostics/topology-convergence-normalizers.js,src/diagnostics/topology-convergence-constants.js,test/diagnostics/topology-convergence-graph.test.js; validation: topology convergence, evidence summary, scenario triage, priority residuals, causal model, scenario route, focused diagnostics test, literal guardrail, decision-boundary guardrail, runtime grammar guardrail, and diff check passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: rechecked focused diagnostics test, canonical extractors, scenario route, package doctor, and pre-impl validation after metadata repair; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md,work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md; validation: npm run work:repair passed, package doctor passed, npm run work:validate -- --pre-impl passed; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
2. node --test test/diagnostics/topology-convergence-graph.test.js
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
4. npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: 3b2bc6bd6d31e034f3c9a10ec60144842593c562
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
