# Rolling Restart Frontier Oscillation Handoff

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence remains same-frontier after the direct admin WebSocket ignorePreRestart handoff, owner-RPC replica-preferred repair read, and SQL fallback replica-preferred routing experiments. The selected snapshot source still times out with snapshotCoverage=0/5 and selected snapshot observation fields remain unknown, so the sprint now prioritizes architecture experiments that decide the missing selected-source, observation-outcome, and timeout-budget owner contract before any further runtime patch.",
  "nextAction": "Run the autonomous architecture experiment ladder: prove selected snapshot source validity, snapshot observation outcome ownership, and layered timeout-budget ownership from the latest same-frontier artifact; select the next owner contract or child package without waiting for human intervention.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260521-rolling-restart-frontier-oscillation-handoff.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260521-rolling-restart-frontier-oscillation-handoff.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-experiment-ladder/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "architecture experiment evidence is contradictory or insufficient",
      "the selected experiment requires runtime ownership changes before a child package names the owner contract",
      "owned files expand beyond package and tracker scope before the experiment selects an implementation child"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The repeated same-frontier selected_snapshot_source_timeout is not another local handoff bug; it is missing architecture ownership for selected snapshot source validity, selected snapshot observation outcome, and layered timeout-budget semantics.",
    "hypothesisDiscriminator": "If source selection is wrong, canonical evidence should show the chosen source is stale or less valid than other active candidates; if observation ownership is wrong, the selected snapshot observation fields remain unknown instead of structured retry/defer/terminal outcomes; if timeout ownership is wrong, selectedSnapshotTimeoutMs and the emitted admin timeout disagree without a single owner accounting for the nested budget.",
    "expectedMetric": "Architecture experiment selects one next owner contract or child package before runtime edits; no local runtime patch may proceed while the latest representative evidence remains snapshotCoverage=0/5 with selected_snapshot_source_timeout and unknown selected snapshot observation fields.",
    "inheritsFrom": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "timebox": "24h",
    "mergeRequirement": "canonical evidence summary, topology convergence, causal model, and an architecture decision that names the selected owner contract or marks evidence incomplete",
    "killRule": "same-frontier/no-movement evidence after a local patch blocks further runtime patches; continue autonomously through architecture-package experiments and request human input only for contradictory or insufficient evidence"
  },
  "validationTier": "cross-owner",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, proof, and no-runtime-patch rule stay as declared",
      "the executor is selecting an architecture experiment or child-package owner contract, not editing runtime",
      "canonical evidence gives a clear same-frontier, migration, architecture-gap, or evidence-incomplete signal"
    ],
    "splitTriggers": [
      "runtime source edits are needed before a child package names the owner contract",
      "proof requires raw logs or ad hoc JSON because canonical extractors are insufficient",
      "the architecture experiment cannot distinguish source validity, observation ownership, or timeout ownership"
    ],
    "childPackageCandidates": [
      "Use this package for autonomous architecture experiment selection and stop rules.",
      "Create experiment children for selected-source validity, observation contract, or timeout-budget accounting once one question is selected.",
      "Create a runtime child only after the experiment names one owner contract and smallest proof surface."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json"
    ],
    "decisionRecord": "Record architecture experiment selection in the current package or sprint edge card; open a separate child only after the experiment selects a single owner contract or proof surface.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "Do not promote runtime files from candidateRuntimeFiles until an architecture experiment names the selected owner contract, expected metric, and falsifying proof."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "widen_architecture_work",
    "stopMode": "architecture_gap",
    "nextLane": "experiment",
    "expectedDelta": "Convert repeated same-frontier/no-movement local patches into architecture experiments that select source-validity, observation-outcome, or timeout-budget ownership before any further runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the architecture experiment route",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Run architecture experiments for selected-source validity, snapshot observation outcome ownership, and timeout-budget ownership before any further runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate snapshot timeout persists because selected snapshot source validity, selected snapshot observation outcome, and nested timeout budget ownership are not represented as one architecture-owned contract.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "expectedCausalModelChange": "The next experiment selects one owner contract or marks evidence incomplete; local runtime patches remain blocked while representative evidence is same-frontier with snapshotCoverage=0/5 and selected_snapshot_source_timeout.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "selected snapshot source timeout remains timeout-only; selected snapshot observation fields are unknown; selectedSnapshotTimeoutMs and emitted admin timeout have no single owner contract.",
    "crossBoundaryReview": "Required across active-gate source selection, admin snapshot observation, query timeout accounting, and readiness support; proceed through architecture-package experiments without waiting for human intervention unless evidence is contradictory or insufficient."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress"
    ],
    "missingCausalEdge": "The selected snapshot source, selected snapshot observation outcome, and nested timeout budget must have one architecture-owned contract before active-gate snapshot coverage can consume timeout-only evidence safely.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "boundedProgressProof": "architecture experiment proves one of: stale or invalid selected source, unknown observation outcome owner gap, timeout budget owner gap, owner-boundary migration, or evidence-incomplete stop.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "expectedObservableTransition": "same-frontier/no-movement local patching -> selected architecture experiment and child owner contract before runtime edits",
    "maxProgressBound": "one architecture experiment ladder before runtime promotion",
    "sameFrontierFallback": "continue architecture-package experiments; do not request human intervention unless evidence is contradictory or insufficient",
    "expectedNextFrontier": "selected architecture experiment, owner-boundary migration, or representative-green after a later child package",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260521-startup-active-gate-admin-snapshot-timeout / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260521-topology-publication-reconcile-system-theory / topology_publication_owner / publication_convergence / same-frontier",
      "done-20260521-rolling-restart-topology-publication-owner-publication-conve / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "local-proof-falsified-same-frontier",
    "handoffInvariant": "selected snapshot source validity, observation outcome, and timeout budget ownership must be decided before another local runtime patch"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "latest artifact routes active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage after local handoff and replica-preferred routing experiments",
      "snapshotCoverage remains 0/5 with selected_snapshot_source_timeout and selected snapshot observation fields unknown",
      "publication convergence and priority recovery are satisfied, leaving the active-gate snapshot contract as the isolated frontier",
      "same-frontier/no-movement after local patches satisfies the kill rule for architecture-package experiments"
    ],
    "choices": [
      {
        "id": "selected-snapshot-source-validity",
        "summary": "Prove whether the selected source is stale, invalid, or less reachable than another active candidate before changing runtime source selection.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json"
        ]
      },
      {
        "id": "selected-snapshot-observation-contract",
        "summary": "Require selected snapshot observation to emit a structured retry/defer/terminal outcome instead of unknown fields and timeout-only silence.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json"
        ]
      },
      {
        "id": "timeout-budget-owner-contract",
        "summary": "Resolve selectedSnapshotTimeoutMs versus emitted admin timeout accounting so nested reads consume one owner-owned remaining budget.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
          "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json --markdown"
        ]
      }
    ],
    "selectedChoice": "selected-snapshot-observation-contract",
    "nextAction": "Start with the selected-snapshot-observation-contract architecture experiment, then split to selected-source validity or timeout-budget ownership only if the observation contract does not select the next owner."
  },
  "observablePrediction": {
    "metric": "architecture experiment selection after same-frontier local handoff/routing reruns",
    "predicted": "Same-frontier/no-movement representative evidence after local handoff and replica-preferred routing fixes should block further runtime patches and select an architecture-package experiment.",
    "observed": "rolling-restart-after-sql-fallback-replica-read-20260521T134018Z remains active_gate_snapshot_coverage with snapshotCoverage=0/5 and selected_snapshot_source_timeout",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "metricDelta": 0
  },
  "requiredPreImplProbe": {
    "command": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "artifact": "test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json",
    "reason": "Proves same-frontier/no-movement selected snapshot observation evidence before any runtime source edit is accepted."
  },
  "closed": "2026-05-21",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260521-rolling-restart-active-gate-replica-operation-read-routing.md"
}
-->

