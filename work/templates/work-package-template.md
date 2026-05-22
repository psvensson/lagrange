# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "read-review-doc-only|mechanical-maintenance|lightweight-maintenance|test-only-proof|diagnostic-classification|bounded-experiment|experiment|single-file-runtime|runtime-owner-boundary|scenario-release-gate|causal-escalation",
  "scenario": "scenario-or-none",
  "artifact": "path/to/latest.report.json",
  "playback": "path/to/playback-or-none",
  "owner": "canonical owner",
  "boundary": "current boundary",
  "dominantReason": "current dominant reason",
  "currentState": "one-line current state",
  "nextAction": "next proof or implementation action",
  "stabilityCredit": "representative-green|representative-migrated|representative-reduced|local-proof-only|instrumentation-only",
  "whyHighestLeverageNow": "<why highest leverage now>",
  "codeQualityAdmission": {
    "reason": "removes-duplicate-decision-paths|preserves-owner-outcomes|improves-evidence-fidelity|prevents-regression|active-guardrail-requirement",
    "evidence": "<stability-relevant effect evidence>"
  },
  "representativeRerunCadence": "fresh-representative-rerun|scheduled-rerun-command|explicit-invalid-rerun-reason|architecture-stop-reason",
  "theoryLedgerRefs": [
    "theory-YYYYMMDD-short-slug"
  ],
  "proof": [
    "Focused owner test",
    "Representative scenario rerun"
  ],
  "writeScope": [
    "src/example.js",
    "test/example.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-predecessor.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/example.js",
    "test/example.test.js",
    "work/packages/active-YYYYMMDD-package.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If this owner-boundary package is correct, the named causal edge will disappear, reduce, or migrate in the predicted way.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- path/to/latest.report.json",
    "expectedCausalModelChange": "State the exact causal edge/class expected to disappear, reduce, migrate, or contradict the hypothesis.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "State residual causal debt separately from local package closure, or explain why none remains.",
    "crossBoundaryReview": "State whether a cross-boundary review is due now, not due, or required before the next runtime package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "named scenario or focused blocker probe",
    "phaseChain": [
      "phase one",
      "phase two"
    ],
    "currentFirstFrontier": "current owner / boundary / reason",
    "knownDownstreamBlockers": [
      "blocked downstream owner or phase"
    ],
    "missingCausalEdge": "unproven handoff, wake, retry, or visibility edge",
    "missingCausalEdgeProbe": "npm test -- path/to/focused-probe.test.js",
    "boundedProgressProof": "focused proof of wake/retry/timeout/reconcile/drain progress",
    "boundedProgressProofArtifact": "path/to/focused-probe.test.js",
    "expectedObservableTransition": "before state -> after state or named classification",
    "maxProgressBound": "maximum retry/timer/dispatch bound before fallback",
    "sameFrontierFallback": "open/select autonomous architecture experiment if the probe does not move",
    "expectedNextFrontier": "expected next owner boundary after this package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "most recent owner / boundary / result",
      "previous related owner / boundary / result"
    ],
    "oscillationCheck": "state whether the frontier returned to or alternated with a recently closed related boundary",
    "handoffInvariant": "producer outcome + consumer precondition + freshness/revision/ack edge"
  },
  "observablePrediction": {
    "metric": "pre-registered numeric/state metric",
    "predicted": "state the expected observable before the probe or rerun",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation",
    "metricDelta": 0
  },
  "predecessor": "work/packages/done-predecessor.md"
}
-->

## Why

Describe the problem being solved.

## Current Edge Card

Required for scenario-driven packages and recommended whenever an LLM will
resume the package.

```text
Representative artifact:
First frontier:
Owner:
Boundary:
Selected cause:
Allowed edits:
Forbidden edits:
Required first proof:
Allowed stop modes:
```

The card is the one-screen handoff. Keep it current when canonical extractors
change owner, boundary, selected cause, or next required action.

## Scope Basis

Link the roadmap row, or state the approved existing subsystem / maintenance
scope that makes this work package valid without a roadmap change.

## Workflow Lane

Select the lightest valid lane from
`.kiro/steering/workflow-guidelines.md`.

- Selected lane:
- Why this lane is sufficient:
- Escalation trigger to a heavier lane:

## Core Logic Brief

Required for runtime owner-boundary, scenario/release-gate, and
causal-escalation packages before implementation starts. Read/review/doc-only
and lightweight maintenance packages may record `not-needed: no runtime,
scenario, or shared contract decision changes`.

