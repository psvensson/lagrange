# Testing Guidelines

## Document Role

This document governs stable testing policy for all code changes.

Use this file for:

- durable expectations for bug-fix testing
- owner-path regression policy
- test execution discipline
- durable policies that apply across workstreams
- validation rules for package-driven implementation work

Do not use this file for:

- exact script names
- narrow threshold tables tied to one suite
- single-scenario closure ladders
- local command examples

Local procedures live next to the relevant suites and workflows:

- [`../../test/README.local.md`](../../test/README.local.md)
- [`../../test/integration/README.local.md`](../../test/integration/README.local.md)
- [`../../test/distributed/README.local.md`](../../test/distributed/README.local.md)

For work-tracking workflow and package lifecycle, use:

- [`../../work/README.md`](../../work/README.md)

## Package-Driven Validation Policy

All non-trivial implementation work should have validation owned by its active
work package.

Required workflow:

1. The active work package must define the required validation surface.
2. Tests added during the change must match the package concern rather than an
   unrelated umbrella scope.
3. A package must not be renamed to `done-...` until its required validation
   has passed.
4. If validation reveals a second concern, split that concern into a new idea
   or work package instead of silently widening the current one.
5. After the package validation surface is green, perform the required
   package-closure deep dive across the affected area before closing the
   package.
6. If that deep dive finds mistakes, irregularities, or doctrine/system
   guideline violations in the affected area, fix them before renaming the
   package to `done-...`.
7. If a package changes a shared contract, validation must prove not only the
   runtime owner path, but also the direct status, diagnostics, admin, harness,
   or reporting surfaces that consume that contract.
8. A package is not validation-complete while tail-consumer proof is still
   missing, even if the main owner tests are green.
9. When residual closures are split into a follow-on package, the original
   package must stop short of `done-...` until the split is explicit in `work/`
   and the original package file names the exact handoff.

This keeps test closure aligned with bounded implementation scope instead of
letting validation sprawl across unrelated concerns.

The package is not done merely because the named tests pass. Test closure and
package closure both require the final affected-area deep dive required by
`.kiro/steering/system guidelines.md`.

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
   scenario still fails for a different named reason.

## Runner Stability Boundary Policy

When a validation run fails with unrelated TAP child-worker crashes such as
`SIGILL`, `SIGSEGV`, or `1..0 # no tests found`, treat the problem as a shared
runner-boundary concern until proven otherwise.

Required workflow:

1. Confirm whether the failing files are unrelated in domain behavior.
2. Prefer a shared runner or bootstrap fix before editing individual suites.
3. If the crash traces point to Node/V8 startup or worker initialization,
   harden the shared TAP worker configuration first.
4. Only return to suite-local fixes after the shared runner boundary is shown
   stable.

This prevents nondeterministic worker crashes from being misdiagnosed as a
series of unrelated test bugs.

## Runner Parallelism Budget Policy

When isolated subsystem or shard runs pass, but the aggregate TAP gate fails
only when all suites run together, treat the problem as a shared runner
parallelism-budget concern until proven otherwise.

Required workflow:

1. Confirm that the same suites pass in smaller grouped or isolated bail runs.
2. Check shared machine budget signals such as available RAM, swap pressure,
   and TAP worker count before editing individual suites.
3. Prefer lowering the shared TAP `jobs` budget or other runner-wide worker
   concurrency settings before chasing late aggregate-only assertions.
4. Only restore higher parallelism after the aggregate gate is proven stable at
   the new boundary.

This prevents full-gate resource collapse from being misdiagnosed as a long
tail of unrelated suite failures.

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

## System Guideline Conformance Gate for New and Existing Tests

When adding new tests or changing existing tests for production code, you must
also audit the code under test for System Guidelines violations and fix them as
part of the same change. This requirement applies equally to new test files and
edits to existing test files.

Required workflow:

1. Identify the production files touched by the new or modified test and their
   direct owner collaborators.
2. Check those files against `.kiro/steering/system guidelines.md` with special
   focus on:
   - owner dependency routing
   - duplicate logic and fallback paths
   - single source of truth for state and row-field ownership
3. If you find a violation, add a failing regression that captures it and fix
   the production code before closing the test task.
