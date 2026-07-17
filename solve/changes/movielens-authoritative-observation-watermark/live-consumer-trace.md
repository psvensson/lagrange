# Live consumer trace: authoritative observation watermark

Date: 2026-07-16

## Verdict

The per-table authoritative-observation path is production-wired, but the
selected intervention does not own the sealed MovieLens schema-admission
consumer. A live run was deliberately not launched after this trace.

## Production chain

1. MovieLens schema admission queries `control_snapshot_local()` and requires
   `snapshotObservation.state === fresh` in
   `examples/service-data-affinity/affinity-demo-preload-gate.js`.
2. Forced control-snapshot repair reaches
   `AdminServiceDiscovery.ensureAuthoritativeDiscoveryCacheRepair`, reads all
   nine repair tables, and preserves each gateway-minted receipt into cache
   reconciliation.
3. `ControlPlaneSystemTableGateway` validates the complete authoritative read,
   reconciles it, and publishes the distinct per-table observation watermark.
4. The post-repair control-snapshot evaluation nevertheless derives
   `cache_stale_watermark` only from active-node ready leases:
   `AdminControlSnapshotNodeViewProjection.evaluateAuthoritativeControlSnapshotRepair`
   calls
   `AdminControlSnapshotControlPlaneDiagnostics.resolveControlSnapshotCacheStaleWatermark`,
   which calls `isNodeRecordReady` and never reads mutation or authoritative
   observation evidence.
5. The new mutation-or-observation selector is currently owned by
   `AdminPreflightSnapshot.buildPreflightCacheFreshnessSummary`, which is not
   the `control_snapshot_local()` freshness predicate consumed by MovieLens.

## Immutable pre-fix evidence

The Wave-4 report
`test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json`
ends with `stale_usable: cache_stale_watermark`. Its immutable archive
`data/examples/service-data-affinity-demo-archive/wave4-live-operation-ledger-terminal-hold-2026-07-16T12-23-19-124Z.tar.gz`
records two complete nine-table control-snapshot repairs at
`2026-07-16T12:22:20.872Z` and `2026-07-16T12:22:20.886Z`.

## Safety discriminator

`solve/report/control-snapshot-heartbeat-lease-freshness.md` and
`test/admin/admin-control-snapshot-heartbeat-lease-freshness.test.js` preserve
the settled invariant that expired or missing owner-authored ready leases stay
stale and schedule bounded repair. A service-table observation must not bypass
that lease. The next theory therefore has to explain why the heartbeat owner
did not maintain valid leases, or identify a separate data-owned freshness
contract that preserves this fail-closed invariant.

## Secondary audit results

- The preflight selector currently reduces a nine-table repair to the
  `service_endpoints` timestamp. That timestamp must remain a per-table fact;
  it cannot prove aggregate repair completeness by itself.
- Provisioning trust in
  `src/control-plane/control-plane-readiness-service-node-methods.js` remains
  mutation-only for `nodes` and `services`. This is not the immediate
  MovieLens schema-admission consumer but is a separate follow-up candidate.

