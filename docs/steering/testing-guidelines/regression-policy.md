---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Bug-fix regression policies and owner-path regression rules. Index: [`INDEX.md`](INDEX.md).

# Testing — Regression Policy

## Test-First Bug Fix Policy

**All bug fixes MUST be preceded by a failing test that reproduces the bug.**

Before implementing any fix for a reported bug or error:

1. **REPRODUCE** - Create a test that demonstrates the bug
   - The test must fail with the current code
   - The test should capture the exact failure scenario from the bug report
   - Use minimal setup to isolate the bug

2. **VERIFY** - Run the test to confirm it fails as expected
   - The failure message should match the reported error
   - Document the root cause in test comments if known

3. **FIX** - Only after the test fails, implement the fix
   - The fix should make the failing test pass
   - No other tests should break

4. **CONFIRM** - Run the test again to verify the fix works

This ensures:
- Bugs are properly understood before fixing
- Fixes are verified to actually solve the problem
- Regressions are prevented by the new test
- The test suite grows to cover real-world failure scenarios

## Reuse-First Fix Strategy

**Before writing new code to fix a bug, search for existing systems or
abstractions that already solve the problem or can be extended to solve it.**

This applies to both the fix itself and the test that reproduces it.

### When fixing a bug

1. **Search for existing owners** - Does a component already own this behavior?
   Extend or correct it rather than adding a parallel path.
2. **Search for existing abstractions** - Is there a helper, base class, shared
   utility, or state machine that already handles the general case? Wire into
   it instead of building a one-off solution.
3. **Combine before creating** - If two existing pieces almost solve the
   problem, combine them. Do not create a third piece that reimplements both.
4. **Pause and zoom out** - Periodically step back and ask whether the bug is a
   symptom of a higher-level architectural issue. If a broader fix at a higher
   layer would prevent an entire class of bugs, prefer that over a narrow
   patch at the symptom site. Flag the broader opportunity even if the
   immediate fix is scoped smaller.

### When writing the reproduction test

1. **Reuse existing test fixtures and helpers** - Check the test suite for
   setup utilities, factory functions, or shared harnesses that already
   construct the scenario you need.
2. **Extend existing test files** - If a test file already covers the component
   under test, add the new case there rather than creating a new file.
3. **Leverage existing assertion patterns** - Follow the conventions already
   established in nearby tests for asserting ownership, lifecycle, and state.

### Periodic architecture check

During any multi-step fix or feature, pause at least once to consider:

- Is the current problem a repeated pattern? If so, is there a shared
  abstraction that should exist but does not?
- Would a small refactor at a higher level eliminate the need for the current
  fix entirely?
- Are multiple recent bugs clustering around the same boundary or component?
  That may indicate a design-level issue worth addressing instead of patching
  each symptom individually.

Document these observations in commit messages or PR descriptions so the team
can evaluate broader changes.

## Bug-Cluster Escalation Policy

When the second correctness bug appears at the same architectural boundary in
one work cycle, the response must escalate from a local patch to boundary
consolidation.

Examples of a boundary:

- metadata mutation ingress
- metadata read ingress
- bootstrap-to-runtime handoff
- CDC dissemination
- readiness classification
- transport admission

Required workflow:

1. Name the shared boundary explicitly in the failing test or task notes.
2. Add a targeted regression for the current symptom.
3. Add or update an architectural task/spec that reduces the number of runtime
   paths across that boundary.
4. Do not close the second bug with only a local patch if the porous boundary
   remains unchanged.
5. The next regression in that area must prove the reduced boundary, not only
   the immediate symptom.

## Owner-Path Regression Policy

When a bug involves component ownership, lifecycle persistence, or system-table
row mutation, tests must prove that the canonical owner is actually used.

Required coverage:

1. **Injected owner usage** - If setup injects an owner such as
   `replicaStateMachine`, `serviceLifecycleManager`, or similar, add a test that
   fails if the consumer bypasses that owner.
2. **Create-vs-update separation** - Add coverage proving that the initial row
   creation path uses insert/full-shape semantics and later lifecycle changes use
   update/partial-shape semantics.
3. **Field ownership protection** - Add a regression test that a component does
   not rewrite fields owned by another component (for example, `raft_role`).
4. **Missing-row behavior** - Add a test proving a missing authoritative row is
   handled only by the canonical creation owner, not by a local fallback inside
   an updater.
5. **Primary-key mutation path** - For CDC-propagated system tables, add a
   regression that lifecycle updates are executed with primary-key-addressed
   writes (query rows, then update by PK) rather than broad predicate updates.

These tests should be small and targeted. The goal is to prove architecture
conformance, not just end-state behavior.

## Gateway Boundary Regression Policy

When a change touches shared metadata reads or writes, tests and CI checks must
prove the canonical gateway boundary is still the only runtime ingress.

Required coverage:

1. Add or update a regression proving the caller routes through the canonical
   metadata read or mutation gateway rather than raw helper access.
