---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Distributed validation ladders, artifact-first triage, scenario failure migration. Index: [`INDEX.md`](INDEX.md).

# Testing — Release-Gate & Distributed Validation

## Scenario-Driven Failure Migration Validation Policy

When a package exists because a distributed, integration, load, or scenario
failure exposed a blocker, validation must prove not only the local fix but
also what the original scenario does next.

Required workflow:

1. Keep one named reference scenario or blocker probe for the package.
2. After targeted regression and owner-path proof is green, rerun that
   scenario or probe before treating the analysis as closed.
3. If the scenario still fails, record whether the dominant blocker is the
   same or has migrated.
4. If the blocker migrated, update the active package or split a follow-on
   package in the same work cycle instead of burying the new blocker in
   commentary or memory.
5. Do not close the package on local green proof alone while the reference
   scenario still fails for a different named reason. Sprints and packages
   must never close from symptom movement alone (such as changed timeout
   durations, timing offsets, or message counts); they must prove the named
   contract transition or owner-boundary correctness.
6. If the package has already recorded two material blocker migrations, the
   next validation cycle must start from a replayable owner-decision fixture or
   the narrowest blocker probe that represents the current dominant owner.
7. A scenario-driven package that changes runtime meaning, decision meaning, or
   presentation meaning must prove the current blocker in this order:
   owner-decision fixture or blocker probe, focused owner tests, affected
   presentation tests, then the representative scenario.
8. Presentation tests are required when failure bundles, triage summaries,
   admin summaries, active gates, or report writers consume the changed
   contract. A green owner test alone is not sufficient if presentation can
   still classify the same evidence under a different blocker.
9. If the representative scenario still fails after the fixture and focused
   tests pass, the package must record whether the fixture contract was
   correct and what new owner boundary now dominates.
10. A fresh artifact with different counts, node ids, epochs, or timing does
    not by itself prove blocker migration. Treat it as the same blocker until
    the normalized evidence shows a different semantic owner, owner boundary,
    or next required action.
11. When the same owner boundary still dominates, validation must update the
    active package and sprint current blocker snapshot instead of forcing a new
    package split.
12. The active scenario package owner and boundary must match the canonical
    current first frontier recorded in `scenarioCausalClosure`. If a package
    intentionally owns a diagnostic/support role while the first frontier stays
    elsewhere, it must record explicit `ownerBoundaryMigrationProof` metadata
    with from/to owner-boundary, reason, and focused evidence.
13. If artifact-derived evidence tooling exists for the scenario, use it to
    produce the validation handoff block before writing manual analysis. For
    priority recovery residuals, use
    `npm run analyze:priority-recovery-residuals -- <artifact>` instead of
    hand-written `jq` extraction.
14. A representative rerun should not be the next debugging step while the
    current owner-decision fixture or narrow blocker probe is missing.
15. Retryable or backpressure states require focused probes that prove the
    concrete progress mechanism: wake, retry, timeout, reconcile, drain,
    dispatch, delivery, timer, advance, or bounded progress. A representative
    rerun may confirm that proof, but it must not replace the missing
    causal-edge probe.
16. When a package classifies a retryable or backpressure state as bounded
    rather than fixing runtime code, the validation must prove why the state is
    not the first frontier, which downstream blockers remain, and which stop
    condition prevents another local patch.
    That classification cannot rest on prose alone: it must name the focused
    probe command, proof artifact path, expected observable transition, maximum
    progress bound, and same-frontier fallback.
17. Repeated crossings of the same owner boundary must escalate to a causal
    analysis package or autonomous architecture experiment unless the package
    includes a focused probe for the missing causal edge.
18. If representative evidence oscillates between two related owner
    boundaries, the next validation surface must be a replayable handoff
    fixture or missing-edge probe that includes both boundaries. Focused owner
    tests for either boundary alone are insufficient. The fixture or probe must
    decide which owner owns progress, defer, retry, or terminal classification
    for the handoff before another owner-local runtime patch starts.
19. When repeated scenario runs keep failing after local fixes or
    classification-only reductions, the next validation package must establish a
    causal-analysis boundary or autonomous architecture experiment before more
    runtime fixes. At minimum it must validate the end-to-end phase model,
    cross-entity causal graph, budget/timeout accounting, invariant review,
    failure-class taxonomy, and architecture-level stop conditions.
20. A runtime fix that follows causal-analysis escalation must cite the causal
    model or artifact it uses, then prove that its local regression changes the
    relevant causal edge rather than only improving the immediate symptom.

## Distributed Validation Ladder Policy

For control-plane, readiness, topology, and other shared distributed-boundary
work, the normal debugging loop must follow one validation ladder instead of
jumping straight from unit failures to repeated full distributed reruns.

Required workflow:

