---
id: operation-dispatch-completion-continuity
status: done
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: membership-lifecycle-placement-hard-cutover
quests:
  - operation-dispatch-completion-owner-cutover
  - operation-dispatch-completion-owner-tooling
authorizes: []
legacyStatus: resolved
---

# Epic: Operation dispatch completion continuity

> # OUTCOME 2026-07-22 — RESOLVED
>
> The cutover is landed in `77aafbe5`, with its bounded structural-census and
> scenario-runner tooling split landed in `86447a7d`. Successful non-system
> runtime-service ADD and create-phase REPLACE deliveries now retain progress in
> `operation_workflow_owner` through the existing owner timer registry; the
> caller-local retention authority is removed. The structural census is zero,
> the four-file deterministic scenario is green with 92 assertions, exact
> source reversion is red, and independent verification approved the frozen
> source/test artifact.
>
> Controlled live evidence contains two fixed and two exactly reverted runs,
> with immutable archive/report/source fingerprints and zero terminal lifecycle
> residue. The fixed owner path engaged in both runs; one completed the full
> affinity scenario and one reached owner closure before a downstream affinity
> stall. That downstream product closure remains with
> `runtime-service-affinity-observer-intent-parity`, as planned.

## Intent

A successfully delivered replica operation must create one durable progress
obligation owned by `operation_workflow_owner`. That obligation remains driven
until target progress is applied to the durable operation row or the operation
reaches an explicit terminal failure. Dispatch may be initiated through more
than one transport lane, but those lanes must not independently decide whether
verification, retry, or rearm survives.

The binding witness is the 2026-07-21T18:06 MovieLens run. The dispatch service
deferred on operation-row visibility, the coordinator sent CREATE_REPLICA 102ms
later before that deferred retry fired, the target completed, the deferred
retry then delivered a duplicate CREATE, and the source operation remained
CREATING until its remote-handoff budget expired. The existing retained target
progress verification is armed only at the dispatch-service success site, so a
successful coordinator-owned send can bypass it. The affinity observer Quest
could not reach its own seam because this earlier placement invariant failed.

This is operation-workflow substrate, not affinity policy. The affinity demo is
the first blocked consumer and supplies the live engagement witness.

## Owner contract

- **Owner:** `operation_workflow_owner`.
- **Inputs:** normalized operation snapshot, classified delivery outcome, and
  target-progress evidence.
- **Authoritative state:** the durable operation row plus the existing retained
  progress evidence owned by the operation workflow.
- **Consumers:** coordinator dispatch, `ReplicaDispatchService`, planner wakes,
  and executor-outcome handoff.
- **Invariant:** every successful create-phase dispatch creates exactly one
  canonical retained-progress obligation; callers may submit the delivery
  outcome but may not independently clear, reconstruct, or replace that
  obligation.
- **Terminal rule:** retained evidence is consumed only after target progress is
  durably applied or the operation reaches an explicit terminal state.

## Quest ladder

1. **`operation-dispatch-completion-owner-cutover`** — census every delivered
   success exit, reproduce the coordinator-first ordering on the real owner
   path, route all in-scope create success through one canonical owner decision,
   and retire caller-local retention authority.
2. **Residual sweep only if the first Quest proves one is needed** — any
   operation kind or tail consumer outside the first Quest must be named by the
   cutover census and receive a bounded successor. Do not pre-author speculative
   siblings.
3. **Consumer engagement** — after the owner cutover is deterministically and
   adversarially proven, use the smallest controlled live A/B required for a
   hot failure-handling change. Route the result back to
   `runtime-service-affinity-observer-intent-parity`; that Quest retains
   ownership of end-to-end learned-affinity closure.

## REUSED / EXTENDED / NEW

- **REUSED:** retained runtime target-progress verification, executor-outcome
  retry, canonical workflow-step policy, operation budget accounting, owner
  serialization, and the existing virtual-timer test substrate.
- **EXTENDED:** the workflow owner's classified delivery-result contract so
  every successful create dispatch creates the same retained obligation.
- **NEW:** only the success-path census/structural guard and the deterministic
  coordinator-first ordering. No new runtime queue, timer family, cache, retry
  registry, scoring rule, or replay engine is permitted.

## Epic exit

- A machine-checkable census reports zero in-scope successful create-dispatch
  exits that bypass the canonical owner decision.
- Deterministic production-seam proofs cover dispatch-service success,
  coordinator-first success before a pending retry, duplicate delivery,
  missing operation-row visibility, lost executor-outcome handoff, owner
  movement, shutdown cleanup, and terminal cleanup.
- The exact runtime-service ADD reaches durable ACTIVE from exact-target ACTIVE
  evidence and releases its operation-budget slot without widening a timeout or
  budget.
- Duplicate delivery remains idempotent and no retained work survives a
  terminal operation.
- Existing system-partition semantics remain byte-identical unless a separate
  red-on-current proof establishes a defect.
- A controlled live engagement witness shows the canonical owner path fires;
  the full three-run affinity result remains owned by the affinity epic.

## Non-goals

- Affinity scoring, observation, or routing policy.
- A general CDC or partition-metadata redesign.
- Timeout, concurrency, or budget increases.
- Broad replay of non-system operations.
- A second retry queue, timer registry, cache, workflow engine, or transport
  bypass.
- Reopening CL-017 without evidence that its guarded invariant regressed.

## Decision log

- 2026-07-21 — Epic authorized for execution after the second runtime-service
  placement failure at the same dispatch-completion boundary. The response is
  a single-owner cutover, not another lane-local retry patch. The existing
  affinity Quest remains the downstream consumer and live product surface.
- 2026-07-22 — Epic resolved by `operation-dispatch-completion-owner-cutover`
  and its scope-guarded tooling child. No runtime residual required a successor;
  the complete tail/cleanup/diagnostic inventory is sealed with the Quest.