2. If a semantic owner exists above the gateway, add coverage that the caller
   goes through that owner rather than invoking the gateway directly.
3. Add or update a structural guard that fails when non-owner runtime code
   imports raw system-table mutation helpers or ad-hoc metadata read helpers.
4. Prefer import-boundary or API-boundary guards over table-by-table
   allowlists. The goal is to enforce one path structurally.

## Deterministic Control-Loop Regression Policy

When a change touches control-plane progression (dispatch, rebalance, split,
admission progression, operation timeout handling), tests must prove
deterministic owner-path behavior rather than only eventual convergence.

Required coverage:

1. **Single in-flight reconcile** - Add a regression proving only one
   progression execution can run for a given owner key at a time.
2. **Enqueue-only triggers** - Add coverage proving event handlers enqueue work
   and do not execute long-running progression inline.
3. **No dual mutation paths** - If polling/recovery exists, prove it feeds the
   same owner queue instead of mutating state via a second direct path.
4. **Monotonic workflow transitions** - Add a regression proving no backward
   step transitions except explicit terminal recovery transitions.
5. **Stale-fence rejection** - Add a regression proving stale owner claims or
   stale events cannot overwrite newer transitions.
6. **Acknowledgement-before-advance** - For executor-owned boundaries, add a
   regression proving the owner advances only after durable participant
   acknowledgement rather than cache timing or elapsed time.
7. **Readiness-dimension verification** - For topology changes, assert that
   internal consumers use `repairEligible` and that routing/benchmark paths use
   `serveEligible`.
8. **Cache observation boundary** - Add a regression proving cache divergence
   emits typed diagnostics/invariant input and that recovery re-enters the same
   owner queue rather than a direct mutation fallback.

## Temporal Witness Replay Policy

When a bug depends on stale cache truth, stale routing, delayed authoritative
visibility, no-handler witnesses, or other cross-time evidence races, the
regression must replay the witness order that triggered the bug rather than
asserting only the final steady state.

Required coverage:

1. Capture at least one stale or degraded earlier witness that points to the
   old state.
2. Capture the newer runtime or authoritative witness that disproves the old
   state.
3. Assert the owner emits the canonical deferred, repair, widen, or blocked
   outcome for that witness ordering.
4. Assert the caller or consumer does not fall back to stale routing, empty
   visibility, or local semantic reinterpretation after the newer witness
   arrives.
5. Prefer focused unit or integration replays over broad scenario-only proof,
   but keep the original scenario or representative blocker probe in the
   validation surface.

## Continuity And Lifetime Regression Policy

When a change touches CDC propagation, watches, subscriptions, reconnect loops,
buffers, queues, or phase-to-runtime handoff, tests must prove continuity and
bounded lifetime, not just eventual correctness.

Required coverage:

1. **Phase completion continuity** - Prove the needed runtime path still exists
   after bootstrap, join, or recovery phase completion.
2. **Restart continuity** - Prove subscriptions, watches, or reconnect owners
   re-establish without requiring manual repair or broad fallback reads.
3. **Failover continuity** - Prove leadership or transport failover does not
   leave the dissemination path detached or waiting on a dead phase owner.
4. **Bounded lifetime** - Prove listener counts, queue depth, retry registries,
   and deferred-work maps plateau under repeated cycles.
5. **Typed handoff diagnostics** - If continuity breaks, assert typed owner or
   handoff diagnostics rather than generic timeout failure.

## Bounded-Memory Regression Policy

When a bug involves buffering, retries, subscriptions, deferred work, or queue
pressure, the fix is not closed until tests show memory-related state plateaus.

Required coverage:

1. Add a deterministic unit or integration regression for the owning component
   that repeats the triggering cycle a bounded number of times — enough to
   expose accumulation while staying within the duration limits (2s unit / 30s
   integration).
2. Assert owned resource metrics such as queue depth, subscriber count,
   in-flight map size, or buffered-event count return to a bounded plateau.
3. If the distributed harness reported heap growth, add or refine diagnostics
   that map the growth to an owning subsystem before rerunning the broad
   scenario.

## Structured Deferred-Outcome Regression Policy

When an owner path is intentionally unresolved under pressure, publication
establishment, or recovery completion, tests must prove the caller receives a
structured deferred outcome rather than ambiguous absence.

Required coverage:

1. Assert the canonical deferred vocabulary for the boundary, such as
   `outcome`, `completionState`, `reasonCodes`, `retryAfterMs`,
   `runtimeAuthority`, `visibilityState`, or other owner-defined fields.
2. Assert that callers preserve or consume that contract instead of silently
   converting it into:
   - `[]`
   - `null`
   - timeout-only failure text
   - generic fallback success
3. When diagnostics or reports consume the boundary, add coverage that they
   emit the structured deferred state directly.
4. If the same hotspot family has a bounded audit, update that audit in the
   same change.

## Read-Side Repair Separation Regression Policy

When a change touches startup, readiness, admin snapshot, service discovery, or
another shared control-plane truth surface, tests must prove readers observe
and schedule repair instead of repairing inline.