4. Do not land a test-only change that leaves a known System Guidelines
   violation in the code path being tested.
5. In test descriptions, name the owner path being verified (for example
   "uses `storageAdmissionService.checkSplit`" or
   "refreshes via `setRebalanceCoordinator`").
6. For CDC-replicated system-table lifecycle changes, include at least one
   regression that fails when writes are keyed by non-primary predicates instead
   of canonical primary key.

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
   that repeats the triggering cycle enough times to expose accumulation.
2. Assert owned resource metrics such as queue depth, subscriber count,
   in-flight map size, or buffered-event count return to a bounded plateau.
3. If the distributed harness reported heap growth, add or refine diagnostics
   that map the growth to an owning subsystem before rerunning the broad
   scenario.

## Test Duration Hard Limit

**Any unit test taking longer than 2 seconds is a HARD ERROR that requires immediate analysis. Integration tests can take up to 30 seconds**

This is a powerful multi-core machine running in-memory tests. There is no valid reason for tests to take more than a couple of seconds. If a test exceeds this limit:

1. **STOP** - Do not accept the test as passing
2. **ANALYZE** - Identify the root cause:
   - Unnecessary `setTimeout()` or real-time delays in tests
   - Uncleaned timers (`setTimeout`, `setInterval`) keeping the process alive
   - Speculative execution or background intervals not disabled in tests
   - Actual performance bugs in the implementation
3. **FIX** - Resolve the issue before proceeding:
   - Mock time-based behavior instead of waiting for real time
   - Ensure all timers are cleared in `finally` blocks
   - Disable background features (speculative execution, intervals) in unit tests
   - Use `Promise.resolve()` or immediate callbacks instead of delays

**Common violations:**
```javascript
// ❌ WRONG - Real delay in test
await new Promise(resolve => setTimeout(resolve, 100));

// ✅ CORRECT - Immediate execution
await Promise.resolve();

// ❌ WRONG - Timer never cleared
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('timeout')), 30000);
});

// ✅ CORRECT - Timer cleared in finally
let timeoutId;
try {
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), 30000);
  });
  // ... use promise
} finally {
  clearTimeout(timeoutId);
}
```

## Timeout Budget and Classification Policy

Timeouts in control-plane logic are hard correctness bugs and must be tested as
typed outcomes, not generic strings.

Required behavior:

1. Add tests that assert remaining-budget derivation for nested operations
   rather than fresh full-budget resets.
2. Add tests that assert timeout classification payloads, not only error text.
3. Treat exact-boundary timeout clusters (for example exactly 4s/6s/30s/60s)
   as hard failures requiring deterministic regression coverage before closure.
4. Include timeout class and budget context in integration or harness failure
   artifacts used for diagnosis.

## Distributed Harness Failure Triage Script
Distributed-harness local procedure lives in
`test/distributed/README.local.md`.

## Distributed Scenario Policy SQL Ownership Gate
Distributed-scenario local procedure lives in
`test/distributed/README.local.md`.

## Property-Based Test Iteration Limit
Project-local property-test iteration guidance lives in
`test/README.local.md`.

## No Skipped Tests Policy

Tests must never be skipped. Every test that exists must run and pass.

- **Do not use** `.skip()`, `skip:`, `xit()`, `xdescribe()`, or any skip mechanism
- **Do not comment out** tests to avoid running them
- If a test is failing, fix the code or the test - do not skip it
- If a test is no longer relevant, remove it entirely rather than skipping

## No Test-Only Code Paths in Production Code

**Production code must never contain alternate code paths, branches, or
special-case logic that exist solely to make tests pass.**

Tests must exercise the real production code paths. If a test cannot be written
against the existing code, that is a signal to improve the design — not to add
a test-specific backdoor.

It is FORBIDDEN to:

- Add `if (process.env.NODE_ENV === 'test')` or similar environment checks
  that change runtime behavior for tests.
- Introduce optional parameters, flags, or configuration that are only used by
  test harnesses to bypass real logic.
- Create alternate constructors, factory methods, or initialization paths that
  only tests call.
- Weaken validation, skip steps, or short-circuit logic to make a test
  scenario easier to set up.
