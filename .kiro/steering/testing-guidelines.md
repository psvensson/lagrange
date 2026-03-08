# Testing Guidelines

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

After any distributed harness failure, run the consolidated diagnostics script
before implementing a fix:

```bash
npm run analyze:distributed-failure -- --report test-output/reports/<report>.report.json
```

This is required so every failure investigation starts from the same
structured signal set (phase reason counts, channel metrics, load metrics,
consistency mismatches, and cluster-stage timing) instead of ad hoc log
sampling.

## Distributed Scenario Policy SQL Ownership Gate

Distributed scenario code must route `tables.table_policies` mutations through
the canonical owner helper in
`test/distributed/scenarios/table-distribution-helpers.js`.

Do not introduce raw policy-update SQL in other scenario files.

Run this guard when changing distributed scenarios:

```bash
npm run guard:scenario-policy:file
```

## Property-Based Test Iteration Limit

Property-based tests using fast-check must limit iterations to keep test runs fast:

- **Maximum 10 iterations** - Use `{numRuns: 10}` for all `fc.assert()` calls
- This applies to all property tests in the project
- Do not use higher values like `numRuns: 100` or the default

Example:
```javascript
fc.assert(
  fc.property(
    fc.string(),
    (str) => str.length >= 0
  ),
  {numRuns: 10}  // Always limit to 10
);
```

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

**All test failures and timeouts must be fixed when discovered, even if pre-existing.**

When you discover failing or timing-out tests:

1. **DO NOT IGNORE** - Failing tests indicate broken functionality
2. **DO NOT DEFER** - Fix the issue immediately, even if it appears to be pre-existing
3. **INVESTIGATE** - Determine the root cause:
   - Is the test incorrect?
   - Is the implementation broken?
   - Is there a race condition or timing issue?
4. **FIX** - Resolve the issue:
   - Update the test if it's testing the wrong behavior
   - Fix the implementation if it's broken
   - Fix timing issues or clean up resources properly
5. **VERIFY** - Re-run the test to confirm it passes

**Rationale:** Broken tests erode confidence in the test suite. If tests are allowed to fail, developers stop trusting test results and the suite becomes worthless. Every test must pass, every time.

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

## Node Join Convergence SLO Strategy

All cluster join changes must include or update a convergence SLO integration
test. The purpose is to prove the system settles after topology change and does
not enter sustained churn.

### Required Assertions

After a node joins:

1. **Settle within fixed window** - Cluster must settle before a strict timeout
2. **Bounded leadership churn** - Leader-election events must stay below a
   partition-count-scaled cap
3. **No sustained over-target voters** - Any partition with voter count above
   target must return within a bounded duration
4. **Final state converged** - No partition may remain above target voter count
   at the end of the test

### Measurement Rules

1. Track leadership changes by subscribing to partition `LEADER_ELECTED` events
2. Sample voter counts at fixed interval from `services` system-table rows
3. Count only voter-ready partition replicas:
   - `service_type === 'partition'`
   - `status === ACTIVE`
   - explicit `raft_role` exists and is not `learner`
   - `address` is present
4. Record max continuous over-target duration per partition and assert it stays
   below threshold
5. Require a quiet window (no leader changes) before declaring settled

### Baseline Thresholds

Use these defaults unless a test has a justified reason to differ:

- `targetVoterCount = 3`
- `settleTimeoutMs = 20000`
- `quietWindowMs = 5000`
- `maxSustainedOverTargetMs = 2000`
- `sampleIntervalMs = 250`
- `maxLeaderChanges = partitionCount * 4`

### Required Coverage

For any change affecting rebalancing, learner promotion, leader election, or
node join flow:

1. Add or update convergence assertions in
   `test/integration/node-join-convergence-slo.integration.test.js`
2. Run the targeted test:
   `npm test -- test/integration/node-join-convergence-slo.integration.test.js`
3. If the test fails, treat it as a correctness regression, not just a timing
   issue

## When to Run Full Test Suite

Only run the complete test suite (`npm test`) at:
- Checkpoint tasks explicitly marked in the task list
- Final integration verification
- When explicitly requested by the user

## Full Test Suite Execution

The full test suite can take a very long time to run. Follow these guidelines:

1. **Use adequate timeout** - Set timeout to at least 150 seconds (150000ms)
2. **Dump output to file** - Save test output to a temporary file for analysis
3. **Analyze from file** - Perform multiple operations on the saved output instead of re-running tests

**Example workflow:**
```bash
# Run full suite once, save output to temp file
npm test 2>&1 > /tmp/test-output.txt

# Analyze the output multiple times without re-running
grep "# fail" /tmp/test-output.txt
grep "Error:" /tmp/test-output.txt
tail -50 /tmp/test-output.txt

# Clean up when done
rm /tmp/test-output.txt
```

**DO NOT:**
- Run the full test suite multiple times in a row
- Run the full suite without adequate timeout
- Try to parse output in real-time if it times out

## Test Output Management

- Avoid verbose test output that can overflow context
- If a test run produces too much output, re-run with specific test file or pattern
- Summarize test results rather than showing full output when possible

## Example Commands

```bash
# Run specific test file
npm test -- test/storage/partition.test.js

# Run tests matching a pattern
npm test -- --grep "should insert"

# Run a single test
npm test -- --grep "exact test name"
```

## Distributed test harness

Used for lifelike testing scenarios with multiple nodes and for efficiency testing.
See; test/distributed/README.local.md
