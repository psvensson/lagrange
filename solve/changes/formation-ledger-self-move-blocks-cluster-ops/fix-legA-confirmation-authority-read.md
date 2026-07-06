# Leg A confirmation authority read fix

## Mechanism recap

The pinned failure is confirmed: terminal persistence used `confirmReplicaOperationPersistence()` -> `confirmReplicaOperationVisibility()` and read `OWNER_LOCAL_ONLY` from the local `replica_operations-p1` copy. After ledger spread, node-local copies can be stale or absent while the ledger authority has the terminal row, so confirmation returned `MISSING` or `DEFERRED` and terminal repair re-armed.

Relevant current sources before the fix:
- `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:391-410`, `443-498`: confirmation loop and throw/defer behavior.
- `src/rebalancer/replica-operation-repository-read-methods.js:284-320`: `OWNER_LOCAL_ONLY` selects local visibility options.
- `src/rebalancer/replica-operation-repository.js:327-345`, `405-418`: local-only has no owner RPC/SQL fallback; general visibility already has `OWNER_RPC_PREFERRED_SQL_FALLBACK`.

## Why `OWNER_LOCAL_ONLY` history

`git blame` shows the confirmation method came from `8540134f` (`Refactor second oversized sprint batch`, 2026-05-24) with `OWNER_LOCAL_ONLY` already wired into confirmation and retry-recovery proof reads. `70e434e6` (`fix(rebalancer): terminal-transition durability repair`, 2026-07-05) added terminal repair and reused those local-only confirmation reads for terminal repair and terminal zero-change/refusal helpers. `86b7b178` (`nominally working system grammar`, 2026-04-23) introduced `REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS`; its historical tests explicitly asked confirmation to reuse a bounded local replica fallback contract (`persistOperationUpdate requests bounded local replica fallback...`). I found no hard reason forbidding an authority-capable read after local confirmation fails; the history points to a cheap/local fallback lineage, not a terminal authority prohibition.

## Changes

- `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:277-340`: zero-change update resolution and terminal conflict rejection now read through a local-first authority fallback helper.
- `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:383-433`: added `queryReplicaOperationPersistenceAuthority*` helpers: local read first; if it does not satisfy the projected operation, re-read with `OWNER_RPC_PREFERRED_SQL_FALLBACK`.
- `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:490-558`: confirmation loop now escalates to authority within the existing 5s confirmation window whenever the local read does not confirm.
- `src/rebalancer/operation-workflow-terminal-transition-repair.js:229-232`: refused terminal repair persist uses the same authority fallback before deciding whether a durable terminal row won.
- `test/rebalancer/replica-operation-confirmation-authority-read.test.js:127-225`: regression coverage for stale local row, no local row, and authority-missing/no-weakening.

## Red evidence

Added the regression test first and ran:

```sh
npx tap --disable-coverage test/rebalancer/replica-operation-confirmation-authority-read.test.js 2>&1 | grep -E "not ok|ok [0-9]+ - .*authority|No coverage|total:" | head -80
```

Unfixed result:

```text
not ok 1 - authority-confirmed terminal visibility should clear the retained repair state
not ok 2 - a stale local confirmation must escalate to the ledger authority
not ok 1 - terminal repair confirms through authority when the local ledger row is stale
not ok 1 - missing local ledger visibility should not strand a confirmed authority row
not ok 2 - an empty local confirmation must escalate to the ledger authority
not ok 2 - terminal repair confirms through authority when no local ledger row exists
ok 1 - missing authority rows must keep repair armed instead of claiming success
not ok 2 - the no-weakening case should still prove it checked the authority
# { total: 6, pass: 1, fail: 5 }
```

## Green results

All of these passed after the fix:

```sh
npx tap --disable-coverage --reporter=dot test/rebalancer/replica-operation-confirmation-authority-read.test.js test/rebalancer/replica-operation-repository.test.js test/rebalancer/replica-operation-insert-retry-idempotency.test.js test/rebalancer/replica-operation-observation-contract.test.js test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js test/rebalancer/remove-active-dispatch-redrive.test.js
npx tap --disable-coverage --reporter=dot test/rebalancer/unified-rebalancer-odd-replica-policy-rebalancing.test.js test/rebalancer/unified-rebalancer-triggers-priority-surrogate-gates.test.js test/rebalancer/unified-rebalancer-triggers-priority-surrogate-followup.test.js test/rebalancer/coordinator-dedup-gap.test.js test/rebalancer/unified-rebalancer-replica-state-management-node-state-change.test.js test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js test/rebalancer/unified-rebalancer-triggers-scheduling.test.js test/rebalancer/unified-rebalancer-triggers-priority-recovery-cache-bypass.test.js test/rebalancer/unified-rebalancer.test.js test/rebalancer/unified-rebalancer-move-calculation-state-evaluation.test.js test/rebalancer/unified-rebalancer-node-readiness-replica-state.test.js
npx tap --disable-coverage --reporter=dot test/control-plane/replica-dispatch-atomic-claim.integration.test.js test/control-plane/replica-dispatch-node-state-update-node-row-bootstrap-failures.test.js test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js test/control-plane/replica-dispatch-node-state-update-payload-wakeup-slow-write.test.js
npx eslint src/rebalancer/replica-operation-repository-mutation-persistence-methods.js src/rebalancer/operation-workflow-terminal-transition-repair.js test/rebalancer/replica-operation-confirmation-authority-read.test.js
npm run audit:file-size -- --paths src/rebalancer/replica-operation-repository-mutation-persistence-methods.js src/rebalancer/operation-workflow-terminal-transition-repair.js test/rebalancer/replica-operation-confirmation-authority-read.test.js
```

## Caller safety analysis

- `runTerminalTransitionRepairAttempt()`: a terminal row confirmed by authority now clears retained repair; authority missing still keeps repair armed.
- `confirmCommittedTransitionPersistence()`: unchanged caller semantics. A `CONFIRMED` authority read clears repair; `DEFERRED`/throw still arms repair.
- `completeOperation()` / `failOperation()` move execution path: unchanged persistence API; stale local confirmation no longer turns an already-authority-visible terminal write into `Authoritative replica operation not confirmed`.
- `shouldRejectConflictingTerminalTransitionMutation()` and zero-change resolution: terminal/local-stale decisions now escalate before refusing, accepting, or re-inserting.
- `shouldRejectExpectedWorkflowStepMutation()` and retryable mutation recovery remain local-only; they are non-terminal/hot retry guards and existing retry tests require first empty proof to retry rather than using a second read as proof.

## Cost and timeout

Escalation happens inside the existing confirmation loop, not after the 5s deadline, so a live authority row clears immediately instead of adding 5s latency. It only performs the authority-capable read after the cheap local read fails to satisfy the projected operation; confirmed local reads stay cheap. If authority is genuinely absent/unreachable, the same non-confirmed behavior remains: terminal confirmation throws or defers, and repair remains armed.

## Open risks

This is a surgical local-fail escalation, not a rewrite of all owner-local guards. A local read that already satisfies the projected operation is still accepted without a second authority read, matching the requested minimal/hot-path cost posture.