- Canonical outcome:
- Inputs/signals:
- State model or invariant:
- Non-goals and forbidden interpretations:
- Proof mapping:
- Wrong-slice trigger:

## Active Sprint Isolation

Required when the package is systemic, governance, architecture-planning,
tooling, or future-sprint work while another scenario package is active.

- Active package/sprint used only as handoff context:
- Evidence that may be read but not mutated:
- Files explicitly forbidden by this package:
- Runtime architecture ideas captured as contract/backlog items:
- Activation rule before any runtime/scenario implementation:

## Higher-Order Problem Framing

Required when the package changes release-gate workflow, architecture planning,
or systemic sprint execution.

- Blocker-path ledger rows this package creates, updates, or consumes:
- Repeated owner-boundary failure or causal edge being addressed:
- Architecture contract created, updated, or required before runtime work:
- Focused fixture, extractor, or probe required before representative rerun:
- Bounded progress mechanism and maximum bound, when retryable/backpressure
  evidence is involved:
- Runtime backlog item that may activate later:
- Latest active scenario proof this package reconciles with:

## Experiment Outcome

Required at closure for `experiment` packages.

- Distinguished hypothesis: `H1|H2|H3|evidence-incomplete`
- Decision:
  `open-runtime-owner-boundary|open-architecture-experiment|open-architecture-contract|owner-boundary-migration|human-escalation|evidence-incomplete`
