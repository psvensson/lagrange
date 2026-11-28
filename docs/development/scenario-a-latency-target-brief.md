# Scenario A latency: target, findings so far, and where to start

Status: working brief, written 2026-11-28. It records what was measured and decided on that
day so that the next person or agent does not start from zero. It is not a design and not
evidence. Update it when a number or a decision changes; delete it when the epic
`scenario-a-measured-latency-and-efficiency` carries the same content.

## The target (owner, 2026-11-28)

Scenario A latency must end **within two to three times TiDB's** on the final substrate
(GCP, same zone). Ten times slower is not acceptable. The question to answer is: find an
order-of-magnitude speedup, or show that it is impossible and why. A percentage gain is not
the goal; report progress as a ratio to TiDB with the substrate named.

## Where things stand

Median latency of committed first attempts, in milliseconds
(new_order / payment / delivery / order_status / stock_level / mix-weighted 52-35-5-3-5):

| System and substrate | Figures | Standing |
| --- | --- | --- |
| TiDB, GCP, 24 Nov | 96 / 19 / 49 / 9 / 15 / 60 | three 100-transaction smoke runs; records classed not admissible |
| PostgreSQL single primary, GCP, 24 Nov | 36 / 7 / 14 / 5 / 6 / 22 | same |
| PostgreSQL synchronous HA over three replicas, GCP | 36 / 9 / 15 / 3 / 5 / 23 | same, two runs |
| Lagrange, GCP, 24 Nov build | 4133 / 2890 / 3483 / 666 / 398 / 3375 | the one run that completed; an older build |
| Lagrange, one lab host, main `ab347e962` | 1479 / 1033 (pooled, three runs) | first look only |
| Lagrange, one lab host, ACTIVE-row removal | 1229 / 850 (pooled, three runs) | first look only |

Source of the GCP rows: `data/tidb-comparison/raw-observations.ndjson`. So the gap is between
15 and 55 times against TiDB depending on which Lagrange figure is used, and the per-kind
targets are about 288 / 57 / 147 / 27 / 45 ms. Payment and the read-only kinds are the tight
ones.

## The two facts that organise the work

1. **Latency is the number of sequential consensus rounds times the cost of one round.**
   A write transaction waits for 9 + 2P rounds, P being the partitions it writes
   (new_order 19, payment 17); a read-only transaction waits for 3. Statements that need no
   round are fast. The code trace with every round named is the report "R1" (see below).
   Removing five rounds from new_order removed about a fifth of its latency, as predicted.
2. **A round is slow because one node's event loop is saturated, not because of consensus.**
   Dividing latency by rounds gives about 80 ms per round on one lab host (1479 ms over 19
   rounds, 1229 ms over 14). But the consensus layer alone (real Raft runtime and durable
   store, three replicas in one process, NVMe) takes 6.2 ms per round at the median: 1.5 ms
   for the two disk syncs and 2.3 ms for two `setTimeout(0)` inbound drains, which Node
   rounds up to 1 ms each (`src/raft/raft-rs-runtime-owner-constants.js`,
   `INBOUND_DRAIN_DELAY_MS`); 180 extra ticking groups do not change it. On a real one-host
   cluster the seed node is the only SQL endpoint and leads nearly all partitions; with two
   clients of a one-row transaction its event loop is 99.9 % busy with a queue delay of
   16 ms, a round costs 28-36 ms, and one such transaction uses about 185 ms of that loop.
   Right after formation the same node is 98 % busy for about two minutes with no client
   load. A synced SQLite commit measures 0.7-1.4 ms on the lab SSDs (44.6 ms on a spinning
   disk, so check the disk before trusting any number). In process, with recording doubles
   below the gateway, the coordinator's own logic takes about 1.25 ms for a one-write
   transaction. So the levers on the cost of a round are: the processing per round on the
   leader's thread, the concentration of every leader and the only endpoint on one node, and
   the two timer turns. None touches a sealed constraint. (Interim result of R2; its CPU
   profile of the loaded node is the next thing to read.)

## What decides whether the target is reachable

From the design study "R3" (interim result; the full report replaces this section):

