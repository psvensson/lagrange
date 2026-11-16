---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Test execution strategy, harness rules, output management. Index: [`INDEX.md`](INDEX.md).

# Testing — Harness & Execution

## Runner Stability Boundary Policy

When a validation run fails with unrelated TAP child-worker crashes such as
`SIGILL`, `SIGSEGV`, or `1..0 # no tests found`, treat the problem as a shared
runner-boundary hypothesis to investigate. Preserve the first failing artifacts
before changing runner settings or retrying; a startup crash is not itself proof
of a product defect.

Required workflow:

1. Confirm whether the failing files are unrelated in domain behavior.
2. Prefer a shared runner or bootstrap fix before editing individual suites.
3. If the crash traces establish a Node/V8 startup or worker initialization
   cause, repair the shared TAP worker boundary.
4. Only return to suite-local fixes after the shared runner boundary is shown
   stable.

This prevents nondeterministic worker crashes from being misdiagnosed as a
series of unrelated test bugs.

## Runner Parallelism Budget Policy

When isolated subsystem or shard runs pass, but the aggregate TAP gate fails
only when all suites run together, investigate shared runner capacity alongside
possible product contention. Passing in isolation does not refute a concurrency
defect.

Required workflow:

1. Confirm that the same suites pass in smaller grouped or isolated bail runs.
2. Check shared machine budget signals such as available RAM, swap pressure,
   and TAP worker count before editing individual suites.
3. If measured resource exhaustion prevents valid execution, correct the shared
   TAP `jobs` budget or worker placement. Retain the failure and distinguish
   runner capacity from product behavior under the required load.
4. Only restore higher parallelism after the aggregate gate is proven stable at
   the new boundary.

This prevents full-gate resource collapse from being misdiagnosed as a long
tail of unrelated suite failures.

## Test Duration Targets and Hardware Tolerance

Operator supersession, 2026-10-12: observed execution time depends on VM and
hardware. The targets remain 2 seconds for a unit case and 30 seconds for an
integration case; up to **10 times the target** is acceptable for this elapsed-
time performance gate. Over-target measurements retain their actual duration
and ratio and are reported as tolerated, not as meeting the target. Beyond
20 seconds/unit or 300 seconds/integration requires investigation. Historical
failed measurements remain unchanged; later dispositions cite this ruling.

A test is integration when its filename ends in `.integration.test.js` or it
lives under `test/integration/` or `test/bootstrap/`; all other `*.test.js` are
unit cases. Do not reclassify tests just to gain tolerance. Per-case measurements
are distinct from file/runner startup costs.

This explicitly replaces the previous machine-specific 2/30-second HARD ERROR
rule for observed test cost only. It does not raise production protocol, seed,
election, lease, retry or caller deadlines; alter asserted ordering/budgets;
turn test timeouts, hangs, missing output or unengaged cases into passes; or
waive correctness, resource, audit or independent review requirements. Test
runner kill timeouts are unchanged unless separately justified and reviewed.

Beyond that tolerance, retain the failure and identify the product, fixture,
runtime or host cause. Do not accept it as passing or raise the limit to hide
that cause. Use the runner's existing machine-budget handling where applicable
and keep the required workload unchanged.

Identify the root cause by looking for unnecessary `setTimeout()` or real-time delays in tests, uncleaned timers (`setTimeout`, `setInterval`) keeping the process alive, speculative execution or background intervals not disabled in tests, or actual performance bugs in the implementation. Resolve it by mocking time-based behavior instead of waiting for real time, clearing all timers in `finally` blocks, disabling background features (speculative execution, intervals) in unit tests, and using `Promise.resolve()` or immediate callbacks instead of delays.

When a test genuinely needs a timer, use the teardown-registered helpers in
`src/test-helpers/managed-timers.js` (`managedTimeout` / `managedInterval` /
`managedSleep`) instead of bare timer calls — they bind every timer to the
test's lifetime so a re-armed background loop cannot outlive its test (the
classic assertions-pass-then-hang-the-full-TAP-timeout class). Do NOT reach
for `unref()` on awaited sleeps — that lets the process exit mid-await and has
broken suites before. To hunt a surviving handle, call
`reportOpenHandlesOnTeardown(t)` first in the test body; it snapshots
`process.getActiveResourcesInfo()` after all other teardowns ran.

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

Control-plane timeout behavior must be tested against its owner-defined budget
and typed outcome. Unexpected watchdog failures are not interchangeable with a
legal caller deadline, safe refusal, or unavailable execution.

Required behavior:

1. Add tests that assert remaining-budget derivation for nested operations
   rather than fresh full-budget resets.
2. Add tests that assert timeout classification payloads, not only error text.
3. Investigate exact-boundary timeout clusters (for example 4s/6s/30s/60s)
   through the responsible budget owner and a deterministic witness when the
   mechanism can be reproduced there; do not dismiss them as flakes.
4. Include timeout class and budget context in integration or harness failure
   artifacts used for diagnosis.

## Test Execution Strategy

When running tests during task execution:

