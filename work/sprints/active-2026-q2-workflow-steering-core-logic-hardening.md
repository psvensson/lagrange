# Workflow Steering Core Logic Hardening Sprint

Status: todo. Created on May 23, 2026 from the read-only multi-agent project
review.

## Goal

Reduce repeated rolling-restart owner-boundary churn by hardening the workflow
tools, steering documents, evidence extractors, and core owner contracts that
currently allow conflicting signals to become another local patch.

Beyond the rolling-restart anchor, the multi-agent review identified four
cross-cutting process risks that the sprint must also reduce so that the
contracts hardened by the runtime packages are not immediately re-eroded by
ceremony drift:

- Rule duplication across `AGENTS.md`, `.kiro/steering/llm/core.md`,
  `work/templates/*`, and `scripts/work-package-schema.js` (1025 lines /
  ~188 constants), which makes any rule change require 4–5 coordinated edits.
- Package metadata that nests 10+ optional JSON objects on a 679-line
  template, with two parallel ledgers (legacy `Subagent Progress` and current
  `Execution Evidence`) both validated as gates.
- An LLM-facing surface in which `architecture.md` is a 132 KB monolith, the
  largest test file is 4,688 lines, and the file-size ratchet is regressing
  (+10 source, +12 test over baseline).
- A code surface with 144 ordinal `*-segment-N` / `*-stage-N` / `*-part-N`
  files (e.g. `sql-query-engine-segment-[1-7]`, `operation-workflow-owner-
  segment-[1-7]-stage-[1-5]`) that fragment the owner-boundary and
  decision-table discipline this sprint is trying to reinforce.

The sprint is successful when queued packages either remove the evidence
conflicts, process drift, and oversized surfaces identified in the review,
or produce explicit successor packages with owner, boundary, scope, proof,
and stop rules. Pure-runtime hardening that does not fit the workflow /
steering / core-owner-contract scope is named in the deferred section and
routed to a successor sprint.

## Current Evidence Snapshot

Seed artifact:
`test-output/reports/rolling-restart-rerun-2.report.json`.

Canonical state on May 23, 2026:

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-2.report.json`
   reports first frontier `active_gate_snapshot_coverage`, owner
   `startup_active_gate_owner`, boundary `snapshot_coverage`, dominant reason
   `active_gate_timed_out`.
2. `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`
   selects `continue_local_fix` and reports zero priority recovery residual
   witnesses.
3. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`
   reports `Witnesses: 0`, but other artifact fields and the handoff probe
   still preserve priority/recovery context.
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`
   classifies the handoff as
   `publication_active_gate_handoff_contract_pending` with required action
   `wait_owner_recovery`, one pending recovery node, and one pending owner
   queue write.
5. `npm run summarize:harness -- --report-dir test-output/reports` shows the
   broader harness state is still dominated by active-state and convergence
   failures across several distributed scenarios, so this sprint must improve
   root-cause selection before adding more scenario reruns.

## Operating Rules

1. Do not mutate the currently active package or its tracker-generated handoff
   files from this sprint unless that package is explicitly activated or
   migrated by the normal tracker workflow.
2. Use canonical workflow commands before raw JSON, raw logs, or broad search:
   `work:context`, `work:llm-start`, `work:scenario-triage`,
   `work:evidence-summary`, `analyze:priority-recovery-residuals`,
   `analyze:topology-convergence --handoff-probe`, `analyze:owner-files`,
   `work:package:doctor`, and `work:validate`.
3. Start with workflow and evidence-tooling packages before runtime packages.
   Runtime work should not begin until the triage tools can surface signal
   conflicts explicitly.
4. Runtime packages must preserve owner-issued outcomes. Diagnostics may report
   owner evidence, but must not synthesize owner decisions from free-form error
   strings.
5. If a queued package discovers that its write scope overlaps unrelated dirty
   work, stop and split or ask for human direction instead of committing a
   mixed slice.

## Package Queue

The queue is grouped into three rounds. Round 1 stays anchored to the
rolling-restart artifact and is unchanged from the original review.
Round 2 attacks process / steering ceremony drift that the review flagged
as a force multiplier for the runtime contracts in Round 1. Round 3
addresses oversized surfaces that hurt both LLM and human navigation.
Within each round, ordering follows Operating Rule 3
(workflow / evidence tooling before runtime).

### Round 1 — Rolling-Restart Anchored

1. [Evidence Conflict Triage Contract](../packages/done-20260523-evidence-conflict-triage-contract.md)
   - Lane: `diagnostic-classification`
   - Owner boundary: `diagnostics_owner / scenario_triage_signal_conflict`
   - Purpose: make `work:scenario-triage` and
     `analyze:priority-recovery-residuals` preserve cross-signal conflicts,
     including zero-witness priority recovery with derived low-confidence
     recovery context.
   - Acceptance: triage prints an explicit signal-conflict section for the
     seed artifact and tests cover the conflict case.
2. [Workflow Package Tooling Reliability](../packages/done-20260523-workflow-package-tooling-reliability.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / package_validation_and_ledgers`
   - Purpose: reduce package ceremony drift by unifying validator/doctor
     contract checks, removing false git provenance fallbacks, making
     predecessor metadata inheritance parser-backed, making
     `work:model-ledger -- summary` tolerant of malformed JSONL lines, and
     integrating schema auto-healing in `npm run work:repair` (automatically
     correcting schema fields, timestamps) along with autocompletion of writeScope
     and commitScope based on git status.
   - Acceptance: workflow tests prove doctor/validator consistency, malformed
     ledger lines produce warnings without losing the summary, and `npm run work:repair`
     successfully auto-heals schema constraints and git scopes.
