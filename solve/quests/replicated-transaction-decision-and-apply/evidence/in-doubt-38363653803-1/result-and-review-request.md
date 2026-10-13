# TX1 real in-doubt COMMIT before fanout — native process-loss result

Status: **focused proof PASSED**, NOT final coordinator recovery acceptance.
No Solver independent approval, merge, TX1 eight-receipt seal change, or
physical multi-host certification is claimed.

## Exact source and evidence

Measured source/test head: `19ab6ae349202d24cbc704e33a3773975a184f8b`.
Published proof/evidence branch head before this document:
`f4ea7ce8bbe1f9a0ee5a003d73dc6a6421ad893c`.
GitHub Actions run: `38363653803`.
Artifact ID: `11795523796`.
Artifact SHA256:
`ef03be7b1b17af938ec1a01e1b80691eba9eb7cdd904d9d3025e5be97f48a51a`.
Canonical selected test: **1 passed / 0 failed / 0 skipped or cancelled**.
Evidence and SHA256SUMS are preserved in this directory.

## What the actual executable witness proves

The existing production seed M1 setup drives an actual two-participant schema
cutover, with three raft-rs/SQLite replicas for each of four system-table groups
(twelve different durable files).

The test intercepts only the first production coordinator
`commitParticipant` callback and refuses to deliver it. This callback is
entered only after the coordinator has recorded its immutable COMMIT decision.
The test requires the real sql_transactions row to carry COMMIT and frozen
participant count two, the two actual participant records to carry PREPARE
evidence, and the two migration-cutover effects to remain unapplied on all
three replicas. All twelve disk files must agree before the marker is fsynced
and atomically published.

A separate test process sees the complete marker, SIGKILLs the live seed while
its twelve database handles are open, and independently re-reads every selected
SQLite file. The rows after process loss exactly match the pre-kill observation.

A fresh process constructs `DistributedTransactionCoordinator` and calls its
production `recoverFromSystemTables` against the independently recovered rows.
The recovery registry discovers the same in-doubt transaction, frozen
participant count two, and an obligation to recover.

**Importantly, snapshot discovery does not adopt COMMIT by itself.** The
coordinator deliberately leaves `decision = null` until the existing
authoritative recovery owner rereads the transaction and exact participant rows.
This is a correct authority fence, not lost COMMIT durability.

The receipt records:
`durableDecisionReadBack=true`,
`cacheDiscoveryCannotDecide=true`,
`effectsNotApplied=true`,
`fanoutReplayCertified=false`.

## Retained negative attempts

The first Actions attempt `38362902926` stopped at formatting and was
preserved; it did not engage the native scenario. The subsequent run
`38363176014` engaged real pre-fanout process loss and recovered the durable
rows, but its final test assertion incorrectly required the untrusted snapshot
to authorize COMMIT in the reconstructed coordinator. This was corrected
without changing production code or weakening the durability/effect checks.
The corrected exact run is green.

## Still explicitly unproved

- Restarting a serving coordinator through production startup and its actual
  authoritative control-plane gateway.
- Re-reading the immutable COMMIT decision through that gateway and delivering
  the exact bound decision to both still-PREPARED participants after process
  loss.
- No rollback, duplicate SQL effect, or lost CDC obligation across that replay.
- Genuinely admitted historical legacy transactions and retirement of the
  obsolete session-based producer/reconstructor/expiry paths.
- Split/merge, full seed rejoin and physical host loss.

The existing four legacy-oriented failing tests and global static failures
remain open; this proof is not a replacement for their acceptance.

## Independent review request

Review the actual M1 interception point, the fact that no physical COMMIT
callback ran, all twelve independent RF3 files and committed/unapplied rows,
SIGKILL timing, separate reader and production discovery semantics. Attack
possible early terminalization, accidental delivery through another worker,
marker publication before durability, stale snapshot authority, and test
cleanliness. Distinguish the correct non-adoption of snapshot decision bytes
from an actual production recovery/replay guarantee. Do not claim full
coordinator crash recovery from this scoped proof.