Required coverage:

1. Add a regression showing the non-forced read path returns a fresh, stale,
   deferred, or failed observation contract without blocking on synchronous
   multi-table authoritative repair.
2. Add a regression showing any background or deferred repair is routed
   through the shared owner path rather than a reader-local retry loop.
3. If the caller caches the observation, add a regression proving stale or
   deferred blocked answers are not memoized as fresh truth.
4. If the same boundary also carries critical convergence traffic, add coverage
   proving that diagnostics or repair deferral does not block the critical
   owner path.

## Availability Under Pressure Test Policy

System guideline §9 (Load May Slow The System, Not Break It) requires that all
subsystems remain correct under load.
Tests MUST verify this property at the unit and integration layers, not only in
the distributed harness.

### When to add pressure tests

For any component that:

- Accepts work from a queue, event stream, or external caller
- Makes decisions based on cached or eventually-consistent state
- Participates in topology transitions (split, move, rebalance, election)
- Applies timeouts or deadline budgets

### Required coverage patterns

1. **Slow-dependency resilience** — inject artificial latency into a dependency
   (mock that resolves after a delay) and prove the component does not fail,
   corrupt state, or drop work. It may be slower, but it must remain correct.
2. **Concurrent-caller correctness** — submit multiple concurrent requests to
   the same component and prove no race conditions, lost updates, or duplicate
   side effects occur.
3. **Backpressure propagation** — if the component has a bounded queue or
   admission control, prove that exceeding capacity returns a structured
   rejection (not a timeout or silent drop).
4. **Stale-state tolerance** — inject stale cache data or delayed CDC
   propagation and prove the component makes correct (possibly conservative)
   decisions rather than incorrect ones.
5. **Resource plateau** — for components that buffer, subscribe, or defer work,
   prove owned resource counts plateau instead of growing across repeated
   pressure cycles.

### Test structure

- Pressure tests belong alongside the existing unit or integration tests for the
  component, not in a separate stress-test directory.
- Pressure tests MUST respect the standard duration limits (2s unit,
  30s integration). Use mocked time and injected latency, not real delays.
- Name them clearly: include "under pressure", "slow dependency",
  "concurrent callers", or "stale cache" in the test description.

### Idempotency regression coverage

For any state-mutating operation path (system guideline §11, Mutations Are
Idempotent), add at least
one test that:

1. Executes the operation once and records the resulting state.
2. Executes the same operation again with the same inputs.
3. Asserts the state is identical after both executions.

This applies to row creation, lifecycle transitions, workflow step advances,
and any CDC-propagated mutation.
## Fix Failing Tests Immediately

Failures discovered in the touched area, or discovered by the test runs chosen
for the current change, must be resolved before the task closes.

When you discover failing or timing-out tests you must address each failure with this remediation sequence rather than ignoring or deferring it:

1. **Do not ignore a failing test.** A failing test indicates broken functionality and must be treated as a stop-the-line signal for the touched area.
2. **Do not defer the failure.** When the failure is in the touched area, or was surfaced by the runs you chose to perform, you must resolve it before closing the current task.
3. **Investigate the root cause.** Determine whether the test itself is incorrect, the implementation is broken, or a race condition or timing issue is at fault.
4. **Apply the fix.** Update the test if it is checking the wrong behavior, fix the implementation if it is broken, or fix timing issues and clean up resources properly.
5. **Verify by re-running.** Re-run the test to confirm it passes before closing the task.

**Rationale:** Broken tests erode confidence in the suite. Work must not close
while the touched area remains red.

## Baseline-Discovered Bug Closure Policy

Distributed baseline runs are allowed to discover bugs, but they are not
allowed to be the only place those bugs remain reproducible.

For any correctness bug first discovered in a `3node`, `5node`, or `7node`
distributed baseline:

1. Add a targeted reproduction before closure.
2. Start reproduction in regular deterministic layers first (unit and targeted
   integration) before rerunning a full distributed harness.
3. Prefer the deterministic integration layer under `test/integration/` over a
   full Docker baseline rerun when the bug can be isolated there.
4. Use the smallest fixture layer that still preserves the failure contract:
   replica creation, promotion delay, failed move, degraded admission,
   fallback visibility, or other control-plane instability.
5. Do not mark the bug closed just because the baseline rerun happens to pass.
   Closure requires a stable targeted regression in the normal development
   loop.
6. If a baseline failure cannot yet be reproduced below the full harness,
   record that gap explicitly and keep the issue open until the deterministic
   layer exists.
7. Treat timeouts as hard correctness failures by default. Do not raise product,
   harness, or scenario timeouts as a fix until a deterministic root-cause
   reproduction exists.
8. For each timeout failure, add or refine diagnostics that identify the owning
   subsystem (for example queue depth, in-flight work, and backpressure/admission
   signals) before rerunning broad harness scenarios.
9. If two baseline failures cluster at the same architectural boundary, record
   the boundary and open a consolidation task/spec before continuing with more
   local fixes.

