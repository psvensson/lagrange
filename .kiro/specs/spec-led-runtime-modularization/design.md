# Spec-Led Runtime Modularization Design

## Module Pattern

Every owner module follows the same shape:

```text
src/<domain>/<owner>/
  <owner>-constants.js
  <owner>-evidence.js
  <owner>-state.js
  <owner>-decision.js
  <owner>-effects.js
  <owner>-ports.js
  <owner>-adapter.js
  <owner>-diagnostics.js
```

The pattern is intentionally repetitive. Repetition here improves review,
guardrails, and package sequencing.

## Contract Freeze Rule

Before a runtime package edits production or test code, it must copy or link the
module contract template and replace every blank entry with package-owned
values. The contract must identify the owner constant source, explicit state
variants, normalized evidence shape, total decision table, effect commands,
allowed consumers, and deletion target. A package with an unfilled contract is
not ready for implementation.

## Dependency Direction

Allowed:

```text
constants -> evidence -> decision -> effects -> adapter
                         \-> diagnostics
ports -------------------/
```

Forbidden:

1. `decision` imports `effects`, `adapter`, SQL repositories, message routers,
   timers, harness helpers, or diagnostics.
2. `diagnostics` imports runtime effect modules.
3. `adapter` exports domain vocabulary not declared by `state`.
4. A consumer assembles behavior by combining booleans from several owners.

## Operation Owner Target Design

The operation owner should expose one decision function:

```js
decideOperationProgress(normalizedEvidence) -> operationOutcome
```

The outcome vocabulary should include named variants such as:

1. `wait_for_owner_progress`
2. `advance_existing_operation`
3. `wake_remote_owner`
4. `dispatch_local_owner`
5. `reconcile_stale_progress`
6. `wait_for_serial_operation`
7. `terminal_success`
8. `terminal_failure`
9. `defer_authoritative_visibility`

The exact names must be finalized in the first operation-owner package. The
important rule is that each outcome carries reasons, owner, boundary, and next
effect command in one object. Outcomes that do not execute an effect still use
an explicit named no-effect command rather than `null`, `undefined`, or field
absence.

## Priority Recovery Target Design

Priority recovery should become two bounded modules:

1. `priority-recovery-observation`: consumes owner outcomes and formats
   partition progress.
2. `priority-recovery-request`: asks placement or operation owners for needed
   follow-up work.

It should not schedule operation-owner effects directly from observation
snapshots.

## Publication And Readiness Target Design

Publication emits a revisioned projection stream:

1. Publication revision.
2. Published membership.
3. Required acknowledgements.
4. Observed acknowledgements.
5. Freshness state.
6. Recovery gate state.

Projection/readiness consumes that stream plus owner outcomes and emits:

1. Internal readiness.
2. Repair readiness.
3. Serve readiness.
4. Reasons and source revisions.

Readiness consumers must consume named readiness states rather than rebuilding
readiness from transport reachability, service rows, heartbeat freshness, or
cache visibility.

## Diagnostics Target Design

Diagnostics should normalize one list of owner witnesses:

```text
owner, boundary, state, nextRequiredAction, reasons, sourceRevision,
correlationKey
```

Dominant blocker selection must be a pure ranking over those witnesses. It must
not reclassify raw evidence or override owner outcomes. Missing source
revision, correlation, or subordinate evidence must be normalized into named
diagnostic variants owned by the contract, not represented by raw absence.

## Best-Of-Breed Tactics Used

1. Reconcile loop, not event branch piles: use the Kubernetes controller style
   of repeatedly reconciling desired/observed state into one outcome.
2. Command emission, not worker-owned truth: use the Temporal style where the
   owner decides commands and workers report results.
3. Status conditions, not raw flags: expose named, reasoned conditions with
   observed generation or revision where possible.
4. Revisioned streams, not cache presence: publication and readiness should
   behave like watchable metadata streams rather than incidental cache reads.
5. Scheduler phases, not policy mutation in pressure paths: placement filters,
   scores, reserves, and emits intent without completing operation progress.

## Testing Shape

Each package should add tests in this order:

1. Decision table fixture.
2. Owner adapter test.
3. Consumer presentation test, if the contract is consumed by diagnostics or
   harness output.
4. Focused regression for the latest representative blocker.
5. Representative scenario rerun or blocker probe.
