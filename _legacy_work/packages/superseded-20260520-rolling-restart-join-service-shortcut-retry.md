# Rolling Restart Join Service Shortcut Retry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "superseded",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
  "playback": "none",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "readiness_inherited_active_gate_no_progress",
  "currentState": "Superseded on 2026-05-20 by architecture reset: readiness remains downstream of the shared operation-publication-active-gate lifecycle and is not the next local symptom patch.",
  "nextAction": "Close this local startup-readiness package and replace it with operation_progress resource/invariant work.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "node --test test/bootstrap/node-joining-service.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-shortcut-retry-20260520TBD.report.json --fast-local --verbose",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/superseded-20260520-rolling-restart-join-service-shortcut-retry.md",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/superseded-20260520-rolling-restart-join-service-shortcut-retry.md",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "startup-readiness/join-service-shortcut-retry/current-frontier-migration",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "write scope expands beyond join-time message-group service shortcut retry metadata or focused bootstrap proof",
      "fresh representative evidence returns the same startup readiness shape with no active-node or failure-class movement"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Join-time service shortcut failures caused by transient control-plane pressure are currently flattened into terminal errors, forcing cleanup and leaving rolling-restart at active=3/5 after publication is otherwise closed.",
    "expectedMetric": "Fresh rolling-restart keeps publication PUBLISHED and moves active readiness beyond the message-group service shortcut failure, or exposes the next startup owner boundary.",
    "inheritsFrom": "work/packages/done-20260520-topology-publication-open-pending-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement discards the experiment or escalates"
  },
  "representativeResidual": {
    "status": "superseded",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "frontier": "readiness_startup_support",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_inherited_active_gate_no_progress",
    "nextAction": "Superseded by operation_progress resource and invariant package."
  },
  "validationTier": "release-gate",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
      "node --test test/bootstrap/node-joining-service.test.js",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-shortcut-retry-20260520TBD.report.json --fast-local --verbose"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_inherited_active_gate_no_progress",
    "routeCausalOutcome": "migrated",
    "stopMode": "migrate-owner-boundary",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh rolling-restart keeps publication PUBLISHED and moves active readiness past join-time service shortcut pressure, or exposes the next startup owner boundary.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_inherited_active_gate_no_progress",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "Fresh representative rerun moved publication_ack_convergence to PUBLISHED with no pending ACK or missing-published debt; the remaining selected frontier is readiness_startup_support with active=3/5 after join-time registration failure.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --handoff-probe",
      "subagent startup-readiness trace of create-message-group shortcut failure"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The readiness no-progress stall is caused by startup join cleanup after create-message-group shortcut publication treats a retryable control-plane write result as terminal.",
    "stopConditionCheck": "Use `npm run analyze:causal-model -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`, focused bootstrap tests for retryable and terminal shortcut non-success handling, then rerun rolling-restart and route the fresh artifact.",
    "expectedCausalModelChange": "The next representative proof should keep publication PUBLISHED and either increase active readiness beyond 3/5, turn rolling-restart green, or expose a different startup owner boundary.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Baseline artifact has publication=PUBLISHED, pendingAck=0, missingPublished=0, snapshotCoverage=5/5, but active=3/5 with readiness_inherited_active_gate_no_progress and node logs showing Message group service registration shortcut returned non-success.",
    "crossBoundaryReview": "User pre-approved architectural escalation on 2026-05-20; subagents confirmed operation-workflow evidence is residual and the causal failure is the bootstrap join-admission service shortcut path."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "phaseChain": [
      "publication workflow handoff and evidence normalization cleared stale publication blockers",
      "publication owner retry-context merge moved the representative artifact to publication=PUBLISHED with pendingAckCount 0 and missingPublishedCount 0",
      "snapshot coverage is complete at 5/5, but startup readiness remains active=3/5 after join-time message-group service shortcut failure"
    ],
    "currentFirstFrontier": "readiness_startup_support / startup_readiness_owner / startup_support_evidence / readiness_inherited_active_gate_no_progress",
    "knownDownstreamBlockers": [
      "active=3/5 while publication=PUBLISHED",
      "failed join cleanup after Message group service registration shortcut returned non-success",
      "operation workflow residual retry-log witness is not the selected live blocker"
    ],
    "missingCausalEdge": "Join-time message-group service shortcut must preserve retryable control-plane write metadata so startup can defer/resume instead of terminal cleanup.",
    "missingCausalEdgeProbe": "node --test test/bootstrap/node-joining-service.test.js",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "boundedProgressProof": "Focused bootstrap tests must prove retry/defer shortcut non-success surfaces deferRetry metadata while terminal shortcut non-success remains terminal.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json",
    "expectedObservableTransition": "Fresh rolling-restart keeps publication PUBLISHED and moves active readiness beyond the shortcut failure, migrates owner boundary, or turns green.",
    "maxProgressBound": "one startup_readiness_owner / startup_support_evidence runtime slice before architecture or human escalation",
    "sameFrontierFallback": "If fresh representative evidence returns the same readiness shortcut failure with no active-node or failure-shape movement, stop for architecture or human escalation instead of another local patch.",
    "expectedNextFrontier": "representative-green, startup owner-boundary migration, or architecture-gap",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260520-topology-publication-workflow-handoff-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-topology-publication-remaining-pending-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260520-topology-publication-open-pending-runtime.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The frontier moved only after concrete publication closure in the fresh artifact; this package must prove startup retry semantics or stop.",
    "handoffInvariant": "Publication owners decide publication debt; startup readiness owns join lifecycle retry/defer behavior; operation workflow residual evidence must not be used to reinterpret startup failure."
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Publication is closed in the latest representative artifact, but load-mode
readiness stalls at active=3/5 after a join-time message-group service shortcut
failure. This package owns the startup readiness slice that preserves retryable
control-plane pressure as defer/resume evidence instead of terminal cleanup.

