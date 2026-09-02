# S3 landing decisions (graduated from the epic memo)

Detail graduated from
[`cluster-formation-topology-admission-closure`](../../epics/cluster-formation-topology-admission-closure.md)
to keep the epic inside the 150-line planning bound. One entry per decision;
the epic memo keeps the one-line pointers.

## S3 landed as three-state authoritative evidence, superseding the parked observer

The uncommitted `critical-placement-formation-observer` draft (s3 worktree,
base 3cddfcf65) correctly delegated to the convergence owner but conflated
UNKNOWN with KNOWN_NOT_CONVERGED (`unavailable-cache-is-typed-and-not-
converged`), read only the services table, and inherited the identity-count
requirement source. `critical-placement-authoritative-evidence` (landed
767e48684) adopts its cache-reading design and replaces the contract: the
convergence owner resolves required RF exclusively through
`resolveDesiredReplicationFactor` on the persisted partitions row, the
vocabulary is UNKNOWN / KNOWN_NOT_CONVERGED / KNOWN_CONVERGED, the observer
reads SERVICES + PARTITIONS + CONTROL_PLANE_PUBLICATIONS, stamps the
membership publication epoch, and `resolveCriticalPlacementEvidenceCurrency`
is the single evidence-to-currency boundary (fence vocabulary reused from the
topology_membership_owner, no local generation counter). The barrier reports
the observation and provably does not gate on it.

## The projection's cost is a formation input, not an afterthought

The S1 projection re-copied and re-scanned every service row once per
critical partition; nothing consumed it in production, so the ~45x redundancy
was invisible. Wiring it into the join barrier snapshot (500ms poll, seven
in-process nodes in the harness) measured at ~55ms per observation and
coincided with a joiner exhausting its join retries in the multi-join
witness. Copy-once/index-once inside the convergence owner brought it to
~2.5ms with both witnesses green unchanged. Anything added to
join/rejoin/rebalance/partitioning loops is coupled and systemic - cost
included (operator directive, 2026-09-02).

## v4 receipt lineage rename

`required-count-derives-from-initial-replica-ids` is now
`required-count-derives-from-authoritative-policy`. The old receipt NAME
pinned the defective requirement source (an identity count - the
drifted-denominator class; S1 had only made the declaration un-mutable, not
authoritative). The invariant it guards is unchanged and stronger: the
scenario forces the persisted value apart from the identity count and refuses
every unreadable requirement shape. Quest JSON, evidence script and receipt
regenerated together (18/18, bookkeeping b12993892); recorded because
renaming a landed quest's receipt is lineage, not drift.