| Design | Sequential rounds, write | Read-only | A round may cost at most (statement 1 ms / 3 ms) |
| --- | --- | --- | --- |
| Today | 9 + 2P | 3 | - |
| ACTIVE-row removal (built) | 9 + P | 3 | - |
| End of the track that reverses nothing | 6 + P | 1 | 5.1 / 3.9 ms |
| The product's own protocol at its floor ("design A") | 4 for any P | 0 | 12.8 / 9.8 ms |
| Nothing durable before COMMIT | 3 (2 if answered at the decision) | 0 | 17 / 13 ms (25.5 / 19.5) |
| Commit implied by the prepare records | 1 | 0 | 51 / 39 ms |

The roadmap has two tracks (R3, section 6).

Track 1 reverses no sealed constraint and is built now: (1) a read-only COMMIT is answered
when its sessions are released, its writes following as owned settlement (read-only 3 -> 1);
(2) the decision write is retried to a known outcome, the PREPARED status write is dropped,
settlement follows the answer (new_order 14 -> 11, payment 13 -> 10); (3) BEGIN answers after
the local can-persist check, its insert durable before the first participant request;
(4) all rows of one locking statement in one reservation proposal.

Track 2 is unlocked one proof obligation at a time, each proven before the owner reverses
the sealed text it names: PO-1 the participant set written once at COMMIT instead of per
statement (gain P rounds); PO-2 PREPARE evidence only in the decision record (1 round);
PO-3 a locking read as a claim in the partition leader's memory (1 round per locked row;
the benchmark adapter strips `FOR UPDATE` today, so measured numbers contain none of that
cost); PO-4 the coordinator row created at COMMIT (1 round; with PO-1 and PO-2 this is
design A: 4 rounds, read-only 0). At a round of 5 ms and a statement of 3 ms, PO-1 alone
already puts every transaction kind inside three times TiDB (mix 109 ms), and design A gives
158 / 38 / 68 / 12 ms, mix 100 ms. Designs with three, two or one round are needed only if
a round cannot be brought under about 10 ms.

- Necessary for every design: a round of at most about 51 ms, and a statement that needs no
  round costing at most about 6 ms (new_order makes 46 client calls). The second has never
  been measured apart from the first.
- At today's cost of a round (about 80 ms) no design meets the payment target, even with one round.
- If a round comes down to about 5 ms, the product's own protocol trimmed to four rounds
  lands at about 1.3-1.7 times TiDB on the mix. Fewer rounds alone cannot reach the target;
  a cheaper round alone cannot either.

## Open question to answer first

**What is the processing that saturates the leader node's event loop?** About 15 ms of loop
time per round and about 185 ms per one-row transaction are far more than the coordinator's
own logic. R2's CPU profile of that node under load answers this; the candidates are the
SQL engine statement each coordinator write is executed as, CDC obligations and cache
propagation per write, digests and canonical JSON, logging, and the background work after
formation. The cost of a statement that needs no round must be measured separately
(R3 needs it at or below about 3-6 ms).

## Directions, and whether they fit the product

Fit was judged against: SQLite per partition replica, one process and event loop per node,
one Raft group per partition, coordinator state readable in system tables, one commit
protocol with no second path.

Fewer rounds (all keep the same commit protocol):
- Nothing replicated before COMMIT: participants already hold staged writes only in memory
  before PREPARE; the per-statement write of the participant list would move to COMMIT.
  Needs the sealed per-statement manifest write superseded.
- Read-only transactions with no rounds: no coordinator record at BEGIN.
- Row locks for locking reads in leader memory plus the validation at PREPARE that already
  exists, instead of one replicated reservation per row. Needs the sealed replicated
  reservation superseded.
- One decision record instead of several sequential status writes; answer before settlement.
- Commit implied by the prepare records (what TiDB calls async commit): fits, but changes
  recovery (any participant must be able to resolve an abandoned transaction; readers wait
  on prepared rows). Only needed if a round cannot be made cheap.

Cheaper rounds:
- Whatever R2 finds to be the 70 ms.
- The leader persisting its log while it sends to followers (standard Raft; whether the
  WASM binding of the Raft core exposes it is unchecked).