1. Run the targeted owner-path tests for the boundary you are changing.
2. Run the boundary-transition scenario layer next.
3. If the package or runner boundary requires it, run the shared unit-only gate
   before any checkpoint distributed rerun.
4. Run a full `5node` or `7node` harness scenario only after the earlier
   stages are green.
5. Treat the full distributed rerun as checkpoint truth, not as the default
   inner-loop debugger.

Local execution may use `scripts/run-distributed-validation-ladder.js` to
make this order explicit. Work packages should list their targeted owner tests,
the relevant boundary-transition scenarios, and the final distributed checkpoint
command in that same order.

## Artifact-First Distributed Failure Triage Policy

After a distributed harness failure, artifact-first triage is mandatory.
Distributed artifact triage must start with `npm run work:evidence-summary --
<artifact>`, the focused extractor for the failure class such as `npm run
analyze:priority-recovery-residuals -- <artifact>`, and `npm run
analyze:owner-files -- <owner> [boundary]` before broad text search, raw JSON
slicing, ad hoc `jq`, or raw logs.

Required workflow:

1. Read `triage-summary.md` first.
2. Read `triage-summary.json` next.
3. Use the consolidated diagnostics tooling before sampling raw node logs:
   start with `npm run work:evidence-summary -- <artifact>` and then use the
   focused extractor for the failure class, such as
   `npm run analyze:priority-recovery-residuals -- <artifact>`.
4. Use `npm run analyze:owner-files -- <owner> [boundary]` before broad text
   search or opening large owner-boundary segment files.
5. Only after the artifact summaries and relevant extractors have been read may
   raw container logs, node logs, raw JSON slicing, or ad hoc `jq` become the
   primary debugging surface.
6. When the harness provides a report, playback bundle, failure bundle, or
   triage summary, derive a compact evidence block from those artifacts before
   assigning sub-agent work or changing runtime code.
7. The evidence block must name the canonical blocker, owner boundary, source
   artifact paths, prior blocker status, subordinate evidence, and next focused
   proof surface.
8. Manual evidence summaries are allowed only when no extractor exists or the
   extractor output is insufficient. They must preserve the normalized owner
   fields from the artifact rather than reclassifying from raw logs, and the
   package must record why the extractor was not enough.

This keeps rerun cost low and prevents repeated raw-log spelunking from becoming
an accidental substitute for canonical owner diagnostics.

## Boundary-Transition Scenario Layer Policy

Between focused owner-unit tests and full distributed harness reruns, use a
dedicated boundary-transition scenario layer when the failure sits at a shared
distributed boundary.

Use this layer when:

1. The bug depends on several real owner contracts interacting together.
2. A tiny unit test loses the important owner transition.
3. A full `5node` or `7node` rerun is truthful but too expensive for the next
   debugging step.

Required workflow:

1. Name the boundary explicitly in the test description and package notes.
2. Reuse existing harness helpers and owner snapshots instead of building a
   second fake distributed framework.
3. Assert canonical state transitions directly, for example:
   - usable spread versus raw spread
   - routed admission versus local usability
   - structured deferred outcome versus timeout-shaped silence
   - dispatch contribution versus nominal admission
4. Keep the scenario narrow enough to run in the normal local loop.
5. Still finish with the full distributed harness when the package explicitly
   requires real-cluster closure.

This layer exists to shrink the gap between “too small to be truthful” and
“too expensive to iterate on”.

## Agent And Sub-Agent Validation Handoff Policy

When an agent or sub-agent is used to continue a sprint, validation ownership
must follow the same evidence ladder as package work.

Required workflow:

1. The first delegated or local analysis step must extract the canonical
   evidence from the latest artifact and compare it with the sprint current
   blocker snapshot.
2. Before implementing a new or continued package, delegate a review of the
   most recently executed package on the same sprint or owner boundary.
3. The review must check package closure evidence, residual inventory,
   guardrail ledger, blocker migration notes, sprint snapshot consistency, and
   whether the last package's stated next action still matches current
   artifact evidence.
4. If that review finds actionable defects, delegate a bounded fix for those
   defects and validate that fix before starting the new package
   implementation.
5. A separate implementation sub-agent may start the current work package only
   after the previous-package review is clean or the review findings have been
   fixed.
6. A second analysis step may map the owner path, focused fixture, or affected
   presentation surface, but must not broaden beyond the current snapshot.
7. Implementation work should start only after the current owner boundary and
   smallest proof surface are named.
8. If several sub-agents are used, give each one a disjoint question or file
   scope. Do not ask several workers to independently fix the same blocker.
9. The final validation note must state whether the representative scenario
   passed, stayed on the same owner boundary, or migrated to a new named
   owner boundary.
10. If the blocker stayed on the same owner boundary, update the current
   package rather than opening a new package.
11. If the blocker migrated, update the sprint current blocker snapshot and
   activate exactly one new representative package before further runtime
   edits.

