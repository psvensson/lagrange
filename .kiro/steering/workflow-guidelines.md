# Workflow Guidelines Detail

## Document Role

This file expands the package, sprint, sub-agent, guardrail, causal-closure,
and roadmap-truth workflow summarized by
[`system guidelines.md`](system%20guidelines.md).

Use this file when starting, continuing, reviewing, splitting, validating, or
closing non-trivial implementation work.

For validation-specific detail, also read
[`testing-guidelines.md`](testing-guidelines.md). For scope and edition
authority, also read [`roadmap.md`](roadmap.md).

## Workflow Lanes

Choose the lightest lane that protects the current boundary.

| Lane | Use For | Required Proof | May Omit |
| --- | --- | --- | --- |
| Read/review/doc-only | Questions, reviews, explanatory docs, typo fixes, generated steering pack refreshes | clear answer or focused doc diff; `git diff --check` for edits | work package, sub-agents, causal ledger, representative rerun |
| Lightweight maintenance | Small tooling, docs-as-process, templates, low-risk internal cleanup | focused test or script plus `git diff --check`; package only when tracker truth changes | causal ledger, scenario rerun, sub-agent ledger unless package declares it |
| Runtime owner-boundary | Runtime/control-plane/shared contract changes | active package, owner contract, guardrail preflight/closure, focused owner tests, affected consumers | representative scenario only when no scenario drove the work |
| Scenario/release-gate | Distributed, integration, load, or release-gate blockers | active package, sequential sub-agents, causal closure ledger, missing-edge probe, representative proof | none of the scenario ledger fields |
| Causal escalation | Repeated scenario failures after local reductions or classification | causal-analysis package with phase model, causal graph, timeout/budget review, invariant review, taxonomy, stop conditions | runtime patch unless the analysis explicitly authorizes it |

Lane selection rules:

1. Prefer read/review/doc-only for analysis that does not change implementation
   truth.
2. Prefer lightweight maintenance for process, template, or tooling cleanup
   that cannot change runtime behavior.
3. Escalate to runtime owner-boundary when the change can alter ownership,
   shared contracts, guardrails, runtime behavior, or affected consumers.
4. Escalate to scenario/release-gate when the work is driven by a failing
   representative artifact or must prove what that scenario does next.
5. Escalate to causal analysis when repeated local fixes or classifications do
   not make the representative gate pass.
6. When lane choice is ambiguous, record why the lighter lane is sufficient or
   use the heavier lane.

## Lane Requirements

### Read/Review/Doc-Only Lane

This lane is valid when the task does not change runtime code, package status,
roadmap truth, architecture owner maps, or validation obligations.

Required:

1. Load enough steering context to answer accurately.
2. Keep edits focused on explanatory or generated documentation.
3. Run `git diff --check` for file edits.

Not required unless the task changes implementation truth:

- active work package
- sub-agent sequencing ledger
- static drift ledger
- causal closure ledger
- representative scenario proof

### Lightweight Maintenance Lane

This lane is valid for small internal docs, workflow, template, and tooling
changes that do not change runtime ownership or shared runtime contracts.

Required:

1. Name the focused maintenance concern.
2. Keep the diff confined to that concern.
3. Run the focused script or test for any changed tooling.
4. Run `git diff --check`.
5. Use a package only when work-tracker truth or package templates require a
   durable execution record.

May omit:

- scenario causal closure ledger
- representative rerun
- sub-agent sequencing, unless the work package declares the runtime/scenario
  lane or the user explicitly requires it

### Runtime Owner-Boundary Lane

This lane is required when runtime behavior, shared metadata, control-plane
progression, owner contracts, diagnostics grammar, guardrails, or affected
runtime consumers can change.

Required:

1. Active package with one primary owner and boundary.
2. Shared boundary contract when a shared runtime surface changes.
3. Static drift ledger before and after implementation.
4. Focused owner-path tests.
5. Affected consumer proof for diagnostics, admin, harness, reporting, or
   status surfaces that consume the changed contract.
6. Affected-area deep dive before closure.
7. Sequential sub-agent review/fix/implementation proof unless the user
   explicitly disables sub-agents.

Representative scenario proof is required when a scenario artifact drove the
work; otherwise focused proof may be sufficient.

### Scenario/Release-Gate Lane

This lane is required when work is driven by a distributed, integration, load,
or release-gate artifact.

Required:

1. Active package naming current dominant blocker, semantic owner, and boundary.
2. Sub-agent sequencing ledger before implementation.
3. Causal governance fields and scenario causal closure ledger.
4. Focused missing-edge probe before broad reruns.
5. Affected presentation tests when reports, active gates, summaries, or
   failure bundles consume the changed contract.
