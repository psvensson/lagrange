---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Test execution strategy, harness rules, output management. Index: [`INDEX.md`](INDEX.md).

# Testing — Harness & Execution

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

## Test Duration Hard Limit

**Any unit test taking longer than 2 seconds is a HARD ERROR that requires immediate analysis. Integration tests can take up to 30 seconds.**

This is a powerful multi-core machine running in-memory tests, so there is no valid reason for a unit test to exceed 2 seconds (or an integration test 30 seconds). When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an integration test) you must not accept it as passing; remediate before proceeding by identifying the root cause and then resolving it.

Identify the root cause by looking for unnecessary `setTimeout()` or real-time delays in tests, uncleaned timers (`setTimeout`, `setInterval`) keeping the process alive, speculative execution or background intervals not disabled in tests, or actual performance bugs in the implementation. Resolve it by mocking time-based behavior instead of waiting for real time, clearing all timers in `finally` blocks, disabling background features (speculative execution, intervals) in unit tests, and using `Promise.resolve()` or immediate callbacks instead of delays.

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

## Test Execution Strategy

When running tests during task execution:

1. **Run targeted tests only** - Don't run the full test suite except at checkpoints
2. **Focus on relevant tests** - Only run tests related to the feature/file being modified
3. **Run failing tests first** - When fixing issues, run only the specific failing test(s)
4. **Use test filtering** - Use patterns like `npm test -- --grep "pattern"` or similar to filter tests

## When to Run Full Test Suite

Only run the complete test suite (`npm test`) at:
- Checkpoint tasks explicitly marked in the active Quest's `doneWhen` or frontier list
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

## External Testing Procedures and Resources

For additional testing-related details, refer to the following resources:
- **Distributed Harness & Scenario Policies**: Local procedures and guidelines live in `test/distributed/README.local.md`.
- **Property-Based Testing**: Project-local property-test iteration guidance lives in `test/README.local.md`.
- **Node Join Convergence SLO Strategy**: Integration-specific node-join convergence procedures live in `test/integration/README.local.md`.