3. [Steering Template Noise Reduction](../packages/done-20260523-steering-template-noise-reduction.md)
   - Lane: `mechanical-maintenance`
   - Owner boundary: `steering_governance_owner / llm_pack_and_template_clarity`
   - Purpose: dedupe noisy generated steering rules, align source and LLM-pack
     wording around pre-implementation validation and subagents, shrink
     low-signal template/handoff sections, and reconcile roadmap/product
     roadmap gate-state wording.
   - Acceptance: regenerated LLM packs are clearer, lane templates stop
     teaching legacy ledgers as the default, and roadmap references do not
     imply representative green while the active gate remains red.
4. [Recovery Reason Taxonomy And Handoff Semantics](../packages/done-20260523-recovery-reason-taxonomy-handoff-semantics.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Purpose: split real recovery pending from diagnostics-unavailable states,
     make active-gate handoff distinguish derived missing input from explicit
     authoritative empty recovery input, establish provisional read grace periods
     for healthy nodes in priority recovery, and introduce a dampening retry budget
     for transient transport errors (like selected_transport_closed) to prevent
     cascading readiness timeouts.
   - Acceptance: focused control-plane/bootstrap tests prove separate typed
     outcomes for pending recovery, grace-period reads, transport dampening,
     unavailable diagnostics, and no pending recovery.
5. [Evidence Based Rebalancer Readiness Gate](../packages/done-20260523-evidence-based-rebalancer-readiness-gate.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `rebalancer_planning_owner / cluster_readiness_gate`
   - Purpose: replace timer-confirmed cluster readiness with evidence-backed or
     explicitly relaxed readiness, and make timeout a typed degraded outcome.
   - Acceptance: rebalancer proof distinguishes evidence-confirmed readiness,
     intentionally relaxed readiness, and degraded timeout readiness.
6. [Active Node Projection Eligibility Contract](../packages/done-20260523-active-node-projection-eligibility-contract.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_publication_owner / active_node_projection_eligibility`
   - Purpose: collapse duplicated active-node projection branches into one
     normalized eligibility snapshot and one ranked source-decision table.
   - Acceptance: projection proof covers partial readiness, transport errors,
     owner recovery evidence, and confirms one canonical projection outcome.

### Round 2 — Process And Steering Hardening

These packages target ceremony drift identified by the multi-agent review.
They are workflow / steering only; they do not change runtime contracts.
Round 2 may be picked up in parallel with Round 1 whenever its write scope
does not overlap an active Round 1 package.

7. [Rules Canon Consolidation](../packages/done-20260523-rules-canon-consolidation.md)
   - Lane: `mechanical-maintenance`
   - Owner boundary: `steering_governance_owner / rules_canon_consolidation`
   - Purpose: establish `work/RULES.md` as the single canon for lane
     definitions, proof requirements, validator phases, and coding
     constraints. Rewrite `AGENTS.md` to ~50 lines as an index that defers
     to `core.md` and `work/RULES.md`. Update `core.md` to reference rather
     than restate the canon. Validator error messages cite `work/RULES.md`
     anchors instead of inlining text.
   - Acceptance: every rule appears in exactly one source; AGENTS.md is a
     thin index; a grep across `AGENTS.md`, `.kiro/steering/llm/core.md`,
     and `work/templates/*` finds no rule restated in more than one place;
     `npm run steering:llm:pack` regenerates without inconsistency
     warnings.
8. [Package Metadata Flattening And Proof Unification](../packages/done-20260523-package-metadata-flattening-and-proof-unification.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / package_schema_and_proof_shape`
   - Purpose: flatten the package schema to five top-level sections
     (`intent`, `scope`, `gates`, `modelFit`, `execution`). Move advanced
     blocks (`causalGovernance`, `scenarioCausalClosure`,
     `observablePrediction`, `representativeResidual`, `modelFitSplit`,
     `rerunDecision`, `architectureDecisionGate`) into optional companion
     files referenced from the package, not inlined in metadata. Unify
     proof recording into `proof.commands` + `proof.evidence` so
     `proof[]`, `classificationEfficiency.commands`, `Validation`, and
     `Execution Evidence` stop duplicating the same ladder. Reduce
     `work/templates/work-package-template.md` from 679 to ~250 lines,
     and introduce a 'Lite Metadata Profile' that bypasses causal tracking
     blocks entirely for lightweight lanes to optimize LLM token footprint.
   - Acceptance: `work-package-schema.js` exposes a flat top-level shape;
     existing active and queued packages still validate after a
     compatibility shim; a doctor pass on every Round 1 package returns
     zero schema-shape suggestions.
9. [Legacy Subagent Progress Ledger Retirement](../packages/done-20260523-legacy-subagent-progress-ledger-retirement.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / execution_evidence_ledger`
   - Purpose: stop validating the legacy `Subagent Progress` ledger as a
     gate. New packages use only `Execution Evidence`, simplified to five
     fields (action, owner, files-changed, validation, outcome). Legacy
     packages keep their ledger and emit a "migrate next closure"
     advisory. Remove legacy ledger language from `work/templates/*` and
     `work/README.md`.
   - Acceptance: validator no longer fails closure on legacy ledger fields;
     templates teach only `Execution Evidence`; ~400 lines of
     legacy-compat logic removed from `scripts/work-tracker.js`.
10. [Lite Steering And Lite Package Templates](../packages/done-20260523-lite-steering-and-lite-package-templates.md)
    - Lane: `mechanical-maintenance`
    - Owner boundary: `steering_governance_owner / lite_pack_and_lite_templates`
    - Purpose: add `.kiro/steering/llm/lite.md` (~30 lines listing the
      top-10 must-not rules with anchors into the canon) and three lite
      package templates (`doc-only-package.md`,
      `single-file-maintenance-package.md`,
      `lightweight-maintenance-package.md`) of 20–40 lines each, linked
      from the top of the full template. Document
      `npm run steering:llm:pack` as the required regeneration step in
      `AGENTS.md` Workflow Tools, and add a unified developer/LLM entrypoint
      CLI command `npm run work:help` that outputs a clean markdown list of
      all diagnostic, triage, and validation commands with usage descriptions.
    - Acceptance: an LLM landing cold can pick the correct lite template
      from a single page, `npm run work:help` is fully operational and
      comprehensive, and `npm run steering:llm:pack` is named in
      `AGENTS.md` and validated to run cleanly after any
      `.kiro/steering/*.md` source edit.
11. [Lane Model Simplification And Picker](../packages/done-20260523-lane-model-simplification-and-picker.md)
    - Lane: `lightweight-maintenance`
    - Owner boundary: `workflow_tooling_owner / lane_model`
    - Purpose: collapse the 13 lane constants into 5–6 (read-doc,
      maintenance, proof, experiment, runtime, scenario) with an explicit
      decision tree. Add `npm run work:lane-picker` that asks 3–4
      diagnostic questions and recommends a lane. Have
      `npm run work:context` print the recommended lane on its one-line
      header so LLMs do not have to read 13 lane descriptions. Keep
      legacy lane names as aliases for one closure cycle.
    - Acceptance: `work-package-schema.js` exposes 5–6 canonical lanes;
      the picker recommends the historically-used lane on every Round 1
      package; `work:context` includes a single-line lane recommendation.

### Round 3 — Structural Hardening (LLM And Human Navigation)

These packages reduce oversized surfaces that the review flagged as
correctness risks for both LLM agents and human reviewers. Round 3 is
mostly mechanical-maintenance / test-only-proof, so it does not block
Round 1 or Round 2.

12. [Architecture Document Slicing](../packages/todo-20260523-architecture-document-slicing.md)
    - Lane: `mechanical-maintenance`
    - Owner boundary: `steering_governance_owner / architecture_index`
    - Purpose: slice the 132 KB `architecture.md` into
      `architecture/INDEX.md` plus per-domain files
      (`bootstrap.md`, `rebalance.md`, `control-plane.md`,
      `runtime-lifecycle.md`, plus archived patterns). Each domain file
      stays under ~500 lines. Optionally keep a generated
      `architecture.md` concatenation for grep continuity. Update
      `.kiro/steering/llm/README.md` and `AGENTS.md` to point at
      `architecture/INDEX.md`.
    - Acceptance: every domain file under 500 lines; `INDEX.md` lists
      one-line descriptions; no broken references from steering packs
      or roadmap.
13. [Ordinal Segment Inventory And Migration Plan](../packages/done-20260523-ordinal-segment-inventory-and-migration-plan.md)
    - Lane: `diagnostic-classification`
    - Owner boundary: `runtime_modularization_owner / ordinal_segment_inventory`
    - Purpose: catalogue every `*-segment-N`, `*-stage-N`, and `*-part-N`
      file under `src/` (the review counted 144), classify each by the
      real semantic concern it owns (planning vs execution vs delivery,
      etc.), and emit a migration plan with one successor owner-boundary
      package per cluster. This sprint does NOT refactor segments; it
      produces the inventory + plan so the successor sprint can land
      semantic renames without ad hoc grouping. The plan must explicitly
      structure segment modularization to isolate concerns into small,
      modular sub-modules under 500 lines to optimize LLM context usage
      and simplify search-and-replace edits.
    - Acceptance: machine-readable inventory checked into
      `work/inventory/ordinal-segments.json`; a human-readable
      `work/inventory/ordinal-segments.md` lists each cluster, intended
      semantic owner, and proposed successor package; rebalancer README
      and query README updated to point at the inventory instead of the
      current "temporary wrappers" prose.
14. [Oversized Test File Cap And Top Offender Split](../packages/todo-20260523-oversized-test-file-cap-and-top-offender-split.md)
    - Lane: `test-only-proof`
    - Owner boundary: `test_quality_owner / oversized_test_files`
    - Purpose: introduce a hard cap (1,500 lines) in
      `scripts/check-file-size-thresholds.js` for test files and split
      the three current top offenders by concern:
      `test/scripts/work-tracker-subagent-ledger.test.js` (4,688 lines),
      `test/distributed/harness/failure-bundle-diagnostics-contract.js`
      (4,227 lines), and
      `test/rebalancer/rebalance-coordinator-stopping-reconcile-test-registrations.js`
      (3,527 lines). Drop the test ratchet baseline by at least those
      three files; do not add new test files over the cap.
    - Acceptance: `npm run audit:file-size:strict` passes; the three
      named files are each split into focused suites under 1,500 lines;
      `test:fast` and the relevant shards remain green.

## Activation Decision Table

| Evidence after package | Next package |
| --- | --- |
| Triage still hides priority/recovery conflicts | Keep working the triage package before runtime activation |
| Triage conflict is explicit and package routing is stable | Activate workflow tooling reliability or recovery taxonomy based on current blocker pressure |
| Workflow/package tools block reliable package closure | Activate workflow tooling reliability before runtime packages |
| Steering ambiguity blocks package activation or closure | Activate steering template noise reduction |
| Rule duplication causes contradictory guidance across `AGENTS.md`, `core.md`, and templates | Activate rules canon consolidation (Round 2) |
| Package authors leave required schema fields blank or duplicate proof in three sections | Activate package metadata flattening and proof unification (Round 2) |
| Validator fails closure on the legacy `Subagent Progress` ledger | Activate legacy subagent progress ledger retirement (Round 2) |
| LLM agents cannot find a 30-second entry point or use the wrong template for trivial work | Activate lite steering and lite package templates (Round 2) |
| Authors pick the wrong lane or `work:context` cannot recommend one | Activate lane model simplification and picker (Round 2) |
| `architecture.md` is the largest single context an LLM must load | Activate architecture document slicing (Round 3) |
| Ordinal segment files keep being cited as risks but have no inventory | Activate ordinal segment inventory and migration plan (Round 3); do not refactor in this sprint |
| Oversized test files block safe edits and the ratchet is regressing | Activate oversized test file cap and top offender split (Round 3) |
| Runtime evidence still conflates recovery pending and unavailable diagnostics | Activate recovery reason taxonomy and handoff semantics |
| Recovery taxonomy is clean but planning still progresses from timeout confirmation | Activate evidence-based rebalancer readiness gate |
| Active-node projection remains a repeated source of restart drift | Activate active-node projection eligibility contract |

## Deferred — Successor Sprint Candidates

The multi-agent review surfaced runtime hardening that is out of scope for
this sprint because it would mix workflow / steering ceremony reduction
with deep runtime refactors. Each item below is named here so the
successor sprint can pick it up against a documented baseline; none of
them may be opened as packages inside this sprint.

1. **Ordinal segment refactor execution.** The Round 3 inventory package
   produces the plan; actual semantic renames and decomposition of
   `sql-query-engine-segment-[1-7]`, `query-executor-segment-[1-3]-part-[1-2]`,
   `operation-workflow-owner-segment-[1-7]-stage-[1-5]`, and the
   message-router segment/shared-stage cluster belong in a successor sprint
   that owns the migration plan as its anchor artifact.
2. **Decomposition of remaining large multi-owner files.** Beyond the
   active-node projection contract in package 6, `move-planner.js`
   (~47 KB) and `operation-lifecycle.js` (~37 KB) need sub-owner splits.
   These should not be combined with Round 1 contract work because their
   write scope is too wide.
3. **Transport backpressure contract.** `src/transport/message-router` has
   no visible circuit breaker, queue drop policy, or backpressure signal
   even though the transport README forbids hidden drops. This is a new
   owner-boundary contract, not a tooling fix.
4. **WASM service partition-local placement.** Data locality is a core
   thesis but the placement guarantee is neither documented nor tested.
   Successor sprint should add a documented contract plus a representative
   test.
5. **Query budget inheritance test matrix.** `budget-enforcer.js` (~11 KB)
   plus the rule "do not start nested with fresh default budget" suggests
   inheritance gaps. A scenario-driven test matrix for
   `lookup → emit → runtime` budget propagation is its own runtime
   package.
6. **`src/transaction/` discoverability.** The directory only contains
   constants today; `DistributedTransactionCoordinator` lives elsewhere.
   Either move the coordinator under `src/transaction/` or add a README
   pointer; either way it is a runtime-owner change, not workflow.
7. **Cache timing-based inference removal.** Functions such as
   `isNodeHeartbeatWatermarkRegression` bypass the doctrine that owners
   decide and the cache observes. These call sites need typed owner
   signals, which is runtime contract work.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`
4. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-2.report.json --markdown`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`
6. `npm run work:package:doctor -- --suggest <active-package>`
7. `npm run work:validate -- --pre-impl <package>`
8. Focused package tests and static guardrails selected by each active package.
9. Representative rerun only after the active package proof and affected
   extractor/contract proof are green.

Round 2 and Round 3 packages add the following lane-specific proof:

- `npm run steering:llm:pack` after any `.kiro/steering/*.md` source edit
  (Rules Canon Consolidation, Steering Template Noise Reduction, Lite
  Steering And Lite Package Templates, Architecture Document Slicing).
- `npm run work:validate -- --closure <package>` against every Round 1
  package after the schema flattens in Package Metadata Flattening And
  Proof Unification, to prove the compatibility shim does not break
  existing packages.
- `npm run audit:file-size:strict` after Architecture Document Slicing
  and Oversized Test File Cap And Top Offender Split.
- `node scripts/list-commands.js` after Lane Model Simplification And
  Picker to prove the new `work:lane-picker` command is discoverable.

## Closure Rules

1. Each package closes with its own focused validation and commit/push ledger.
2. Packages that change code, tests, scripts, runtime contracts, or tracker
   truth require implementation and verifier-fixer execution evidence before
   closure.
3. The sprint closes only after the queued tooling/steering packages are either
   done or intentionally superseded, and runtime packages have either landed or
   produced explicit successor owner-boundary packages.
4. Round 2 packages must close before any further new package metadata is
   designed in the successor sprint, so the successor sprint inherits the
   flat schema, single rule canon, and single ledger.
5. Round 3 packages may close in any order relative to Round 1 / Round 2
   provided their write scope does not overlap an active package, but the
   sprint does not close until the test file-size ratchet is no longer
   regressing.
6. The sprint must not claim representative green unless a fresh canonical
   artifact proves it.
7. The Deferred section is informational and must be copied verbatim into
   the successor sprint's intake notes so nothing the review surfaced is
   silently dropped.

## Sprint Strategy Brief

- Goal state: rolling-restart is green, or triage tool explicitly reports evidence conflicts, and process/steering ceremony is streamlined.
- Current causal thesis: The triage tool currently masks conflict state by reporting zero priority recovery residuals despite other signals carrying pending recovery evidence. Resolving this conflict prevents wrong-slice runtime route selection.
- Competing hypotheses: H1 resolving the triage signal conflict exposes the correct successor route; H2 the active gate timing out is a distinct independent blocker; H3 workflow tooling drift hides other runtime contradictions.
- Confidence and evidence: High; the triage tool output currently contradicts the convergence and residual analyzer outputs on the same baseline seed artifact rerun-2.
- Expected green path: Complete the triage and diagnostic conflict contract packages, followed by workflow tool reliability and recovery taxonomy packages, establishing unified validation and a clean, uncontradicted route.
- Wrong direction signals: Promoting runtime packages before triage conflict is explicitly surfaced, or adding more scenario reruns without stable diagnostics.
- Next best package: `work/packages/done-20260523-workflow-package-tooling-reliability.md`.
- Stop or escalate rule: Stop for autonomous architecture experiment if same-frontier.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md
Active package owner: workflow_tooling_owner
Active package boundary: package_schema_and_proof_shape
Selected cause: package_ceremony_drift
Required action: Flatten package schema and unify proof recording
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: .kiro/steering/llm/README.md, .kiro/steering/llm/architecture.md, .kiro/steering/llm/core.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json, .kiro/steering/testing-guidelines.md, AGENTS.md, roadmap.md, scripts/analyze-priority-recovery-residuals.js, scripts/analyze-topology-convergence.js, scripts/generate-steering-llm-pack.js, scripts/model-ledger.js, scripts/work-context.js, scripts/work-package-new.js, scripts/work-package-schema.js, scripts/work-scenario-triage.js, scripts/work-subagent-prompt.js, scripts/work-theory-ledger.js, scripts/work-tracker.js, src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js, src/control-plane/control-plane-readiness-service-segment-3.js, src/control-plane/publication-active-gate-handoff-contract.js, src/diagnostics/topology-convergence-graph.js, src/rebalancer/operation-lifecycle.js, src/rebalancer/operation-workflow-owner-ports.js, src/rebalancer/operation-workflow-owner-segment-1.js, src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-recovery-reconcile.js, src/rebalancer/rebalancer-planning-gate-methods.js, src/rebalancer/unified-rebalancer-segment-1.js, src/rebalancer/unified-rebalancer-segment-5.js, test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js, test/distributed/harness/__tests__/cluster.test-part-4.js, test/distributed/harness/cluster-segment-7-class-4.js, test/rebalancer/cluster-readiness-gate.test.js, test/rebalancer/operation-workflow-owner-adapter.test.js, test/rebalancer/operation-workflow-owner-decision.test.js, test/rebalancer/unified-rebalancer-part-5-2-stage-2.js, test/rebalancer/unified-rebalancer.test-part-5.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/work-context.test.js, test/scripts/work-llm-usability-tools.test.js, test/scripts/work-theory-ledger.test.js, test/scripts/work-tracker-subagent-ledger.test.js, work/templates/work-package-template.md, test/bootstrap/owners/, test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js, test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js, test/scripts/analyze-priority-recovery-residuals.test.js, test/scripts/work-scenario-triage.test.js, work/RULES.md
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: npm run work:package:doctor -- --suggest work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md, npm run work:validate -- --pre-impl work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md, npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-theory-ledger.test.js test/scripts/work-scenario-triage.test.js test/scripts/analyze-priority-recovery-residuals.test.js test/scripts/analyze-topology-convergence.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js, git diff --check -- scripts/work-package-schema.js scripts/work-context.js scripts/work-subagent-prompt.js scripts/work-tracker.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js work/packages/done-20260523-package-metadata-flattening-and-proof-unification.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/sprints/active-2026-q2-workflow-steering-core-logic-hardening.md, npm run work:context
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```
