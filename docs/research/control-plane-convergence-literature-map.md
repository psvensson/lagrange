# Control-plane convergence: the academic literature map

Research commission (2026-08-04, subagent-synthesized, citations verified against
canonical sources): the peer-reviewed grounding for the MovieLens phantom-predicate
problem class. Companion to
[`control-plane-convergence-production-mechanisms.md`](control-plane-convergence-production-mechanisms.md)
(the production-systems map). This file maps each of our three symptoms to the
named papers/results that address it, so the eventual cut is the best-precedented
mechanism rather than a bespoke one.

## Our problem class, in literature terms

1. **Unreliable failure detector asked to do a job theory says it can't do
   perfectly** - so eviction must be made *safe*, not *correct* (the
   progress-or-evict tension).
2. **Read-path scalability/consistency** - consumers need fresh-enough
   authoritative membership/leadership reads without funneling through one
   congested leader (solved by leases, quorum reads, ordering tokens - not by
   stronger funneling).
3. **Reconfiguration safety** - quorum-intersection arguments across config
   changes plus epoch fencing, so no two leaders are ever both legitimate.

## Theme 1 - Failure detection & the progress-or-evict tension

- **φ Accrual Failure Detector** - Hayashibara, Défago, Yared, Katayama,
  *IEEE SRDS 2004* (DOI 10.1109/RELDIS.2004.1353004). Continuous suspicion level
  from heartbeat inter-arrival statistics; the application picks the threshold.
  Decouples "how suspicious" from "what to do". (First author is Hayashibara,
  not Défago.)
- **SWIM** - Das, Gupta, Motwani, *DSN 2002*. Suspicion mechanism: a node is
  first *suspected*, can *refute* by bumping its incarnation number, and is only
  declared dead after a timeout. The incarnation number is a membership-epoch
  fencing token.
- **Lifeguard** - Dadgar et al. (HashiCorp), *NSDI 2018*. Local Health Aware
  Probe (a slow node raises its own awareness multiplier) + the Buddy system
  (peers stop suspecting a self-reporting slow node). The closest peer-reviewed
  precedent to our exact "slow, not dead" symptom.
- **Theory backbone** - Chandra & Toueg, "Unreliable Failure Detectors for
  Reliable Distributed Systems," *JACM 1996*; Chandra, Hadzilacos, Toueg, "The
  Weakest Failure Detector for Solving Consensus," *JACM 1996*; Dwork, Lynch,
  Stockmeyer, "Consensus in the Presence of Partial Synchrony," *JACM 1988*.
  These prove bounded-time eviction of a slow node is impossible under asynchrony;
  bounded-time claims require explicit synchrony assumptions (leases, bounded
  clock drift).
- **Fail-slow at Scale** - Gunawi et al., *FAST 2018*. Empirical evidence that
  fail-slow (limping) faults are common and distinct from fail-stop - the
  "healthy enough to stay, too slow to hand off" mode is real steady state.
- **No named bounded-time progress-or-eviction result exists, and theory says it
  can't** (consequence of FLP + Chandra–Toueg). The accepted compromise is in
  Themes 3–4: evict on *suspicion gated by quorum safety*, and make a wrongful
  eviction harmless via fencing.

## Theme 2 - Linearizable/consistent reads without leader funneling

- **Raft ReadIndex & leader leases** - Ongaro & Ousterhout, "In Search of an
  Understandable Consensus Algorithm," *USENIX ATC 2014*, §6.4; Ongaro
  dissertation, *Stanford 2014*, §6.4.1. ReadIndex: leader confirms leadership
  via one heartbeat round, serves read at commit index - no log application, but
  the read still *touches the leader*. Lease-based reads: zero round trips under
  a bounded-clock-drift assumption. **Honest caveat: ReadIndex does NOT break
  the funnel** - a congested leader still stalls reads. Leases do break it.
- **ZooKeeper / Zab** - Junqueira, Reed, Serafini, *DSN 2011*; Hunt, Konar,
  Junqueira, Reed, *USENIX ATC 2010*. Followers serve reads locally (not
  linearizable); a client needing freshness calls `sync()` first, ordering its
  read after all writes up to its last-seen **zxid**. zxid is the
  "fresh-enough token" pattern.
