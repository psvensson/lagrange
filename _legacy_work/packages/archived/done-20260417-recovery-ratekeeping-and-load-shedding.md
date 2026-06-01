# Recovery Ratekeeping And Load Shedding

## Why

The repo now reproduces a failure family where recovery is not absent; it is
present but still unable to finish under load and topology churn.

That is a classic signal that recovery work needs explicit ratekeeping:

1. critical recovery should have enough reserved budget to finish
2. non-critical movement should not starve it
3. critical recovery itself must not flood the control plane and transport

TiKV's scheduler limits and FoundationDB's ratekeeper/data-movement health are
the useful comparisons here.

## External System Patterns

1. etcd treats a new member as a learner first, keeps it non-voting and
   non-serving, only promotes it after it has caught up, and limits the number
   of concurrent learners so the leader is not overloaded.
2. TiKV/PD separates operator generation from operator execution, drives
   movement through explicit ordered steps, and uses both global scheduling
   limits and store-level token buckets so movement does not flood one store or
   one leader path.
3. CockroachDB explicitly tolerates some temporary imbalance to avoid
   thrashing, prioritizes internal health-critical work ahead of less critical
   work, and exposes overload through queue wait, slot exhaustion, and IO
   overload metrics.
4. FoundationDB separates data movement ownership from ratekeeping ownership,
   throttles when the cluster approaches saturation, and uses transaction
   tagging and request tracing to make hot internal paths visible.

## Design Implications For This Package

1. A newly added recovery replica must remain non-authoritative and
   non-routable until catch-up and publication closure are explicit.
2. Recovery planning limits and recovery execution limits must be modeled as
   different contracts; one decides whether new work may be generated, and the
   other decides whether specific source or destination paths may consume more
   work.
3. Ordinary priority recovery must prefer bounded under-spread over recovery
   thrash when safety is already preserved.
4. Recovery movement must expose one canonical current step and one canonical
   blocked reason, rather than requiring operators to infer stalling from
   unrelated side effects.
5. Critical recovery diagnostics must identify whether pressure came from
   planner admission, destination catch-up, control-plane mutation execution,
   or source-retirement closure.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `src/control-plane/pressure-governor.js`
2. `src/control-plane/control-plane-workload-profile.js`
3. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Define one explicit budget and concurrency model for critical recovery
   operations.
2. Separate critical recovery capacity from generic balancing and background
   maintenance work.
3. Add typed defer/load-shed outcomes when pressure exceeds safe limits.
4. Surface recovery budget and pressure diagnostics to operators and tests.

## Out Of Scope

1. Full multi-tenant workload QoS.
2. Broad SQL user admission redesign.
3. Replacing the existing pressure-governor substrate with an unrelated
   scheduler.

## Invariants

1. Critical recovery must not be starved by best-effort balancing work.
2. Critical recovery must not destabilize the online path through unbounded
   retries or concurrent movement.
3. Pressure and budget state must be explicit owner outcomes, not ad hoc
   local counters.
4. Ordinary priority control-plane spread work must serialize add-like
   planning while recovery is active; emergency transport partitions may keep
   one bounded overflow lane because they unblock the rest of the control
   plane.
5. A recovery replica may become serving only after one explicit state
   transition proves that catch-up, publication visibility, and authority
   eligibility are all closed.
6. The system must preserve a clear distinction between planner-side admission
   limits and executor-side consumption limits; one global counter is not an
   acceptable substitute.
7. Temporary topology imbalance is acceptable while recovery is converging;
   churn caused by over-correction is not.
8. Every stalled recovery path must surface one canonical blocked reason and
   step age.

## Priority Recovery Budget Diagnostics

1. Planner-side budget outcomes must distinguish ordinary priority serial
   gating from generic global budget exhaustion.
2. When ordinary priority recovery is deferred because another ordinary
   priority move is already in flight, diagnostics should expose:
   - the serial limit
   - the ordinary priority in-flight count
3. Emergency transport partitions should remain visible as a separate overflow
   class instead of being merged into the ordinary priority serial lane.
4. Recovery diagnostics should distinguish planner deferral from executor
   blockage. At minimum the operator-facing snapshot should expose:
   - current recovery step
   - blocked reason
   - step age
   - source node
   - destination node
5. Budget diagnostics must distinguish global recovery budget from per-node
   consumption budget so that a saturated destination or source path is not
   misreported as a generic cluster-wide budget miss.
6. Control-plane write failures during recovery must surface as a first-class
   recovery pressure signal, not only as downstream convergence timeouts.

## Required Metrics

1. Recovery planner deferrals by canonical reason, partition, entity, and
   emergency class.
2. Recovery moves in flight by canonical step and step age.
3. Per-node add-consumption and remove-consumption budget availability, plus
   the number of queued moves waiting on each.
4. Control-plane mutation queue depth and mutation wait duration percentiles
   for recovery-tagged internal writes.
5. `authoritative_row_source_unavailable` occurrences by table, partition, and
   target node.
6. Participant-delivery reconnect failures and retry counts during internal
   recovery writes.
7. Recovery endpoint visibility repair usage, so operators can see when
   readiness-backed backfill was needed versus when publication data was
   independently sufficient.
8. Canonical convergence blockers by count and total blocked time, so tests can
   assert not just failure classes but the dominant stall mode.

## Inspiration Mapping

1. etcd learner guidance maps to our non-authoritative catch-up lane and to the
   requirement that the system must never route serving work to a recovering
   replica before promotion.
2. TiKV/PD scheduling maps to explicit movement steps, store or node level
   consumption budgets, and exposing pending reasons instead of opaque
   timeouts.
3. CockroachDB admission control maps to protected internal recovery priority,
   bounded queueing, and visibility into queue wait and resource exhaustion.
4. FoundationDB ratekeeper and request tracing map to one explicit recovery
   pressure owner plus tagged tracing or metrics for internal recovery writes.

## Hotspots

1. `src/control-plane/pressure-governor.js`
2. `src/budget-enforcer.js`
3. `src/control-plane/control-plane-workload-profile.js`
4. `src/rebalancer/unified-rebalancer.js`
5. `src/storage-admission-service.js`
6. `src/bootstrap/node-storage-budget-service.js`
7. `test/distributed/harness/load-generator.js`

## Detection / Analysis Tasks

- [x] Inventory the current concurrency and budget gates used by recovery
      paths.
- [x] Detect where critical and non-critical work still share one undifferentiated
      pressure path.
- [x] Detect where retry loops can consume work without improving convergence.
- [x] Define one recovery-lane ratekeeping model and defer vocabulary.
- [x] Detect which diagnostics must surface budget exhaustion directly.

## Implementation Tasks

- [x] Add the explicit recovery-lane ratekeeping and load-shedding contract.
- [x] Make critical reconfiguration, movement, and retry paths consume that
      contract.
- [x] Protect critical reserve capacity from generic balancing work.
- [x] Serialize ordinary priority control-plane planning during active
      recovery while preserving the bounded emergency overflow lane.
- [x] Add diagnostics and tests for defer, retry, and shed behavior.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted pressure-governor and budget-owner tests.
2. Focused integration tests for recovery under load.
3. Boundary scenarios with sustained load plus critical recovery pressure.
4. Seven-node reruns that verify recovery completes without broad budget
   inflation.

## Done When

1. Critical recovery has one explicit reserved budget model.
2. Generic balancing cannot starve or drown the critical lane.
3. Operators can see when recovery is deferred for budget reasons.
4. Operators can see when ordinary priority recovery is serialized behind an
   in-flight ordinary priority move instead of a generic global budget miss.
5. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
