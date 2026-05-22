# Stability Credit Progress Labels

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "representative_progress_accounting",
  "dominantReason": "local_work_can_mask_release_gate_progress",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Add stability-credit labels to package metadata and validation so package progress is classified as representative-green, representative-migrated, representative-reduced, local-proof-only, or instrumentation-only.",
  "stabilityCredit": "local-proof-only",
  "proof": [
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js",
    "npm run work:package:schema",
    "npm run work:validate -- --pre-impl work/packages/done-20260522-stability-credit-progress-labels.md"
  ],
  "writeScope": [
    "scripts/work-tracker.js",
    "scripts/work-package-schema.js",
    "work/templates/work-package-template.md",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "scripts/work-tracker.js",
    "scripts/work-package-schema.js",
    "work/templates/work-package-template.md",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js"
  ],
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "mechanical edits only; no behavior or ownership decisions",
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
      "Keep docs/templates/schema metadata edits in this Spark-safe package.",
      "Split any runtime or test behavior into a separate package before execution."
    ]
  },
  "predecessor": "work/packages/done-20260522-network-partition-split-brain-startup-active-gate-owner-snap.md",
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The tracker can currently distinguish valid package shape from invalid package
shape, but it does not make stability movement the first-class accounting unit.
This package owns the workflow/tooling change that labels each package by the
kind of representative progress it earns.

## Scope Basis

Current sprint focus: universal owner-contract completion and release-gate
stability. This is workflow/tooling-only AGPL maintenance; it does not change
runtime behavior or representative evidence.

## Detailed Execution Contract

1. Add a `stabilityCredit` or equivalent metadata field with the accepted
   values `representative-green`, `representative-migrated`,
   `representative-reduced`, `local-proof-only`, and
   `instrumentation-only`.
2. Update package schema, templates, doctor/context output, and validation so
   runtime/scenario packages cannot hide behind local proof when no
   representative metric moved.
3. Preserve existing `scenarioCausalClosure` and `observablePrediction`
   semantics; this package adds accounting, not a second causal model.
4. Keep generated steering updates mechanical if schema text changes require
   pack regeneration.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Package doctor/context output shows stability credit separately from validation status, and scenario/runtime packages can be sorted by representative-green, migrated, reduced, local-proof-only, or instrumentation-only progress.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `representative_progress_accounting`
- Route dominant reason: `local_work_can_mask_release_gate_progress`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `mechanical-maintenance`
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

1. scripts/work-tracker.js
2. scripts/work-package-schema.js
3. work/templates/work-package-template.md
4. test/scripts/work-tracker-subagent-ledger.test.js
5. test/scripts/work-llm-usability-tools.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `scripts/work-tracker.js`, `scripts/work-package-schema.js`, `work/templates/work-package-template.md`, `test/scripts/work-tracker-subagent-ledger.test.js`, `test/scripts/work-llm-usability-tools.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js`, `npm run work:package:schema`, `npm run work:validate -- --pre-impl work/packages/done-20260522-stability-credit-progress-labels.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical edits only; no behavior or ownership decisions
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep docs/templates/schema metadata edits in this Spark-safe package.
2. Split any runtime or test behavior into a separate package before execution.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: Added stabilityCredit enum value checks and lane constraints in scripts/work-tracker.js. Added schema rendering inside scripts/work-package-schema.js. Verified all existing work-tracker unit tests pass cleanly.; parent revalidated focused proof: yes; next: verification_fix.
- [x] verification-fix: status: validated; evidence: Added 6 comprehensive unit tests validating stabilityCredit behavior in test/scripts/work-tracker-subagent-ledger.test.js. Ran and verified all 143 tests are 100% green.; changed files: scripts/work-tracker.js, scripts/work-package-schema.js, work/templates/work-package-template.md, test/scripts/work-tracker-subagent-ledger.test.js; parent revalidated focused proof: yes; next: repair.
- [x] repair: status: validated; evidence: `npm run work:repair` successfully refreshed current-blocker.json and current-blocker.md without any validation errors.; next: closure.

## Validation

1. npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js
2. npm run work:package:schema
3. npm run work:validate -- --pre-impl work/packages/done-20260522-stability-credit-progress-labels.md
