# Distributed transaction replicated apply: design-gate STOP checkpoint

Status: **STOP**

Evidence-bearing branch: `quest/distributed-transaction-replicated-apply`

Immutable checkpoint: `292b7204334cf47617e675dd9b12bc708b682886`

Blocking prerequisite: `bounded-transaction-workspace`

No production `src/` repair is part of this checkpoint. Distributed
transaction replicated apply does not continue until the prerequisite proves
a workspace whose transaction-critical startup is bounded independently of
total partition size.

## What the rejected mechanism proved

The measured workspace mechanism is:

1. serialize the full SQLite partition database;
2. normalize a serialized WAL image's header read/write versions from `(2,2)`
   to rollback-journal `(1,1)` so `better-sqlite3` can open the anonymous
   buffer database;
3. open that buffer as the private shadow;
4. scrub copied Raft tables.

The header normalization is a valid measured SQLite finding and remains useful
if serialized WAL images are used elsewhere. It is not generalized into a
production transaction abstraction whose only consumer would be this stopped
design.

The mechanism is technically functional. Public apply traffic continued
during the experiment, and the finalized reordered harness is green. The STOP
is therefore a design verdict, not a failed-test verdict: the harness now
correctly measures and records the rejected architecture without making the
ordinary corpus depend on host performance.

Full SQLite serialization remains on the workspace critical path. On the
slower supported lab host the finalized measurements were:

| Serialized partition image | Workspace preparation |
| ---: | ---: |
| 32 MiB | 68.69 ms |
| 128 MiB | 210.19 ms |
| 256 MiB | 436.08 ms |

The gate evaluated these against a 350 ms required boundary. The prerequisite
performs the separately requested read-only audit of which real
election/apply/liveness owner that boundary belongs to, which event starts it,
which event must finish, the consequence of overrun, and whether continuing
public apply changes the argument. A correction to the budget or phase cannot
rescue this mechanism: its critical-path work remains `O(total partition
bytes)`.

## Consequence

The evidence falsifies the mechanism, not the transaction contract. It must
not be hidden behind a 32, 128, 200, or other total-partition-size cap; a
machine/throughput/slow-node limit; a lower split threshold; or a larger
liveness budget chosen to fit the copy. A future transaction bound may attach
to actual transaction work or the rs-raft maximum entry size, not unrelated
partition bytes.

Unbounded rs-raft history in the serialized image is an adjacent storage
concern. Compaction or separation may remove unnecessary bytes, but even a
fully compact partition can legitimately contain hundreds of MiB or GiB of
user data. Faster copying after compaction is not a bounded transaction
workspace.

The stopped transaction design and its prior owner/challenger reports remain
the continuation point after the prerequisite. They are not restarted or
silently weakened.

## Append-only liveness-budget correction

The prerequisite's independent source audit corrected the earlier timing
premise without changing the STOP verdict.

At `292b7204334cf47617e675dd9b12bc708b682886`, partition-specific timing does
reach rs-raft. The default 20 ms tick and per-replica election minima derive
core election ticks of 50, 175, and 300, for minimum windows of 1000, 3500,
and 6000 ms before raft-rs randomization. The earlier 350 ms figure is
therefore retained above as the design gate's historical required boundary,
not as a current source-owned rs-raft scalar.

The real liveness constraint is the residual election slack consumed by an
uninterrupted monopoly of the authoritative process's event loop: it starts
after a follower last steps a valid leader message and ends when the leader
returns to tick/core/Ready/send and the follower steps the next message. A
workspace may take longer off-thread if authoritative tick and apply continue
and its exact snapshot remains valid. The prior copy experiment ran
serialization outside the leader process while node workers continued, so it
did not measure this owner-thread slice.

This correction cannot rescue serialization. Full-image work is still
unbounded in total user-data bytes and remains rejected by the prerequisite's
frozen complexity claim.

## Append-only publication checkpoint

On 2026-09-27 the clean branch
`quest/distributed-transaction-replicated-apply` was verified again at exact
HEAD `292b7204334cf47617e675dd9b12bc708b682886`. Its quest-only range from
`33885263f` has no `src/` delta, and the remote branch did not exist.

The non-force push was refused by the repository's exact-checkout pre-push
gate after its static checks and corpus ratchets passed. The placed whole
corpus repeatedly failed
`test/integration/transaction-concurrent-read-outage.integration.test.js` on
`tv-dator` during formation. Nothing was pushed, and
`refs/heads/quest/distributed-transaction-replicated-apply` therefore still
has no remote SHA to record. The full attempt is retained in the prerequisite
evidence record
`publication-attempt-stop-quest-2026-09-27.md`.

No force, history rewrite, `--no-verify`, or unreceipted test-stage skip was
used. The STOP verdict and immutable evidence head are unchanged; only remote
publication is unresolved.
