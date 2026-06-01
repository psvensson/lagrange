# Rolling restart benchmark load admission

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_retryable",
    "currentState": "Scaffolded from representative evidence for readiness_startup_support.",
    "nextAction": "Apply benchmark-table load admission gating to rolling restart before node restarts so readiness proof matches the actual load lane.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "test/distributed/scenarios/rolling-restart.js",
      "test/distributed/harness/__tests__/rolling-restart-scenario.test.js",
      "test/distributed/harness/__tests__/node-join-under-load-scenario.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/scenarios/table-distribution-helpers.js"
    ],
    "commitScope": [
      "test/distributed/scenarios/rolling-restart.js",
      "test/distributed/harness/__tests__/rolling-restart-scenario.test.js",
      "test/distributed/harness/__tests__/node-join-under-load-scenario.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
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
        "falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js # contract fixture: benchmark-ready admission transition gates startLoad and affected rolling-restart consumer proof",
        "regression: node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # consumer proof: shared benchmark admission behavior remains ready for node-join-under-load",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json # representative routing evidence",
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
        "npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown",
        "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown"
      ]
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected benchmark load-admission proof, then rerun canonical rolling-restart evidence before any further local runtime package.",
    "triggerEvidence": [
      "Frontier returned to startup_readiness_owner / startup_support_evidence after recent migrated packages.",
      "The predecessor diagnostic selected a concrete missing edge: rolling restart generic readiness proof does not match table-scoped benchmark load admission.",
      "This package is bounded to one local proof that aligns load admission before restart sequencing."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Patch rolling restart to gate sustained load on benchmark table admission before restarts.",
        "route": "continue-local-proof",
        "proof": [
          "node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js",
          "node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
        ]
      }
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_retryable",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Rolling restart uses benchmark-ready load nodes/table before starting sustained load, reducing startup readiness pressure and preventing zero-success load/restart recovery timeout.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_retryable",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "observablePrediction": {
    "metric": "rolling restart load admission before restart",
    "predicted": "Rolling restart waits for benchmark-ready load nodes on a benchmark partitioning table before sustained load and restart actions begin.",
    "observed": "Focused proof passed; representative rerun no longer reached zero-success benchmark admission and instead failed during initial cluster setup at rebalancer_leader / operation_scheduling before the scenario body.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json"
  },
  "causalGovernance": {
    "hypothesis": "The readiness_retryable rolling-restart failure is amplified by starting sustained load and restart actions after generic /readyz stability while the actual table-scoped load lane still rejects the default logs workload.",
    "stopConditionCheck": "`npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` plus focused tests must prove rolling restart uses benchmark table creation plus benchmark-ready load-node admission before startLoad, and representative evidence must move away from zero-success load with local_benchmark_discovery_missing admission failures.",
    "expectedCausalModelChange": "Rolling restart should route load through the same benchmark admission contract as node-join-under-load, so readiness proof and the actual load lane observe the same table readiness frontier.",
    "representativeOutcome": "migrated",
    "causalDebt": "The current representative artifact reaches load-readiness stability but sustained load records zero successful operations and table-scoped load admission failures before restart recovery times out.",
    "crossBoundaryReview": "Do not patch startup internals, active-gate diagnostics, transport, or rebalancer workflow from this package; keep changes to rolling restart scenario admission and focused harness tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart benchmark load admission",
    "phaseChain": [
      "active-gate snapshot coverage satisfied from control-plane evidence",
      "representative route migrated to startup_readiness_owner / startup_support_evidence / readiness_retryable",
      "load readiness stable evidence showed generic readiness but sustained load had zero successes and benchmark admission denials"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / readiness_retryable",
    "knownDownstreamBlockers": [
      "rolling restart recovery gate times out for a restarted node",
      "sustained load begins against a table/load-lane that is not benchmark-admitted"
    ],
    "missingCausalEdge": "Rolling restart must align its pre-restart readiness proof with table-scoped benchmark load admission.",
    "missingCausalEdgeProbe": "node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js",
    "falsifyingProbe": "node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js",
    "boundedProgressProof": "Focused tests prove benchmark table readiness, admission retry, and ready-node bounded progress gate startLoad and node restart sequencing; representative rerun proves the failure frontier moves, reduces, or goes green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "Rolling restart no longer starts restart sequencing while benchmark load admission is missing or no load node is table-admitted.",
    "maxProgressBound": "one rolling restart scenario admission slice before representative rerun",
    "sameFrontierFallback": "If fresh evidence returns the same frontier and zero-success benchmark admission failures after this change, stop for an autonomous architecture experiment instead of another local patch.",
    "expectedNextFrontier": "rebalancer_leader / operation_scheduling / priority_recovery_progress_blocked",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "This package is allowed because the previous diagnostic package selected a concrete runtime successor from canonical route evidence; no further same-frontier local patch is allowed without metric movement.",
    "handoffInvariant": "Runtime edits stay limited to rolling restart admission and focused tests unless validation names a different owner boundary.",
    "commitAndPushLedgerRequired": true
  },
  "commitAndPushLedgerRequired": true
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

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for readiness_retryable.
- Inputs/signals: test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js; regression: node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js; supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps readiness_retryable and route evidence to one emitted outcome: migrate_owner_boundary.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_retryable | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Apply benchmark-table load admission gating to rolling restart before node restarts so readiness proof matches the actual load lane. | Rolling restart uses benchmark-ready load nodes/table before starting sustained load, reducing startup readiness pressure and preventing zero-success load/restart recovery timeout. | falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
- Competing explanations: At minimum compare readiness_retryable against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_retryable, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: readiness_retryable is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
- Success metrics: Rolling restart uses benchmark-ready load nodes/table before starting sustained load, reducing startup readiness pressure and preventing zero-success load/restart recovery timeout.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_retryable`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Expected delta: Rolling restart uses benchmark-ready load nodes/table before starting sustained load, reducing startup readiness pressure and preventing zero-success load/restart recovery timeout.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_retryable`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
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

1. test/distributed/scenarios/rolling-restart.js
2. test/distributed/harness/__tests__/rolling-restart-scenario.test.js
3. test/distributed/harness/__tests__/node-join-under-load-scenario.test.js
4. work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/scenarios/rolling-restart.js`, `test/distributed/harness/__tests__/rolling-restart-scenario.test.js`, `test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`, `work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`, `regression: node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`, `supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

theory-ledger: not-needed

theory-ledger: not-applicable because related readiness theories cover prior startup support routes, while this package owns the newly selected benchmark load-admission missing edge before restart sequencing.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_readiness_owner; files-changed: test/distributed/scenarios/rolling-restart.js, test/distributed/harness/__tests__/rolling-restart-scenario.test.js, test/distributed/harness/__tests__/node-join-under-load-scenario.test.js, work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md; validation: `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`, `node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`, representative rerun `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --verbose`, and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: test/distributed/harness/__tests__/node-join-under-load-scenario.test.js; validation: `node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js` and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js
2. regression: node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
5. npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: f45810e664bb41da040fc8c2fea39c7618c2cf90
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
