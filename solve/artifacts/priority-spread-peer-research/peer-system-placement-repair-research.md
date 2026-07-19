# Peer-system research: replica-spread repair, over-target ambiguity, and planner/guard inventory disagreement

Date: 2026-07-19. Context: live run `movielens-lagrange-service-affinity-live-2026-07-19T07-22-01-510Z`
stalled with `sql_write_operations-p1` at 3 replicas on 2 distinct nodes (target 3 distinct).
The planner believed the partition over target (activeCount 4, one undrained surplus voter) and
deferred every spread ADD waiting for a count-neutral REPLACE pairing; the topology guard's union
view saw 3 rows on 2 nodes at target and denied the plain (non-cure-typed) ADDs another node minted
(`replica_inventory_unusable`, authoritative read UNAVAILABLE), so the conservative-union escape
never engaged. Four research agents surveyed CockroachDB, TiKV/PD + etcd, Elasticsearch + Ceph,
and FoundationDB + Kafka/Cruise Control with citations. Full agent reports are in the session
transcript; this file preserves the load-bearing findings and the synthesis.

## Direct analogs of our stall (documented in peer systems)

- **CockroachDB #85652** — range at target count with a violated placement constraint: the
  up-replication path refused (count OK) and the rebalance path found no target; result was a
  persistent silent stall ("no rebalance target found, not enqueuing"). Same two-paths-both-decline
  shape as ours.
- **TiKV PD #6559** — "regions stuck in 2 voters, 1 down peer, 1 learner": two repair rules each
  had a precondition the other's state violated; 2-day stall. **Fix (PR #6831): a composite-state
  escape rule** that recognizes the combined state and acts directly (promote the existing learner,
  remove the down peer) — not making either rule stricter.
- **PD #7808** — a placement constraint blocked down-peer recovery entirely; fixed by letting
  availability repair proceed under *temporary* rule violation.
- **Elasticsearch #17050** — the balancer kept a predictive model that was never re-validated by
  the allocation deciders; the model drifted into illegal states. Fix direction: every planner
  model state must be validated by the same deciders that gate execution.
- **ZK-era Kafka (KIP-500 motivation)** — controller/broker/ZooKeeper held divergent metadata
  views; some discrepancies were fixable only by restarting the controller. Fixed structurally by
  a single Raft-replicated metadata log all parties consume in order.

## Convergent design invariants across all four systems

1. **Spread repair at/over target count is a count-neutral atomic REPLACE, never a bare ADD.**
   CRDB: diversity violations at target are fixed only via the rebalance path — one atomic
   `ChangeReplicas` carrying ADD+REMOVE through raft joint consensus (v19.2 "atomic replication
   changes"; the pre-19.2 separate ADD-then-REMOVE with its over-replicated intermediate is
   exactly the state our planner fears). PD: one `move-to-better-location` operator
   (add learner → joint promote+demote atomically → remove). Kafka KIP-455: declarative
   grow-then-shrink via typed `addingReplicas`/`removingReplicas`. ES: RELOCATING+INITIALIZING
   linked pair — one routing entry, not two. FDB: `startMoveKeys`/`finishMoveKeys` atomic swap.

2. **Interim replicas are TYPED so count checks cannot misread a move in flight.**
   CRDB `VOTER_INCOMING`/`VOTER_OUTGOING`/`VOTER_DEMOTING`/`LEARNER` (learners never count toward
   quorum or over-replication); Kafka AR/RR with under-replication computed against the
   *original* set (KIP-352); ES counts a relocating pair once at its destination for spread,
   both ends for anti-affinity. Our "activeCount 4, one undrained" is an *untyped* transitional
   state being misread as plain over-replication — the direct root of the defer.

3. **Resolving a transitional state is the HIGHEST-priority action, before any count-based
   planning.** CRDB's allocator priorities: finalize atomic change 12002 > remove leftover
   learner 12001 > replace dead 12000 > add 10000 > … > remove over-replication 800. A range in a
   joint/transitional config is never evaluated by count at all until the transition is resolved.
   etcd raft auto-leaves joint configs so no external actor is needed. Applied to us: the first
   question in the stalled state is "why is the 4th voter not draining, and what resolves that" —
   not "which new move can we admit."

4. **One inventory authority; guards and planners consume the same view.** ES: planner and
   admission are the same decider chain over the same routing table (planner-vs-guard split-brain
   structurally impossible). FDB: singleton Data Distributor fenced by `MoveKeysLock`; staleness
   caught transactionally inside the mutating transaction. Ceph: placement is a pure function of
   a monitor-quorum-owned versioned map; disagreement is only ever "older epoch" and reconciles
   by catch-up. Kafka KRaft: one metadata log; laggards are fenced, never divergent.