- Next owner:
- Next boundary:
- Evidence command or artifact:

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits:
   `npm run work:package:doctor -- --suggest <package>`,
   `npm run work:package:doctor -- --fix-dry-run <package>`,
   `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence:
   `npm run work:evidence-summary -- <artifact>` plus any focused extractor
   for this failure class.
3. Owner discovery:
   `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing:
   `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup:
   `npm run work:oversized-next -- --markdown`.

Use `theoryLedgerRefs` only as an advisory index into
`work/theory-ledger.md`; package evidence, current-blocker, and artifacts remain
the source of truth.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## Classification And Implementation Gates

Required before runtime edits for scenario-driven packages.

Classification gate:

- [ ] `work:evidence-summary` or a focused extractor identifies the selected
      owner, boundary, and cause.
- [ ] The package records which subordinate evidence must not drive edit scope.
- [ ] The package records the missing-edge probe or replayable fixture command.

Implementation gate:

- [ ] Exact candidate runtime files are known.
- [ ] Focused owner tests or fixture/probe assertions are named.
- [ ] Forbidden boundaries are listed before broad in-scope implementation
      detail.
- [ ] Runtime edits wait until the classification gate is satisfied.

Oscillating-frontier gate:

- [ ] If `architectureDecisionGate.status=watching` and
      `trigger=frontier-oscillation`, runtime edits wait for an `experiment`
      package whose `boundedExperiment.hypothesisDiscriminator` predicts
      different observables under H1 vs H2 vs H3 and whose
      `observablePrediction.predicted` is written before the probe runs.
      Human escalation is not the default route; use it only when evidence is
      contradictory, policy-blocked, credential-blocked, or unavailable.

## Classification-Only Fast Path

Use only when the package proves no implementation edit is justified.

- Metadata records `classification-only` as representative outcome, scenario
  result classification, or representative residual status.
- `writeScope` and `commitScope` contain no runtime, test, script, or report
  paths.
- Possible implementation files stay in `candidateRuntimeFiles`.
- Proof is two or three canonical commands: representative evidence, one
  focused extractor/probe, and validation or causal-model proof.
- Subagent sequencing and static runtime guardrails are optional until
  implementation write scope is promoted.
- Do not open another classification-only package from the same unchanged
  artifact unless owner/boundary, package class, or stop condition changes.

## Classification Efficiency

Use when this package is a pure classifier or when classification gates runtime
promotion.

- Default mode: `inline-gate-default`
- Separate package reason:
- Artifact budget: `one-artifact`
- Proof command budget: `two-or-three-canonical-commands`
- Commands:
  1. Representative evidence or route command
  2. Focused extractor/probe
  3. Validation or causal-model proof
- Decision record:
- Successor action:
- Runtime promotion rule: stable owner/boundary local-fix routes open a
  `runtime-owner-boundary` successor; do not open another classifier from the
  same unchanged artifact.

## Bounded Experiment

Use only for same-owner or tightly scoped hypothesis-driven slices that inherit
context from the active sprint/package and should move quickly.

- Hypothesis:
- Hypothesis discriminator:
- Expected metric:
- Inherits from:
- Timebox:
- Validation tier: `file-local|single-owner|cross-owner|release-gate`
- Merge requirement:
- Kill rule:

## Observable Prediction

Required for `experiment` packages and for watching frontier oscillation before
runtime edits resume.

- Metric:
- Predicted:
- Observed:
- Accuracy: `pending-before-observation|matched|partial|missed|contradicted`
- Evidence:

## Expected Representative Delta

Required before runtime/scenario implementation after representative evidence
drives the package.

- Baseline artifact:
- Expected metric, owner, boundary, dominant reason, or route delta:
- Local proof class:
- Representative proof class:
- Stop if unchanged:

## Rerun Decision Gate

Required for successor packages created from a representative rerun.

- Source artifact:
- Route owner:
- Route boundary:
- Route dominant reason:
- Route causal outcome:
- Stop mode:
- Next lane:
- Required after rerun: route-after-rerun, Sprint Strategy Brief update,
  Current Edge Card update, `npm run work:repair`, and
  `npm run work:validate -- --pre-impl`.

## Same-Owner Reduction Continuation

Required for scenario/release-gate and causal-escalation packages after each
focused proof or representative rerun.

- Current owner:
- Current boundary:
- Current required action:
- Prior metric:
- New metric:
- Continue this package when owner, boundary, and required action are unchanged.
- Split or create successor only when owner, boundary, required action, or
  intentional stop state changes.

Fixture-first is a phase inside this package unless the fixture proves no
runtime edit is justified, changes the selected owner/boundary/action, or
creates reusable tooling.

## In Scope

1. Item
2. Item
3. Item

## Out Of Scope

1. Item
2. Item
3. Item

## LLM Trap List

Required for scenario/release-gate and causal-escalation packages. Name the
sprint-specific mistakes that the next LLM must not repeat.

1. Do not promote subordinate evidence unless canonical extractors select it.
2. Do not patch downstream consumers while the current producer frontier is
   unsatisfied.
3. Do not widen timeout budgets or admission policy to mask a selected owner
   failure.
4. Do not evaluate publication deficits or producer states in isolation from
   active-gate reconcile handoffs, as doing so can hide structural deadlocks
   during pressure restarts.


## Invariants

1. Correctness rule that must not regress.
2. Ownership or architecture rule that must not regress.
3. Validation rule that must not regress.

## Hotspots

1. File or subsystem
2. File or subsystem
3. File or subsystem

## Model Fit

Required for active metadata-bearing packages. Use `gpt-5.3-codex-spark` only
for a bounded leaf slice; otherwise choose a package class and intended model
that records why escalation is already required.

Prefer creating new packages with `npm run work:package:new -- ...` so the
metadata, lane defaults, and Model Fit fields come from the shared schema.
Use `npm run work:package:schema` before hand-editing enum fields such as
representative outcomes, scenario result classifications, and stop conditions.

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Ambiguity score: 1
- Owned files: `path/to/owned-file`
- Forbidden files: `src/runtime-or-other-forbidden-area`
- Frozen decisions: decision that must not be reopened by this package
- Escalation triggers: condition that requires a stronger model or human split
- Focused proof: exact command or proof surface for this leaf slice

## Model-Fit Split

Required when a package is intended to be executable by a lower model. Put
route selection and ambiguity in the parent package; put only the mechanical
or preselected implementation slice here.

- Target executor: `gpt-5.3-codex-spark|gpt-5.4|gpt-5.3-codex`
- Allowed decision depth: mechanical/test-only/bounded-hypothesis/single-file-runtime
- Spawn rule: set the subagent model explicitly to the target executor; do not
  rely on inheriting a stronger parent model.
- Safe to execute when:
1. Owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared.
2. The executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence.
3. The first focused proof gives a clear pass, fail, or escalate signal.
- Split or escalate when:
1. Write scope expands beyond the declared lower-model lane.
2. Proof requires forbidden scope, cross-owner reasoning, or architecture route selection.
3. Implementation needs to decide system behavior instead of executing a named local mechanism.
- Candidate lower-model child packages:
1. `mechanical-maintenance` for docs/templates/schema/metadata.
2. `test-only-proof` for tests and fixtures.
3. `bounded-experiment` for one same-owner hypothesis.
4. `single-file-runtime` for one preselected runtime file.

## Shared Boundary Contract

Required when adding or reshaping a shared runtime boundary.

- Semantic owner:
- Canonical contract shape / vocabulary:
- Allowed consumers:
- Prohibited reinterpretations:
- Primary diagnostics / proof surfaces:

## Causal Governance

Required for scenario-driven active packages. A runtime patch may land only when
it is tied to a predicted causal-model change rather than a local symptom.

- Causal hypothesis: if this package is correct, which causal edge or class
  changes?
- Stop-condition check:
  `npm --silent run analyze:causal-model -- path/to/latest.report.json`.
- Expected causal-model change: one predicted result, such as edge disappears,
  reduced evidence, named migration, or contradiction.
- Representative outcome: one of `pending-before-rerun`,
  `representative-green`, `reduced`, `same-frontier`, `migrated`, or
  `classification-only`, `architecture-gap`, or `contradictory`.
- Causal debt: residual causal work tracked separately from package closure.
- Cross-boundary review: due/not-due/required-before-next-runtime-package, with
  the owner boundaries named.

## Scenario Causal Closure

Required for scenario-driven active packages. First-frontier migration does not
close the scenario unless the whole causal chain remains recorded.
Retryable or backpressure frontiers cannot be classified as bounded or
non-frontier with prose alone.

- Reference scenario/probe:
- Phase chain:
- Current first frontier:
  must name the same owner and boundary as package metadata. If this package is
  only a bounded diagnostic/support-role package while the first frontier stays
  elsewhere, add metadata `ownerBoundaryMigrationProof` with concrete
  `fromOwner`, `fromBoundary`, `toOwner`, `toBoundary`, `reason`, and
  `evidence` fields.
- Known downstream blockers:
- Missing causal edge:
- Missing causal edge probe:
  name the focused command that proves or disproves the missing edge.
- Falsifying probe:
  name the focused npm test command to serve as the falsifying blocker probe in runtime lanes.
- Bounded progress proof:
  name the focused wake/retry/timeout/reconcile/drain/dispatch/delivery/timer/
  advance/bounded mechanism.
- Bounded progress proof artifact:
  name the focused test, report, diagnostic output, or artifact path.
- Expected observable transition:
  name the before/after state change or classification.
- Observable prediction:
  record metric, predicted, observed, accuracy, and evidence; closure compares
  predicted vs observed so missed predictions become escalation data.
- Max progress bound:
  name the maximum retry/timer/dispatch/owner-cycle bound before fallback.
- Same-frontier fallback:
  open/select an autonomous architecture experiment if the boundary does not
  reduce or migrate; use human escalation only for contradictory or blocked
  evidence.
- Remaining-node fast path:
  when one node remains, name `Target node`, `Required action`,
  `Runtime promotion allowed`, `Goal`, and `Forbidden edits`.
- Expected next frontier:
- Result classification: one of `pending-before-probe`,
  `representative-green`, `reduced`, `same-frontier`, `migrated`,
  `classification-only`, `architecture-gap`, or `contradictory`.
  `Reduced` requires a concrete metric delta. `Classification-only` must name
  the accepted bounded/backpressure state and the stop reason.
- Stop condition: one of `continue-local-fix`, `bounded-non-frontier`,
  `migrate-owner-boundary`, `classification-only-stop`,
  `architecture-gap-stop`, `representative-green`, or `human-escalation`.
  Same-frontier/no-reduction uses `architecture-gap-stop` plus a selected
  `architectureDecisionGate` route of `architecture-package` unless evidence is
  explicitly blocked or contradictory.

## Frontier Transition Ledger

Required when a scenario/release-gate or causal-escalation package closes as
`migrated`, `reduced`, `same-frontier`, or `classification-only`.

| Package | Artifact | First frontier | Metric change | Result |
| --- | --- | --- | --- | --- |
| This package | path/to/latest.report.json | owner / boundary / edge | before -> after | pending |

## Atomic Closure Transaction

Required before renaming this package to `done-...` or `superseded-...`.

- [ ] Result classification is selected from canonical evidence.
- [ ] Same-owner/same-action reductions were kept in this package, or the
      successor split records the changed owner, boundary, required action, or
      stop state.
- [ ] Package file is renamed and metadata status matches filename.
- [ ] Commit And Push Ledger is filled.
- [ ] Successor active package exists, or the package records that no active
      package remains intentionally.
- [ ] `work/sprints/current-blocker.*` points at an existing active package or
      records no-active intentionally.
- [ ] `npm run work:validate -- --closure` passes before commit.
- [ ] Representative artifact names use real unique timestamps or run ids, not
      placeholders such as `T000000Z`.

## Static Drift Ledger

Required for runtime, control-plane, harness, diagnostics, admin, shared test
infrastructure, and broad refactor packages.

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] Inherited repo-wide debt classified.
- [ ] Inherited write-scope debt classified.
- [ ] File-scoped or boundary-scoped baseline recorded.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new write-scope owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.
- [ ] Package-owned changes committed as one focused slice.
- [ ] Slice commit pushed to the recorded remote/branch.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation
end to end. One separate verifier-fixer verifies the last package work, may fix
in-scope problems directly, reruns focused proof, and reports changed files.
Agent identity is optional provenance. Use legacy subagent ledgers only when a
reopened historical package already uses them.

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: verification.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Legacy Subagent Ledgers

Legacy `## Subagent Sequencing Ledger`, `## Subagent Progress Ledger`,
`## Subagent Attempt Ledger`, and `## Subagent Progress And Attempt Ledger`
sections remain valid for packages already using them. Do not invent agent names
or ids; record agent identity only when a real subagent was used.

