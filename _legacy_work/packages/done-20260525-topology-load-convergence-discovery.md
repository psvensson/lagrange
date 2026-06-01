# Topology Convergence Under Heavy Load Discovery

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "discovery",
    "scenario": "seven-node-read-write-load-transaction-recovery",
    "artifact": "test-output/reports/topology-load-baseline.report.json",
    "playback": "none",
    "owner": "diagnostics_owner",
    "boundary": "causal_analysis_framework",
    "currentState": "Scaffolding discovery package to run 7-node baseline load and analyze control-plane topology convergence",
    "nextAction": "Run representative load suite and extract causal model",
    "dominantReason": "active_gate_timed_out",
    "closed": "2026-05-25"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260525-topology-load-convergence-discovery.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/done-20260525-topology-load-convergence-discovery.md"
    ]
  },
  "gates": {
    "stabilityCredit": "instrumentation-only",
    "whyHighestLeverageNow": "Scoping the exact first-frontier topology convergence blocker under sustained load"
  },
  "modelFit": {
    "packageClass": "discovery-framing",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "regression: npm run work:advance -- --check"
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
    "hypothesis": "Under heavy load, control-plane topology convergence is blocked by startup readiness timeout because snapshot watch handoff or readiness timing is too tight.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model -- test-output/reports/topology-load-baseline.report.json to see first critical path block.",
    "expectedCausalModelChange": "None, this is a discovery package to analyze baseline convergence.",
    "representativeOutcome": "migrated",
    "causalDebt": "We have snapshotCoverageNodeCount=1/7 and snapshot timeout on node 11601fe0-72d6-5853-8590-ec2881853e72.",
    "crossBoundaryReview": "Ensure the active-gate snapshot watch, publication convergence, and readiness delay timers are reviewed under heavy load."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seven-node-read-write-load-transaction-recovery",
    "phaseChain": [
      "priority recovery is satisfied",
      "publication convergence is satisfied",
      "active_gate_snapshot_coverage remains pending due to snapshot timeout"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / diagnostics_owner / causal_analysis_framework / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness delay cause: snapshot_timeout"
    ],
    "missingCausalEdge": "Startup readiness timers need to adapt or wait longer under heavy write load.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/topology-load-baseline.report.json",
    "falsifyingProbe": "npm run work:advance -- --check",
    "boundedProgressProof": "bounded progress proof is required",
    "boundedProgressProofArtifact": "test-output/reports/topology-load-baseline.report.json",
    "expectedObservableTransition": "discovery successor is activated",
    "maxProgressBound": "discovery package only; no runtime edits",
    "sameFrontierFallback": "close as architecture-gap if load baseline cannot be stabilized",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence / startup_readiness_blocked",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
    ],
    "oscillationCheck": "no oscillation",
    "handoffInvariant": "no runtime promotion"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/topology-load-baseline.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "startup_readiness_blocked",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "active-gate snapshot timeout or startup readiness delay is resolved by opening a diagnostic-classification package",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --from-artifact test-output/reports/topology-load-baseline.report.json",
      "Update Sprint Strategy Brief under work/sprints/",
      "Update Current Edge Card under work/sprints/",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `discovery`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `diagnostics_owner`
- Route boundary: `causal_analysis_framework`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `discovery`
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

- Package class: `discovery-framing`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260525-topology-load-convergence-discovery.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: diagnostics_owner; files-changed: none; validation: npm run work:evidence-summary -- test-output/reports/topology-load-baseline.report.json and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: diagnostics_owner; files-changed: none; validation: npm run work:validate -- --closure work/packages/done-20260525-topology-load-convergence-discovery.md and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: validated.

## Validation

1. `git diff --check -- <files>`