5. **Refusal must carry a wake-up path; per-operation denial loops are an anti-pattern.**
   CRDB purgatory: a repair blocked by "no live targets"/quorum errors parks and is retried on
   liveness/gossip *events* (plus a 1-min timer). ES THROTTLE is typed distinctly from NO and
   retried every reroute; hard failures cap at `max_retries` with an explicit operator override.
   PD operators time out and cancel with typed reasons that are metrics. FDB's philosophy: an
   unavailable authority is a *failure*, handled by killing and re-recruiting the authority from
   durable truth in seconds — never by limping through per-op denials. Our guard denied the same
   ADD every few seconds for minutes on `replica_inventory_unusable` with no
   escalation/refresh trigger.

6. **Prevention: anti-affinity in the placement function itself.** Ceph CRUSH failure-domain
   rules make co-located layouts unrepresentable as placement outputs — [A,A,B] can only exist
   as a typed degraded transition. This is the peer-system version of join-time spread-correct
   placement.

## Guidance mapped to our candidate options

- **Option A (count-neutral cure REPLACE for the over-target+under-spread composite state)** —
  strongest peer support. It is PD #6559's exact fix shape (composite-state escape rule) and the
  standard repair primitive everywhere (invariant 1). Refinement from research: mint the REPLACE
  *from the co-located surplus source*, and keep it one typed plan (our cure typing plays the role
  of CRDB's replica types / Kafka's AR-RR).
- **Option B (single inventory author for planner + guard)** — the structural end-state of every
  surveyed system, and divergent-views is their documented wedge class. But each system that got
  there did it as a major architectural investment (KIP-500, Zen2, DD singleton). Right direction
  for the epic (O-series); wrong scope for unblocking the quest.
- **Option C (make the surplus drain complete)** — elevated by the research: CRDB doctrine says
  resolving the transitional state *precedes* count-based planning. Forensics on why the 4th
  voter never drains is the first step; if it wedges on the same unavailable authoritative read,
  that seam is the true root cause.
- **Option D (narrow the admission predicate)** — partial support: Ceph `min_size` and ES typed
  degraded states show availability is not gated on perfect placement, but every peer system keeps
  the violation loudly visible while unblocking unrelated work. Acceptable only as a principled
  predicate change with the health signal preserved.
- **Option E (join-time spread-correct placement)** — supported long-term by CRUSH (invariant 6);
  scope unchanged (large, undesigned).

## Two cheap liveness patterns worth adopting regardless of option

1. **Escalation on repeated defer**: `DEFER_ADD_OVER_TARGET` repeating for N cycles on a
   priority partition should escalate to a typed composite-state diagnostic (and eventually to
   the composite-state cure), mirroring PD's typed cancel reasons and CRDB's priority-inversion
   requeue. Silent identical defers every cycle for 75+ seconds is the documented anti-pattern.
2. **Event-driven re-evaluation on inventory recovery**: a `replica_inventory_unusable` denial
   should subscribe the denied intent to "authoritative inventory became readable" (CRDB
   purgatory's gossip/liveness wakeup), instead of relying on the next periodic pass.

## Primary sources (as cited by the research agents)

CockroachDB: joint-consensus blog (cockroachlabs.com/blog/joint-consensus-raft), v19.2 release
notes, `allocator.go` / `replicate_queue.go` / `replica_command.go` / `metadata.proto`,
tech-notes/rebalancing.md, issues #25392, #85652, #79318, #152604, #35156.
TiKV/PD/etcd: PD wiki (Scheduling Introduction, Metadata Management), `operator_controller.go`,
`fit.go`, PD issues #2860, #6559 (+PR #6831), #5786, #7808, #4362, #6662, tikv#3868, etcd learner
design, runtime reconfiguration docs, go.etcd.io/raft/v3 docs, etcd #12136/#12133.
Elasticsearch/Ceph: every-shard-deserves-a-home blog, decider chain references,
`AwarenessAllocationDecider.java`, `SameShardAllocationDecider.java`, desired-balance PR #91343,
issues #17050, #24921, Zen2 coordination blog; Ceph architecture/peering docs, CRUSH map docs,
pg-upmap docs, balancer docs, trackers #37968/#51729/#20108.
FoundationDB/Kafka: SIGMOD'21 FDB paper, `design/data-distributor-internals.md`, forum thread
1626, KIP-455, KIP-352, KIP-500, KIP-631, KIP-236, Cruise Control wiki + `RackAwareGoal.java`,
cruise-control issue #1167.
