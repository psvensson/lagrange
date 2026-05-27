# Rolling Restart Restart Recovery Seed Contact Readiness Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "admin_reachability_refused",
    "currentState": "Experiment selected H1: the restarted durable rejoin enters contacting_seed and does not receive a bootstrap response before the restart recovery gate expires.",
    "nextAction": "Open the bounded seed-contact/bootstrap-request runtime successor; repair startup readiness support so durable rejoin receives a bootstrap response or retryable bootstrap-not-ready before the recovery gate expires.",
    "closed": "2026-05-27",
    "successor": "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/bootstrap/phases/contact-seed-phase.js",
      "src/bootstrap/pipeline/join-startup-plan.js",
      "src/bootstrap/node-joining-service-segment-5.js",
      "src/control-plane/heartbeat-service-lifecycle-methods.js",
      "src/control-plane/heartbeat-service-publication-methods.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js"
    ],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md",
      "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
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
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "Restart recovery is stuck before admin runtime because durable rejoin remains in contacting_seed or readiness convergence while active-gate evidence is not attached to the representative report.",
    "hypothesisDiscriminator": "H1 seed-contact hang is selected if logs stop in contacting_seed with no bootstrap response; H2 readiness heartbeat is selected if node-state publication times out after join infrastructure; H3 instrumentation gap is selected if canonical report omits active-gate progress while playback sidecar has coverage details.",
    "expectedMetric": "selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism",
    "inheritsFrom": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md",
    "timebox": "same-turn",
    "mergeRequirement": "canonical scenario-route, causal model, distributed failure summary, and log/bundle discriminator select one successor",
    "killRule": "Do not patch startup readiness or active-gate runtime again until the experiment names a concrete phase/mechanism; otherwise close as architecture/report evidence gap."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism",
    "predicted": "selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism",
    "observed": "H1 selected. The restarted node log enters contacting_seed with startupMode=durable_rejoin/restart_reentry, retains readinessPhase=INIT and blocker control_snapshot_authority_unavailable, and has no bootstrap response before the 120000ms recovery gate; H2 and H3 remain downstream/supporting.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json plus playback log 35a891b8-c1a0-5064-9c6e-2acfba61c2a7.log"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
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
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "frontier": "startup_readiness_owner / startup_support_evidence",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "admin_reachability_refused",
    "nextAction": "Open the runtime successor for seed-contact/bootstrap-request bounded progress."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "admin_reachability_refused",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "experiment",
    "expectedDelta": "Select a concrete startup readiness runtime mechanism or architecture/report evidence stop from the fresh restarted-node INIT/admin-refused artifact.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason admin_reachability_refused",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "experimentOutcome": {
    "decision": "open-runtime-owner-boundary",
    "distinguishedHypothesis": "H1",
    "baselineArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "representativeArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "metricDelta": "discriminator selected contacting_seed/no bootstrap response before 120000ms recovery gate; readiness heartbeat publication and report attachment remain downstream/supporting",
    "nextOwner": "startup_readiness_owner",
    "nextBoundary": "startup_support_evidence",
    "nextDominantReason": "seed_contact_bounded_progress",
    "evidence": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "The fresh rolling-restart restart failure is blocked by one of three support mechanisms: seed contact did not complete, readiness heartbeat publication stalled after join infrastructure, or active-gate evidence was captured only in the playback sidecar and not attached to the report.",
    "stopConditionCheck": "Run canonical evidence-summary, scenario-triage, `npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`, priority-recovery residual extraction, and the bounded log/bundle discriminator before selecting any runtime patch.",
    "expectedCausalModelChange": "Experiment selects H1 seed-contact hang, H2 readiness heartbeat publication stall, or H3 report evidence attachment gap with a concrete successor owner and boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "The visible admin_reachability_refused symptom is downstream of a restarted node stuck in contacting_seed with no bootstrap response. The active-gate report attachment gap remains downstream/supporting until seed contact makes bounded progress.",
    "crossBoundaryReview": "Promote only the seed-contact/bootstrap-request bounded-progress path; active-gate report attachment, heartbeat publication, operation workflow, transport, and generic timeout budgets stay frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart restart recovery after startup readiness support",
    "phaseChain": [
      "startup readiness focused proof passed",
      "representative rolling-restart still failed restarted-node admin readiness",
      "active-gate report coverage was missing while playback sidecar held deferred owner-recovery evidence",
      "fresh experiment distinguishes seed contact, readiness heartbeat, and report attachment mechanisms"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / admin_reachability_refused",
    "knownDownstreamBlockers": [
      "active-gate coverage remains incomplete in canonical report",
      "restarted node remains reachable by bootstrap health but not admin-ready"
    ],
    "missingCausalEdge": "Resolved for this experiment: restarted durable rejoin is stuck in contacting_seed before readiness heartbeat publication, while active-gate report coverage remains downstream/supporting evidence.",
    "missingCausalEdgeProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "boundedProgressProof": "Experiment must name one concrete bounded progress mechanism before runtime edits: seed-contact retry/timeout hang, readiness heartbeat publication retry stall, or active-gate report attachment/reconcile gap.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "expectedObservableTransition": "Promote a runtime-owner-boundary successor for seed-contact/bootstrap-request bounded progress instead of another undifferentiated startup readiness patch.",
    "maxProgressBound": "one restart recovery discriminator",
    "sameFrontierFallback": "If the discriminator cannot select a mechanism, open an autonomous architecture/report-evidence experiment before local runtime work.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence / seed_contact_bounded_progress",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Allowed because this package is an information-first discriminator before another runtime patch.",
    "handoffInvariant": "Do not patch startup readiness, active-gate, heartbeat, transport, operation workflow, or timeout code until the experiment selects that owner boundary."
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: Restart recovery is stuck before admin runtime because durable rejoin remains in contacting_seed or readiness convergence while active-gate evidence is not attached to the representative report.
- Hypothesis discriminator: H1 seed-contact hang is selected if logs stop in contacting_seed with no bootstrap response; H2 readiness heartbeat is selected if node-state publication times out after join infrastructure; H3 instrumentation gap is selected if canonical report omits active-gate progress while playback sidecar has coverage details.
- Expected metric: selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism
- Inherits from: `work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md`
- Timebox: `same-turn`
- Validation tier: `cross-owner`
- Merge requirement: canonical scenario-route, causal model, distributed failure summary, and log/bundle discriminator select one successor
- Kill rule: Do not patch startup readiness or active-gate runtime again until the experiment names a concrete phase/mechanism; otherwise close as architecture/report evidence gap.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism
- Predicted: selected owner-boundary, phase evidence, and one concrete next runtime or report-evidence mechanism
- Observed: H1 selected. The restarted node enters `contacting_seed` with `startupMode=durable_rejoin` / `membershipLifecycleIntentType=restart_reentry`, stays `readinessPhase=INIT` with `control_snapshot_authority_unavailable`, and has no bootstrap response before the `120000ms` recovery gate.
- Accuracy: `partial`
- Evidence: `test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json` plus playback log `35a891b8-c1a0-5064-9c6e-2acfba61c2a7.log`.
- Closure compares predicted vs observed before the package can close.

## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of `writeScope` and `commitScope` until fresh evidence promotes implementation.
- Keep possible implementation files in `candidateRuntimeFiles` only.
- Subagent sequencing is optional until implementation or tracker-truth write scope is promoted.
- Verifier-fixer proof is optional while the package remains classification-only and no implementation or tracker-truth write scope is present.
- Use 2-3 canonical proof commands, then close and rerun evidence instead of adding more package ceremony.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`
- Expected delta: Select a concrete startup readiness runtime mechanism or architecture/report evidence stop from the fresh restarted-node INIT/admin-refused artifact.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `admin_reachability_refused`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
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

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

theory-ledger: not-needed

theory-ledger not-applicable: related historical theories are advisory for this discriminator; the current artifact must select seed-contact retry/timeout, readiness heartbeat publication retry, or active-gate report attachment/reconcile from fresh evidence before a new theory is recorded.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: none; validation: canonical evidence-summary, scenario-triage, causal-model, distributed-failure, topology-convergence, priority residuals, and bounded playback log discriminator selected H1 seed-contact hang; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: classification-only verifier pass; no runtime/test/script behavior changed; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: tracker repair not required before successor migration; migration transaction will refresh current blocker; parent revalidated focused proof: yes; outcome: not-needed.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: 3b2bc6bd6d31e034f3c9a10ec60144842593c562
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