## Why

Latest representative evidence stayed same-frontier after the local
ignorePreRestart, owner-RPC replica-preferred, and SQL fallback
replica-preferred routing experiments. This package now owns the escalation
from local patching to architecture experiments so the sprint selects the next
owner contract without waiting for human intervention.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits an architecture-experiment outcome for active_gate_timed_out after same-frontier/no-movement local patch evidence.
- Inputs/signals: test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json.
- State model or invariant: Same-frontier evidence with snapshotCoverage=0/5, selected_snapshot_source_timeout, unknown selected snapshot observation fields, and satisfied publication/priority edges blocks further local runtime patches until an architecture experiment selects one owner contract.
- Non-goals and forbidden interpretations: Do not edit runtime source, widen timeout budgets, relax active-gate admission, or ask for a human gate while canonical evidence can still select an architecture experiment.
- Proof mapping: Canonical evidence must prove the latest same-frontier shape, then the architecture experiment must distinguish selected-source validity, observation outcome ownership, timeout-budget ownership, owner-boundary migration, or evidence-incomplete stop.
- Wrong-slice trigger: Stop or split if proof needs runtime edits before the selected owner contract is named, or if canonical extractors cannot distinguish the architecture question.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| latest representative evidence | active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | same-frontier/no-movement after local handoff and routing experiments means runtime patching is no longer the default | select architecture-package experiment | one selected owner contract or evidence-incomplete stop before runtime promotion | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json |
| selected snapshot observation | mode/state/contract/refresh/nextAction are unknown | active gate lacks a structured owner outcome for selected-source timeout | prioritize selected-snapshot-observation-contract experiment | structured retry/defer/terminal owner contract or selected child package | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json |
| scope boundary | package and tracker files only | runtime proof before contract selection means this package is the wrong slice | split to experiment child or runtime child only after owner contract selection | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes the sprint route, not runtime behavior; it prevents another local patch until the missing architecture contract is selected.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Competing explanations: selected source is stale or invalid; selected snapshot observation lacks a structured owner outcome; layered timeout budgets disagree; evidence projection is stale or insufficient.
- Systemic interaction scan: Check source selection, admin snapshot observation, query timeout budgeting, active-gate admission, readiness support, and evidence-generation before assigning the next owner slice.
- Ping-pong stop rule: Do not open another local runtime patch from same-frontier/no-movement evidence; select an architecture experiment or evidence-incomplete stop first.
- Oscillation guard: If fresh representative evidence remains same-frontier, the next action is still architecture experiment selection unless the experiment produced a concrete owner contract and child proof surface.

