# Product blocker, first causal divergence 2026-11-01: summary (derived index)

Full report: relocated bundle `comparative-benchmark-evidence-repair--comparative-benchmark-evidence-repair-evidence-c959e0241-2026-11-01.tar.gz`, sha256 `eaf4c6658612a812504507dffa26a594ff820217898f8df0ba28cf5f7f83b95f`, file `product-blocker-first-divergence-2026-11-01.md`.

**First divergence:** 19:50:58.093Z, seed log `S:2329`: the 750 ms write -> local system-table-cache
visibility bound (`CACHE_WAIT_TIMEOUT_MS`, `src/cdc/cdc-integration-service-cache-visibility-wait.js:52-53`) is
exceeded for a routed `services` write in steady state, 0.3 s after `join_ready`. The same lag later refuses
learner promotions (`learner_address_unresolvable`) and provisioning (`resolvedNodeCount 0`).

**Classification:** product defect, not setup; confidence 0.9 product-side, 0.6 on mechanism H1 (CDC obligation
holds `cdc_committed_acceptance_unknown` keep the cache seconds behind the table).

**Ruled out:**
- Event-loop starvation: one gap, before partitions existed.
- Docker storage: no I/O error; the lag is cache-side.
- Address/port configuration: ports derive from `NODE_ADDRESS`; peers are logical ids.
- Node 3's learner specifically: node 2's learners were refused the same way.
- Ready-lease flap: leases current at 19:51:47; the rebalancer reads a stale projection.
- Image build: Hub image `src/` identical to HEAD.
- Client timer: only shapes the 29.8 s answer.
- (CDC subscriber hold not ruled out: it is H1.)

**Quest ownership (§4):** no open quest owns the cause; proposed bounded child quest under
`topology-convergence-hardening` (fresh three-node formation opens its serve lane and routes a new user table).

**Verified-ready predicate (§5):** `/health ready:true` only means a SQL engine exists; before measuring, require
active nodes with current leases, priority spread satisfied, serve lane open on every node, a quiescent ledger,
a routable user table, and a probe write + readback.