- **Session guarantees** - Terry, Demers, Petersen, Spreitzer, Theimer, Welch,
  *PDIS 1994*. Read Your Writes, Monotonic Reads, Monotonic Writes, Writes
  Follow Reads. Our "phantom missing leader / phantom deficit" is precisely a
  **Monotonic Reads violation**; the fix is consumers carrying a last-seen
  epoch/index and servers refusing to answer behind it.
- **CAP / PACELC** - Brewer, PODC 2000 keynote; Gilbert & Lynch, *SIGACT News
  2002*; Abadi, *IEEE Computer 45(2), 2012*. For a membership/leadership service
  the accepted choice is CP during partition, paying the latency/consistency
  tradeoff in steady state via leases. You cannot have both the funnel-free read
  and unconditional freshness.
- **Megastore** - Baker et al., *CIDR 2011*. A per-entity-group **coordinator**
  tracks which Paxos groups a replica has fully applied, letting any up-to-date
  replica serve *current* reads locally without contacting the leader. Strong
  precedent for a locally-readable authoritative view.
- **Paxos quorum leases** - Moraru, Andersen, Kaminsky, *CMU PDL 2014*. Read
  leases granted to entire quorums, so any leaseholding replica serves strongly
  consistent reads locally. Directly targets the anti-funnel requirement.

## Theme 3 - Membership reconfiguration without split-brain

- **Raft joint consensus & single-server changes** - Raft paper §6 (ATC 2014),
  Ongaro dissertation §4. Safety holds because any quorum of C_old, C_new, or
  the joint config intersects any other. The dissertation's single-server change
  result proves adjacent configs' majorities always intersect (this is what etcd
  raft implements). **This is the deadlock-breaker**: reconfiguration commits
  with any quorum of the *old* config, so evicting the stuck node never requires
  the stuck node to make progress.
- **Vertical Paxos** - Lamport, Malkhi, Zhou, *PODC 2009*. Configuration managed
  by an external master ballot so a replica set can reconfigure even when the old
  primary is unavailable.
- **SMARTER Paxos** - Lorch, Adya, Bolosky, Chaiken, Douceur, Howell,
  *OSDI 2006*. Reconfiguration of Paxos-replicated storage clusters.
- **Stoppable Paxos / "Reconfiguring a State Machine"** - Lamport, Malkhi, Zhou,
  *SIGACT News 41(1), 2010*. Each configuration is a stoppable SMR instance; the
  next config is chosen by the old one before it stops. The clean theoretical
  statement of formation-vs-steady-state handoff.
- **Why these kill divergent truth**: every scheme reduces to one invariant -
  *no two quorums that can act across a reconfiguration boundary are disjoint* -
  so two leaders can never both be legitimate. Divergent control-plane truth can
  only happen if the reconfig path bypasses quorum intersection.

## Theme 4 - Epoch/lease fencing for stale actors

- **FLP** - Fischer, Lynch, Paterson, *JACM 1985*. No deterministic async
  algorithm guarantees consensus termination; corollary: no perfect async
  failure detector. Practical mitigations: randomization, or partial synchrony
  (DLS 1988) - i.e., assume eventually-bounded message delay/clock drift, which
  is what every lease system actually assumes.
- **Chubby** - Burrows, *OSDI 2006*. Canonical lease-based lock service on
  Paxos. Two fencing mechanisms: the **sequencer** (a monotonic token the
  lock-holder presents to the resource, which rejects stale sequencers) and
  **lock-delay** (resource holds off for a bounded period after lease expiry).
  The sequencer is the peer-reviewed ancestor of the fencing token.
- **Viewstamped Replication** - Oki & Liskov, *PODC 1988*; Liskov & Cowling,
  *MIT CSAIL TR-2012-021*. **View numbers** (≡ Raft terms) are the fencing
  primitive: replicas reject messages from stale views. Raft's term is a direct
  descendant.
- **Paxos leases / engineering practice** - Lamport, "Paxos Made Simple,"
  *SIGACT News 2001*; Lamport & Massa, "Cheap Paxos," *DSN 2004*; Chandra,
  Griesemer, Redstone, "Paxos Made Live," *PODC 2007*. Time-based leases sit on
  top of consensus - safety never depends on the lease, only liveness/performance.
- **Fencing tokens** - Kleppmann, blog 2016; also *Designing Data-Intensive
  Applications* (2017), ch. 8–9. **Honest caveat: this specific articulation is
  not peer-reviewed.** Peer-reviewed equivalents are the Chubby sequencer and VR
  view numbers; cite those in design docs, Kleppmann as accessible exposition.