## Scope Basis

Rolling-restart AGPL release-gate closure; the user pre-approved architectural
escalation while driving the scenario to green.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the frontier migrated after concrete publication progress and the startup retry/defer edge is bounded to one runtime file plus focused bootstrap tests.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence preserves retry/defer metadata for transient join-time shortcut publication failures.
- Inputs/signals: test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json; node --test test/bootstrap/node-joining-service.test.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-shortcut-retry-20260520TBD.report.json --fast-local --verbose; npm run work:scenario-triage -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown.
- State model or invariant: Retryable control-plane shortcut failures surface a resumable error; non-retryable shortcut failures remain terminal.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_inherited_active_gate_no_progress | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Preserve retryability metadata for join-time message-group service shortcut failures so transient control-plane pressure defers/resumes instead of forcing terminal cleanup. | Fresh rolling-restart keeps publication PUBLISHED and moves active readiness past join-time service shortcut pressure, or exposes the next startup owner boundary. | npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`
- Competing explanations: At minimum compare readiness_inherited_active_gate_no_progress against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_inherited_active_gate_no_progress, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: readiness_inherited_active_gate_no_progress is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`
- Success metrics: Fresh rolling-restart keeps publication PUBLISHED and moves active readiness past join-time service shortcut pressure, or exposes the next startup owner boundary.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_inherited_active_gate_no_progress`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Bounded Experiment

- Hypothesis: Join-time service shortcut pressure is currently flattened into a terminal shortcut error, forcing cleanup and leaving rolling-restart at active=3/5.
- Expected metric: Fresh rolling-restart keeps publication PUBLISHED and moves active readiness beyond the shortcut failure, turns green, or exposes a different startup owner boundary.
- Inherits from: `work/packages/done-20260520-topology-publication-open-pending-runtime.md`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement discards the experiment or escalates
- Subagent sequencing is optional before implementation; use post-hoc review before merge when runtime behavior changed.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`
- Expected delta: Fresh rolling-restart keeps publication PUBLISHED and moves active readiness past join-time service shortcut pressure, or exposes the next startup owner boundary.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_inherited_active_gate_no_progress`
- Route causal outcome: `migrated`
- Stop mode: `migrate-owner-boundary`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/superseded-20260520-rolling-restart-join-service-shortcut-retry.md
2. src/bootstrap/phases/create-message-group-phase.js
3. test/bootstrap/node-joining-service.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `startup-readiness/join-service-shortcut-retry/current-frontier-migration`
- Output profile: `medium`
- Owned files: `work/packages/superseded-20260520-rolling-restart-join-service-shortcut-retry.md`, `src/bootstrap/phases/create-message-group-phase.js`, `test/bootstrap/node-joining-service.test.js`
- Forbidden files: unrelated startup admission, timeout budget, active-gate, publication, and operation-workflow rewrites.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: write scope expands beyond join-time shortcut retry metadata, or fresh representative evidence returns the same readiness shape with no active-node or failure-class movement.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json`, `node --test test/bootstrap/node-joining-service.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-shortcut-retry-20260520TBD.report.json --fast-local --verbose`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: superseded; evidence: 2026-05-20 architecture reset selected operation_progress ownership and multi-scenario invariants before another startup-readiness symptom patch; next: closure as superseded.
- [x] implementation: status: not-run; evidence: no additional local startup-readiness runtime patch was accepted because the replacement operation_progress package owns the shared lifecycle contract; parent revalidated focused proof: yes; next: successor architecture package.
- [x] repair: status: pending-successor; evidence: generated current-blocker will be refreshed after the replacement operation_progress package/sprint is installed; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json
2. node --test test/bootstrap/node-joining-service.test.js
3. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-shortcut-retry-20260520TBD.report.json --fast-local --verbose
4. npm run work:scenario-triage -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-retry-context-merge-20260520T092500Z.report.json --markdown
