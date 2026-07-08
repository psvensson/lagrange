# Literature / industry practice — keeping placement alive through control-plane transients

Session s12 (2026-07-08). Research subagent synthesis (cited). Maps directly onto the two residual
modes: MODE-A (run1 eligibility dip → one-shot deny → under-replicated) and MODE-B (run2 self-move
interlock globally gates provisioning).

## One-line industry consensus
Every mature system treats a leader/lease handoff and a brief liveness divergence as a **transient to
ride out**, never a condition that terminally denies work; and ranks **up-replication strictly ABOVE
rebalance** with **per-range independence**. So MODE-A (edge-triggered one-shot deny on an empty set)
and MODE-B (a global interlock letting lowest-priority rebalance gate highest-priority up-replication)
are both recognizable **anti-patterns** relative to the reference designs.

## Top 5 transferable patterns (ranked by fit)
1. **Level-triggered placement with a purgatory/retry state — never one-shot deny.** [MODE-A, top fit]
   CockroachDB replicate queue + **purgatory**: *"If a node needs to be up-replicated but there are no
   available matching nodes … the replica will be put in purgatory to be re-processed when new nodes
   become live."* K8s scheduler unschedulableQ (timer floor `PodMaxInUnschedulablePodsDuration=5m` +
   event re-drive via QueueingHint + 1s→10s backoff). Nomad blocked evals. Park the under-replicated
   table; re-drive on a short timer floor (seconds) AND on eligibility/quorum-return events. Converts
   "empty set once → permanent under-replication" into "delayed by one retry interval."
   (rebalancing.md; k8s scheduling_queue.go; Hockin edge-vs-level.)
2. **Up-replication ≫ rebalance priority; scope/throttle the interlock, don't globally gate.** [MODE-B]
   CRDB allocator priorities: `ReplaceDeadVoter`=12000, `AddVoter`=**10000** ≫ `ConsiderRebalance`=**0**,
   decided per-range. TiKV/PD: checkers (repair) outrank schedulers; separate budgets
   `replica-schedule-limit`=64 vs `region-schedule-limit`=2048, `max-pending-peer-count`=16. No
   reference system uses a global interlock blocking all provisioning during one rebalance. Replace the
   partition-blind gate with per-partition scope + a small self-move concurrency budget + priority.
3. **Membership hysteresis — suspect≠dead, fail-open on all-ineligible.** [MODE-A] memberlist/Serf
   Alive→Suspect→Dead with refutation (`SuspicionMult=4`, `ProbeInterval=1s`); **Lifeguard**
   self-awareness (`AwarenessMaxMultiplier=8`) — an overloaded node distrusts its OWN judgments;
   Cassandra phi-accrual (`phi_convict_threshold=8` ≈ 18s tolerance); Akka `acceptable-heartbeat-pause=3s`,
   SBR `stable-after=20s` (flapping is a *tuning bug*, fix by widening not acting faster); CRDB
   store-suspect (~30s) biases new replicas AWAY but still counts the store live — never empties the
   set. K8s `--node-monitor-grace-period` 40-50s. **Every grace window (3s / 18s / 20s / 30s / 50s) is
   >> the observed 10s dip.** Give candidates a reversible SUSPECT tier; treat "ALL candidates
   simultaneously ineligible" as observer-disruption → retain last-known-good (Lifeguard).
4. **Sever the metadata self-dependency + over-replicate/stickiness.** [MODE-B root] CRDB: meta1/meta2/
   liveness ranges *"are not managed using the above mechanism to prevent circular dependencies"* — they
   use expiration leases so their own placement never routes through the metadata they govern; and
   default `num_replicas=5` for `.meta/.liveness/.system` vs 3, for stickiness (fewer forced moves).
   Generalizes A1 (`b535d0ec`: single-partition ledger progress writes take an independent path). Makes
   self-moves rare → kills the limit cycle. This is the sibling-quest direction (reduce thrash upstream).
5. **Ride out the handoff via forwarding/retry + learner-staged moves.** [MODE-A+B] etcd proposal
   forwarding (default ON — a write to a follower mid-handoff is buffered+forwarded, never rejected) +
   repropose-on-timeout; Pre-Vote+CheckQuorum stop a brief divergence widening the no-leader window;
   `MsgTimeoutNow` sub-election-timeout cooperative transfer; **learner-first → joint-consensus promote**
   so a metadata move never drops quorum or empties the eligible set.

## Direct doctrine hits
- **MODE-A is the textbook edge-triggered one-shot deny** these systems were built to eliminate (CRDB
  purgatory, K8s unschedulableQ). The ~10s transient should delay convergence by one retry interval,
  never strand the table. (Matches memory: level-triggered reap-on-timeout, avoid escalate-per-failure.)
- **MODE-B's global interlock inverts the canonical priority ordering** (lowest-priority self-move gates
  highest-priority up-replication) and couples unrelated partitions. Fix = priority + scope + upstream
  churn reduction, NOT narrowing the gate reactively (matches memory 20/22).
- **Circular-dependency incidents:** CRDB #18151 (leader-leaseholder split perpetuated by the stale
  leaseholder still heartbeating liveness — self-sustaining wedge, resonant with our circular deadlock);
  #32525 (replicate-queue snapshot pressure itself causing unavailability — rebalance starving repair).
  Caveat: no public postmortem of the exact "metadata rebalance churn starved data up-replication"
  shape was found — MODE-B is under-documented publicly, but every reference design independently
  condemns its priority inversion.

## Caveats / source conflicts
K8s `node-monitor-grace-period` 50s (current) vs 40s (older), version-dependent. CRDB store-suspect
~30s is an internal code constant, not a cluster setting. MODE-B's exact shape is publicly
under-documented (see above).
