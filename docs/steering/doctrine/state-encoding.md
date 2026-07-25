---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: rules.json corpus (below architecture pack cap; query via npm run rule)
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-07-25
---

> **Canonical source.** Doctrine sub-file: state encoding, lifetime, pressure, progress grammar. Index: [`INDEX.md`](INDEX.md).

# Doctrine — State And Lifetime

## 4. Phase Code Must Hand Off Completely

Bootstrap, join, and recovery phases may initialize runtime mechanisms, but
they must hand off to steady-state owners before phase completion.

- A phase must not tear down the only live runtime path.
- A phase-scoped bridge must either become a runtime-owned bridge or be
  replaced before teardown.
- Completion of a phase must reduce temporary machinery, not strand it.

## 5. Slower Under Pressure, Never Less Correct

Under load, the system may slow down, defer work, or reject new edge work with
structured retry semantics. The system must not become less correct.

- Pressure must become admission, defer, reject, or coalescing signals.
- Pressure must not become hidden drops, memory growth without bounds, or
  correctness failures.
- Pressure policy belongs at canonical ingress boundaries, not at scattered
  feature call sites.

When an owner-path read or write is unresolved because pressure, authority
establishment, or recovery completion is still in flight, the owner must emit
one structured deferred outcome. The owner outcome must not degrade into empty
collections, null-shaped absence, or timeout-only silence.

That deferred outcome must carry the canonical vocabulary for the boundary,
such as:

- outcome or completion state
- reason code set
- bounded retry delay
- authority, readiness, or recovery witness that explains why the owner is
  still deferred

Callers may consume or propagate that deferred outcome, but they must not
silently reinterpret it as success, empty visibility, or unknown absence.

For shared control-plane truth surfaces such as startup, readiness, admin
snapshot, service discovery, and harness convergence, readers must observe
through a canonical snapshot/watch owner. Readers must not run synchronous
multi-table authoritative repair inline on the hot read path. If freshness is
insufficient, the owner returns an explicit fresh, stale-but-usable, deferred,
or failed observation and schedules or performs repair through the owned
reconcile path.

Critical convergence traffic must keep stricter admission than diagnostics,
observability, or broad repair. In practice, node-state publication,
membership publication, and authoritative operation visibility must be allowed
to keep progressing under pressure conditions that may defer snapshot repair or
admin reads.

## 7. Resource Lifetime Must Be Owned And Bounded

Every queue, buffer, subscriber set, retry registry, deferred-work map, or
single-flight registry must have:

- one owner
- one capacity or bounding rule
- one teardown or expiry rule
- one diagnostic surface

If memory, queue depth, or subscriber count can grow without a named owner and
plateau condition, the design is not finished.

## 10. Normalize Evidence Before Adjudicating Decisions

When one decision depends on several live signals, separate observation from
policy.

Every multi-signal admission or readiness boundary has four stages:

1. Collect observations.
2. Normalize them into one immutable snapshot per entity.
3. Adjudicate the snapshot in one pure decision function.
4. Act on that decision and emit diagnostics.

Collectors may fetch, retry, and annotate evidence, but they do not emit the
final verdict. The normalized snapshot keeps observations, their evidence
classes, and policy targets distinct.

Classify every observation before adjudication:

- **Authoritative** — owned by the same semantic owner and plane; may directly
  admit or reject.
- **Equivalent** — another access path to the same owner and plane; may confirm
  or refute only the equivalence declared by the governing contract.
- **Degraded** — weaker, indirect, or cross-plane; may explain, defer, or
  improve diagnostics, but must not promote a blocked entity to ready.
- **Contradictory** — authoritative or equivalent signals disagree; produces
  reconciliation with explicit reasons, never a local exemption.

Never let degraded evidence promote a blocked entity to ready or admitted.

The canonical adjudicator applies static ineligibility first, waits for missing
authoritative proof, treats only contract-declared hard blockers as terminal,
and allows equivalent proof to clear only the blocker classes for which
equivalence is declared. Policy targets must not be rewritten from the
survivors observed during one attempt.

Its verdict is the only legal source for cohort selection, retries, and
human-readable diagnostics. It includes `state`, `admit`, `retryable`,
`reasonCodes`, `evidenceUsed`, and `missingProof`. State names are
boundary-specific but must distinguish static exclusion, missing discovery or
owner proof, equivalent-confirmation wait, admission, reconciliation, and hard
rejection.

Every input to a liveness or safety gate must be classified before use:

- **Actuals** — observed state: a raft-observed leader, an active service row,
  a committed operation read back from the authority. A gate must consume
  actuals only.
- **Targets** — intent: `replica_count`, planned placement, configured cohort
  sizes. A target must never gate liveness: it legitimately exceeds placed
  reality on single-node and degraded clusters, so a target-built gate
  rejects correct work.
- **Inferences** — derived signals such as error-string matching or absence
  of a row. An inference may trigger a re-read of actuals; it must never be
  the witness itself.

A guard whose inputs cannot each be named actual, target, or inference is not
designed yet. (Witnessed: a `replica_count` liveness witness would have
rejected — and, through an envelope bug, silently dropped — every user-table
write on default-config single-node clusters; the correct witnesses were the
raft-observed leader and the published leader pointer, both actuals.)

If fixes keep arriving as new boolean exemptions, the decision boundary is not
modeled yet. Replace the branch pile with an explicit state model and decision
table. Cover each state and blocker class with table-driven tests, including a
regression that degraded evidence cannot promote and a regression that policy
targets remain distinct from incidental survivors.

## 15. Lifecycle Boundaries Must Publish One Progress Grammar

When a boundary owns progress through startup, join, rejoin, readiness,
admission, recovery, convergence, or rebalancing, the design is not done until
the progress vocabulary is explicit and follows the canonical 10-field progress contract shape (`owner`, `boundary`, `state`, `reason`, `nextAction`, `wakeSource`, `retryAfterMs`, `terminalState`, `evidencePath`, `blockingDependency`).

Prefer:

- one named grammar that states the lifecycle or progress states
- one declared meaning for blocked, deferred, retryable, terminal, and ready
- one declared evidence precedence when several witnesses disagree
- one declared consumer set for that grammar across runtime, diagnostics,
  admin, and harness surfaces

Do not force readers to reconstruct progress from object existence, local
booleans, timestamps, or log strings. If several surfaces need the same
reasoning but use different words, the grammar is missing.
