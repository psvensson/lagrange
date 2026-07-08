# Industry direction-check: authoritative voter count + the surplus-drain smell

Research to validate the Phase-1/Phase-2 direction against mature Raft schedulers
(CockroachDB, TiKV/PD, etcd/Raft dissertation). Triggered mid-A/B when POST3
showed a durable surplus (activeVoterCount=5, 345 guard defers, 13 voter-ready
timeouts) that Part 1 fires against but cannot drain.

## Verdict

**Part 1 (count voters by authoritative raft membership, not lagging status) is
correct and industry-standard. The durable-surplus problem it exposes is an
architectural smell that CRDB/TiKV engineer AWAY with atomic (joint-consensus)
replace — NOT with a standalone drain pass.**

## Evidence

### Part 1 is aligned
- **TiKV/PD** computes over/under-replication against authoritative raft
  membership and accounts for in-flight **operator influence** (pending
  operators) so it does not schedule redundant adds — the analogue of our
  `computeInFlightAwareReplicaAccounting` and of reading the promoted voter's
  `raft_role` the instant it flips.
- **CockroachDB** adds a learner (non-voting, excluded from quorum), catches up,
  promotes; the allocator reasons over voters/learners from raft membership.
- **Raft dissertation / etcd**: learners don't count to quorum; promote one at a
  time — matches our promotion guard ceiling + Part 1 learner-exclusion.

### The surplus is a smell mature systems avoid via ATOMIC replace
TiKV/PD canonical replace operator:
> add learner → (joint consensus) **promote new voter + demote old voter
> atomically** → leave joint state → remove old peer

The promotion of the new voter and the demotion/removal of the old voter are
COUPLED in one atomic config change. The group is NEVER durably at N+1 voters, so
there is no surplus for a separate scheduler pass to drain. CockroachDB adopted
joint consensus precisely because separate add/remove legs are unsafe
("lose two replicas at once" on region failure).

### Our constraint
Our raft is `liferaft`-based — **no joint consensus / ConfChangeV2** (verified:
`src/raft/` "demote" refs are all LEADERSHIP demotion, not membership). Our
REPLACE is separate add-then-remove legs → the durable-surplus window is inherent
to our model. That is why POST3 stacks to 5 voters and why the vetted standalone
drain is blocked (interlock + hasPendingMove).

### Real-world analogues (same failure family)
- TiKV #9918 "Add learner too slow → PD operator timeout" == our voter-ready-60s.
- TiKV/PD #6559 "regions stuck 2 voters/1 learner", #5788 "operator stops at
  leave-joint-state".
- Industry mitigation = atomic replace + operator-level **reap/timeout /
  re-drive**, NOT a drain scheduler — matches the "reap-on-timeout / level-
  triggered re-drive" prior research here already converged on.

## Direction implications

| lever | industry verdict |
|---|---|
| Part 1 authoritative voter count | KEEP — matches CRDB/TiKV/PD |
| Phase 2 as a standalone drain REMOVE | WRONG shape — no mature system does this (and vetted-dead here) |
| Phase 2 done right | COUPLE remove to promotion (vet Alt-3: re-drive REPLACE remove-leg / promote-then-demote), approximating joint consensus |
| Deepest fix | joint-consensus/ConfChangeV2 atomic replace in the raft layer for critical partitions (large, separate) |

## Sources
- CockroachDB, "Availability and region failure: Joint consensus in CockroachDB"
  https://www.cockroachlabs.com/blog/joint-consensus-raft/
- TiKV/PD "Use Joint Consensus" #2860 https://github.com/tikv/pd/issues/2860
- TiKV #9918 add-learner-too-slow operator timeout
  https://github.com/tikv/tikv/issues/9918
- TiKV/PD #6559 stuck 2 voters/1 learner https://github.com/tikv/pd/issues/6559
- PD scheduling best practices
  https://docs.pingcap.com/tidb/stable/pd-scheduling-best-practices/
- etcd learner https://etcd.io/docs/v3.3/learning/learner/