1. **Run targeted tests only** - Don't run the full test suite except at checkpoints
2. **Focus on relevant tests** - Only run tests related to the feature/file being modified
3. **Run failing tests first** - When fixing issues, run only the specific failing test(s)
4. **Invoke targeted tests through the classified runner** -
   `npm run test:file -- <explicit-test-file-paths>` enters
   `scripts/run-classified-test-files.js`, which owns placement and resource
   policy and delegates TAP validation to `scripts/run-test-files.js`.
   Empty TAP streams, skips and todos fail. Raw `npx tap` does not establish
   the same guarantees. Do NOT use
   `npm test -- <file>` or `npm test -- --grep "pattern"`: the `test` script is
   the change-proof orchestrator and silently ignores extra arguments, so those
   forms prove the change rather than the file you named.

This targeted-run guidance governs iteration. The scoped static guardrails and
closure review in [`proof-ladders.md`](proof-ladders.md) still apply. Preserve
existing evidence when the current selector and provenance establish that it
remains applicable; unchanged path names alone do not establish reuse when
callers, contracts, dependencies, configuration, tests, or environment changed.
Final landing, publication, and release checks retain their exact-candidate bar.

## What The Four Commands Prove

`npm test` is NOT the complete suite. It is the change-proof orchestrator: the
unconditional safety spine plus whatever this change requires, and it FAILS
CLOSED - an unclassifiable change refuses with `MODULAR PROOF NOT SAFE` and a
reason code rather than proving a convenient subset.

| Command | Proves |
| --- | --- |
| `npm test` | safety spine + the changed subsystem(s) and their witnesses |
| `npm run check` | fast static over the changed paths, then `npm test` |
| `npm run check:subsystem -- <id>` | one whole subsystem, explicitly |
| `npm run check:release` | everything |
| `npm run publish` | the pre-push gate: static stages, then `npm test` against the remote base, or `test:all` when the change proof cannot stand for it |

Only run the complete suite (`npm run check:release`) at:
- Checkpoints explicitly required by the active Quest or epic's acceptance
- Final integration verification
- When explicitly requested by the user
- When `npm test` refuses with `RELEASE_PROOF_REQUIRED`

## Before Any Commit

The normal `.githooks/pre-commit` hook selects staged paths, checks their working
tree bytes and refreshes affected generated inventories. Its ordinary derived
input guard requires source, script and test inputs to match the index; WIP
exceptions do not establish proof of staged content. Exact publication checks
remain required. The hook's report-only complexity output is not a passing
no-regression receipt.

Apply checks at the stage whose claim they support:

| Stage | Required proof |
| --- | --- |
| Iteration | The discriminating witness and applicable checks over the affected change. |
| Reviewed completion and landing | Current independent review where required, the actual candidate's applicable static checks, affected-interaction witnesses and change proof. |
| Publication | The existing exact-candidate publication and whole-repository static gates. |
| Release or full-system acceptance | The complete proof required by the declared acceptance contract. |

This schedule replaces the manual whole-repository lint/complexity minimum
before every commit. It preserves the normal hook, applicable landing checks,
publication/release gates and the ban on dismissing introduced regressions or
required gate failures as unrelated debt. Documentation-only changes use the
[documentation proof policy](release-gate.md#documentation-only-changes).

For an explicitly unverified non-main preservation snapshot, use the existing
[WIP preservation route](../../docs/development/solver-runbook.md#publish-and-git-exceptions).
Preservation does not establish acceptance or authorize publication; an undefined
"emergency" is not a gate exception.

## Full Test Suite Execution
Full-suite local execution procedure lives in `test/README.local.md`.

## Test Output Management
Output-handling procedure lives in `test/README.local.md`.

## Example Commands
Command examples live in `test/README.local.md`.

## Distributed test harness

Used for lifelike testing scenarios with multiple nodes and for efficiency testing.
See `test/distributed/README.local.md`.

Choose the layer that measures the claim. Deterministic owner tests, native
execution, and actual host/network/storage failures have different evidence
ceilings; see [`release-gate.md`](release-gate.md). The representative public WASI
service workload needs its real entry path and declared distributed topology.
A smoke pass or container count alone does not supply that evidence.

For remote work, follow [`home-lab.md`](../../docs/development/home-lab.md).
Record actual submission, admission/queue, execution, terminal artifact, and
cleanup facts as the runner exposes them. A blocked run must name the request,
result source, and actual continuation owner or resumption mechanism. Ending an
agent turn is not background monitoring. Existing lab authorization carries
through ordinary execution and result collection; missing capacity is a test
service issue to route, not grounds to invent an unsupported command.

## External Testing Procedures and Resources

For additional testing-related details, refer to the following resources:
- **Distributed Harness & Scenario Policies**: Local procedures and guidelines live in `test/distributed/README.local.md`.
- **Property-Based Testing**: Project-local property-test iteration guidance lives in `test/README.local.md`.
- **Node Join Convergence SLO Strategy**: Integration-specific node-join convergence procedures live in `test/integration/README.local.md`.