## Commit And Push Ledger

Required before a metadata-bearing package may remain closed as `done-...` or
`superseded-...`. Do not leave placeholders in closed packages.

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`

## Model Ledger

Optional advisory record for future model and reasoning-effort choice. This
does not replace validation, review, sequencing, or closure proof.

- [ ] If this package produced useful model-fit evidence, record it with:
      `npm run work:model-ledger -- record --package <this package> --model <model> --reasoning-effort <effort> --task-class <class> --package-class <class> --intended-minimum-model <model> --scope-shape <shape> --escalated <true|false> --bailout-reason <reason|none> --outcome <outcome> --validation-status <status> --correction-loops <count> --review-findings <count> --notes <note>`.
- [ ] If no record is useful, state why.

## Failure Migration / Contraction

Required for scenario-driven packages after blocker migration.

- Current dominant blocker:
- Current semantic owner:
- Current boundary:
- Generated evidence block:
      `npm run work:package:evidence-block -- <artifact>`
- Owner explain command:
      `npm run analyze:owner-explain -- <artifact> <edge-or-alias>`
- Historical migrations that are evidence only:
- Replayable owner-decision fixture or blocker probe:
- Presentation surfaces that must consume the decision contract:
- Decision table / glossary proof:
      `npm run analyze:owner-decisions`
      `npm run analyze:owner-glossary`

## Detection / Analysis Tasks

- [ ] Build the concern inventory.
- [ ] Build the semantic-question matrix.
- [ ] Detect duplicate ownership.
- [ ] Detect implicit state machines.
- [ ] Detect branch lattices.
- [ ] If dirty worktree scope matters, run `npm run work:dirty-scope` and
      classify package-owned versus unrelated entries before committing.
- [ ] If the LLM needs the whole startup bundle, run `npm run work:llm-start`
      before reading raw logs or large segment files.
- [ ] If package status or validation ownership is unclear, run
      `npm run work:package:doctor -- <package>` and record the concrete
      findings without treating it as a subagent replacement.
- [ ] If package validation fails on schema, ledger, or enum values, rerun the
      doctor with `-- --suggest` or `-- --fix-dry-run` before manually editing
      metadata.
- [ ] If representative evidence is involved, run
      `npm run work:evidence-summary -- <artifact>` before reading raw logs or
      large harness segment files.
- [ ] If owner-file discovery is unclear, run
      `npm run analyze:owner-files -- <owner> [boundary]`.
- [ ] If priority-recovery residuals must be classified, run
      `npm run analyze:priority-recovery-residuals -- <artifact>` instead of
      ad hoc `jq` extraction.
- [ ] If a real subagent is required, run
      `npm run work:subagent-prompt -- --role <role> --package <package>` to
      generate the bounded role prompt and ledger-line guidance.
- [ ] If oversized segment files block review, run
      `npm run audit:owner-boundary-segments -- <files...>` and record the
      extraction guidance or the reason extraction is out of scope.
- [ ] If broad file-size debt needs the next bounded package, run
      `npm run work:oversized-next -- --markdown`.

## Implementation Tasks

- [ ] Add guardrail tests first.
- [ ] Collapse to one canonical owner path.
- [ ] Remove or wrap parallel paths.
- [ ] Tighten static guardrails.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete.
- [ ] Tail consumers are cut over.
- [ ] Diagnostics, admin, and reporting surfaces match the new contract.
- [ ] Superseded paths, booleans, or vocabulary are deleted.
- [ ] Required proof layers are complete.

## Validation

1. Targeted unit tests.
2. Targeted integration tests.
3. Distributed harness scenarios.
4. Deterministic local guideline and runtime-grammar guardrails.
5. Complexity and dependency checks.

## Done When

1. The canonical owner/path is in place.
2. Parallel implementations are removed or downgraded.
3. Required tests pass.
4. Follow-up work, if any, is split into new idea or package files.
