# How comparable systems solve today's defect classes (research, 2026-11-11)

Produced by a research subagent on the owner's instruction ("find inspiration in how
similar systems solve their problems"). It informs repairs and the independent review; it
decides nothing (R25). Claims were checked against a fetched page unless marked
**[unverified]**. Source links point at master/main.

Notable for this codebase: raft-rs does not move leadership off a removed leader (in
`post_conf_change` stepping down is still a TODO), so the embedding application must do
it at its change-proposal port.

## Ten transferable rules, by expected value for formation and CDC stability

1. **Subscribe by position, with typed gaps (list-then-watch).** Every cache and
   recipient holds a position; each shipped range names the position before it. A
   mismatch, an expired position or a "too new" position is a typed GAP whose only
   recovery is a re-list from one image read together with its position. Idle sources
   still advance positions (bookmark/heartbeat). A checkpoint never passes an undelivered
   event.
   - Kubernetes API concepts (410 Gone, bookmarks): https://kubernetes.io/docs/reference/using-api/api-concepts/
   - etcd watch (`compact_revision`, `progress_notify`): https://etcd.io/docs/v3.6/learning/api/
   - CockroachDB advisory a104309 (checkpoint ahead of writes dropped events): https://docs.cockroachlabs.com/docs/advisories/a104309
   - Idle Postgres slot filled the disk; fix was a heartbeat: https://morling.dev/blog/insatiable-postgres-replication-slot
2. **Per-recipient progress states with a bounded release valve.** PROBE, REPLICATE (with
   an in-flight window), RELIST, DETACHED. Only PROBE and REPLICATE pin retention. A
   row-and-age lag bound moves a recipient to RELIST; authoritative lifecycle evidence
   moves it to DETACHED.
   - raft `Progress`: https://raw.githubusercontent.com/etcd-io/raft/main/tracker/progress.go
   - CockroachDB raft log queue: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/raft_log_queue.go
   - Postgres `max_slot_wal_keep_size`, `idle_replication_slot_timeout`: https://www.postgresql.org/docs/current/runtime-config-replication.html
   - TiCDC `gc-ttl`: https://docs.pingcap.com/tidb/stable/ticdc-faq/
   - CockroachDB `gc_protect_expires_after`: https://docs.cockroachlabs.com/docs/stable/protect-changefeed-data
   - Kafka ISR shrink: https://docs.confluent.io/kafka/design/replication.html
3. **Four write outcomes at the transport boundary.** NOT_SENT and WRONG_OWNER may be
   resent freely (follow a leader hint only if newer). AMBIGUOUS is resent only under the
   same command identity, otherwise surfaced to the caller. REJECTED is terminal or a wait
   on an event. The transport never retries an ambiguous write itself.
   - CockroachDB DistSender: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvclient/kvcoord/dist_sender.go
   - TiKV client-go: https://raw.githubusercontent.com/tikv/client-go/master/internal/locate/region_request.go
   - etcd clientv3 retry: https://raw.githubusercontent.com/etcd-io/etcd/main/client/v3/retry.go
   - gRPC A6 (transparent retry, retry throttling): https://github.com/grpc/proposal/blob/master/A6-client-retries.md
4. **Check a command identity at apply; one live attempt per step.** Every internal
   durable write carries op-id, step and epoch; the state machine answers ALREADY_APPLIED
   with the original result; a re-proposal supersedes the earlier epoch. If the dedupe
   record has a horizon, a retry after it gets a typed refusal, never a silent
   re-application.
   - CockroachDB MaxLeaseIndex: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/replica_application_result.go
   - CockroachDB 40003 guidance: https://docs.cockroachlabs.com/docs/stable/common-errors
   - Kafka KIP-98: https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging
   - Kafka KIP-854 (producer-id expiry shorter than delivery timeout) **[unverified]**
5. **One keyed, deduplicated, level-triggered reconcile queue with named waits.** Items
   are keys only, never payloads; a dirty set and a processing set give one worker per
   key; failures get per-key exponential backoff with jitter; waiting keys are parked
   until a named event; terminal errors are recorded and dropped. Each pass re-reads
   committed state and none runs before its cache has synced.
   - client-go workqueue: https://raw.githubusercontent.com/kubernetes/client-go/master/util/workqueue/queue.go
   - controller-runtime reconcile: https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/reconcile
   - Kubernetes controller guidelines: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md
   - CockroachDB purgatory: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/queue.go
