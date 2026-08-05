---
epicContractVersion: 2
id: cluster-identity-and-join-fencing
roadmapRow: RM-0.1-fs-rolling-restart
graduatesTo: null
---

# Epic: Cluster identity and join fencing

## Intent (why now)

The verified join-path audit found that the cluster has no durable identity and
no per-boot fencing: a zombie process from a previous boot passes the heartbeat
watermark and steals the WebSocket slot, a node can seed over durable state it
cannot prove is absent, and a fence proves nothing about which cluster a node
belongs to. Tier 1 (fail-closed evidence readers, fence fallback, sync cache
applier, dead ternary, reentry normalization) is committed. This epic holds the
remaining identity model: mint a durable cluster identity, fence node writes by
incarnation, unify startup evidence into one decision, then layer the
seed-recovery, address-takeover, cleanup, and lifecycle-controller hardening
that only become coherent once identity exists.

## Options under discussion

- **Durable identity carrier** — rejoin hints (node-local, pre-hydration) plus
  a replicated CONFIG-row singleton `cluster_id` (precedented by
  `EPOCH_CONFIG_KEY`) versus a new `CLUSTER_IDENTITY` system table. The
  CONFIG-row avoids new partition/replica wiring; a dedicated table is cleaner
  but touches every partition/replica map.
- **Incarnation source** — a locally persisted monotonic boot counter in the
  rejoin hints (works for idempotent same-address rejoin that bypasses fresh
  admission) versus a value only in the bootstrap response (insufficient).

## Open questions

- Write order at first bootstrap: hints file (node-local, immediate) versus
  CONFIG-row (replicated, later) — and readback precedence at restart.
- Whether address-takeover unification should land before or after the
  incarnation fence, given both touch the same rejoin classification path.

## Decision log

- 2026-08-05 — Epic authored from the verified join-path audit. Tier 1 fixes
  committed (d22c7118d). Two foundational quests already sealed:
  `durable-cluster-identity` (Finding 3) and `node-incarnation-fencing`
  (Finding 1), the latter parented on the former. Design for frontier 1 of
  `durable-cluster-identity` verified via two explore subagents and recorded
  as a Solver finding.
