---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Discovery Gate, Core Logic Brief Gate, Decision Experiment Gate, Two-Level Theory Contract, Sprint Architecture Decision Gate, Classification fast-path, Causal closure ledger. Index: [`INDEX.md`](INDEX.md).

# Workflow — Decision & Closure Gates

## Core Logic Brief Gate

Runtime owner-boundary, scenario/release-gate, and causal-escalation packages
must carry a `## Core Logic Brief` before implementation starts. This is a
logic gate, not a prose quota: it prevents procedurally valid packages from
slicing the wrong behavior or proving the wrong decision.

Required fields:

1. `Canonical outcome`: the exact owner outcome this package changes,
   preserves, or proves.
2. `Inputs/signals`: the evidence inputs that decide the outcome.
3. `State model or invariant`: the state model, decision table, or invariant
   that maps those inputs to one outcome.
4. `Non-goals and forbidden interpretations`: meanings, consumers, owner
   boundaries, or downstream symptoms this package must not treat as authority.
5. `Proof mapping`: the focused tests, extractors, fixtures, or representative
   proof that verify the stated logic.
6. `Wrong-slice trigger`: the concrete signal that should stop, split, or
   migrate the package instead of continuing locally.

Read/review/doc-only and lightweight maintenance packages may omit the brief or
record `not-needed: no runtime, scenario, or shared contract decision changes`.
Diagnostic-classification packages use the brief when they reshape diagnostic
meaning or scenario routing, and may otherwise record `not-needed`.

Sub-agent review and implementation prompts carry the Core Logic Brief forward.
Review checks whether the brief matches the selected owner path and proof
surface. Implementation follows the named state model or invariant rather than
inventing a parallel decision path.

### Runtime Owner-Boundary Lane

This lane is required when runtime behavior, shared metadata, control-plane
progression, owner contracts, diagnostics grammar, guardrails, or affected
runtime consumers can change.

Required:

1. Active package with one primary owner and boundary.
2. Core Logic Brief naming the canonical outcome, evidence inputs, state model
   or invariant, proof mapping, and wrong-slice trigger.
3. Shared boundary contract when a shared runtime surface changes.
4. Static drift ledger before and after implementation.
5. Focused owner-path tests.
6. Affected consumer proof for diagnostics, admin, harness, reporting, or
   status surfaces that consume the changed contract.
7. Affected-area deep dive before closure.
8. Checked `## Execution Evidence` with `implementation` and
   `verification-fix` roles. Real sub-agent identity is optional provenance; if
   delegation is unavailable or intentionally not used, record the unavailable
   state and reason instead of inventing a real agent id.

Representative scenario proof is required when a scenario artifact drove the
work; otherwise focused proof may be sufficient.

### Scenario/Release-Gate Lane

This lane is required when work is driven by a distributed, integration, load,
or release-gate artifact.

Required:

1. Active package naming current dominant blocker, semantic owner, and boundary.
2. Core Logic Brief tying the selected edge to one canonical owner outcome,
   evidence inputs, state model or invariant, proof mapping, and wrong-slice
   trigger.
3. Execution Evidence role plan before implementation, including
   `implementation` and `verification-fix` roles plus any optional delegated
   review or provenance notes.
4. Causal governance fields and scenario causal closure ledger.
5. A compact Current Edge Card near the top of the package that names the
   selected edge, allowed edits, forbidden edits, first proof, and stop modes.
6. Classification and implementation gates before runtime edits: canonical
   extractors must agree on owner/boundary/cause, then the package must name
   exact candidate runtime files and focused proof.
7. Focused missing-edge probe or replayable fixture before broad reruns or
   runtime edits. If the selected edge cannot be represented by a focused
   probe, stop as evidence-incomplete or create tooling before patching.
8. Affected presentation tests when reports, active gates, summaries, or
   failure bundles consume the changed contract.
9. Representative scenario or blocker probe after focused proof.
10. Final classification: representative-green, reduced, same-frontier,
   migrated, classification-only, architecture-gap, contradictory, or
   human-only escalation for blocked/contradictory evidence. `Reduced` requires
   a concrete metric delta; `classification-only` must name the accepted
   bounded/backpressure state and stop reason.