6. **Leader-safe membership changes at one port, with etcd's arithmetic.** Transfer
   leadership to a caught-up survivor before removing the leader. Reject a removal when
   `active - 1 < quorum`, counting a new or unreachable member as down. Refuse to promote
   a learner caught up less than about 90 %. One pending configuration change at a time.
   Joint consensus for REPLACE. A cancelled change rolls forward to policy
   **[roll-forward in PD/CockroachDB unverified]**.
   - etcd server (`mayRemoveMember`, `readyPercentThreshold`): https://raw.githubusercontent.com/etcd-io/etcd/main/server/etcdserver/server.go
   - etcd runtime configuration: https://etcd.io/docs/v3.6/op-guide/runtime-configuration/
   - raft-rs: https://raw.githubusercontent.com/tikv/raft-rs/master/src/raft.rs
   - PD operator builder: https://raw.githubusercontent.com/tikv/pd/master/pkg/schedule/operator/builder.go
   - CockroachDB allocator: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/allocator/allocatorimpl/allocator.go
7. **One bootstrap decision, then a replication-factor gate before user work.** A single
   init creates the system groups under a durable cluster id; joiners only join and check
   the id; no user DDL or DML until every control-plane group has its full voter count and
   the membership publication is committed.
   - `cockroach init`: https://docs.cockroachlabs.com/docs/stable/cockroach-init
   - etcd `initial-cluster-token`: https://etcd.io/docs/v3.6/op-guide/clustering/
   - YugabyteDB: https://docs.yugabyte.com/preview/deploy/manual-deployment/start-masters/
8. **Isolate delivery errors per recipient; halt only on divergence.** A terminal error
   on one recipient's lane moves that recipient to RELIST or DETACHED; it never stalls
   other tables or recipients and never silently skips an event. Halt the replica only
   when apply breaks an invariant (term/index conflict, undecodable committed entry,
   checksum mismatch).
   - Kafka Connect error handling: https://www.confluent.io/blog/kafka-connect-deep-dive-error-handling-dead-letter-queues/
   - etcd raft log panics: https://raw.githubusercontent.com/etcd-io/raft/main/log.go
   - CockroachDB consistency checker: https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/replica_consistency.go
9. **A reserved budget for work that frees resources.** Retirement, acknowledgement,
   truncation and detach writes have a budget growth can never consume. Exhaustion is a
   cluster-visible alarm with an explicit disarm, not a per-call error callers retry. A
   refusal after proposal is AMBIGUOUS (etcd documents a NOSPACE write that still applied).
   - etcd maintenance: https://etcd.io/docs/v3.6/op-guide/maintenance/
   - Postgres reserved connections: https://www.postgresql.org/docs/current/runtime-config-connection.html
   - CockroachDB ballast: https://docs.cockroachlabs.com/docs/stable/cluster-setup-troubleshooting
10. **No dormant fallbacks; bound work amplification.** Delete polls, timers and second
    read sources that run only on failure; make the remaining path always-on (re-list as a
    routine operation); give each destination a retry budget; fix the sustaining feedback
    loop, not the trigger.
    - AWS Builders' Library, "Avoiding fallback in distributed systems": https://builder.aws.com/content/3EuS9Sakq7L3VLQIF3qzfMfke1Y/avoiding-fallback-in-distributed-systems
    - Bronson et al., HotOS '21 (metastable failures): https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf
    - Huang et al., OSDI '22: https://www.usenix.org/conference/osdi22/presentation/huang-lexiang

## Questions this raises for the current tree (to be answered by the independent review)

- Reconcile: is every waiting site on one queue primitive with named wakes, or are waits
  hand-rolled per site? Does any planner pass read a cache that has not reached its
  hydration position?
- Transport: do the ACK/answer outcomes map to NOT_SENT / WRONG_OWNER / AMBIGUOUS /
  REJECTED at one owner, and does any layer below the identity owner retry an ambiguous
  write? Is there a per-destination retry budget?
- Ambiguity: does every internal durable write (operation-ledger step, membership
  publication, CDC acknowledgement, replica-operation row) carry an identity checked at
  apply? What does a client retry get after the statement-outcome dedupe horizon?
- CDC: is retention computed only from recipients that can make progress? Is there an age
  bound beside the 2,048-row bound? Do idle sources advance positions? Is a "too new"
  position a typed re-list?
- Blast radius: "the node admits one durable wave at a time across all tables" gives one
  table's failure a node-wide reach; is a terminal error isolated to its recipient?
- Membership: is promotion refused below a catch-up threshold? Is REPLACE one joint
  transition? Is a new change refused while a configuration change is uncommitted?
- Formation: is user DDL/DML refused until every control-plane group has its full voter
  count and the publication is committed?
- Reserve: is exhaustion a cluster-visible alarm, or a per-call retryable error (a retry
  loop)? Is a post-proposal refusal treated as ambiguous?
- Fallbacks: which polls, timers or second read sources run only on failure?

## Gaps in the research

Kafka's official design page and KIP-854 were not fetched (ISR details are from
Confluent's design doc). CockroachDB "transfer the lease before removing the leaseholder"
rests on replicate-queue comments, not an explicit statement. TiDB's user-facing
"result undetermined" error and roll-forward-on-cancel in PD are unverified.