- Export internal implementation details solely so tests can reach them.

If production code is hard to test, fix the design:

1. **Extract and inject** - Break the hard-to-test dependency out and inject it
   so tests can supply a controlled substitute.
2. **Narrow the interface** - If a component does too much, split it so each
   piece is independently testable through its public contract.
3. **Use the real path** - Set up the test to exercise the same code path that
   production uses, even if setup is more involved.

The test suite must prove that production code works — not that a
test-friendly fork of it works.

## Fix Failing Tests Immediately

Failures discovered in the touched area, or discovered by the test runs chosen
for the current change, must be resolved before the task closes.

When you discover failing or timing-out tests:

1. **DO NOT IGNORE** - Failing tests indicate broken functionality
2. **DO NOT DEFER** - Resolve the failure before closing the current task when
   it is in the touched area or surfaced by the runs you chose to perform
3. **INVESTIGATE** - Determine the root cause:
   - Is the test incorrect?
   - Is the implementation broken?
   - Is there a race condition or timing issue?
4. **FIX** - Resolve the issue:
   - Update the test if it's testing the wrong behavior
   - Fix the implementation if it's broken
   - Fix timing issues or clean up resources properly
5. **VERIFY** - Re-run the test to confirm it passes

**Rationale:** Broken tests erode confidence in the suite. Work must not close
while the touched area remains red.

## System-Table Mutation Test Requirements

For any change that affects writes to `services`, `nodes`, `partitions`,
`tables`, or another system table with shared ownership:

1. Add or update a unit test for the direct writer/owner path.
2. Add or update one integration test that verifies the resulting row becomes
   visible through `SystemTableCache` on the relevant node or nodes.
3. When the mutation is lifecycle-related, assert both:
   - the initial row exists with canonical identity fields
   - later transitions preserve owner boundaries and do not recreate or replace
     the row

Do not rely on a broad scenario test alone when the bug is in a narrow
system-table write path.

## Test Execution Strategy

When running tests during task execution:

1. **Run targeted tests only** - Don't run the full test suite except at checkpoints
2. **Focus on relevant tests** - Only run tests related to the feature/file being modified
3. **Run failing tests first** - When fixing issues, run only the specific failing test(s)
4. **Use test filtering** - Use patterns like `npm test -- --grep "pattern"` or similar to filter tests

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

## Node Join Convergence SLO Strategy
Integration-specific node-join convergence procedure lives in
`test/integration/README.local.md`.

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

Required workflow:

1. Read `triage-summary.md` first.
2. Read `triage-summary.json` next.
3. Use the consolidated diagnostics tooling before sampling raw node logs.
4. Only after the artifact summaries have been read may raw container or node
   logs become the primary debugging surface.

This keeps rerun cost low and prevents repeated raw-log spelunking from becoming
an accidental substitute for canonical owner diagnostics.

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

## When to Run Full Test Suite

Only run the complete test suite (`npm test`) at:
- Checkpoint tasks explicitly marked in the task list
- Final integration verification
- When explicitly requested by the user

## Full Test Suite Execution
Full-suite local execution procedure lives in `test/README.local.md`.

## Test Output Management
Output-handling procedure lives in `test/README.local.md`.

## Example Commands
Command examples live in `test/README.local.md`.

## Distributed test harness

Used for lifelike testing scenarios with multiple nodes and for efficiency testing.
See `test/distributed/README.local.md`.

## Availability Under Pressure Test Policy

System guideline §1.10 requires that all subsystems remain correct under load.
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

- These tests belong alongside the existing unit or integration tests for the
  component, not in a separate stress-test directory.
- They MUST respect the standard duration limits (2s unit, 30s integration).
  Use mocked time and injected latency, not real delays.
- Name them clearly: include "under pressure", "slow dependency",
  "concurrent callers", or "stale cache" in the test description.

### Idempotency regression coverage

For any state-mutating operation path (system guideline §1.13), add at least
one test that:

1. Executes the operation once and records the resulting state.
2. Executes the same operation again with the same inputs.
3. Asserts the state is identical after both executions.

This applies to row creation, lifecycle transitions, workflow step advances,
and any CDC-propagated mutation.
