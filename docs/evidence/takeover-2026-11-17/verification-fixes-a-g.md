---
audience: evidence
recorded: 2026-11-18
---

# Independent verification of fixes A-G at 19a2134c5 (2026-11-17)

Scratch: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/verify-ag/`.

| Fix | Verdict |
|---|---|
| A f50344e98 | APPROVE-WITH-FINDINGS |
| B ff4318b24 | REJECT the SKIP_CALLER_MANAGED_DISPATCH removal; APPROVE the genesis predicate, the granularity reorder and the lazy Phase B reads |
| C 829180ae6 | APPROVE-WITH-FINDINGS |
| D c44e3e0b8 | APPROVE |
| E ba7ecfeb4 | APPROVE-WITH-FINDINGS |
| F dcdfd78c4 | APPROVE-WITH-FINDINGS |
| G 9905a06e2 | APPROVE-WITH-FINDINGS |

Merge a456fd4d6 (E×F) is clean.

## Findings to act on

**A**
- **F1 INFO:** the remove-safety half was dead-code consolidation, not a reachable fail-open fix.
- **F2 LOW:** exact-CAS is pinned only by `replica-operation-repository.test.js:844`. There is no test that a zero-change CAS against a progressed row is refused (`update-methods.js:389/494/537`, `persistence-methods.js:547`).
- **F3 LOW P:** a null change count combined with monotonic acceptance can confirm a CAS that lost to a remote writer (`update-methods.js:235-246`, `persistence-methods.js:400-412`).
- **F4 LOW P:** NOT_CONFIRMED is thrown again after a lost-outcome insert followed by a remote advance.

**B**
- **F1 MEDIUM, CONFIRMED at runtime:** repro in `verify-ag/B-repro-*`.
  1. Attempt 1 stamps the ops, clears their holds, then fails before execute.
  2. Attempt 2 reuses the intents. `createOperation` claims PENDING→SENDING but returns the stale PENDING copy (`rebalance-coordinator-operation-intent-methods.js:438-439`).
  3. The provisioner's unconditional `persistOperationUpdate(operation)` (`sql-query-engine-initial-partition-provisioning.js:555` → `replica-operation-repository-mutation-update-methods.js:118`, no step condition) rewinds SENDING→PENDING.
  4. Execute then dispatches without a claim; `steps_history` reads PENDING, ACTIVE.

  The root cause is the unconditional stale stamp write, which predates B.
- **F2:** no test pins the central change (mutation M2, restoring the skip, passes everything).
- **F3:** the rearm-guard rewrite has no replacement for unheld PENDING rows.
- **F4:** `emitOperationCreated:false` still gates fresh creates (`rebalance-coordinator-operation-creation.js:426,863`). It is redundant, because its only caller (`sql-query-engine-provisioning-admission-methods.js:439`) always sets the hold too, so it is a second dispatch authority.
- **F5:** the triple classifier survives in `unified-rebalancer-control-plane-readiness-methods.js:63,202,221`.
- **Pre-existing:** the provisioner's feature detection `typeof ...dispatchOperation === 'function' && typeof ...persistOperationUpdate === 'function'` (~551).

**C**
- **F1 LOW:** an unresolved autocommit write answers XX000. It should answer 08007 TRANSACTION_RESOLUTION_UNKNOWN, as COMMIT already does (`pgwire-transaction-outcome.js:109-113`). `resolveFailureSqlState` (`pgwire-result-mapper.js:204-211`) has no mapping from failureCode OUTCOME_UNKNOWN.

**E**
- **F1 LOW:** the native fixture's cancellation assertion depends on bash ≥ 5.1 exec'ing the last command.
- **F2:** `scripts/lab/*` ssh is unprefixed. It is a separate owner and there is no live defect.

**F**
- **F1 LOW-MEDIUM process:** quest `gcp-bounded-vm-lifetime` was sealed at 4b0c8ec1 with the old statement. F rewrote `quest.json` with no log entry, and the receipt's `testFileDigests` for `provision-gcp-script.test.js` (9aeffe7f…) no longer match HEAD (a5a4d2c7…).
- **F2:** `@pulumi/gcp` is unpinned, and there is no live read-back.
- **F3:** a restart resets the max-run-duration.

**G**
- **F1 MEDIUM-LOW:** public API break. `BudgetEnforcer` and `ExecutionContext` are exported via `src/public-api.js` → `query/index.js`, but `normalizeQueryBudget` is not, so `new BudgetEnforcer()` now throws. `RUNTIME_ERROR_MSG.INVALID_BUDGETS` was removed. There is no CHANGELOG entry.
- **F2:** `wasm-executor.js:124-134` still has `memoryLimitBytes || MEMORY_LIMIT_BYTES || DEFAULT` (the WASM resource budget), and `emit-primitive.js:86` has `options.maxBytes ?? EMIT_MAX_BYTES`.
- **F3:** `sql-select-execution-helpers.js:70-71` reads `queryOptions.budgets?.RESULT_MAX_*`, so a missing budget means unbounded partition reads for internal `executeQuery` callers. `partitionBudgetShare` floors a third of the partitions to a cap of 0 (P).
- **F4:** mutations M5 (an `ExecutionContext` with no budget gets a default) and M8 (PG-wire maps a 0 limit to a 30 s default) survive.
- **F5:** `docs/evidence/review-repairs-2026-11-17/query.md:73-84` still accepts the alias contract and has no supersession note.
