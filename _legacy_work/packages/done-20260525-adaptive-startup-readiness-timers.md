# Adaptive Startup Readiness Timers Under Load

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "runtime-owner-boundary",
    "scenario": "seven-node-read-write-load-transaction-recovery",
    "artifact": "test-output/reports/topology-load-baseline.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "currentState": "Implementing Phase 1 startup readiness backoffs and harness timeout dynamic scaling under write load",
    "nextAction": "Implement adaptive delay backoff in node-joining service",
    "dominantReason": "startup_readiness_blocked"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/cluster-segment-1.js",
      "src/bootstrap/traffic-readiness-utils.js",
      ".kiro/steering/schemas/work-package.schema.json",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "test/bootstrap/traffic-readiness-utils.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-1.js",
      "src/bootstrap/traffic-readiness-utils.js"
    ],
    "commitScope": [
      "work/packages/active-20260525-adaptive-startup-readiness-timers.md",
      "test/distributed/harness/cluster-segment-1.js",
      "src/bootstrap/traffic-readiness-utils.js",
      ".kiro/steering/schemas/work-package.schema.json",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "test/bootstrap/traffic-readiness-utils.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-reduced",
    "whyHighestLeverageNow": "Transition findings to stabilize the active_gate_snapshot_coverage first frontier under write load"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/bootstrap/traffic-readiness-utils.test.js # focused contract fixture and affected consumer proof for startup readiness backoff transition under pressure",
        "regression: npm run work:evidence-summary -- test-output/reports/topology-load-baseline.report.json # representative routing evidence for adaptive startup readiness timers"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": []
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "causalGovernance": {
    "hypothesis": "implementing adaptive startup readiness timers and scaling dynamic probe timeouts under heavy write load prevents premature timeouts and stabilizing the system under load",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/topology-load-baseline.report.json",
    "expectedCausalModelChange": "edge disappears, reduces, migrates, or contradicts the hypothesis",
    "representativeOutcome": "reduced",
    "causalDebt": "residual causal debt tracked outside local closure",
    "crossBoundaryReview": "not-due"
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seven-node-read-write-load-transaction-recovery",
    "phaseChain": [
      "harness-timeout-dynamic-scaling",
      "adaptive-delay-backoff"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / startup_readiness_blocked",
    "knownDownstreamBlockers": [
      "downstream lag"
    ],
    "missingCausalEdge": "unproven dynamic backoff on backpressure",
    "missingCausalEdgeProbe": "npm test -- test/bootstrap/traffic-readiness-utils.test.js",
    "boundedProgressProof": "focused proof of wake/retry/timeout/reconcile/drain progress",
    "boundedProgressProofArtifact": "test/bootstrap/traffic-readiness-utils.test.js",
    "expectedObservableTransition": "flat timeout delay -> doubled delay on backpressure",
    "maxProgressBound": "30000ms",
    "sameFrontierFallback": "continue-local-fix",
    "expectedNextFrontier": "done",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "falsifyingProbe": "npm test -- test/bootstrap/traffic-readiness-utils.test.js"
  },
  "observablePrediction": {
    "metric": "startup readiness convergence delay",
    "predicted": "adaptive backoff doubles sleep delay under load-line backpressure, preventing thrashing",
    "observed": "doubled sleep delay (200ms) under load-line backpressure vs normal delay (100ms) verified by tap test",
    "accuracy": "matched",
    "evidence": "test/bootstrap/traffic-readiness-utils.test.js",
    "metricDelta": 0
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

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for startup_readiness_blocked.
- Inputs/signals: Implement adaptive delay backoff in node-joining service.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps startup_readiness_blocked and route evidence to one emitted outcome: Implement adaptive delay backoff in node-joining service.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / startup_readiness_blocked | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Implement adaptive delay backoff in node-joining service | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:advance -- --check |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:advance -- --check`
- Competing explanations: At minimum compare startup_readiness_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own startup_readiness_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: startup_readiness_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:advance -- --check`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason startup_readiness_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `startup_readiness_blocked`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

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
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
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

- [x] action: implementation; owner: startup_readiness_owner; files-changed: src/bootstrap/node-joining-ready-signal-readiness.js, src/bootstrap/traffic-readiness-utils.js, test/bootstrap/traffic-readiness-utils.test.js, test/distributed/harness/cluster-segment-1.js; validation: npm test -- test/bootstrap/traffic-readiness-utils.test.js and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: test/bootstrap/traffic-readiness-utils.test.js; validation: npm test -- test/bootstrap/traffic-readiness-utils.test.js and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. `git diff --check -- <files>`