- **Application to us**: a slow/partitioned node must be unable to *act* on stale
  authority even though we can never *know* it's stale (FLP). Every consumer of
  authority checks a monotonic epoch (Raft term / incarnation / config version)
  and refuses stale ones. This converts the eviction problem from "detect
  correctly" (impossible) to "fence reliably" (solved).

## Theme 5 - Consensus-driven control-plane / metadata distribution

- **Spanner** - Corbett et al., *OSDI 2012* (journal *ACM TOCS 31(3), 2013*).
  Paxos per partition + TrueTime; reads served from any sufficiently up-to-date
  replica using a **safe time** watermark. The strongest precedent for "locally
  readable, fresh-*enough*, authoritative": freshness is a provable timestamp
  bound, not a funnel. (CockroachDB closed timestamps / follower reads are the
  industrial descendant.)
- **Calvin** - Thomson, Diamond, Weng, Ren, Shao, Abadi, *SIGMOD 2012*.
  Replicates transaction *inputs* via Paxos; deterministic execution makes all
  replicas converge identically. Relevant pattern for a control plane: replicate
  the *decisions* (membership/leadership intents) and let every node's local
  replica derive the same authoritative view - reads become local by construction.
- **Control-plane-as-SMR generally**: Chubby (OSDI 2006) and ZooKeeper (ATC 2010)
  are the canonical consensus-replicated metadata services; Megastore's
  coordinator (CIDR 2011) shows how to make that metadata locally readable at
  full freshness. **Our control plane is a Chubby/Megastore-shaped problem
  wearing a Raft costume.**

## Synthesis - strongest precedent set for our exact constraints

Given (i) Raft per partition, (ii) single-leader-funneled control-plane writes,
(iii) fresh-enough local authoritative reads, (iv) a progress-or-evict deadlock:

1. **Raft single-server/joint reconfiguration + term-based fencing** (Ongaro &
   Ousterhout 2014; Oki & Liskov 1988). Breaks the circular dependency: eviction
   of a stuck node commits with any quorum of the old config - never needs the
   stuck node to progress - and the config change bumps the epoch that fences the
   evictee. The named, peer-reviewed deadlock-breaker.
2. **Lease-based local reads + ordering tokens** (Raft leader leases; Zab/zxid;
   Megastore coordinators; Spanner safe time). Breaks the funnel: the
   authoritative membership/leadership view is served locally under a leader
   lease (strongest, needs bounded clock drift) or behind a carried freshness
   token (zxid/commit-index/closed-timestamp - guarantees Monotonic Reads,
   eliminating phantom-stale "missing leader"/"deficit" states per Terry et al.
   1994).
3. **Accrual detection + suspicion-with-refutation, gating fencing-guarded
   eviction** (Hayashibara 2004; Das 2002; Dadgar 2018; Chandra & Toueg 1996).
   Solves "slow, not dead" the accepted way: continuous suspicion, self-aware
   slowdown, refutation by incarnation bump - and because perfect detection is
   impossible, the *consequence* of a wrong verdict is neutralized by fencing.

Together: *state-machine-replicate the control-plane config (Calvin/Megastore
pattern), change it only via quorum-intersecting Raft reconfig, fence all actors
on the resulting epoch, serve reads locally behind leases or freshness tokens,
and let an accrual detector merely inform - never decide - eviction.*

## What does NOT apply (honest list)

- **FLP** rules out any bounded-time progress-or-eviction guarantee in async
  networks; there is no theorem to cite for one, only for its impossibility. The
  accepted compromise is partial synchrony (DLS 1988) embodied as **leases with
  assumed bounded clock drift** (Chubby lock-delay; Spanner commit-wait as the
  extreme).
- **ReadIndex does not solve the funnel** - it still contacts the leader per read.
- **SWIM-style gossip alone cannot be authoritative membership** - it is
  explicitly weakly consistent; it must sit *under* a consensus-committed config
  (the Memberlist/Serf pattern).
- **Kleppmann's "fencing token" is a blog, not a peer-reviewed result** - cite the
  Chubby sequencer or VR view numbers in formal documents.
- **CAP doesn't forbid the design, but PACELC prices it**: funnel-free local reads
  with unconditional linearizability is not achievable; pick leases (clock
  assumption), freshness tokens (client cooperation), or leader contact (the
  funnel). Every production system picks one of the three.
