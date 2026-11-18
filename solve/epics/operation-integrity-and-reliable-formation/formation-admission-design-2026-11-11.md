# Formation completeness and serve admission: findings and design (2026-11-11)

Read-only design unit (subagent) over HEAD 103f132c1 plus the uncommitted tree. Nothing
here is built. Decisions D1, D2, D5, D6 are the owner's; D3 is already decided (F10).

## Main result

The owner already decided how CREATE TABLE behaves when fewer founders exist than
requested (F10, confirmed 2026-11-02: complete at the sealed quorum minimum, answer
`under_replicated` with the missing count, full RF is the rebalancer's obligation;
`solve/quests/serve-eligibility-committed-epoch-read/quest.json:33`,
`solve/epics/core-architecture-convergence/readiness-observation-currency.md:728`,
`solve/epics/operation-integrity-and-reliable-formation.md:771-774`).

What nobody has decided is serving **before formation is complete**. The codebase has no
declared cluster size: every "formation complete" signal is measured against whatever
membership exists at the moment. The formation quest only covers a CREATE TABLE "issued
after (a)-(c)".

## Verified findings

| # | Finding | Verdict | Evidence |
|---|---|---|---|
| F1a | Priority spread requirement is `min(3, eligibleNodeCount)`; a second fallback adds every node from ready stats when none is eligible; five different spread formulas at five sites | TRUE | `membership-publication-priority-partition-summary.js:45, 549-563`; `solve/epics/formation-complexity-consolidation.md:327-335` |
| F1b | No declared cluster size anywhere in runtime config (the chart states it only in a comment) | TRUE | `charts/lagrange-node/values.yaml:4,14-16` |
| F1c | RF3 CREATE TABLE with 2 founders succeeds as `under_replicated` | TRUE, owner-decided (F10) | `sql-query-engine-provision-target-methods.js:186-195,236-250`; `sql-query-engine-initial-partition-provisioning.js:208-224` |
| F1d | Schema-job retry pins to the founders named by durable bootstrap operations (today's change) | TRUE, consistent with F10 | `initial-partition-provisioning.js:77-107`, `initial-partition-bootstrap-cohort.js` |
| F1e | Statement admission has no formation predicate | TRUE | `sql-query-engine-statement-execution.js:309-354` |
| F2a | The load lane admits when the readiness snapshot is unavailable | TRUE | `admin-websocket-load-lane-admission.js:98-135`; `admin-websocket-api-shared.js:261-268` |
| F2b | The default lane and PG wire have no readiness gate (PG wire's gate is four presence checks) | TRUE | `admin-websocket-api-base.js:698-703`; `pgwire-startup-safety-gate.js:120-145` |
| F3a | The startup cluster-id check compares the hints file with itself; MISMATCH cannot occur | TRUE | `entrypoint-runtime-join-decision.js:397-405`; `rejoin-hints.js:271-277, 350-353` |
| F3e | The server admits UNKNOWN identity when its cache lacks the row (pre-hydration window): a joiner from another cluster is admitted and keeps its old id | TRUE | `bootstrap-api-control-plane-methods.js:140-150`; `bootstrap-request-owner-handler.js:554` |
| F4a | Probe fallback 404 -> `/health`, and `/health` answers 200 while initializing, so a not-ready peer counts as reachable | TRUE | `entrypoint-runtime-join-decision.js:215-230,250-253`; `bootstrap-api-server-methods.js:200-212` |
| F4b | `executeUnpersistedCreateTable`: a second CREATE TABLE route, unreachable in production, kept alive by 9 test files | TRUE | `table-creation-service-create-table.js:311-316,335-345` |
| F4c | A swallowed `readServeEligibility` failure re-reads the cohort; no false admit but the cause is lost; dead `degradedFallback*` fields | PARTLY | `provision-target-methods.js:139-164` |
| F4d | `ClusterReadinessSignal` is dead code (and the only place a declared node count exists) | TRUE | `src/rebalancer/cluster-readiness-signal.js` |

### Trace: three-node formation, default RF3

- **Seed alone.** Spread requirement is min(3,1) = 1, so the seed is serve-eligible.
  CREATE TABLE commits the `tables` and `partitions` rows first, then finds 1 target below
  quorum 2 and throws `PROVISIONING_UNAVAILABLE`; the client gets SQLSTATE 57P03 although
  the table metadata is durably committed; the job retries every ~1 s.
- **Seed plus one joiner.** Spread requirement is 2, both nodes become serve-eligible.
  CREATE TABLE founds 2 replicas, records requested 3 / committed 2 / missing 1, answers
  success with a NOTICE. INSERTs run on a 2-voter group: zero fault tolerance.
- **What brings the table to three.** The rebalancer (ADD, reason
  `INCREASE_REPLICA_COUNT`), triggered by `node_join` and a periodic check (60 s, backing
  off). Not bounded (no deadline or obligation record) and not witnessed end to end: the
  formation scenario asks a user partition for quorum only, never RF.

## Owner decisions

- **D1. Declared formation size.** (a) required declaration at seed bootstrap, written
  once as a replicated CONFIG row beside `cluster_id` (chart passes `1 + joiners`;
  single-node dev is an explicit 1); (b) default to the default replica count; (c) keep it
  relative. Recommended: (a).
- **D2. User DDL/DML before formation is complete.** (i) refuse typed with retry
  guidance; (ii) admit and found under-replicated with a bounded repair; (iii) reads
  only. Recommended: (i), as a one-time monotone latch, never a continuous condition:
  after formation, node loss must not close serving cluster-wide (F10 and the rebalancer
  govern steady state).
- **D3. Acknowledge a table with fewer founders than requested.** Already decided (F10).
  Recommended addition: a bounded, witnessed up-replication obligation and a per-table
  `under_replicated` state readable through an explicit function.
- **D4. One admission point.** `resolveClientStatementRefusal`
  (`src/query/sql-statement-ingress.js:132`), which both the admin websocket and PG wire
  reach; in-process owners exempt; the lane-specific readiness gate removed.
- **D5. Unavailable readiness.** Refuse typed (reason, epoch, retry-after), never admit on
  null.
- **D6. Cluster-id check.** The joiner fails closed when the response id differs from its
  persisted id; the server answers a typed retryable "identity unavailable" instead of
  UNKNOWN when its cache lacks the row; the startup check compares against the durable
  cluster identity.

## Design for the recommended options

- **Formation record.** The membership publication coordinator writes, once, a committed
  `formation_complete` record `{epoch, declaredNodeCount, nodeIds}` when a committed
  publication shows: published active nodes >= declared count; every priority
  control-plane group has ready voters on min(declared voter count, declared node count)
  distinct nodes; the publication is acknowledged. Monotone; cleared only by a new
  cluster id.
- **Predicate `answerFormationAdmission()`** at the readiness owner, named states:
  `FORMED{epoch}`, `FORMING{declared, published, blockedPartitions, retryAfterMs}`,
  `UNAVAILABLE{reason, retryAfterMs}`, `UNDECLARED` (a configuration error). Because the
  latch is monotone a lagging cache can only produce a typed refusal, never a false admit.
- **Admission.** Every client statement on user tables is refused while not FORMED:
  `FORMATION_PENDING`, SQLSTATE 57P03, FORMING fields in the detail. No job is created and
  no metadata is committed before FORMED (this removes the seed-alone 57P03 with committed
  metadata).
- **Deletions.** The unpersisted CREATE TABLE route; the `/health` probe fallback; the
  swallowed serve-eligibility catch and the dead `degradedFallback*` fields;
  `ClusterReadinessSignal`; the PG wire presence-check gate; the load lane's
  admit-on-unavailable and its sync fallback; the eligible-empty fallback in the spread
  summary; the five spread formulas consolidated into one.
- **Witnesses** (a new scenario; the sealed formation scenario is unchanged). W1: seed
  alone, then seed plus one joiner held back: CREATE TABLE, INSERT, SELECT through both
  admin websocket and PG wire get `FORMATION_PENDING` and no `tables` row is committed;
  start the last joiner and admission opens within a preregistered bound. W2: after
  FORMED, kill one node: statements still admitted, CREATE TABLE answers
  `under_replicated`; restart: the partition reaches RF within the bound. W3: a data
  directory from another cluster is refused at startup and at join during the seed's
  pre-hydration window.
- **Stages.** S1 declared size (config, CONFIG row, chart, lab, scripts). S2 latch writer,
  predicate, admission, error mapping, W1. S3 deletions. S4 cluster-id repair, W3. S5
  bounded up-replication obligation and visibility, W2. S6 spread-formula consolidation.
  S2 and S5 need the full formation proof on the lab (join-core coupling).

## Not determined

The voter count per control-plane group in the two-node window; the client error for an
INSERT into a table with no replicas yet; whether a node can read its durable cluster
identity locally before Raft and the cache are up; any existing bound for the
rebalancer's RF repair (none found).
