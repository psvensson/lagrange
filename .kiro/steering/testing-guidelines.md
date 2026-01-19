# Testing Guidelines

## Test Duration Hard Limit

**Any test taking longer than 2 seconds is a HARD ERROR that requires immediate analysis.**

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

## Test Execution Strategy

When running tests during task execution:

1. **Run targeted tests only** - Don't run the full test suite except at checkpoints
2. **Focus on relevant tests** - Only run tests related to the feature/file being modified
3. **Run failing tests first** - When fixing issues, run only the specific failing test(s)
4. **Use test filtering** - Use patterns like `npm test -- --grep "pattern"` or similar to filter tests

## When to Run Full Test Suite

Only run the complete test suite (`npm test`) at:
- Checkpoint tasks explicitly marked in the task list
- Final integration verification
- When explicitly requested by the user

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
