# Package Metadata Flattening And Proof Unification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "package_schema_and_proof_shape",
  "dominantReason": "package_ceremony_drift",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Flatten package schema and unify proof recording",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md",
    "npm run work:validate -- --pre-impl work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md",
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-theory-ledger.test.js test/scripts/work-scenario-triage.test.js test/scripts/analyze-priority-recovery-residuals.test.js test/scripts/analyze-topology-convergence.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js",
    "git diff --check -- scripts/work-package-schema.js scripts/work-context.js scripts/work-subagent-prompt.js scripts/work-tracker.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md",
    "npm run work:context"
  ],
  "theoryLedgerRefs": [],
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "Flattens package metadata schema and unifies proof structure to reduce LLM prompt token sizes."
  },
  "writeScope": [
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "AGENTS.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/generate-steering-llm-pack.js",
    "scripts/model-ledger.js",
    "scripts/work-context.js",
    "scripts/work-package-new.js",
    "scripts/work-package-schema.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-subagent-prompt.js",
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "work/RULES.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "AGENTS.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/generate-steering-llm-pack.js",
    "scripts/model-ledger.js",
    "scripts/work-context.js",
    "scripts/work-package-new.js",
    "scripts/work-package-schema.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-subagent-prompt.js",
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "work/RULES.md",
    "work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package advances the active sprint goal and current first frontier.",
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Theory Ledger

- ledger: not-needed; this package records workflow schema/parser proof and does not add or supersede a runtime theory.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
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
- Route owner: `workflow_tooling_owner`
- Route boundary: `package_schema_and_proof_shape`
- Route dominant reason: `package_ceremony_drift`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
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

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md`
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
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: repaired `scripts/work-package-schema.js` duplicate export and v2 proof-command normalization, normalized v2 package metadata in `scripts/work-context.js`, updated v2 scaffolder/context regression tests, expanded package scope, and refreshed generated blocker state with `npm run work:repair`; proof: package doctor pass, pre-impl validation pass, focused workflow TAP batch 655/655 pass, scoped `git diff --check` pass, `npm run work:context` pass; parent revalidated focused proof: yes; next: verification.
- [x] implementation falsification: status: validated; wrong-slice evidence would be `work:context` still rendering v2 package fields as unknown, proof commands missing after v2 normalization, or `scripts/work-package-schema.js` staying outside package scope; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md` pass, `npm run work:validate -- --pre-impl work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md` pass, implementation subagent Locke (`019e5437-9e8f-76f0-947b-2477a38c7025`) confirmed `scripts/work-package-schema.js` belongs in writeScope/commitScope; next: verification.
- [x] verification-fix: status: validated; evidence: verifier-fixer Franklin (`019e543d-ebc2-7061-88cc-b0852e3873aa`) ran package doctor, pre-impl validation, `npm test -- test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js`, scoped `git diff --check`, and `npm run work:context`; changed files: none; parent revalidated focused proof: yes; next: closure validation.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after package scope changes; next: verification.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md`
2. `npm run work:validate -- --pre-impl work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md`
3. `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-theory-ledger.test.js test/scripts/work-scenario-triage.test.js test/scripts/analyze-priority-recovery-residuals.test.js test/scripts/analyze-topology-convergence.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js`
4. `git diff --check -- scripts/work-package-schema.js scripts/work-context.js scripts/work-subagent-prompt.js scripts/work-tracker.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md`
5. `npm run work:context`

## Commit And Push Ledger

1. Focused package commit: 371fa6b428619609fb2445f61cb4bbdec5bbbb95
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
