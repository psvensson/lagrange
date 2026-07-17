# Parallel theory triangulation

## Safety boundary

A successful complete authoritative read is evidence that cached data was
observed, not evidence that the process which last published a node row is
still ready. The two indistinguishable executions are a slow/stalled node and
a node which crashed after publishing the same row. Therefore observation may
advance cache freshness, but it must not renew or override
`ready_lease_expires_at`.

Comparable systems preserve the same separation:

- etcd exposes linearizable reads and lease keepalive as independent APIs;
- Kubernetes publishes node heartbeats through a dedicated Lease and reserves
  priority/concurrency for node-health and leader-election traffic;
- Consul renews TTL sessions early and treats overload-sensitive TTL sizing as
  a lease-owner concern, not a read side effect;
- quorum-backed systems use current-term/quorum evidence when the required
  fact is safe progress rather than process liveness.

## Latest archive facts

Evidence:
`data/examples/service-data-affinity-demo-archive/wave4-live-operation-ledger-terminal-hold-2026-07-16T12-23-19-124Z.tar.gz`.

- All three `nodes-p1` replicas remained co-located on the seed (`node-0`).
- `nodes-p1` is bootstrap-critical but is absent from
  `PRIORITY_CONTROL_PLANE_TABLE_IDS`.
- Five-node recovery therefore requires every ACTIVE node to be ready before
  `nodes-p1` may spread, while the ready leases themselves must be committed
  through the still co-located `nodes-p1`.
- Peer heartbeat updates failed through `nodes-p1` with participant query
  timeouts around 656-696 ms.
- The seed recorded event-loop gaps up to 12.802 seconds and 11.184 seconds
  during the final operation wave.
- The archive contains no `nodes-p1` database on a peer and no `nodes-p1`
  recovery move. The sealed `totalSpreadGap=0` covers the narrower priority
  set and therefore does not prove liveness-table spread.

## Ranked theories

1. **`nodes-p1` recovery circularity (selected).** The liveness table cannot
   spread until leases are healthy, but lease health depends on writes through
   that co-located table. The smallest discriminator compares `nodes-p1` with
   an existing priority partition under five ACTIVE members, a healthy recovery
   quorum, and incomplete remaining leases. Current behavior should block only
   `nodes-p1`.
2. **Post-handler lease aging.** The publication owner rebases the lease at
   handler entry rather than durable commit, so a slow proposal can consume
   much of the new 15-second lease after the already-fixed sender-to-owner
   delay. Test only if theory 1 is falsified or insufficient.
3. **Deadline-driven heartbeat retry.** Maintenance escalates after 10 seconds
   while the lease is 15 seconds and one attempt may remain in flight for up to
   10 seconds. This is plausible, but generic heartbeat priority is already
   live-proven and participant failure is concentrated on the co-located
   liveness owner, so it ranks below the ownership loop.
4. **Purpose-specific quorum barrier.** A current-term quorum certificate could
   own schema admission independently of process readiness. This is a larger
   contract change and is unnecessary unless safe liveness recovery cannot
   close the existing gate.

## Safe intervention boundary

Treating `nodes` as priority *recovery work* may permit a healthy current-epoch
quorum to spread `nodes-p1`; it must not mark an unready node ready, synthesize
or extend a lease, reduce replica/quorum safety, or admit ordinary workload
rebalancing. The intended movement is only to break the storage-placement /
lease-publication cycle so owner-authored renewals can become durable again.

## Rejected alternatives

- Do not let authoritative observation override an expired ready lease.
- Do not merely raise heartbeat dispatch priority; that lane already exists
  and was live-engaged.
- Do not widen the live timeout or stability window.
- Do not describe the remaining failure as generic operation pressure without
  first testing the specific `nodes-p1` ownership cycle.
