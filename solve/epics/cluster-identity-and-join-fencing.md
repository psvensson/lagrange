---
id: cluster-identity-and-join-fencing
status: superseded
proof: deterministic
legacy: true
roadmapRow: RM-0.1-fs-rolling-restart
graduatesTo: null
quests:
  - address-takeover-workflow-v2
  - address-takeover-workflow
  - changeref-own-quest-evidence-bookkeeping
  - cluster-identity-join-gate
  - cluster-identity-persistence-seam
  - durable-cluster-identity
  - durable-withdrawal-cleanup-intent-v2
  - durable-withdrawal-cleanup-intent
  - lifecycle-controller-live-delegates-only-v2
  - lifecycle-controller-live-delegates-only
  - node-incarnation-fencing-v2
  - node-incarnation-fencing
  - seed-restart-recovery-mode-v2
  - seed-restart-recovery-mode
  - stale-replica-file-startup-reconciliation-v2
  - stale-replica-file-startup-reconciliation
  - startup-evidence-single-identity-decision-v2-integrity-migration
  - startup-evidence-single-identity-decision-v2
  - startup-evidence-single-identity-decision
  - test-receipt-probe-tooling
authorizes: []
legacyStatus: null
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

_(none open — both resolved; see decision log)_

## Open questions

_(none open — both resolved; see decision log)_

## Decision log

- 2026-08-05 — Epic authored from the verified join-path audit. Tier 1 fixes
  committed (d22c7118d). Two foundational quests already sealed:
  `durable-cluster-identity` (Finding 3) and `node-incarnation-fencing`
  (Finding 1), the latter parented on the former. Design for frontier 1 of
  `durable-cluster-identity` verified via two explore subagents and recorded
  as a Solver finding.
- 2026-08-05 — **Identity carrier resolved: rejoin hints + replicated
  CONFIG-row singleton `cluster_id`.** Landed by
  `cluster-identity-persistence-seam` (85d88f183) and
  `cluster-identity-join-gate` (7a1f2b721). Mint-once at first seed
  bootstrap (randomUUID), node-local carriage in both rejoin-hints builders,
  authoritative persistence as a CONFIG-row singleton (EPOCH_CONFIG_KEY
  precedent — no new partition/replica wiring), threaded into the raft
  snapshot-checkpoint seam replacing the config-pinned
  `'lagrange-default-cluster'` default. Bootstrap requests carry
  `expectedClusterId`; seed-side mismatch is a typed terminal 409
  CLUSTER_ID_MISMATCH. The dedicated `CLUSTER_IDENTITY` system table option
  was rejected: the CONFIG-row delivered the same authority without touching
  every partition/replica map. Write-order/readback-precedence question
  resolved by the landed implementation: hints are the pre-hydration local
  evidence; the CONFIG-row is authoritative once readable; any mismatch at
  any durable evidence source fails closed with a typed identity-mismatch
  outcome.
- 2026-08-05 — **Incarnation source resolved: locally persisted monotonic
  boot counter in the rejoin hints.** Landed by `node-incarnation-fencing-v2`
  (a6aa54610…b8c6d24fe). Minted at boot in both entrypoint branches,
  propagated on node state updates, fenced receiver-side at the watermark
  check, missing-row upsert, and WebSocket identification slot with a typed
  terminal STALE_NODE_INCARNATION refusal. The bootstrap-response-only option
  was rejected as insufficient for idempotent same-address rejoin that
  bypasses fresh admission.
- 2026-08-05 — **Ordering resolved: incarnation fence before
  address-takeover unification.** The fence landed first
  (`node-incarnation-fencing-v2` solved), so the takeover workflow
  (`address-takeover-workflow`, Finding 9) now classifies conflicts against
  an already-fenced rejoin path; the stale-incarnation ambiguity that
  motivated the ordering question no longer exists.
- 2026-08-05 — **Foundation layer complete.** Seven quests solved:
  `cluster-identity-persistence-seam`, `cluster-identity-join-gate`
  (Finding 3), `node-incarnation-fencing-v2` (Finding 1),
  `seed-restart-recovery-mode-v2` (Finding 5),
  `startup-evidence-single-identity-decision-v2` (+ its integrity-migration
  child; Findings 4/7). Four hardening quests exhausted with falsified
  scenario-harness measurement and were re-authored as v2 successors on the
  deterministic test-receipt apparatus: `address-takeover-workflow-v2`
  (Finding 9), `durable-withdrawal-cleanup-intent-v2`,
  `stale-replica-file-startup-reconciliation-v2`,
  `lifecycle-controller-live-delegates-only-v2` (Finding 13).
- 2026-08-05 — **Epic complete.** All four v2 successors landed SOLVED
  (MEASURED): `lifecycle-controller-live-delegates-only-v2` (484f7e8b5;
  shadow state machine removed, live delegates preserved, reintroduction
  guard), `stale-replica-file-startup-reconciliation-v2` (497dd6e8c;
  post-hydration startup sweep quarantines orphaned nodes-p* replica files
  against the canonical services assignment), `durable-withdrawal-cleanup-intent-v2`
  (e6364323c; leader-side stranded-joining-row reaper alongside the lease
  sweep; explicit-choice finding records lease-expiry-plus-reaper as the
  designed fallback), `address-takeover-workflow-v2` (e201d1598; the three
  address-drift policies unified into one canonical resolveTakeoverDecision,
  the in-lease-window 409 reclassified retryable-with-backoff via a typed
  lease-window conflict, controlled live A/B per TEST-0022). A tooling
  prerequisite also landed: `solver-landing-preflight-deleted-path-filter-v2`
  (c7ad7d91d) — the landing preflight no longer crashes on candidates that
  delete a file. Every join-path-audit finding the epic carried (1, 3, 4, 5,
  7, 8, 9, 13) now has a landed, verifier-approved, red-on-revert-proven
  fix.