6. Representative scenario or blocker probe after focused proof.
7. Final classification: representative-green, reduced, same-frontier,
   migrated, classification-only, architecture-gap, contradictory, or human
   escalation.

### Causal Escalation Lane

This lane is required when the representative gate remains red after repeated
related local fixes or classification-only reductions.

Required:

1. Causal-analysis package rather than another symptom patch.
2. End-to-end phase model.
3. Cross-entity causal graph.
4. Budget and timeout accounting.
5. Invariant review.
6. Normalized failure-class taxonomy.
7. Stop conditions for local fix, owner migration, architecture work, or human
   escalation.

## Package Status And Closure

Work-tracking closure is filename-first.

Required patterns:

1. Close a completed package by renaming `active-...` to `done-...`.
2. Rename dormant package work to `todo-...`.
3. Rename displaced package work to `superseded-...` and link the superseding
   package from the body.
4. Do not create heading, directory, checkbox, or sidecar status systems that
   contradict the filename.
5. Update in-repo links when closing packages or archiving sprints.
6. Do not archive package files into a second package-status directory.
7. Close active sprints by renaming them to `done-...` and moving them to
   `work/sprints/archived/`.

Every completed work-package slice MUST end in a focused commit and push before
the next slice starts.

Commit-and-push ledger for current packages:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

Do not invent historical proof. If an older package is reopened, migrated, or
closed again, current proof rules apply.

Stop for human direction when package-owned and unrelated changes cannot be
separated safely, when no push target exists, or when credentials/policy prevent
the required push.

## Affected-Area Deep Dive

Every work package ends with an affected-area review before `done-...`.

Affected area means:

1. every production file in package `writeScope`
2. direct owner collaborators of those files
3. decision, lifecycle, ingress, dissemination, persistence, diagnostic, or
   resource-lifetime boundaries that those files participate in

Review for:

- owner bypasses and shadow state
- duplicate logic or parallel paths
- fallback behavior and bag-of-`if` decision boundaries
- `null` or `undefined` domain-state contracts
- unowned resource lifetime or missing diagnostics
- row-field or lifecycle ownership violations
- changed contracts without tail-consumer proof

If the deep dive finds an in-scope mistake, irregularity, or steering violation,
fix it before closure. If it finds a separate concern outside the affected
area, open a new idea or work package instead of silently widening scope.

## Residual Closure Inventory

Every active package carries an explicit residual-closure inventory.

The inventory names:

1. direct owner paths being changed
2. tail consumers and collaborator owners that must be cut over
3. status, diagnostics, harness, admin, or reporting surfaces that must match
   the new contract
4. superseded paths, fallbacks, aliases, or vocabulary to delete
5. required proof layers before closure

A package may not close with open in-scope residuals. "Known residual" is not a
closure state; either fix it, or split it into a linked follow-on package before
closure.

Do not start a second active package on the same architectural boundary while
the first has unresolved in-scope residuals. Parallel packages in one broad
area require explicitly disjoint file, owner, and proof scope, or one umbrella
package that defines sequencing.

Progress notes distinguish:

- landed hot-path changes
- remaining residual closures
- proof already run
- proof still required

## Shared Boundary Contract Declaration

When a package adds or reshapes a shared runtime boundary, the package declares
the contract explicitly.

Required fields:

1. semantic owner
2. canonical contract shape or vocabulary
3. allowed consumers
4. prohibited reinterpretations
5. primary diagnostics and proof surfaces
6. operational authority, diagnostics-only view, and owner-internal retained
   state when several views exist

Durable boundary changes update `architecture/current-owner-maps.md` or the
relevant architecture record in the same work cycle. Mechanically checkable
boundary rules get a static guardrail or a linked follow-on before closure.

## Scenario Failure Migration

Scenario-driven packages make blocker movement explicit.

Required workflow:

1. Name the current dominant blocker, owner, and boundary.
2. After focused proof is green, rerun the original scenario or the narrowest
   representative blocker probe.
3. If dominant failure class, reason, owner, or boundary changes materially,
   update the active package or split one follow-on package in the same work
   cycle.
4. If the same owner boundary remains dominant, append normalized evidence to
   the current package and update the sprint blocker snapshot.
5. Do not open a new package merely because artifact epoch, node ids, counts,
   timestamps, or presentation shape changed.

Progress notes distinguish:

- blocker just reduced
- blocker now dominant
- hypothesis for why the new blocker was latent

Evidence copied from distributed or integration artifacts uses canonical
extractors when they exist. Manual summaries name source artifact paths and
preserve normalized owner fields.

## Lifecycle Progress Grammar

Packages touching startup, join, rejoin, readiness, admission, recovery,
convergence, rebalancing, or other lifecycle progression declare a progress
grammar.

Required fields:

1. canonical state or outcome vocabulary
2. meaning of blocked, deferred, retryable, terminal, and ready states
3. blocker or reason-code vocabulary
4. evidence precedence when storage, cache, transport, and runtime witnesses
   disagree
5. explicit axes when the concern has more than one dimension

Diagnostics, admin, harness, and reporting surfaces reuse the grammar or
declare a bounded view role. If readers still infer progress from existence,
local booleans, or logs after the package lands, the package is not done.

## Static Drift Ledger

Every active package touching runtime, control-plane, harness, diagnostics,
admin, or shared test infrastructure records static guardrail status.

Before implementation, record relevant guardrails:

- decision-boundary guideline audit
- runtime-grammar audit when runtime meaning is touched
- metadata gateway or owner-ingress audit for system-table reads/writes
- scalar/literal audit for material runtime edits
- dependency cycle and complexity ratchets for broad refactors

The ledger distinguishes:

1. inherited repo-wide debt outside the package boundary
2. inherited debt in write-scope files
3. new debt introduced by the package
4. debt removed by the package

Do not close if relevant guardrail counts increase. Do not hide failures by
weakening scripts, expanding allowlists, renaming files out of scan scope, or
moving code into test-only paths.

Any new allowlist, suppression, or accepted-boundary entry names owner, reason,
expiry or follow-on, and the guardrail that fails after removal.

## LLM Sprint Entry And Width Limits

LLM-driven sprint work keeps architectural width small.

Required workflow:

1. Run `npm run work:context` before non-trivial package implementation.
2. Use `npm run work:llm-start` when the next step needs a fuller startup
   bundle with package doctor suggestions, dirty scope, model-ledger summary,
   and representative evidence summary.
3. Use the handoff's current blocker, first files, proof ladder, commands, and
   dirty-worktree summary as the starting point.
4. Keep one representative gate per sprint and at most one package owning the
   current representative re-entry gate.
5. Keep one primary owner and boundary per active scenario-driven package.
6. Split work when guardrail cleanup, runtime behavior, presentation, or
   roadmap truth repair are separate boundaries.
7. After two material blocker migrations inside one package, close the gate or
   split a contraction package around the current owner contract.
8. Broad representative reruns are acceptance proof only after owner fixtures,
   focused owner tests, and affected presentation tests are green.

## LLM Tool-First Triage

This is a repo-wide package and sub-agent entry contract, not a sprint-local
note. LLM-driven work across all packages and sub-agent tasks must use canonical
workflow and artifact tools before raw JSON or log slicing: `work:llm-start`,
`work:evidence-summary`,
`work:package:doctor -- --suggest`, `work:package:schema`,
`work:package:new`, `analyze:owner-files`, focused scenario extractors such as
`analyze:priority-recovery-residuals`, `work:subagent-prompt`, and
`work:oversized-next`.

Required workflow:

1. Use `npm run work:package:doctor -- --suggest <package>` or
   `npm run work:package:doctor -- --fix-dry-run <package>` before hand-editing
   package schema, causal ledger, Model Fit, sub-agent ledger, or commit-ledger
   fields.
2. Use `npm run work:package:schema` before choosing status, lane,
   causal-outcome, scenario-classification, stop-condition, or bounded-progress
   enum values.
3. Use `npm run work:package:new -- ...` to create new package files unless the
   task is only renaming an existing package status.
4. Use `npm run work:evidence-summary -- <artifact>` before reading raw
   distributed report JSON or large harness files.
5. Use `npm run analyze:owner-files -- <owner> [boundary]` before broad owner
   file search or opening oversized segment files.
6. Use scenario-specific extractors such as
   `npm run analyze:priority-recovery-residuals -- <artifact>` before ad hoc
   residual extraction.
7. Use `npm run work:subagent-prompt -- --role <role> --package <package>` to
   prepare bounded sub-agent tasks; the generated text assists the real
   sub-agent sequence but does not replace real returned agent ids.
8. Use `npm run work:oversized-next -- --markdown` before inventing file-size
   cleanup packages from raw line counts.
9. Use explicit metadata scope fields for new packages: `writeScope` for files
   the package may edit, `handoffFiles` for read-only context,
   `generatedFiles` for deterministic outputs, `candidateRuntimeFiles` for
   files gated by a focused probe, and `commitScope` for focused commit
   containment. `touchedFiles` is legacy compatibility only.
10. Use validation phases deliberately: `npm run work:validate -- --entry` for
    package shape, `--pre-impl` when review/fix proof is complete and
    implementation may still be pending, and `--closure` before close/commit.

Ad hoc `jq`, raw JSON slicing, or raw-log sampling is allowed only after the
relevant canonical extractor is missing or insufficient. The package records
which extractor was tried and why the fallback was necessary.

The sprint current-blocker snapshot stays near the top of the sprint document
and names:

- latest artifact or replay directory
- representative gate or scenario
- current representative package
- primary semantic owner and boundary
- canonical blocker or dominant reason
- prior blocker that just closed or migrated
- subordinate evidence that must not drive edit scope
- next required owner proof or action

`work/sprints/current-blocker.json` is generated handoff state, but it must not
be stale. Default `work:validate` checks that the snapshot package exists,
uses an `active-...` filename, has `status: active`, and matches the discovered
active package and active sprint. If it fails, regenerate it with
`npm run work:current-blocker -- --write` before using `work:llm-start` or
continuing package work.

Long migration history belongs below the snapshot as a ledger.

## Sub-Agent Sequencing

Real sub-agents are used sequentially for sprint or work-package implementation
unless the user explicitly disables them.

Default sequence:

1. Review sub-agent reviews the most recently executed package on the same
   sprint or owner boundary.
2. If review finds actionable problems, a separate fix sub-agent fixes those
   findings before new implementation starts.
3. A separate implementation sub-agent handles the current package.

Review checks:

- last package closed its stated blocker
- stale status
- widened scope
- missed residual closure
- guardrail drift
- sprint snapshot mismatch with current evidence

Parallel sub-agents are allowed only for independent sidecar questions with
disjoint owner or file scope. Parent-session notes, local/manual labels, and
arbitrary text without a real agent id do not satisfy review, fix, or
implementation roles at closure. Before closure, an implementation environment
may record `human-waived`, `tool-unavailable`, or
`blocked-by-environment-policy` with a `reason: ...` note so unavailable
delegation is explicit instead of disguised as agent proof.

The main agent remains responsible for integrating findings, deciding whether
the owner boundary changed, and keeping package status filename-first.

## Causal Analysis Escalation

When scenario-driven work keeps reducing or classifying blockers without making
the representative gate pass, the next work cycle escalates to causal analysis
before another local runtime patch.

Escalate when:

1. the same representative scenario remains red after two material fixes or
   classification-only reductions on related lifecycle, admission, readiness,
   recovery, or convergence boundaries
2. the same owner boundary remains dominant while residual evidence shifts by
   node, timing, retained evidence, subordinate reason, or artifact shape
3. package review identifies local tactical treatment as the risk
4. residual evidence is classified as intentional backpressure but the
   representative gate remains red

A causal-analysis package produces or updates durable diagnostic or architecture
material covering:

- end-to-end phase model
- cross-entity causal graph
- budget and timeout accounting
- invariant review
- normalized failure-class taxonomy
- stop conditions for local fix, owner migration, architecture work, or human
  escalation

Runtime packages that follow cite the causal model, schema, decision table,
fixture, extractor, or artifact they rely on.

## Scenario Causal Closure Ledger

Scenario-driven active packages and sprint snapshots carry a
`scenarioCausalClosure` ledger.

Required fields:

1. Reference scenario/probe
2. Phase chain
3. Current first frontier
4. Known downstream blockers
5. Missing causal edge
6. Missing causal edge probe
7. Bounded progress proof
8. Bounded progress proof artifact
9. Expected observable transition
10. Max progress bound
11. Same-frontier fallback
12. Expected next frontier
13. Result classification
14. Stop condition

The active scenario package owner and boundary must appear in
`scenarioCausalClosure.currentFirstFrontier`. A package may diverge only when it
records metadata `ownerBoundaryMigrationProof` with concrete from/to owner and
boundary, reason, and focused evidence proving a bounded diagnostic/support role
or owner-boundary migration.

Allowed result classifications:

- pending-before-probe
- representative-green
- reduced
- same-frontier
- migrated
- classification-only
- architecture-gap
- contradictory

Allowed stop conditions:

- continue-local-fix
- bounded-non-frontier
- migrate-owner-boundary
- classification-only-stop
- architecture-gap-stop
- representative-green
- human-escalation

Retryable or backpressure first frontiers cannot be classified as bounded or
non-frontier with prose alone. The package names the focused probe command,
proof artifact path, observable transition, maximum progress bound, and
same-frontier fallback.

## Roadmap And Work-Tracker Truth

Roadmap status must not outrun representative evidence.

Required rules:

1. A complete roadmap row means the capability exists and declared exit
   evidence is not contradicted by an active package or representative
   scenario.
2. If a package fixes a failure that belongs to a completed roadmap row, the
   package classifies the mismatch as capability-complete but gate-open,
   status-overstated, or new maintenance concern.
3. Scenario-driven rows such as failure simulation, topology stabilization, and
   production guarantees require named representative evidence, not only unit
   proof.
4. Before sprint closure, reconcile active packages with `../../roadmap.md` and
   `../../architecture/current-owner-maps.md`.
5. Roadmap corrections discovered during implementation land with the package
   or sprint closure that discovered them.