- Idle groups not ticking: one shared clock or hibernation.
- One shared log database per node with one sync per turn: possible with SQLite but a
  rewrite of the durable store; disk sync is not today's bottleneck.

Judged not to fit: transaction state held only in a lock with no coordinator record
(recovery reads the coordinator's rows); a one-round commit for single-partition
transactions (retired by owner decision in October 2026 as a second commit algorithm, and
no Scenario A transaction is single-partition as deployed); separate thread pools for
consensus (the worker-thread consensus path was deleted by owner decision in September
2026).

Owner decisions these would need: superseding the two sealed constraints named above, and
accepting explicitly that a participant leader change before COMMIT aborts the transaction
(already true in practice).

**How the owner wants this done (2026-11-28).** Start implementing the directions that
reverse no sealed constraint. For each sealed constraint a direction would replace: first
research and prove that the replacement works, then the owner reverses the decision, and
only then does anything that depends on it land. A proof package states why the constraint
was sealed (quoted from the record that sealed it), the replacement mechanism, a table of
crash points and interleavings with the cells where the two differ, executable witnesses
with the real participant and recovery code, interleaving or model checking where the
repository's apparatus allows it, and the latency it buys. Proof work lives on the
experimental branch `perf/latency-stack-20261128` (main plus the telemetry export plus the
ACTIVE-row removal), never on a branch that lands. An instruction to implement is not a
reversal of a seal.

## What exists to build on

- **ACTIVE-row removal** (quest `transaction-redundant-progress-writes`): implemented, at
  independent verification; new_order 19 -> 14 rounds, payment 17 -> 13; about 20 % on one
  host in three interleaved runs per arm. Branch `wip/oltp-20261128/td-active-row-removal`.
- **Transaction telemetry export** (quest `transaction-path-telemetry-export`): a node-local
  admin route, `GET /api/admin/diagnostics/transactions`, that reports per transaction the
  time per phase and per coordinator write. Independently verified; it is the instrument
  that shows where a transaction's time goes on a real cluster. Branch
  `wip/oltp-20261128/tb-telemetry-export`.
- **Research harness** (quest `scenario-a-research-substrate-ladder`): runs the fixed
  workload on one lab host, on three lab hosts or on GCP and keeps the raw record:
  `docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target lab --profile
  research --substrate lab-single-host|lab-multi-host ...`. Branch
  `wip/oltp-20261128/tc-research-substrate`.
- **Substrate ladder** (owner rule): one host with three nodes is a first look and never
  evidence; three separate lab hosts, repeated, is working evidence; GCP is final
  verification only. The three-host lab runs over Wi-Fi and is not a latency instrument.

## Reports and tools outside this repository

They live in the coordination directory of the 2026-11-28 programme on the workstation,
`/mnt/data/peter/projects/lagrange-oltp-perf-20261128/`:

- `reports/r1-commit-path.md`: the code trace of every round, with candidates ranked and the
  sealed constraints each one meets.
- `reports/r2-round-anatomy.md` (and `r2-interim.md`): where one round's milliseconds go.
- `reports/r3-target-commit-path.md` (and `r3-interim.md`): the minimal-round designs, the
  latency model, the staged roadmap and the feasibility verdict.
- `reports/td-design-review.md`: the design review of the ACTIVE-row removal, including why
  removing the `status = PREPARED` write was deferred.
- `reports/lead-rulings.md`: every decision of the day in order (rulings 201 onward concern
  this target).
- `tools/synced-commit-bench.cjs`, `tools/ab-first-look.sh`, `tools/ab-three-host.sh`,
  `tools/ab-summary.mjs`: the disk-sync measurement, the interleaved comparison runners and
  the summary of their records.

## Where to start

1. Read R2. If it names the dominant cost of a round, the first change is to remove it and
   re-measure the cost of a round and of a statement that needs no round.
2. Read R3 and pick the fewest-round design that the measured round cost allows; bring the
   two constraint supersessions to the owner with R3's safety arguments.
3. Land the telemetry export first: every later claim should be read off it.
4. Measure on three lab hosts for working evidence and on GCP for the final ratio, with
   TiDB measured in the same session.
