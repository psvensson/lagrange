# Query executor no-handler address quarantine: transition record

Writer: claude:quarantine (single writer, bounded investigation and repair), 2026-11-21.
Worktree `/mnt/data/peter/projects/.worktrees/query-executor-quarantine-20261121`, branch
`work/query-executor-quarantine-20261121`, base `23344cddc` (integration line). Rule set:
`docs/steering/rules.md` at base. Source of the finding: `topology-guard-owner-fact-record.md`
10.4 and witness W2 on `work/topology-guard-owner-fact-20261121` (017921e17).
Markers: [V] verified by reading at base, [X] executed, [I] inference not traced to the end.

Commits (all pushed, branch tip `b76d50c68`): `d5698f225` red clock witnesses; `504e2c989` one-clock
repair; `b76d50c68` red penalty witness (stays red until the lead rules on 7.2). Lab directories under
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/`: `quarantine-clock-red-d5698f225-tv-dator`,
`quarantine-head-504e2c989-tv-dator`, `quarantine-base-23344cddc-tv-dator`,
`quarantine-penalty-b76d50c68-tv-dator` (other `quarantine-*` directories hold runner failures: host busy
or not ready).

## 1. The contract as implemented [V]

All paths are `src/query/` unless stated; line numbers at `23344cddc`.

| Aspect | As implemented |
| --- | --- |
| Cause (the only one) | A `NO_HANDLER` delivery outcome for the candidate: transport reason `no_handler` on an answered delivery (`query-executor-partition-delivery.js:581-600`), or a thrown error whose text contains `No handler registered for address` (`:677-709`, `isNoHandlerFailure` `query-executor-write-retry-routing.js:374-379`). Both call `handleNoHandlerCandidate` (`query-executor-partition-candidate-state.js:172-186`), which marks. |
| Not causes | Connection closed, no connection, message timeout, websocket connect timeout, outbound backpressure, query transport not ready, handler failed, ACK rejected: they take the control-plane retry decision, the leader-unavailable widening of writes, or the read "next candidate" path (`query-executor-partition-delivery.js:601-669, 710-782`). None marks. |
| Producer of `NO_HANDLER` | The receiving router: ACK first, then `SERVICE_RESPONSE {noHandler: true}` when `handlers.get(targetAddress)` is absent (`src/transport/message-router-inbound-dispatch.js:483-505`); at the sender the pending response settles as an Error with `noHandler` (`message-router-pending-response-ledger.js:62-66`) and the transport owner classifies it `no_handler` (`transport-semantic-outcome.js:142-150`). So the node is alive and its router answered. |
| Duration | `resolveNoHandlerAddressQuarantineMs` (`query-executor-temporary-unroutable-addresses.js:150-166`): an explicit `noHandlerAddressQuarantineMs` option applies to every partition; otherwise a system-table partition (`SYSTEM_TABLE_NAMES` = every `TABLES` value, `query-executor-shared.js:162`) gets `max(NO_SERVICE_WARN_THROTTLE_MS, CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS)` = max(5 s, 30 s) = **30 s**, a user table 5 s (`query-constants.js:473-475`). Production passes no option (`sql-query-engine-instance-initializer.js:227-238`). One cause, so one duration per table class. The 5 s default is the no-service *log-warn throttle* constant reused as a quarantine duration (`query-executor-base.js:126-133`): one scalar with two meanings (R06). |
| Clock | Host clock: `Date.now()` at mark (`:28-29`) and at check (`:132`), although the executor holds its node clock (`query-executor-base.js:79-84`). Repaired in this run (section 6). |
| Early removal | (1) A successful delivery to that (partition, address) (`query-executor-partition-failure.js:217-224`), also the success of a followed redirect (`query-executor-partition-delivery.js:486-493`). (2) The consulted SERVICES row's fingerprint differs from the witnessed one (`:118-131`; fingerprint = service_id, address, node_id, raft_role, status, updated_at, `query-executor-shared.js:180-213`), only where the consulting call passes the row. (3) Expiry, lazily at the next consult (no timer). Nothing else: the executor subscribes to no publication. |
| Key | `(partitionId, address)` (`:31-54`), and a partition replica's address is `${nodeId}/partition/${replicaId}` (`src/transport/message-router-handler-registry.js:41-69`), so the mark is per replica. One replica's `NO_HANDLER` for one partition does **not** block other partitions' traffic to that node. |
| Consumers | (a) candidate construction for every read and write, `resolvePartitionServiceCandidates` `addService` (`query-executor-partition-routing-candidates.js:142-150`, row passed); (b) candidate eligibility `accepts` (`query-executor-partition-candidate-state.js:18-22`, snapshot row passed), used by recovery-read inspection, by `shouldSkipCandidateDelivery` (`:106-110`) and by the recovery redirect check `redirectCandidate` (`:45-50`); (c) leader-recovery widening `getLeaderRecoveryCandidates` (`query-executor-write-retry-routing.js:72-82`, row passed); (d) the session pin `prioritizeSessionPartitionAddress` (`query-executor-base.js:312-317`, no row, so no fingerprint release there). The coordinator's replica_operations write admission consumes (a) through the executor's canonical write candidates (quest `application-write-formation-authority` log) [I]. |

What a consumer does when the canonical leader's address is quarantined [V]:

- **Leader-required read** (`readAuthority.leaderMode = REQUIRED`): only the canonical leader's
  services are candidates (`query-executor-partition-routing-candidates.js:167-191`) and the widening
  returns nothing for this mode (`query-executor-write-retry-routing.js:42-48`), so the candidate set is
  empty and the read fails typed after its attempt limit with `PARTITION_SERVICE_NOT_FOUND`
  ("Partition service not found", `query-executor-partition-delivery.js:260-308`), with no hop.
  **No fallback to another replica.** The outcome does not name the state: the leader's row exists
  and is routable; the executor refused locally (R07 gap, see the proposal).
- **Write**: the canonical leader's rows are skipped and the other replicas become candidates
  ("Try other live replicas to follow redirects", `query-executor-partition-routing-candidates.js:247-252`).
  A follower never executes it: a write or a transactional statement on a non-leader is refused
  (`src/partition/partition-service-remote-query-methods.js:98-118, 340-346`), typed NOT_LEADER or a
  LEADER_REDIRECT to the leader's address, and the non-recovery redirect is delivered without consulting
  the quarantine (`query-executor-partition-delivery.js:471-478`), so a write reaches the quarantined
  leader through the follower's redirect and clears the mark on success. A detour, not a semantic fallback;
  but it means writes treat the mark as advisory while leader-required reads treat it as absolute.
- **Ordinary read** (leader mode ANY or PREFERRED): another replica serves, as that read's contract permits.

**Item 4 (safety): no finding.** The quarantine never sends a leader-required read to a different
replica; the read fails typed. A transactional read (leader-pinned through `transactionIdentity`) can be
offered to followers when the leader is quarantined (`query-executor-partition-routing-candidates.js:258-272`),
but the follower refuses statements carrying a transaction id
(`partition-service-remote-query-methods.js:340-346`), so it is not served there [V for the refusal,
I for every transactional read carrying `transactionId` in its payload].

## 2. History [V]

- Introduced in `28f413983` (2026-03-30, "nominally working distributed tests", a 353-file commit) inside
  `src/query/query-executor.js`: "Mark one partition service endpoint as temporarily unroutable after a
  runtime no-handler witness so follow-up calls do not immediately retry the same stale address". The
  cause was `NO_HANDLER` from the start and has remained the only cause; the duration was the explicit
  option or `NO_SERVICE_WARN_THROTTLE_MS` (5 s); cleared on a successful delivery; host clock.
- `8f284ad8a` (2026-04-13, "major refactor and code cleanup"): added the per-partition duration with the
  30 s control-plane value ("Control-plane partitions keep stale addresses shadowed longer so routed
  writes stop chasing cache rows that lag behind removal/publication") and the witnessed-service
  fingerprint release. The commit message gives no rationale for 30 s and names no quest; the only stated
  motivation is the doc comment's stale-row case (a replica that is gone), not a starting replica.
- `e2797b6c8` (2026-04-20) split the executor into segments, `04e765a51`/`c8608aa4e` (2026-05-24)
  extracted the methods into `query-executor-temporary-unroutable-addresses.js`, `06273547c` (2026-07-02)
  inlined constant aliases: mechanical. `git log --oneline -15` on the file lists only the last two.
- No quest log discusses the quarantine's duration or clock; `application-write-formation-authority`
  names "endpoint quarantine" as a rule the coordinator's write admission must observe. Related transport
  history: `b1ec24664` (CL-007, the router's ACK-timeout connection quarantine needs death evidence, not
  slowness) and `773fa9ca0` (a per-owner circuit breaker with a half-open probe, since removed): the
  project already keeps node unreachability with the transport owner.
- Witnesses that compensate for the host clock today: W2 on the guard branch (200 ms quarantine, 500 ms
  real wait) and `test/control-plane/control-plane-read-authority-token.test.js:433, 510`
  (1 ms quarantine, 5 ms real wait).

## 3. What `NO_HANDLER` means and when it happens

At the receiver [V]: the node's router has no handler registered for the exact replica address
(`message-router-inbound-dispatch.js:488-505`). A partition replica registers its handler in its own
initialization, before raft starts (`src/partition/partition-service-raft-init-base.js:256-261`), and
retires only its own exact handler (`message-router-handler-registry.js:111-120`). Partition activation
refuses to mark a replica's SERVICES row ACTIVE unless that exact handler is registered
(`src/bootstrap/shared/partition-service-activation.js:271-283`), and the activation row bumps
`updated_at` (`src/node/replica-state-machine-registered-activation.js:112-120`). Routing only offers
ACTIVE, addressed rows. So for a sender that routes from an ACTIVE row:

- "not yet" (starting) does not normally happen: activation follows registration [V];
- "no longer": the replica was retired or moved and the sender's cache still holds its row (the case the
  30 s was written for) [V for the comment, I for frequency];
- the node process restarted: the durable row survives, the new process has not recreated the replica
  yet [I]. Its re-activation rewrites the row with a new `updated_at`, which changes the fingerprint and
  releases the mark at the sender as soon as the sender's cache applies that row [V code, I end to end];
- the partition is not hosted there at all (a stale or wrong row) [I].

An unreachable node does not produce `NO_HANDLER`: the sender gets a transport failure (no connection,
connection closed, timeout), which does not mark [V for the classification and the marking sites; I that
no other query-path producer synthesises `noHandler`]. W2's fixture models "unreachable" as a
`noHandler` hop (guard fixture header, line 18, and `crossNodeHop`), which production does not do: the
quarantine delay W2 waits out is a fixture/production divergence for its unreachable cases.

Retained real-cluster logs [X, `grep -c`, one node log at a time]:

| Run | Node log | "No handler registered for partition service" (the mark's warn) | "No handler registered for address" | query-executor lines (warn channel live) |
| --- | --- | --- | --- | --- |
| gcp-formation-f580579a5-run1 | 751f5575 | 0 | 0 | 23 |
| | 868fba57 | 0 | 0 | 101 (46 warn) |
| | fab780c9 | 0 | 0 | 98 (45 warn) |
| gcp-formation-f580579a5-run2-profile | 95ce5141 | 0 | 0 | 71 |
| | d1162379 | 0 | 0 | 225 |
| | c14b47ee | 0 | 0 | 193 |

The executor's warn channel is live in these logs (its other warn, "Partition write outcome still unknown
when its delivery budget was spent", appears 1/46/45 times in run 1), so zero is a real zero: **no
address was quarantined on any node of either retained fresh three-node formation**. `NO_HANDLER` does
not occur on every fresh formation, and the 30 s penalty did not contribute to the 420 s miss in these
runs. No refusal-to-success gap can be measured from them.

## 4. Siblings: direct host-clock reads where the owner holds an injected clock [V]

Not repaired in this run (scope: the quarantine only).

QueryExecutor (holds `nowFn`):
- decisions: `query-executor-base.js:694` (`resolveRequestDeadlineMs` via `computeDeadlineFromNumbers`:
  a request deadline on the host clock, while the attempt budget measures on `nowFn`); the in-read retry
  delay `query-executor-cancellation-routing-install.js:19-26` waits on a host `setTimeout` (a timer
  sibling, not a clock read);
- log throttles: `query-executor-partition-routing-snapshot.js:362, 623`,
  `query-executor-partition-service-resolution.js:656`;
- telemetry durations: `query-executor-base.js:474, 509`, `query-executor-join-execution.js:571, 585`;
- the same clock spelled twice more (equivalent, not defects): `query-executor-partition-delivery.js:73`,
  `query-executor-partition-attempt-budget.js:96-99` (`nowFn ? nowFn() : Date.now()`).

SqlQueryEngine (holds `engine.nowFn`, `sql-query-engine-instance-initializer.js:166`):
- decisions or stamps: `sql-query-engine-statement-execution.js:174` (split-evaluation interval),
  `sql-query-engine-routing-metadata-methods.js:449` (SERVICES row timestamps it builds),
  `sql-query-engine.js:171` (write-operation row timestamps);
- durations: `sql-query-engine-statement-execution.js:291, 328, 441, 463`,
  `sql-query-engine-metadata-authority-refresh.js:728, 736, 756, 771`,
  `sql-query-engine-write-execution.js:619, 668`, `sql-query-engine-select-execution.js:412, 430`,
  `sql-query-engine-request-dispatch.js:354, 427`.

Transport:
- `src/transport/message-router-reconnect-behaviors.js:379` calls `ownerRetryBudget.tryConsume(targetNodeId)`
  without the router's `timeSource` (`message-router.js:277`), so the budget refills on its
  `nowMs = Date.now()` default (`owner-retry-budget.js:53`): a reconnect-rate decision on the host clock
  in an owner with an injected clock.
- Not siblings (no injected clock in the owner, or a documented default when none is given):
  `rpc-client.js:45, 150, 212`, `router-server-manager.js:255`, `bulk-transfer-channel.js:92, 481`,
  certificate and join-token `nowMs` defaults. `ParallelQueryCoordinator` and the merge sessions read
  the host clock and are constructed by the executor without its clock.

## 5. Prior art

Routing caches in range-partitioned databases separate a semantic refusal from a live node from a
transport failure. CockroachDB's DistSender keeps a range descriptor and lease-holder cache: a
`NotLeaseHolderError` from a live replica updates the cached lease holder from the error's hint and the
request is retried at once on it; `RangeNotFound`/`RangeKeyMismatch` evicts the descriptor and re-reads
it from the meta ranges, with a short backoff; an RPC that fails to connect moves on to the next replica,
and unreachability is handled by per-node connection health and circuit breakers that probe before
traffic resumes. TiKV's client region cache does the same: `NotLeader` updates or switches the cached
leader and retries with a small region-miss backoff, `RegionNotFound`/`EpochNotMatch` invalidates the
region entry and reloads it from PD, and a store that cannot be reached is marked unreachable while a
health checker probes it. In both, a "not ready / not here" answer is evidence that the node is alive and
that the route knowledge is stale: it invalidates the route and is retried promptly, never parked for a
fixed long window; long-lived suppression is reserved for transport-level unreachability, owned by the
connection layer and lifted by a probe. (From the systems' public designs, not re-verified in this run.)

## 6. One-clock repair (ruled; red-first)

Witness `test/query/query-executor-no-handler-quarantine-clock.test.js` with its fixture
`test/query/query-executor-no-handler-quarantine-fixture.js`. Subject unchanged: the production
QueryExecutor (routing snapshot, canonical-leader candidates, eligibility, the delivery loop, the
quarantine owner) given a `VirtualTimeSource` as its node clock (`nowFn`); the SERVICES owner-fact read
as the topology guard issues it (owner-RPC, leader REQUIRED, recovery dimension, bounded); services-p1
with the production duration (asked of the owner: `resolveNoHandlerAddressQuarantineMs` = 30 s).
Substituted: only the node-to-node hop; each replica node answers from its router's handler table as
the receiving router does (no handler: the router's no-handler fact classified by the transport owner;
otherwise the handler's answer). The follower's handler serves throughout.

Red at `d5698f225` (witness commit on base `23344cddc`) [X], tv-dator,
`lab/quarantine-clock-red-d5698f225-tv-dator` (8 assertions, 4 fail):
- case 1: the leader answers no handler (1 hop); 1 ms of node time before expiry the read is refused
  locally (ok); **at exactly mark + 30 s of node time it is still refused, no hop** (not ok 5, 6): the mark
  never expires on node time. The local refusal reads `"Partition service not found"`.
- case 2: with the node clock frozen and the host clock advanced by 60 s, **the read hops to the leader and
  succeeds** (not ok 1, 2): host time alone released the quarantine.
(Earlier placement attempts at the same sha were runner failures: tv-dator busy, then no ready host.)

Repair (commit 2, below): the executor resolves its one clock once, `this.timeSource =
resolveTimeSource({timeSource: nowFn ? {now: nowFn} : undefined})` (the host clock when none is given, as
its HLC already did), hands that same source to its HLC, and the quarantine marks and expires on
`this.timeSource.now()` (`query-executor-base.js`, `query-executor-temporary-unroutable-addresses.js`).
Causes, durations, key and consumers unchanged. Commit `504e2c989`.

Green and attribution [X], tv-dator, check base `0dbed1718`:
- head `504e2c989`, `lab/quarantine-head-504e2c989-tv-dator`: **12/12 files, 406 assertions, 0 fail**: the
  clock witness (10 assertions) plus every `test/query` file named `*routing*` (8; no file is named
  `*unroutable*` or `*executor-partition*`) and the three files that exercise the quarantine directly
  (`query-executor-session-binding-and-build-sql`, `query-executor-executeonpartition-no-handler-repair`,
  `test/control-plane/control-plane-read-authority-token`).
- base `23344cddc`, `lab/quarantine-base-23344cddc-tv-dator`: the same 11 pre-existing files, **11/11, 396
  assertions**; head adds exactly the witness's 10. No attribution difference.

Follow-ups this run did not take (scope): `query-executor-partition-delivery.js:73` and
`query-executor-partition-attempt-budget.js:96-99` still spell the same clock as `nowFn ? nowFn() :
Date.now()`; consuming `this.timeSource` / `executor.timeSource` there leaves one spelling (the budget's
helper takes `executor?.`, so its test doubles need checking first). The construction-time capture is
the HLC's own semantics: a test that reassigns `executor.nowFn` after construction
(`router-envelope-lost-write-answer`, `readiness-routing-denial-observability`) moves the budget, not
the HLC or the quarantine; neither touches the quarantine.

Witnesses that can now drop their real-time waits (not edited here):
- W2 on `work/topology-guard-owner-fact-20261121`: `test/rebalancer/topology-guard-inventory-authority-fixture.js`
  `afterAddressQuarantine` (:675-678, a 500 ms real `setTimeout`) and its call in
  `test/rebalancer/topology-guard-owner-fact-inventory.test.js:137-138`. With this repair, construct the
  planner host's `QueryExecutor` (fixture :605-607) with `nowFn: () => clock.now()` of the turn's
  `VirtualTimeSource` (the clock must exist before `openPlannerHost`, so create it in the test and pass it
  in) and delete the real wait: `turn.advance(RECOVERY_BOUND_MS)` then carries the 200 ms quarantine past
  expiry on node time. Better still (section 3): the fixture's "unreachable" hop should answer as an
  unreachable node does (a transport failure such as no connection), not "no handler"; the quarantine is
  then not engaged at all and the wait has nothing to wait for.
- `test/control-plane/control-plane-read-authority-token.test.js:428-434, 509-510` (1 ms quarantine, 5 ms
  real wait): pass a node clock and advance it instead.

## 7. The penalty of a semantic refusal: witness and proposal

### 7.1 Witness (red; durations and causes unchanged)

`test/query/query-executor-no-handler-quarantine-penalty.test.js` (commit `b76d50c68`, same fixture as
section 6). The services-p1 leader's node is alive; it answers the leader-required owner-fact read "no
handler" once and its handler serves 200 ms of node time later, with no change to its SERVICES row (so
the fingerprint release cannot help). The planner reads every 5 s of node time (the runtime-service
planner's priority cadence; 5.04-7.16 s observed in the PG-wire report). It asserts the wanted property:
no turn after the handler serves is refused.

Result at `b76d50c68` [X], tv-dator, `lab/quarantine-penalty-b76d50c68-tv-dator` (penalty file 3 ok, 1
not ok; the clock witness 10/10 ok in the same run):

| turn (node ms) | 0 | 5000 | 10000 | 15000 | 20000 | 25000 | 30000 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| outcome | hop, "No handler registered for address ..." | local refusal | local | local | local | local | hop, answered |

- wasted turns after the handler serves: **5**, all **local refusals without a hop**, each reading
  `"Partition service not found"`; first success at **30 000 ms**, i.e. **29 800 ms after the handler
  serves**, against 4 800 ms (the next turn) without the mark. At the observed 5.04-7.16 s cadence that is
  4-5 wasted turns and up to ~30 s plus one cadence of delay per episode.
- held (ok): the first read reached the leader and was answered no handler; every hop went to the leader,
  none to the serving follower (no fallback); the read is answered within the bound.

### 7.2 Proposal for the lead's ruling (not implemented)

Premise from sections 1 and 3: the executor already marks only the semantic refusal (`NO_HANDLER`, a
live node whose router answered), never a transport failure; and its key is already per replica
(partition, address). What is wrong is the window: one fixed window (30 s control plane, 5 s user
tables, the latter borrowed from a log throttle) applied to an answer that means "this route is stale or
not serving yet", with the release event observed only partly.

P1. Owners stay as they are. Transport unreachability stays unmarked by the executor and owned by the
transport (router reconnect budget, ACK-timeout connection quarantine with its liveness window,
`message-router-peer-liveness.js`). No executor circuit breaker is added.

P2. Release on the event that makes the handler available. That event is the replica's SERVICES
activation: activation requires the exact handler registered first and writes the row with a bumped
`updated_at` (section 3), so it is observable at the sender as a SERVICES row change for that replica
once its cache applies it. The existing fingerprint release already acts on it, but only where the
consulting call passes the row; the session-pin consult (`query-executor-base.js:312-317`) passes none.
Every consult passes the row (one release rule). No subscription, timer or polling: the release is
evaluated at the next consult, which is the caller's next read.

P3. Replace the fixed windows with one declared, short, growing backoff per (partition, address) for a
`NO_HANDLER`: for example 1 s, doubling on each consecutive `NO_HANDLER` from that address, capped at the
present 30 s, reset by a successful delivery or by the row change of P2. The window is a node-clock
timestamp checked at consult, as today. Named constants owned by the quarantine owner, no longer the
warn throttle.

P4. Name the refusal. A leader-required read whose only candidates are under the mark fails typed as
such (for example `canonical_leader_not_serving` with `retryAfterMs` = the remaining window) instead of
`PARTITION_SERVICE_NOT_FOUND`, so a caller can tell "no such service" from "the leader is alive, its
handler is not serving, retry at T". The planner keeps its own cadence; the executor arms nothing.

Trade-offs and what must not regress:
- A retired replica whose row lingers in a sender's cache is probed at about 1, 2, 4, 8, 16, 30, 30 ...
  s instead of every 30 s: about six extra `NO_HANDLER` answers in the first minute per (sender,
  partition), each answered by the remote router's handler lookup without replica work; the row's
  removal ends it. Not hammering, but more than today.
- A node that is down is not retried every turn: unchanged, it is never marked by the executor; the
  transport owner's reconnect budget applies.
- No silent fallback for leader-required reads: unchanged; the candidate set stays leader-only (the
  witness asserts every hop goes to the leader while a follower serves).
- High-rate ordinary reads of a user table with a stale replica row: an extra hop at 1, 2, 4 s ... where
  today one refusal shadows it for 5 s. Small added latency until the cache drops the row.
- Writes today detour through a follower's redirect to the marked leader (the mark is advisory for
  writes, absolute for leader-required reads). With a short window the detour (`query-executor-partition-
  routing-candidates.js:247-252`) could go, leaving one rule for both; for a later ruling.

Smaller alternatives: (O1) drop the 30 s control-plane override only (5 s everywhere): at an aligned 5 s
cadence it still costs about one turn and keeps the warn-throttle coupling; (O2) no window at all,
release only on success or row change, skip only within the same read: cheapest code, but every read of
every caller hops to a stale address until the cache drops its row.

Measurement before ruling: the two retained GCP formations show zero marks (section 3), so the 30 s
penalty is not shown to be on the 420 s path. The mark's warn line ("No handler registered for partition
service") already exists; counting it per node per formation in the lab matrix tells whether P3 buys
anything for the formation bound before the durations change.
