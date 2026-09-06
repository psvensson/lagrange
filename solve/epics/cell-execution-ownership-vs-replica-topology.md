---
id: cell-execution-ownership-vs-replica-topology
status: superseded
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests: []
authorizes: []
legacyStatus: null
---

# Cell execution ownership vs durable replica topology

## Intent (why now)

The 2026-08-06 adversarial audit (verified in-tree) found that the activation
dead-end, the contention-destroys-Cells failure, and several coordination
integrity gaps all trace to one unresolved architectural choice: an ephemeral
call-Cell execution slot is owned today as if it were a durable service replica,
so the count-reconciliation machinery that correctly protects steady-state
replica topology also suppresses, starves, or destroys transient execution
capacity. Deciding whether to split **CellExecutionSlotOwner** (ephemeral,
invocation-scoped) from **service replica topology** (durable,
count-reconciled) determines how much to invest in interim activation repairs
(v3) versus treating them as stopgaps.

## Options under discussion

- **Option A — full owner split.** A dedicated ephemeral slot owner manages
  activation, backpressure admission, and teardown of call-Cell workers;
  `UnifiedRebalancer`/`MovePlanner` keep authority only over durable replica
  counts and placement. Execution slots become invisible to count
  reconciliation entirely. Cleanest invariant story, largest owner-boundary
  change, and requires re-homing the activation-lease and pin machinery that
  currently flows through the rebalancer.
- **Option B — bounded exemption (interim repair).** Keep the single placement
  owner, but exempt bounded activation ADDs from at-target count suppression,
  make the rebalancer reactive to `call_activation_leases`, and cap pin
  expansion by `maxReplicaCount`. Much smaller diff, preserves existing owner
  boundaries, but leaves contention/health semantics entangled with replica
  lifecycle and accumulates special cases.

## Open questions

- Who owns slot admission/backpressure if slots are not replicas: a new
  owner, the invocation router, or the Cell runtime itself?
- Do activation pins participate in placement scoring at all under a split,
  or is execution placement fully pin-driven?
- Which durable surfaces (readiness projection, node drain, rejoin) must see
  execution slots, and in what form?
- What is the migration order if Option A is chosen — split the owner first
  and repair activation on the new owner, or repair first and split after?

## Decision log

- 2026-08-06 — Epic authored alongside `data-local-call-partition-activation-v3`
  (audit Finding 1) per the verdict's recommendation. The v3 quest is scoped to
  the Option-B interim repair so the dead-end is closed under normal traffic
  now; this memo decides whether v3 is the final shape or a stopgap before the
  Option-A owner split.