### Causal Escalation Lane

This lane is required when the representative gate remains red after repeated
related local fixes or classification-only reductions.

Required:

1. Causal-analysis package rather than another symptom patch.
2. Core Logic Brief for the cross-boundary outcome or invariant under review.
3. End-to-end phase model.
4. Cross-entity causal graph.
5. Budget and timeout accounting.
6. Invariant review.
7. Normalized failure-class taxonomy.
8. Stop conditions for local fix, owner migration, architecture work, or human
   escalation.
9. Sprint Architecture Decision Gate when the sprint may continue local proof,
   migrate owner boundary, classify `architecture-gap`, or route broad
   architecture work.

## Two-Level Theory Contract

Active `causal-escalation`, architecture-gated, owner-boundary migration, and
repeated-frontier packages must split theory into two metadata levels before
implementation.

Do not treat those packages as pre-implementation ready unless they record both
`systemTheory` and `sliceTheory` with the fields below.

`systemTheory` is the whole-system causal map. It records:

1. Problem statement.
2. Phase chain.
3. Owner-boundary map.
4. Stable facts.
5. Changed facts.
6. Competing theories.
7. Eliminated theories.
8. Downstream symptoms.
9. Transition table.
10. Ownership migration triggers.
11. Architecture-gap triggers.
12. Whole-system invariant.

Each transition-table row names the input signal, owner, missing transition,
expected evidence, focused falsifier, and migration trigger.

`sliceTheory` is the package-local executable contract. It records:

1. System theory reference.
2. Selected system theory.
3. Selected mechanism.
4. Source/test contract.
5. Focused falsifier.
6. Representative expected movement.
7. Kill rule.
8. Theory-fit score.
9. Wrong-slice triggers.

Theory-fit score uses concrete high/medium/low rationale for evidence fit,
owner-boundary fit, falsifiability, representative movement, and downstream risk
containment.

Evidence-only theorizing remains sprint-level work. A package is promoted only
when the slice can execute one declared source/test contract, migrate ownership,
or close as architecture-gap. If the system theory cannot select a slice, do
not open another local runtime patch.

## Discovery Gate

The Discovery Gate is a package-local pre-implementation framing step for
material owner, boundary, route, or proof ambiguity. It gives an LLM a bounded
place to compare lateral explanations without creating a parallel workflow
truth source.

Use it when `modelFit.ambiguityScore >= 2`, competing owners or hypotheses
remain plausible, the package repeats a same-frontier or same-action pattern,
or write scope cannot be chosen until one discriminator is named. Skip it when
owner, boundary, route, forbidden scope, and proof are already explicit.

Required fields:

1. `Symptom / decision question`
2. `Current evidence`
3. `Candidate owners / boundaries`
4. `Competing hypotheses`
5. `Cheapest discriminator`
6. `Do not edit yet`
7. `Selected route`
8. `Promotion rule`

The gate has only four valid promotions:

1. Continue the current package after selected route, write scope, forbidden
   scope, and proof are explicit.
2. Open or use an `experiment`/probe package when the discriminator must run
   before implementation.
3. Update current-blocker or successor truth only when selected owner,
   boundary, required action, stop condition, or successor changes.
4. Add or supersede a theory-ledger entry only for durable route knowledge that
   future packages should reuse.

Transient discovery that only clarified the current package stays inside the
package and does not update current-blocker or `work/theory-ledger.md`.

## Sprint Strategy Brief

Active scenario-driven, release-gate, and causal-escalation sprints carry a
compact `## Sprint Strategy Brief` near the top of the sprint file. The brief
keeps the sprint pointed at a causal explanation instead of a sequence of local
packages.

Required fields:

1. `Goal state`: concrete green condition or release-gate success state.
2. `Current causal thesis`: the best current explanation for why the gate is
   red.
3. `Competing hypotheses`: plausible alternates that could redirect owner,
   boundary, or proof sequence.
4. `Confidence and evidence`: confidence by hypothesis and the artifacts,
   focused probes, or extractor outputs behind it.
5. `Expected green path`: expected package sequence from current residual to
   representative success.