## Decision Experiment Gate

- Decision question: Which architecture contract must own selected snapshot source validity, selected snapshot observation outcome, and nested timeout budget before active-gate snapshot coverage can make progress?
- Architecture review: Runtime edits are blocked in this package; the selected route is an autonomous architecture-package experiment, starting with selected-snapshot-observation-contract.
- Competing hypotheses: the selected source is stale or less reachable than another candidate; the selected snapshot observation owner is missing structured retry/defer/terminal outcomes; timeout budgets are layered inconsistently; the evidence projection is stale or insufficient.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Success metrics: one selected owner contract, child package, owner-boundary migration, representative-green result, or evidence-incomplete stop before any runtime source edit.
- Representative rerun: defer until an architecture experiment selects a runtime child; use `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json` for the current route.
- Kill rule: Same-frontier/no-movement evidence after local patches keeps runtime patching blocked; continue architecture experiments without human intervention unless evidence is contradictory or insufficient.

## Bounded Experiment

- Hypothesis: The blocker is an architecture contract gap, not another local handoff/routing implementation bug.
- Hypothesis discriminator: selected-source evidence, selected snapshot observation fields, and causal budget accounting must distinguish source validity, observation ownership, timeout ownership, migration, or evidence-incomplete stop.
- Expected metric: selected architecture experiment and child owner contract before runtime promotion.
- Inherits from: `test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same-frontier/no-movement after a local patch blocks more runtime patches and keeps architecture-package experiments first
- The executor owns architecture experiment selection. A separate verifier-fixer is required before closure when tracker truth changes.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Expected delta: same-frontier/no-movement local patch evidence becomes architecture experiment selection with no runtime promotion until one owner contract is named.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction keeps the sprint in architecture experiments; human escalation is reserved for contradictory or insufficient evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `widen_architecture_work`
- Stop mode: `architecture_gap`
- Next lane: `experiment`
- Required after rerun: canonical evidence refresh, architecture experiment selection, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run the selected architecture experiment, close as architecture-gap/evidence-incomplete, or open the selected child package without a human gate unless evidence is contradictory.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Package and tracker truth that prioritizes architecture experiments.
2. Canonical representative evidence classification for the latest same-frontier artifact.
3. Selection of the first architecture experiment without human intervention.

## Out Of Scope

1. Runtime source edits.
2. Timeout increases or active-gate admission relaxation.
3. Human-gated route selection while canonical evidence can still select an architecture experiment.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `architecture-experiment-ladder/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: no runtime patch before an architecture experiment selects a child owner contract.
- Escalation triggers: canonical evidence is contradictory or insufficient; a runtime child is selected; owned files expand beyond package and tracker scope.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: architecture experiment selection; split executable children before implementation
- Safe to execute when:
1. no runtime source edits occur in this package
2. canonical evidence selects same-frontier, migration, architecture-gap, or evidence-incomplete
3. the next action is an experiment child or selected owner contract
- Split or escalate when:
1. runtime source edits are needed
2. canonical extractors cannot distinguish the architecture question
3. a child package must own one selected contract
- Candidate lower-model child packages:
1. selected-snapshot-observation-contract experiment.
2. selected-snapshot-source-validity experiment.
3. timeout-budget-owner-contract experiment.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: shifted package and current-blocker route from local runtime patching to autonomous architecture experiments using `test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`; commands passed: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json`, `npm run work:repair`, `npm run work:validate -- --pre-impl work/packages/done-20260521-rolling-restart-frontier-oscillation-handoff.md`; parent revalidated focused proof: yes; next: run the selected-snapshot-observation-contract architecture experiment before any runtime source edit.
- [x] verification-fix: status: superseded; evidence: fresh representative route `test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json` classified the stable owner/boundary as `continue_local_fix`; changed files: none in this package; parent revalidated focused proof: yes; next: successor package owns runtime proof.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker files after architecture route selection; next: pre-implementation validation.

## Commit And Push Ledger

1. Focused package commit: 26b0593c1ea8813353de6e4ec626757bdaa2458d
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-sql-fallback-replica-read-20260521T134018Z.report.json
