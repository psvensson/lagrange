# Forward-lever synthesis — three researched, they collapse to one root

Inputs (all read-only, write-as-you-go):
- `research-lever-a-off-partition-persistence.md`
- `research-lever-b-reseat-after-demotion.md`
- `research-lever-c-election-gap.md`
- Binding-wedge evidence: `verify-model-lever-vs-run6-binding-wedge.md`

## The three levers do NOT sit side by side — they stack

All three bottom out at the SAME defect at different layers: **the raft-log
durability substrate acks / advertises a write as durable when it is not.** On
`replica_operations-p1` the frozen leader's `getLastInfo()` reads through a wedged
sqlite connection and advertises a **phantom-high, non-durable last index**
(`sqlite-log-adapter.js:157-185`; wedge described in
`partition-service-durability-fitness.js:10-30`). That single lie produces every
symptom we traced:

- **The op-progress write "participant failures"** (Lever A's layer): the
  self-move's transition write to `replica_operations` can't confirm durable
  quorum, so it fails for the duration.
- **The ~66s election storm / term 2→21** (Lever C's layer): per Raft §5.4 every
  live voter MUST veto a candidate whose last index is behind its own
  (`liferaft index.js:228-239`); the zombie advertises a phantom-high index, so it
  **vetoes every honest durable candidate** — including the voter-ready target the
  rebalancer actively campaigns (`priority-publication-leader-safety.js:254-322`).
- **The ~78s leaderless window after demotion** (Lever B's layer): the
  durability-fitness demotion (`tracked-leader-demotion.js:18-41`) is a BLIND
  step-down naming no successor, and even a directed one can't win while the
  zombie's veto stands.

## Verdicts

| Lever | Verdict | Why |
| --- | --- | --- |
| **C — close the election gap** | **DROP (not independent)** | Strictly downstream of the lie. You cannot elect around a lying voter; §5.4 correctness *requires* the veto. Pre-vote (NEW, and only a spike exists) stops the term climb but NOT the veto → still no leader. Timer tuning is counter-productive. C is a *diagnostic consequence*, not a frontier. |
| **A — off-partition operation store** | **DEPRIORITIZE (root, wrong layer, highest cost)** | Structurally the self-reference is real (`replica_operations` is single-partition, no sharding). But A treats the *operation-ledger* write path with NEW durable machinery crossing rebalancer + control-plane gateway + storage/raft, and its only viable variant (leader-local journal) is invisible to CDC → a **secondary-source-of-truth** the codebase forbids. It sits one layer ABOVE the actual durability lie. |
| **B — directed reseat on demotion** | **KEEP as cheap defense-in-depth, AFTER the root** | EXTENDED, not NEW: `STEP_DOWN_REPLICA`/`requestElectionNow` directed-handoff already ships (`priority-publication-handoff.js:114-146`) for surplus-drain; extend it to durability-demoted sources. But it only helps once a durable successor is *electable* — which requires the root fix first. Recent-ack viability is a lying sensor. |

## The cheapest-correct root lever (emerged from C, not in the original three)

**Make a durability-unfit voter recuse from the §5.4 up-to-date veto — not just
from its own candidacy.** The durability-fitness detector ALREADY fires (it is
what demotes the leader at 07:04:17) and candidacy-deferral ALREADY targets the
zombie — but per lever-C it "suppresses candidacy, not the vote." So the honest
durable target (voter-ready 07:04:29) is vetoed by the zombie's phantom index and
can't win until the wedge heals by luck at 07:05:35. Extending the existing
unfit-voter detection to also **suppress that voter's phantom-index veto** lets an
honest durable candidate win immediately.

- **Reuse: EXTENDED.** Reuses the shipped durability-fitness detector
  (`partition-service-durability-fitness.js`) and the liferaft vote path
  (`index.js:228-239`); no new store, no new read path. Contained vs A.
- **Owner boundary:** raft-adapter + partition-service-durability-fitness — the
  same owner that already ships the demotion.
- **Correctness caveat (SERIOUS):** muting a voter's §5.4 veto is raft-safety
  critical (cf. CL-040/041/042). It is only sound if the unfit voter's advertised
  index is provably NON-authoritative (its "extra" entries are in-memory-acked but
  non-durable, so they were never truly committed and cannot be lost by electing
  around it). That proof — that durability-unfitness ⟹ advertised-index-not-committed
  — is the crux and must be established before any patch.

## Recommended sequence (DT-first, lever-agnostic step first)

1. **Build the missing DT that reproduces the BINDING fault.** All three reports
   independently flag that NO existing DT reproduces it: `dt6-rebalancer-formation-
   self-move-interlock.test.js` fails ledger writes only under *contention*
   (`:107`), not the run-6 signature (the self-move's OWN write failing during its
   voter-transit window even when serialized, producing a phantom-high index and a
   §5.4 veto). Extend the multi-node virtual-network raft substrate
   (`dt6-ledger-leader-durability-fitness.test.js` physics +
   `election-jitter-seed.test.js` seeded elections) to rig one adapter's
   `getLastInfo()` phantom-high and assert "no leader within bounded ticks" (RED).
   This grounds every lever and satisfies "DT must move the binding observable."
2. **Root fix: unfit-voter veto-recusal**, proven red-on-revert against that DT
   (leader elected in bounded time once the zombie recuses), after establishing the
   durability-unfit ⟹ non-committed-index correctness lemma.
3. **Defense-in-depth: directed reseat on demotion** (Lever B), extending
   `requestElectionNow` to durability-demoted sources, so the bounded window is
   tight even without waiting on randomized timers.
4. **Deprioritize A** unless 2+3 prove insufficient (i.e. if the transient write
   failure itself — not the recovery latency — exceeds the provisioning budget even
   with fast durable-leader recovery).

## Note
The sibling quest `formation-ledger-leader-local-persistence-wedge` (SOLVED)
added the durability-fitness demotion; this synthesis shows the demotion is a
LATE, coarse heal downstream of the lie. The precise remaining gap is that the
detected-unfit voter still *votes* (vetoes) with a phantom index. That is the
narrow, load-bearing seam.
