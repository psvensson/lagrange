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

These tests should be small and targeted. The goal is to prove architecture
conformance, not just end-state behavior.

## Test Duration Hard Limit

**Any uinit test taking longer than 2 seconds is a HARD ERROR that requires immediate analysis. INtegration tests can take up to 30 seconds**

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
