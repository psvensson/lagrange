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
- 2026-07-26 — S1 SOLVED — commit c340e962 — see
  `solve/specs/raft-snapshot-transfer-install/tasks.md` and
  `checkpoint-format-design.md`.
- 2026-07-26 — S2 SOLVED — commit 9283b579 — see tasks.md and
  `atomic-install-design.md`.
- 2026-07-26 — S3 SOLVED — commit 81a197cb — see tasks.md and
  `bulk-transfer-design.md`. Open question 1 ANSWERED from code: no existing
  transport pressure owner sits on raft's path, so the implementation
  introduced a dedicated per-peer bulk WebSocket channel under the existing
  identity/admission handshake.
- 2026-07-26 — S4 SOLVED — commit 01b7a364 — see tasks.md and
  `compacted-follower-catchup-design.md`.
- 2026-07-26 — S5 SOLVED — commit 512e2118 — see tasks.md and
  `retention-compaction-design.md`. Open question 3 ANSWERED:
  entry/byte thresholds and generation counts are retention-module policy
  constants; the protocol surface takes only explicit indexes and durable
  proof.
- 2026-07-26 — S6 SOLVED — EPIC CLOSED — handoff commit e2c36b1a, bar seal
  de08aa73 — see tasks.md and `live-rebuild-design.md`. Decision (path B):
  the sealed certification bar isolates **rebuild safety** (wiped follower
  rejoins ACTIVE via snapshot install AND every acknowledged write is visible
  cluster-wide) from rolling-restart's priority-spread convergence axis,
  which had dominated pass/fail without measuring rebuild safety. Open
  question 2 (non-SQLite adapter) and per-profile threshold calibration
  remain future-scale work, not blockers; the SQLite production path is
  certified live (N=15 ABOVE_BAR). The ladder is complete; the epic is
  closed.
