---
epicContractVersion: 2
id: raft-snapshot-transfer-install
roadmapRow: null
graduatesTo: raft-snapshot-transfer-install
---

# Raft snapshot transfer and install

## Intent (why now)

Bound Raft log growth and make large replica recovery independent of an
indefinitely retained committed prefix. The work extends the existing Raft
protocol and adapters; it does not add adapter-local compaction, a second
consensus owner, or a backup/PITR product.

## Selected boundary

- A versioned envelope seals authenticated cluster, Raft-group, and
  state-machine entity identity together with index, term, committed state,
  membership epoch, payload kind, length, and digest.
- SQLite uses a versioned state-machine include-set, or a consistent backup
  scrubbed before sealing, because its production database co-locates
  follower-local `_raft_log` and `_raft_state`. Those tables are never copied
  across replicas; install reconstructs them through the local Raft transition.
  Other adapters provide the same state-machine/local-consensus separation.
- Snapshot bytes use a separately admitted, backpressured bulk pressure class.
  Sharing cluster transport is allowed only when critical convergence has an
  independently enforceable lane.
- Membership-epoch change aborts transfer. Install is atomic and cannot publish
  progress ahead of durable state.
- Retention is bounded, but active installs pin their required generation.
  Compaction requires durable local snapshot proof.

## Quest ladder

1. `raft-snapshot-checkpoint-format`
2. `raft-snapshot-atomic-install`
3. `raft-snapshot-bulk-transfer`
4. `raft-snapshot-compacted-follower-catchup`
5. `raft-snapshot-retention-compaction`
6. `raft-snapshot-live-rebuild`

Each row is a product Quest with a real artifact probe. The safety-only
`raft-snapshot-gated-compaction` Quest stays solved and is never widened.
Managed split snapshot pacing is an unrelated table-copy mechanism.

## Open questions

- Which existing transport pressure owner can prove effective lane isolation,
  or must the first implementation introduce a dedicated bulk socket?
- Which non-SQLite production adapter is required in the first compatibility
  matrix?
- What entry/byte threshold and generation count fit each declared scale
  profile without turning policy constants into protocol semantics?

## Decision log

- 2026-07-25 — Selected the authenticated identity envelope,
  state-machine-only adapter payload, separately bounded bulk pressure,
  abort-on-epoch-change, and bounded retention contract. Graduated executable
  requirements to
  `solve/specs/raft-snapshot-transfer-install/requirements.md`.
- 2026-07-26 — **S1 SOLVED** (`raft-snapshot-checkpoint-format`, commit
  c340e962; design `checkpoint-format-design.md`). New owner modules
  `src/raft/snapshot-checkpoint-{constants,format,store}.js`; adversarial
  verification found and fixed a real batch-commit watermark overstatement
  (MF-1) — the applied watermark now advances densely per apply with a sticky
  startup gap marker. Identity sources for `clusterId`/`membershipEpoch` are
  caller-supplied in S1; pinning the authoritative production sources is S2
  scope. `_transaction_outcomes` classified as state-machine state (retained
  in payloads). Next: S2 `raft-snapshot-atomic-install`.
- 2026-07-26 — **S2 SOLVED** (`raft-snapshot-atomic-install`, commit 9283b579;
  design `atomic-install-design.md`, twice-verified). Atomic install at the
  closed-handle boot boundary with a nonce-healed five-state marker machine,
  durable term/votedFor rule (scoped to `_raft_state` rows), compacted-log
  boundary observability in the adapters (CL-042 virgin zero preserved), and
  S1 creation amendments (`maxCommittedHlc`, boundary-fallback term,
  `prepared_transactions_pending` gate). Recorded S4 inputs: leader catch-up/
  stale-batch livelock for installed followers, wrong-term-at-boundary guard
  test, live raft term boot-seeding gap, production wiring of the
  checkpoints-root layout. Identity sources remain caller-supplied — pinning
  moves to S3/S4 with the first production wiring. Next: S3
  `raft-snapshot-bulk-transfer`.