6. `Wrong direction signals`: evidence that the sprint is patching the wrong
   owner, chasing a downstream consumer, or widening scope to hide the blocker.
7. `Next best package`: the next package to continue or activate after the
   current package closes.
8. `Stop or escalate rule`: the concrete condition that opens/selects an
   autonomous architecture experiment, causal escalation, or a human-only
   escalation for blocked/contradictory evidence instead of another local
   runtime patch. In theory-loop terms (see
   [`work/RULES.md#non-halting-continuation-invariant-r12`](../../../work/RULES.md#non-halting-continuation-invariant-r12)),
   an architecture experiment or causal escalation is a `redirect(next-action)`
   — an autonomous continuation, never a halt. Only a human-only block maps to
   `terminate(blocked-frozen-decision | blocked-external-dependency)`.

Update the brief when selected owner or boundary changes, fresh evidence
contradicts the thesis, two or three material packages close, or frontier
oscillation appears. The Current Edge Card is the tactical next edge; the Sprint
Strategy Brief is the strategic map for the whole sprint.

## Classification-Only Fast Path

Classification-only packages are evidence closure, not implementation. Use the
fast path when the package records `classification-only` as representative
outcome, scenario result classification, or representative residual status and
does not own runtime, test, script, or report write scope.

Fast-path rules:

1. Keep `writeScope` and `commitScope` to package, sprint, tracker, ledger, or
   documentation handoff files.
2. Put possible runtime, test, script, and report files in
   `candidateRuntimeFiles` only.
3. Use two or three canonical proof commands: representative evidence, one
   focused extractor/probe, and validation or causal-model proof.
4. Execution Evidence role proof and static runtime guardrails are optional
   while no implementation write scope exists.
5. Promotion to runtime, test, script, or report edits exits the fast path and
   requires normal lane proof, including `implementation` and
   `verification-fix` role evidence when the lane requires it.
6. Do not create another classification-only package from the same unchanged
   artifact unless owner/boundary, package class, or stop condition changes.
   Close, rerun fresh evidence, or escalate.
7. This fast path is forbidden for theory-loop work packages and cannot close a
   theory-loop sprint. In theory-loop sprints, classification-only evidence is
   sprint-level discrimination until it promotes a real `src/` source-code
   package, and the sprint continues until its success condition is met by
   fresh representative evidence.

## Classification Efficiency Contract

Classification is an inline gate by default. Record the decision in the
predecessor, successor, or sprint Current Edge Card unless the classification
changes durable route truth.

Create a separate pure classification package only when at least one is true:

1. owner, boundary, or required action changed
2. runtime promotion is blocked until a route is selected
3. the result is architecture-gap or a human-only blocked/contradictory escalation
4. sprint/current-blocker truth would otherwise become misleading
5. the classification creates a concrete successor package

Pure classification packages carry `classificationEfficiency` metadata with
the default mode, separate-package reason, one-artifact budget,
two-or-three-command proof budget, capped commands, decision record, successor
action, and runtime promotion rule.

Execution Evidence role proof and static runtime guardrails are optional while
the pure classifier has no runtime, test, script, or report write scope.
Promotion to implementation scope exits the fast path and restores normal lane
proof.

When canonical owner and boundary are stable and the route is a local runtime
fix, the successor action is `open-runtime-owner-boundary` and
`rerunDecision.nextLane` is `runtime-owner-boundary`. Do not open another
classification package from the same unchanged artifact.

## Decision Experiment Gate

Active runtime owner-boundary, scenario/release-gate, and causal-escalation
packages must carry a compact `## Decision Experiment Gate` before
implementation starts. Treat the next implementation as a falsifiable
experiment, not as proof that the current route is correct.

The gate names:

1. decision question
2. architecture review
3. competing hypotheses
4. pre-edit focused probe
5. success metrics
6. representative rerun
7. kill rule

The architecture review distinguishes local owner-boundary work from
owner-boundary migration, autonomous architecture experiment, or a human-only
route for blocked/contradictory evidence. Competing hypotheses include stale
evidence and wrong-owner explanations. The pre-edit probe and representative
rerun are executable commands. Success metrics name concrete count, metric,
frontier movement, migration, or representative green. The kill rule opens or
selects the autonomous architecture experiment on unchanged
same-frontier/no-reduction evidence instead of opening another local patch.

Classification-only fast-path, pure classification, read/review/doc-only, and
lightweight maintenance packages are exempt unless they promote runtime,
scenario, script, report, or shared-contract implementation scope.

## Sprint Architecture Decision Gate

Use this gate when a scenario-driven or causal-escalation sprint may decide
between continued local proof, owner-boundary migration, autonomous
architecture experiment, or human-only escalation. The gate lets a sprint
classify and route work in context; it does not authorize broad runtime edits
from sprint prose.

Required before the gate can decide:

1. The sprint has a current blocker snapshot and active package for the latest
   representative artifact.
2. Canonical extractors agree on the first frontier, owner boundary, cause, and
   next required action, or the sprint records the exact extractor conflict.
3. A focused probe, replay fixture, or bounded evidence artifact represents the
   selected edge, or the sprint records why evidence is incomplete.
4. A direct code-path review names the concrete files or functions involved and
   separates existing owner contracts from consumer-local interpretation.
5. The sprint records a ranked candidate list with trigger evidence, rejected
   candidates, forbidden edits, and the next package route for each viable
   candidate.
6. The sprint states the roadmap and edition scope check before routing broad
   architecture work.

Allowed gate decisions:

- `continue-local-proof`: the same owner, boundary, and action remain selected,
  and a focused proof can still reduce, migrate, or turn the representative
  gate green.
- `open-contraction-package`: the same edge remains selected, but the next
  proof needs a narrower package boundary.
- `open-causal-analysis-package`: repeated reductions or oscillation require a
  phase/causal analysis package before more runtime edits.
- `architecture-gap`: the code-path review shows the owner contract is missing,
  contradictory, or would require a consumer-local reinterpretation to pass.
- `roadmap-sharpening-required`: the proposed reset is real but too broad for a
  bounded runtime package and must be converted into roadmap/spec/architecture
  scope first.
- `human-escalation`: evidence is contradictory or blocked by policy,
  credentials, or unavailable proof. It is not the default same-frontier route.
  This is the only gate outcome that `terminate`s a theory loop, and it maps to
  the closed termination reasons `blocked-frozen-decision` (policy/frozen
  decision) or `blocked-external-dependency` (credentials/unavailable proof);
  it keeps the sprint open as a handoff and is recorded in a
  `## Theory Loop Termination` section. Every other outcome above is a
  `redirect(next-action)` — an autonomous continuation, not a stop. See
  [`work/RULES.md#non-halting-continuation-invariant-r12`](../../../work/RULES.md#non-halting-continuation-invariant-r12).

Tracker contract:

- Packages carry `architectureDecisionGate` metadata with `status`, `trigger`,
  `triggerEvidence`, `choices`, `selectedChoice`, and `nextAction`.
- `work:current-blocker`, `work:context`, and `work:llm-start` surface the gate
  so the sprint can stop at the handoff instead of hiding the decision in prose.
- `status: required` means the tracker has enough evidence to stop and request
  concrete choices. `status: presented` means choices are visible but no route
  has been selected. Both states fail pre-implementation validation for active
  runtime/scenario work.
- `status: selected` names the selected choice and opens the bounded route for
  the next package or new sprint. For architecture gaps and unchanged
  same-frontier/no-reduction evidence, the default selected route is
  `architecture-package`, implemented as an autonomous architecture experiment.
  The selected route still must carry normal owner, boundary, scope,
  execution-role, validation, commit, and push evidence.
- The tracker infers and surfaces an autonomous architecture package route from
  `architecture-gap` scenario closure. Frontier oscillation is rendered as
  `watching`; it becomes an autonomous architecture experiment when the next
  local proof cannot reduce, migrate, or classify the edge without changing
  architecture. Human escalation remains reserved for contradictory or blocked
  evidence.

Limits:

1. The gate cannot authorize edits outside the active package scope.
2. The gate cannot replace canonical extractor evidence, package closure,
   required Execution Evidence roles, validation, or focused commit and push
   proof.
3. A representative green artifact is not success when it contradicts the
   selected owner contract; classify it as `architecture-gap`, `migrated`, or
   `contradictory` instead.
4. Architecture work opened by the gate still starts from an active package or
   roadmap-sharpening document with explicit owner, boundary, scope, proof, and
   forbidden edits.
5. Refresh the sprint gate card whenever the representative artifact,
   canonical owner boundary, or required action changes.

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
15. Recent frontier history when frontier oscillation is possible
16. Oscillation check when a related boundary recently closed or migrated
17. Handoff invariant when producer and consumer owners can disagree

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

## Scenario Failure Migration

Scenario-driven packages make blocker movement explicit.

Required workflow:

1. Name the current dominant blocker, owner, and boundary.
2. After focused proof is green, rerun the original scenario or the narrowest
   representative blocker probe.
3. Split one follow-on package only when canonical extraction shows semantic
   movement: first-frontier edge, semantic owner, owner boundary, or next
   required action changes. A dominant reason change qualifies only when it
   changes the next required action.
4. If the same owner boundary and next required action remain dominant, append
   normalized evidence to the current package and update the sprint blocker
   snapshot.
5. Do not open a new package merely because artifact path, epoch, node ids,
   counts, attempts, timings, timestamps, or presentation shape changed.

Same-owner reductions stay in the current package unless the required action
changes. If the only change is a smaller count, narrower node set, better
coverage, or clearer evidence for the same owner/boundary/action, update the
Current Edge Card and continue. A reduction such as `pendingReconcileCount=3`
to `1` is one package phase, not automatic successor-package evidence.

Fixture-first is a phase, not automatically a package boundary. A fixture-only
package is valid only when the fixture proves no runtime edit is justified,
changes the selected owner/boundary/action, or creates reusable tooling. When
the fixture confirms the same selected edge, continue in the same package:

1. classify edge
2. add or identify replay fixture/probe
3. run the implementation role
4. implement exact promoted files
5. run focused proof and representative rerun

Progress notes distinguish:

- blocker just reduced
- blocker now dominant
- hypothesis for why the new blocker was latent

Evidence copied from distributed or integration artifacts uses canonical
extractors when they exist. Manual summaries name source artifact paths and
preserve normalized owner fields.

## Frontier Oscillation Escalation

When a representative scenario frontier alternates between two related owner
boundaries, or returns to a recently closed boundary, stop opening ordinary
successor runtime packages.

Escalate when any of these happen:

1. The same representative scenario remains red and the first frontier moves
   A -> B -> A, or B -> A -> B.
2. A package closes as `migrated` to an owner boundary that was active or done
   within the last two related packages.
3. Escalate to causal analysis when two focused fixes in adjacent owner
   boundaries are green locally but do not produce representative green or
   monotonic representative reduction.

The next package uses the `causal-escalation` lane and owns the handoff between
the oscillating boundaries, not either boundary in isolation. If an active
package is already in the `causal-escalation` lane, it may continue only when it
explicitly owns that handoff, names the missing cross-boundary causal edge, and
keeps same-owner evidence in the same package.

That package defines:

1. the cross-boundary invariant
2. the producer owner outcome
3. the consumer owner precondition
4. the handoff freshness, revision, or acknowledgement rule
5. the exact missing-edge probe or replay fixture
6. the stop condition that permits a later local runtime fix

No further runtime patch in either oscillating boundary may start until that
handoff package identifies the failing causal edge. If the same two boundaries
alternate again without representative green or monotonic reduction, the next
validation surface must be a replayable handoff fixture or missing-edge probe
that includes both owners before more runtime edits start.

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
5. the first frontier returns to a recently closed related boundary or
   alternates between two related boundaries

A causal-analysis package produces or updates durable diagnostic or architecture
material covering:

- end-to-end phase model
- cross-entity causal graph
- budget and timeout accounting
- invariant review
- normalized failure-class taxonomy
- stop conditions for local fix, owner migration, autonomous architecture
  experiment, or human-only escalation for blocked/contradictory evidence

Runtime packages that follow cite the causal model, schema, decision table,
fixture, extractor, or artifact they rely on.
