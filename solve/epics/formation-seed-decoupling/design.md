# Formation seed decoupling

Status: **The calibration run is done and the simulator's design is approved
with amendments (owner, 2026-09-14).** The binding text is the design-note
section at the end of this file; `formation-sim` is sealed against it, and no
`seed-formation-decoupling` fix starts before that section's acceptance
results exist.

Drafted against `14df53cccde45bd95c0ba3b2042877c6f6c89ee7` on
2026-09-08. The current Solver authoring contract is version 1, so this work is
represented by the parent Quest
`solve/quests/formation-seed-decoupling-resealed.json` with three ordered
frontiers. The frontiers preserve the requested proof shapes—simulation,
deterministic fix, then certification. Bounded supporting Quests linked through
`parentQuest` now implement the seams inside `formation-sim`; they do not add a
fourth semantic proof stage or permit a later parent frontier to start early.
This design can be migrated mechanically to a v2 epic after that contract cuts
over; the separate solve-v2 worktree is not an input to this draft.
The checked-in authoring constant is still 1
(`scripts/solve/quest-lint.js:45`, v1 tooling since retired); the
v2 epic template does not by itself constitute a Solver cutover.

## Terminal contract

Five-node cold formation must complete without starving the seed. Terminal
closure is the existing `scenario-harness` probe for
`release-0-2-five-node-convergence`, `consecutive: 3`, `metric: priority`, with
every contributing report from the same frozen source/release digest also
passing the unchanged `scripts/checks/formation-budget.js` consumer.

The budget is numeric and unscaled:

1. seed event-loop gap total is less than 10% of the formation window, and the
   maximum single gap is less than 500 ms;
2. all five readiness leases are complete within 45,000 ms of the fifth join;
3. by 30,000 ms after quorum, the observed spread history has included at least
   one operation in flight and `prioritySpreadGap` has reached zero; and
4. admission leaves `critical_spread_open` within 60,000 ms of the fifth join
   and never enters `control_plane_pressure`.

Item 3 is the executable interpretation of “reaches 0 with at least one
operation in flight”: the operation may drain before the zero-gap observation,
but both events must occur in the same bounded history. This interpretation and
all four numbers remain owner-reviewable, but they must remain numeric.

Only the third frontier may treat a live run as terminal evidence. The sole
earlier exception is the reviewed one-run attribution calibration in Quest 1;
it is evidence for simulator coefficients and mechanism ranking, never terminal
evidence or a fix attempt.

## Binding scope and anti-goal

The Quest authorizes changes to the readiness owner, membership publication,
bootstrap and formation sequencing, system-partition rebalancer planning, the
replica-worker pool boundary, and formation-time admission. A change outside
those paths is a new owner decision, not incidental cleanup.

No accepted mechanism may cache, memoise, or project a readiness value. The
existing `bounded-read-amplification-scope` constraint remains sealed. Existing
owner caches are allowed to execute because they are part of production
behavior, but the simulator cannot elevate one into authority and the fix
cannot add or tune one. A design that depends on a cache hit, retained
projection, lower refresh rate, larger stale window, or suppressed readiness
read is rejected.

## Phase 0 failure evidence

The immutable identities and extracted measurements are recorded in
[`solve/evidence/formation-seed-decoupling-phase0.md`](phase0-inventory.md).
The existing run establishes the target signature:

- 30 seed gaps totalling 66,486 ms, 49,840 ms unexplained, maximum 5,365 ms;
  joiners show no gaps;
- 521 incomplete readiness observations, 425 naming all five nodes unready,
  with 5,000, 75,000, and 120,000 ms backoffs;
- available admission observations retain `prioritySpreadGap: 6` and
  `effectiveInFlightCount: 0`; and
- admission ends in `control_plane_pressure` after the seed snapshot websocket
  fails to open.

The archived watchdog data is not a complete calibration. Its site totals are
inclusive and overlapping, while 49,840 ms of the relevant interval is
unattributed. It has no stable duration/input-unit pair for membership
publication reconciliation. Therefore Phase 0 does **not** rank the candidate
fixes or commit a guessed calibration table. On 2026-09-08 the owner authorized
one calibration run, but only after the mutually exclusive turn-attribution
seam described below lands and is independently verified.

## Consumed production and test surfaces

Every surface this design consumes is present in the current tree unless it is
explicitly marked “to create.”

| Surface | Current contract and gap |
| --- | --- |
| Deterministic test boundary | The repository promises deterministic timers, message delivery, and real hosted owners, but explicitly does not yet model CPU contention and only covers owners threaded onto injected time ([`docs/deterministic-directed-testing-plan.md:11`](../../../docs/deterministic-directed-testing-plan.md), [`docs/deterministic-directed-testing-plan.md:66`](../../../docs/deterministic-directed-testing-plan.md)). Quest 1 adds the missing computed single-core cost use for formation, without claiming real CPU-tail fidelity. |
| Discrete-event network | `createVirtualNetwork` already supplies per-node logical clocks, one message/timer queue, partition/kill controls, a seeded random stream for scenario-defined jitter, serialized per-node `busyUntil`, and a `TimeSource.charge` bridge ([`test/distributed/harness/virtual-network.js:90`](../../../test/distributed/harness/virtual-network.js), [`test/distributed/harness/virtual-network.js:119`](../../../test/distributed/harness/virtual-network.js), [`test/distributed/harness/virtual-network.js:176`](../../../test/distributed/harness/virtual-network.js), [`test/distributed/harness/virtual-network.js:332`](../../../test/distributed/harness/virtual-network.js)). It has explicit delays and partitions but no configured seeded per-link loss policy; that transport-policy layer is to create under `test/simulation/`. |
| Cost model | `createCostTable` maps `{fixedMs, perUnitMs}` to whole virtual milliseconds, but unknown operation keys silently cost zero ([`test/distributed/harness/cost-table.js:1`](../../../test/distributed/harness/cost-table.js), [`test/distributed/harness/cost-table.js:23`](../../../test/distributed/harness/cost-table.js)). The formation runner must validate that every required work class is calibrated before it constructs this generic table. |
| Time and randomness | Production-safe `RealTimeSource`, deterministic `VirtualTimeSource`, and the seeded random source already exist ([`src/time/time-source.js:39`](../../../src/time/time-source.js), [`src/time/time-source.js:70`](../../../src/time/time-source.js), [`src/random/random-source.js:30`](../../../src/random/random-source.js), [`src/random/random-source.js:39`](../../../src/random/random-source.js)). PCT may explore co-due order, but a fixed formation reproduction uses one declared seed and ordering policy ([`src/time/pct-scheduler.js:58`](../../../src/time/pct-scheduler.js)). |
| Real Raft | `connectRaftCluster` hosts real `LifeRaft` request/reply traffic over `VirtualNetwork` and injects the per-node clock; its bounded driver drains async protocol continuations deterministically ([`test/distributed/harness/raft-network-host.js:54`](../../../test/distributed/harness/raft-network-host.js), [`test/distributed/harness/raft-network-host.js:135`](../../../test/distributed/harness/raft-network-host.js)). `LifeRaft` already accepts time and random sources ([`src/raft/liferaft.js:672`](../../../src/raft/liferaft.js)). |
| Readiness owner | `ControlPlaneReadinessService` is the canonical readiness/planning owner ([`src/control-plane/control-plane-readiness-service.js:1`](../../../src/control-plane/control-plane-readiness-service.js)); its base already resolves a `TimeSource` for timers ([`src/control-plane/control-plane-readiness-participation-base.js:144`](../../../src/control-plane/control-plane-readiness-participation-base.js)). Its existing memos are visible at construction ([`src/control-plane/control-plane-readiness-participation-base.js:165`](../../../src/control-plane/control-plane-readiness-participation-base.js)) and remain behavior to exercise, not a candidate fix. |
| Membership publication | `MembershipPublicationRuntimeOwner` accepts the real router/gateway and retry clock/sleep inputs ([`src/control-plane/owners/membership-publication-runtime-owner.js:29`](../../../src/control-plane/owners/membership-publication-runtime-owner.js), [`src/control-plane/owners/membership-publication-runtime-owner.js:90`](../../../src/control-plane/owners/membership-publication-runtime-owner.js)). Full formation composition must charge publication reconciliation at its owner entry point; that charge surface is to create if no existing diagnostic section binds one complete pass. |
| Bootstrap / formation | `NodeJoiningOwnerConstruction` already accepts injected random, now, and sleep functions ([`src/bootstrap/node-joining-owner-construction.js:90`](../../../src/bootstrap/node-joining-owner-construction.js)). The separate node-ready rebalance owner still calls `Date.now`, `setTimeout`, and `clearTimeout` directly ([`src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js:199`](../../../src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js), [`src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js:297`](../../../src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js), [`src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js:342`](../../../src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js)); it needs one `TimeSource` seam with a red-on-revert test before full simulation. |
| System-partition planning | `UnifiedRebalancer` is the production planning/execution owner ([`src/rebalancer/unified-rebalancer.js:1`](../../../src/rebalancer/unified-rebalancer.js)). Its lifecycle accepts `nowFn` and a `RandomSource`, but its initial scheduling still bypasses them with raw `Date.now`/`Math.random` ([`src/rebalancer/unified-rebalancer-lifecycle-base.js:94`](../../../src/rebalancer/unified-rebalancer-lifecycle-base.js), [`src/rebalancer/unified-rebalancer-lifecycle-base.js:190`](../../../src/rebalancer/unified-rebalancer-lifecycle-base.js)). Quest 1 consolidates this through the existing seams and proves revert-red. |
| Raft apply boundary | Committed CDC batches are applied synchronously on the caller, one event at a time ([`src/message-group/message-group-service-raft-timing.js:141`](../../../src/message-group/message-group-service-raft-timing.js)). The worker-boundary mechanism, if attribution selects it, must change this production boundary rather than simulate a fictitious off-loop apply. |
| Replica-worker boundary | `ReplicaWorkerManager` constructs Piscina directly and owns ambient health timers/clock reads ([`src/worker/replica-worker-manager.js:299`](../../../src/worker/replica-worker-manager.js), [`src/worker/replica-worker-manager.js:337`](../../../src/worker/replica-worker-manager.js), [`src/worker/replica-worker-manager.js:367`](../../../src/worker/replica-worker-manager.js)). Deterministic mode may not construct it as-is because that creates worker threads. If selected or needed for composition, add one executor/pool factory plus time seam; the in-process executor must preserve the same typed operation boundary. |
| Existing convergence fixture | The formation barrier fixture uses a real cache, real `MovePlanner`, and owner-derived startup authority, but constructs a reduced owner with `Object.create` and stubs surrounding dependencies ([`test/convergence/formation-barrier-test-fixture.js:1`](../../../test/convergence/formation-barrier-test-fixture.js), [`test/convergence/formation-barrier-test-fixture.js:152`](../../../test/convergence/formation-barrier-test-fixture.js)). It is a useful witness, not the five-node simulator. |
| Existing placement simulator | `placement-affinity-sim` explicitly uses a stand-in scorer rather than the real planner ([`test/convergence/placement-affinity-sim.js:20`](../../../test/convergence/placement-affinity-sim.js)). It cannot satisfy the real-owner requirement. |
| Existing bootstrap tests | The single-form readiness test proves owner authority but is isolated ([`test/bootstrap/formation-readiness-owner-single-form.test.js:22`](../../../test/bootstrap/formation-readiness-owner-single-form.test.js)); the node-ready rebalance test uses wall-clock timestamps and real timers ([`test/bootstrap/node-ready-rebalance-trigger.test.js:9`](../../../test/bootstrap/node-ready-rebalance-trigger.test.js)). Both inform the new seam tests but do not compose formation. |
| Live formation probe | `npm run demo:formation-probe` resolves to a process/Docker probe; the runner uses wall time and `AdminWsClient` ([`package.json:33`](../../../package.json), [`examples/service-data-affinity/run-formation-probe.js:53`](../../../examples/service-data-affinity/run-formation-probe.js), [`examples/service-data-affinity/run-formation-probe.js:77`](../../../examples/service-data-affinity/run-formation-probe.js)). It remains live integration, not simulator substrate. |
| Admission policy | The production schema-admission wait already injects `query`, `now`, and `sleep` ([`examples/service-data-affinity/affinity-demo-preload-gate.js:568`](../../../examples/service-data-affinity/affinity-demo-preload-gate.js)). The simulator supplies a direct in-process query backed by the real local snapshot builder, whose dependencies and `nowFn` are injected ([`src/admin/admin-control-snapshot-local-build-base.js:378`](../../../src/admin/admin-control-snapshot-local-build-base.js), [`src/admin/admin-control-snapshot-local-build-base.js:424`](../../../src/admin/admin-control-snapshot-local-build-base.js)); it does not open a websocket. Typed admission states remain owned by the quiescence snapshot module ([`src/diagnostics/control-plane-quiescence-snapshot.js:10`](../../../src/diagnostics/control-plane-quiescence-snapshot.js)). |
| Report producer/analyzer | The live report's canonical shape is `summary`, `optimizationSummary`, and `standardSummary.scenarios[]`, but its builder defaults the timestamp from wall time and hard-codes live producer/fidelity ([`examples/service-data-affinity/affinity-demo-live-report.js:60`](../../../examples/service-data-affinity/affinity-demo-live-report.js)). The formation verdict already parses seed gaps, lease waits, spread, and admission, but reads only `node-0.log` and has older relative budgets ([`examples/service-data-affinity/formation-verdict.js:4`](../../../examples/service-data-affinity/formation-verdict.js), [`examples/service-data-affinity/formation-verdict.js:138`](../../../examples/service-data-affinity/formation-verdict.js), [`examples/service-data-affinity/formation-verdict.js:164`](../../../examples/service-data-affinity/formation-verdict.js), [`examples/service-data-affinity/formation-verdict.js:193`](../../../examples/service-data-affinity/formation-verdict.js)). Quest 1 extracts/extends one shared pure report builder and one versioned formation-metrics shape; both live and simulated producers use it. |

## Ambient-time and construction inventory

The owner decision is to leave `check-guideline-ambient-intrinsics` unchanged:
it is a scoped, baselined mutable-prototype checker, not an ambient-time checker
([`scripts/check-guideline-ambient-intrinsics.js:3`](../../../scripts/check-guideline-ambient-intrinsics.js),
[`scripts/check-guideline-ambient-intrinsics.js:70`](../../../scripts/check-guideline-ambient-intrinsics.js)).
Phase 0 instead ran `rg` across 146 files selected from the authorized
readiness/publication, bootstrap, rebalancer/operation, Raft, worker, local
snapshot, and formation-admission paths for `Date.now`, `new Date`,
`performance.now`, `process.hrtime`, `setTimeout`, `setInterval`,
`setImmediate`, socket construction, and worker construction.

The complete match inventory is the seam plan:

| Formation path | Matches (`file:line`) |
| --- | --- |
| Admission and local snapshot | `examples/service-data-affinity/affinity-demo-preload-gate.js:586,589,686,689`; `src/admin/admin-control-snapshot-local-build-base.js:425`; `src/diagnostics/control-plane-quiescence-snapshot.js:538` |
| Readiness | `src/control-plane/control-plane-readiness-participation-base.js:153`; `src/control-plane/control-plane-readiness-priority-recovery-planning.js:695` (comment); `src/control-plane/control-plane-readiness-publication-diagnostics.js:91` (comment); `src/control-plane/control-plane-readiness-service-shared.js:229` (`new Date(nowValue)`, deterministic conversion) |
| Membership publication | `src/control-plane/membership-publication-acknowledgement.js:24`; `src/control-plane/membership-publication-candidate-derivation.js:95`; `src/control-plane/membership-publication-coordinator-reads.js:98`; `src/control-plane/membership-publication-coordinator-reconcile.js:320,373,761,864,872`; `src/control-plane/membership-publication-planning-evidence.js:388,467,582`; `src/control-plane/membership-publication-row-helpers.js:262,287,303`; `src/control-plane/publication-recovery-evidence.js:52,57,64,150` |
| Bootstrap construction/runtime | `src/bootstrap/node-joining-owner-construction.js:119,123`; `src/bootstrap/node-joining-backfill-merge-and-status.js:315,755`; `src/bootstrap/node-joining-cdc-subscription-and-backfill.js:246`; `src/bootstrap/node-joining-publication-activation.js:655`; `src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js:199,342`; `src/bootstrap/bootstrap-service-control-plane-runtime-methods.js:291`; `src/bootstrap/bootstrap-service-runtime-methods.js:158,339,354,381,382` |
| Bootstrap seed and replica registration | `src/bootstrap/bootstrap-service-seed-workflow.js:155,166,176,178,183,186,317,321,324,330,334,338,342,346,359,363,383,427,459,485`; `src/bootstrap/bootstrap-service-replica-registration-methods.js:253,272,284,292,311,325,365,467,486,497,524,757,784,796,812` |
| Rebalancer scheduling/planning | `src/rebalancer/move-planner-state-methods.js:406`; `src/rebalancer/rebalancer-planning-gate-methods.js:69,257,721`; `src/rebalancer/unified-rebalancer-critical-topology-methods.js:480,740`; `src/rebalancer/unified-rebalancer-lifecycle-base.js:102,194,199`; `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js:92,102,289,292,313,327,342,365`; `src/rebalancer/unified-rebalancer-priority-readiness.js:472,691`; `src/rebalancer/unified-rebalancer-rebalance-loop.js:122,329,357`; `src/rebalancer/unified-rebalancer-replica-state.js:670` |
| Operation owner/liveness | `src/rebalancer/replica-operation-liveness.js:276,486,575,643,696`; `src/rebalancer/replica-operation-owner-lease.js:54`; `src/rebalancer/replica-operation-topology-drain.js:54` |
| Operation repository | `src/rebalancer/replica-operation-repository-entity-read-methods.js:121,130`; `src/rebalancer/replica-operation-repository-incomplete-read-methods.js:350,364,376,409,450,474`; `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:46,66,96,131,454`; `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:352,420,492`; `src/rebalancer/replica-operation-repository-read-methods.js:108,115,314,324`; `src/rebalancer/replica-operation-repository-visibility-methods.js:75,113,132,305,374,452` |
| Raft | `src/raft/liferaft.js:501,507,690,728` (501, 690, and 728 are explanatory comments; 507 is a fallback clock read) |
| Worker construction/runtime | `src/worker/replica-worker-manager.js:315` (`new Piscina`); `src/worker/replica-worker-manager.js:346` (`setInterval`); `src/worker/replica-worker-manager.js:382` (`Date.now`) |

No `performance.now`, `process.hrtime`, socket constructor, or direct
`new Worker` match was found in the scoped set. The scan is textual, so the
comments and deterministic `new Date(nowValue)` conversion remain visible and
become explicit allowlist candidates rather than being silently discarded.

Durable enforcement belongs to the simulator, and the boundary it enforces on
had to be corrected twice before it held. Both corrections are contracts now.

**Execution authority.** A formation generation's execution-node context is the
sole authority that code is executing as a simulated production process:
hosted production means the context names both a generation and an execution
node. The context propagates through async lineage, and the generation travels
with the frame rather than being looked up from a module global, so a
continuation belonging to an earlier generation can never donate its node to
the one currently running. Owner attribution is orthogonal - production
running with no owner at all is still production - and harness code executes
outside the node context. There was briefly a second answer to the same
question, a production tag established by the dispatch wrapper, and the two
disagreed: construction, seeding and every continuation released outside a
dispatch carried the node frame without the tag, so 240 of 241 ambient reads
executing on a simulated node were treated as harness work. One authority.

**Violation authority.** Ambient access is recorded to a generation-scoped
ledger *before* any handling. A non-zero ledger makes deterministic proof
impossible even when production catches the local exception - which it does:
a guard that only throws was observed to leave the scenario completing
normally while 19 refusals were swallowed by ordinary retry paths. The throw
still matters, because it stops the illegal value being consumed; it is not
the verdict.

**Strict and discover.** Strict is the contract and the default: record, throw,
and require a terminal ledger of zero. Discover exists only so that migration
diagnosis need not abort at the first defect, which was never the same concern
as failing the proof. In discover an attempted ambient `Date.now()` is
recorded and then answered from the clock the simulated node *already* owns,
resolved through the simulator's own node-clock lookup; the host value is
never consumed, nothing constructs a clock, and every other forbidden
intrinsic still records and throws. Proof eligibility is structural: each
report carries `proofEligibility`, and a discover run - or any run with a
non-zero ledger - is `deterministicProofEligible: false`. Certification,
fixed-seed reproduction, metered-oracle capture and mechanism evidence all
require strict mode with a zero ledger.

**Owner completion inside the instant.** An owner's current-work completion
contract participates in current-instant causal closure, alongside the
deterministic scheduler. A reconcile chain need not create a timer or a
virtual event, so nothing the scheduler can see reports it; without the
owner's own contract in the closure set, work admitted at instant T escapes T
through a promise continuation and lands in a later instant - or, at the end
of a scenario, inside the next one.

**No metered oracle exists.** The 429-entry trace was captured under a
completion model since falsified, and every number measured during migration
(413, 391, 411, 296, 405 violations) is a transient property of an
intentionally defective execution. A replacement oracle may be captured only
after strict mode runs to completion with a zero ledger.

The determinism check must assert the guard by mutation so a reintroduced
ambient dependency makes the hash proof fail. If a static companion proves
useful, it must be a new zero-baseline
`scripts/checks/formation-path-ambient-time.js` with the same sealed path set
and an explicit comment/conversion allowlist; modifying or rebaselining the
guideline checker is forbidden.

## Quest 1 — `formation-sim` (`proof: simulation`)

### 1a. Attribution seam and the one calibration run

Before the simulator coefficients are authored, land per-event-loop-turn owner
attribution on the live formation path. Every scheduled entry inherits a tag at
dispatch and an explicit owner entry can hand off the remainder of that turn to
one of the canonical owners: timer,
transport/message handler, Raft callback/apply, readiness, membership
publication, bootstrap, rebalancer planning/operation, admin snapshot/admission,
worker dispatch, or explicitly unattributed runtime. Each handoff closes the
previous exclusive segment before starting the next: nested calls never add
overlapping time. Owner, unattributed, and idle buckets therefore partition the
measured formation-window wall time.

The instrumentation must emit the formation-window start/end, per-owner turn
count and duration, unattributed duration/fraction, idle duration, and a
partition check with `sum(ownerDurationMs) + unattributedDurationMs +
idleDurationMs == windowDurationMs` within the clock's declared measurement
resolution. Deterministic tests cover nested
owner calls, async continuation dispatch, timer/message/Raft/planning tags,
unattributed turns, window boundaries, and exact partitioning. Any `src/`
change requires independent verification before landing.

During the same window, enable a sampling CPU profile on the seed and write it
into the run report directory. The profile, attribution output, full logs, and
report are immutable siblings bound by run id, exact committed HEAD,
`SRC_FINGERPRINT`, formation window, and individual SHA-256 digests. The profile
corroborates what executes inside an owner bucket; it does not replace the
exclusive turn totals.

Only after that seam lands, execute:

```sh
npm run gate:preflight -- \
  --question "per-owner attribution of seed event-loop time during formation" \
  --why-not-deterministic "A deterministic scheduler can prove bucket partitioning, but only one fresh-container run can calibrate production seed CPU cost per owner and capture the formation-window sampling profile."
```

Then run exactly one fresh-container five-node calibration on matching
`SRC_FINGERPRINT`. It is measurement-only: it cannot count toward Quest 3 and
is not a Quest 2 fix attempt. The run is accepted for calibration only if the
unattributed bucket is less than 10% of the formation window. If it is 10% or
greater, retain the run as a finding, extend the seam under deterministic
tests, stop without a second run, and request new authorization.

### Composition

Create `test/simulation/` as a normal test lane around the existing
`VirtualNetwork`. Each of five node runtimes owns a `networkTimeSource`, seeded
random source, in-memory durable-enough-for-this-claim adapters, real `LifeRaft`
groups, real control-plane/readiness/publication/bootstrap objects, and real
`UnifiedRebalancer` instances for system partitions. The harness may adapt
transport and storage interfaces, but it may not reproduce an owner's decision
logic. Every adapter gets a contract test naming what it simplifies.

The initial scenario models the observed cold boot: the seed creates the system
tables and 135 replicas before four nodes join; link delay/loss is drawn from
the scenario's seeded per-link policy; join times and topology are data, not
wall-clock callbacks. The scheduler charges virtual time to the node that
executes a production owner entry point. Required work keys are:

- `raft_entries_applied` with input unit committed entries;
- `priority_planning_pass` with input unit one complete planning pass;
- `control_snapshot_build` with input unit one complete snapshot build; and
- `membership_publication_reconcile` with input unit one complete publication
  reconcile.

Replica initialization may be a fifth calibrated key if its observed cost
cannot be represented by those four. The formation runner refuses
`calibration_missing`, `calibration_invalid`, or `calibration_source_unbound`
before starting if a required key lacks non-negative numeric coefficients and
artifact provenance. This fail-closed validation compensates for the generic
cost table's unknown-key-is-zero behavior.

The committed calibration file lives under
`test/simulation/calibration/formation-seed-2026-09-05.json`. Each coefficient
must name the source artifact path and SHA-256, measured numerator, input-unit
denominator, extraction method, and exclusive owner bucket. Its source is the
accepted run from 1a, not the incomplete 2026-09-05 archive. No value is
inferred from undocumented hardware or from the desired outcome.

After the measured table reproduces the signature, independently sweep every
coefficient from 0.5× through 2× while holding the other coefficients fixed.
Every point in every one-dimensional sweep must preserve the complete signature
predicate. The reproduction check reports coefficient/key/factor for any
failure; a simulator that passes only at the fitted point is rejected as tuned
by construction.

### Determinism and report contract

The scenario fixes seed, topology, join schedule, cluster id, starting virtual
epoch, and link policy. The report builder receives a virtual timestamp and
sorts all maps/sets/collections before serialization. It writes atomically only
after the run; temporary paths and absolute workspace paths never enter report
bytes. `formation-sim-reproduces.js` runs twice in separate temporary
directories, hashes the exact report bytes, and rejects unequal hashes.

Both producers emit the same additive, versioned `formationMetrics` object in
the existing live report schema. It contains:

- source/release/scenario/config/calibration identities;
- `formationStartedAtMs`, `quorumAtMs`, `fifthJoinAtMs`, and
  `allReadyLeaseCompleteAtMs`;
- per-node event-loop gaps and per-owner charged virtual time;
- ordered readiness observations including unready node ids and backoff;
- ordered spread observations including gap and in-flight count; and
- ordered admission transitions with the existing typed states.

The simulator identifies itself through producer/fidelity values but does not
change field meanings. The existing `formationVerdict` logic is extended rather
than forked. `formation-budget.js`, existing report analyzers, and
`analyze:latent-blockers` consume either producer without a simulator branch.

### Reproduction and ingestion

`scripts/checks/formation-sim-reproduces.js` must assert, on a fixed seed:

1. seed gap fraction is at least 50% and every joiner is below 5%;
2. incomplete-lease observations name all five nodes and backoff escalates;
3. `prioritySpreadGap` is non-decreasing with zero operations in flight through
   the modeled failure window; and
4. admission ends in `control_plane_pressure`.

It must fail if the simulator ceases to reproduce that signature. The full
scenario must complete in less than 60 seconds of real time.

To make a later live failure deterministic, create an ingestion command that
takes one live report plus the complete log archive, verifies both digests,
extracts topology/join timing/calibration overrides, removes addresses and
other environment-only values, and emits a canonical scenario JSON. The output
pins source commit, release/source fingerprints, input digests, seed, topology,
and calibration digest. Ambiguous node mapping, missing full logs, missing join
anchors, or incompatible report schema is a typed refusal; it must never guess.

Every owner seam added in this frontier is one bounded commit with a focused
head-red/red-on-revert test. The ambient guard and inventory above must be green
before claiming full-owner fidelity.

## Quest 2 — `seed-formation-decoupling` (`proof: deterministic`)

The design note is updated after Quest 1 with exclusive seed attribution by
owner and a ranked mechanism table. Ranking uses each candidate's directly
removable seed cost during the bounded formation window, followed by its
critical-path effect in an A/B simulator run. It is not based on code
plausibility.

Candidate ownership hypotheses, deliberately **unranked in Phase 0**, are:

| Candidate | Attribution that would select it | Required owner-level effect |
| --- | --- | --- |
| Early spread | Seed Raft/apply cost is dominated by concentrated system replicas, and spreading after three joins removes that cost while planning remains responsive. | Bootstrap/formation sequencing makes system spread eligible before user-table admission; admission gates on owner-issued spread state, never on a local replica count. |
| Apply off the loop | System-partition committed-entry apply/log work dominates seed cost, but early placement alone does not lower the critical path enough. | The production committed-entry boundary dispatches through the existing replica-worker execution contract while main-loop heartbeats, leases, and planning remain responsive; deterministic mode uses the same executor port without worker threads. |
| Formation-time admission control | Snapshot/readiness/planning work dominates the seed and misses explicit heartbeat/lease deadlines even with placement spread. | The owning scheduler cooperatively yields under a numeric formation deadline; it does not cache, memoise, project, suppress, or merely slow readiness. |

The highest supported candidate is attempted first. The note must also name the
second-ranked mechanism and its attribution before implementation. If two
bounded attempts show no simulator budget improvement, Solver records the
altitude-check finding before any third attempt.

Quest 2 is done only when:

- `formation-budget.js` passes the normal `five-node-cold-formation` simulator
  report;
- `formation-sim-reproduces.js` has become a controlled-negative guard that
  injects the removed condition (for example seed-concentrated system
  replicas), reproduces the old signature, and is excluded from positive
  certification reports; and
- a mechanism-owner deterministic test was committed red before the source fix
  and is red on source revert for the named behavior, not due to fixture/setup
  failure.

## Quest 3 — `release-0-2-five-node-convergence` (`proof: certification`)

This frontier starts only after the Quest 2 landing commit. It preserves the
existing release Quest's frozen release-content digest, fresh-container streak,
deterministic-first rule, and narrow release claim. Its only expensive work is:

```sh
npm run gate:preflight -- \
  --question "Does the exact frozen release-content digest complete three consecutive fresh-container five-node cold formations through production owners while every run passes scripts/checks/formation-budget.js?" \
  --why-not-deterministic "The in-process simulator proves the mechanism and virtual-time budgets, but cannot establish real container scheduling, process/worker isolation, admin-websocket reachability, or the behavior of the exact published release artifact."
```

Then run exactly three fresh-container certification runs. Each contributing
run must cite the same release-content/source fingerprints and independently
cover cold formation, user-table readiness, and initial runtime-service
placement. The scenario-harness streak and `formation-budget.js` consume the
same three immutable report paths. The v1 `doneWhen` structure can express only
one probe, so the Quest seals the second consumer as a same-run constraint; the
scenario producer may report PASS only after both consumers pass.

If any live run fails, retain its outer FAIL, ingest its report and complete
logs into a deterministic scenario, return to Quest 2, and do not start GCP
again until the new simulator scenario passes. GCP is certification only,
never the iteration loop.

## Typed failure edges

| Edge | Typed outcome | Closed? | Caller-visible result |
| --- | --- | --- | --- |
| Missing/invalid/unbound calibration | `calibration_missing`, `calibration_invalid`, or `calibration_source_unbound` | yes | simulator exits non-zero before owner construction; no report can count |
| Ambient time/randomness observed on hosted path | `nondeterministic_owner_seam` | yes | reproduction check names owner/path and refuses proof |
| Unknown required work key charged as zero | `unmodelled_formation_work` | yes | run invalid, never a budget PASS |
| Ingestion lacks report, complete logs, node map, join anchors, or matching digest | `scenario_source_incomplete` or `scenario_source_mismatch` | yes | no scenario emitted |
| Link policy targets an unknown/self-invalid link | `scenario_transport_invalid` | yes | scenario validation fails before run |
| Owner adapter cannot preserve its production typed contract | `owner_adapter_incompatible` | yes | simulator setup fails; no local fallback decision |
| Snapshot observation unavailable | existing `observation_unavailable` / `critical_spread_observation_unavailable` | yes | admission remains closed and transition is reported |
| Seed/control plane under pressure | existing `control_plane_pressure` | yes | admission remains closed and report is FAIL |
| Fifth join or quorum never occurs | `formation_anchor_missing` | yes | budget consumer fails, never derives a shorter window |
| All-ready/spread/admission deadline missed | `formation_budget_exceeded` with the failed budget id | yes | report remains measurable FAIL |
| Scenario already satisfies a mechanism precondition | `treatment_not_engaged` | yes | controlled A/B is invalid, not PASS |
| Controlled-negative injection does not alter source/behavior fingerprint | `negative_control_not_engaged` | yes | regression proof rejected |
| Worker executor refuses/terminates apply | existing worker operation failure, surfaced as `formation_apply_failed` in the report | yes | no inline fallback apply and no admission |
| Source/release/config/calibration identity changes within a run/streak | `identity_drift` | yes | run non-contributing; streak resets |

## Cached-view audit

The mechanism introduces no cache, memo, staged readiness copy, or read-through
view. The simulator drives existing production caches and records their owner
outputs. It never reads a cache to derive an independent readiness, spread, or
admission verdict. Scenario ingestion is offline input normalization, not a
runtime view; its source digests invalidate the entire scenario when inputs
change. The report is an immutable post-run observation and cannot feed owner
decisions.

Existing readiness and publication memos retain their current invalidation and
staleness behavior because they are part of the real owner path. Any Quest 2
proposal that changes one, adds another, or uses a cached projection as a
scheduler/admission input violates the anti-goal and is rejected before an
attempt. Early spread consumes the canonical planning/startup authority;
off-loop apply changes execution placement but not readiness state; cooperative
admission control consumes owner work/deadlines, not retained readiness.

## Identity anchoring

| Artifact/decision | Required anchors | Movement rule |
| --- | --- | --- |
| Simulator scenario | schema version, fixed seed, cluster id, topology epoch, join schedule, source report/log SHA-256 | any changed anchor produces a new scenario/config digest |
| Cost calibration | calibration schema/digest, source artifact SHA-256, source commit/fingerprint, hardware/run identity, operation key and input unit | mismatch or missing provenance refuses the run |
| Raft work | node id, raft group/partition id, term, committed log index/range | term/group movement is handled by real Raft; stale work cannot charge/apply as current work |
| Membership/readiness observation | cluster id, membership/publication epoch, readiness generation/source revision, node boot incarnation | newer authority re-drives the real owner; stale evidence cannot release admission |
| Spread operation | topology/descriptor epoch, operation id, partition/replica ids, source and target node ids | epoch drift uses the existing operation owner outcome; no simulator reinterpretation |
| Formation report | scenario/config/calibration digest, source commit, release/source fingerprint, deterministic timestamp/seed or live timestamp, ordered artifact paths | drift invalidates a run and resets the certification streak |
| Mechanism choice | simulator report digest, baseline/control fingerprints, owner cost table, attempt number | new scenario or attribution requires re-ranking before another mechanism attempt |

## Protected interactions and proof cone

The changed-path proof cone is computed before every source attempt. At minimum,
the current registry entries potentially intersecting the authorized paths are
`priority-spread-planner-retention-admission-hold`,
`priority-services-row-publication-census`,
`priority-services-marker-reconcile`,
`critical-create-hold-topology-guard-order`,
`readiness-freshness-macrotask-bound`,
`active-gate-authoritative-repair-backoff`,
`operation-ledger-self-move-hold-dispatch`, and
`formation-release-seed-contract-joiner-consumer`
([`test/shards/impact-contracts.json:248`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:271`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:294`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:316`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:339`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:392`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:417`](../../../test/shards/impact-contracts.json),
[`test/shards/impact-contracts.json:443`](../../../test/shards/impact-contracts.json)).

For every path owned by a registered pair, read its named contract and witness
tests before editing, keep both participant invariants green in the same
deterministic witness, and complete the `owner-interaction` template. No local
formation shortcut may bypass the readiness, operation, publication, spread,
or admission owner.

The sealed verification categories are `owner-interaction`,
`harness-fidelity`, `sweep-timer`, `formation-circularity`, and `retry-loops`.
`admission-gating`, `transport-delivery`, `concurrency-serialization`, and
`recovery-replay` are additionally required when the selected changed paths
engage those surfaces. Source changes require an independent verifier before
Solver audit/landing.

The template-specific attack is concrete: `harness-fidelity` proves every
adapter reaches the production mechanism and every revert-red fails for that
mechanism; `sweep-timer` proves a timer is recovery rather than the sole release
path; `formation-circularity` proves admission and spread do not wait on each
other; `retry-loops` proves the fix does not amplify backoff work; and
`owner-interaction` proves both sides of each registered pair in one witness.

## Ordered execution and phase reporting

The three frontiers are strict: Quest 2 cannot start until Quest 1 lands; Quest
3 cannot start until Quest 2 lands. Every intended Quest commit is published
only through the repository's post-landing `npm run publish` command.

After each frontier, append to this note:

- all numeric budget results and exact report digests;
- seed per-owner exclusive cost and percent of formation window;
- each production seam added and its revert-red witness;
- the ranked mechanism table, chosen mechanism, second mechanism, and the
  attribution that chose them; and
- judgment findings, controlled-negative identity, and altitude-check outcome.

Phase 0 records the available inclusive site totals in the evidence excerpt,
but exclusive owner attribution is **incomplete**, seams are only inventoried,
and the mechanism is **unchosen** because selecting one now would violate the
attribution-first rule.

## Phase 0 decision log

- 2026-09-08 — v1 Quest authoring with three strict frontiers is confirmed;
  solve-v2 migration is deferred to the cutover.
- 2026-09-08 — one calibration run is authorized after the attribution seam
  lands and verifies. Acceptance requires less than 10% unattributed time; a
  miss stops without a second run.
- 2026-09-08 — leave `check-guideline-ambient-intrinsics` unchanged. The scoped
  `rg` inventory above is the seam plan; deterministic enforcement is the
  owner-dispatch ambient guard. Any optional static checker is new and
  zero-baseline.
- 2026-09-08 — Quest 1 may start. No live run is allowed before the attribution
  seam, deterministic tests, independent verification, landing, exact
  calibration preflight, and matching-source check are complete.

## Phase 1a stop — file-size ratchet

- 2026-09-08 — independent verification rejected three exact candidates before
  landing. The first exposed Promise-owner leakage into an awaiting caller; the
  second exposed stale bootstrap ownership returning in a second async
  generation; the third proved that production LifeRaft election/heartbeat
  callbacks become unattributed after bootstrap release. All three findings are
  recorded against their exact candidate fingerprints in the successor Quest.
- The first two counterexamples now have real-`async_hooks` deterministic
  regressions and pass together. The unlanded third repair assigns LifeRaft
  timer, retry, and inbound callbacks to a distinct `raft_protocol` owner while
  retaining `raft_apply` for applied-entry cost; its production Tick
  registration/re-arm witness is green.
- The cohesive repair makes `src/raft/liferaft.js` 801 lines against the sealed
  800-line source limit. Solver therefore refuses the replacement attempt with
  `blocked-static-quality`; the three-rejection escalation also requires a
  decomposition or successor decision. Per the epic guardrail, no file split,
  ratchet/baseline change, static-quality override, or further attempt is made.
- No simulator or live budget value has changed, no mechanism has been chosen,
  and the single calibration authorization remains unused. Phase 1a is
  unlanded and calibration remains prohibited pending owner review.

## Phase 1a continuation — bounded attribution seams

The 31-file, 12-owner scope refusal and three independent candidate rejections
are decomposition evidence. The rejected candidate remains historical evidence
and must not be reattempted as one patch, even if its file-size failure later
disappears. `formation-sim` remains the parent semantic stage and is implemented
through ordered supporting Quests:

1. `formation-async-attribution-propagation` owns only the attribution core's
   exclusive async propagation contract. It lands the two already-proven
   counterexamples: awaiting callers do not inherit the callee owner, and a
   released bootstrap callback cannot restore bootstrap ownership in later
   async generations. Its proof includes behavioral source mutations for both
   rejected algorithms.
2. `formation-raft-protocol-attribution-interaction` owns only the interaction
   between LifeRaft's existing protocol behavior and formation diagnostics'
   attribution. LifeRaft retains every Raft decision; diagnostics retains the
   owner vocabulary and exclusive accounting. The seam supplies attribution
   around production election/heartbeat registration and re-arm, indefinite
   retry generations, inbound DATA dispatch, and the already-distinct
   `raft_apply` boundary, with inactive attribution behavior unchanged.
3. Only after both attribution foundations land may later bounded supporting
   Quests resume the remaining owner ingress, commit-scheduler, transport,
   window/profile capture, report artifact transfer, and scenario-ingestion
   responsibilities. Each successor must name one interaction owner and its
   own red-on-revert witness; this list is a residual inventory, not authority
   to recombine those responsibilities into another broad tranche.

The LifeRaft successor begins with an ownership/cohesion review. It may reuse an
existing cohesive timing or dispatch owner only when that owner genuinely owns
the interaction. A new source extraction is allowed only for a real interaction
owner with an independent contract; a methods bag or line-count split is
forbidden. If independent verification finds that the cohesive implementation
belongs in `liferaft.js` and no owner-correct extraction exists, Phase 1a stops
again with that evidence before any file-size constraint changes. Any later
supersession must retain the 800-line constraint in history and set the exact
independently verified cohesive floor with no headroom.

No GCP, Docker, or live calibration run is part of these seam Quests. The one
calibration authorization remains unused until every attribution seam is landed
and the measurement path is trustworthy; immutable existing artifacts must be
re-evaluated before any live run is requested or started.

## Phase 1a continuation decision log

- 2026-09-08 — the operator accepted the stop and authorized decomposition
  inside the existing `formation-sim` semantic stage. The rejected 31-file
  candidate is preserved but will not be reattempted.
- 2026-09-08 — async attribution propagation lands before the LifeRaft
  interaction, and both land before scheduler, transport, capture/report, or
  scenario-ingestion work resumes.
- 2026-09-08 — static quality remains binding. No line-count-oriented LifeRaft
  split, methods bag, gate tuning, static override, GCP run, or calibration run
  is authorized by this continuation.

## Calibration wiring and simulator inputs (2026-09-13)

**Precondition state, measured.** The attribution seam
(`src/diagnostics/formation-turn-attribution.js`, `raft-formation-attribution.js`)
is on `main` and the Raft callbacks charge their turns to it, but no production
path constructs or starts a `FormationTurnAttribution`: the module's active
window is `null` in a running seed, so the live formation report
(`examples/service-data-affinity/run-affinity-demo.js`, `formationVerdict`)
carries no per-owner buckets and the acceptance rule (unattributed bucket
under 10 % of the window) cannot be evaluated. No sampling CPU profile is
captured either. `formation-calibration-run` therefore starts with the wiring,
not the run:

1. The seed starts one attribution window at process start when
   `LAGRANGE_FORMATION_ATTRIBUTION=1`. The window ends on the formed event
   (the demo sends `SIGUSR2` at its "Cluster formed." mark, the end the
   verdict already uses) OR on a deadline - the formation budget window plus
   a margin - whichever comes first, because the run this quest exists for
   is the failing formation, where "Cluster formed." never fires (owner
   amendment 2026-09-13). Every 10 s the seed logs a non-finalising snapshot
   of the buckets (`Formation attribution snapshot`), so a stalled or killed
   seed still leaves partial attribution; the seam gains a `snapshot()` that
   reads the buckets without completing the window. The final `stop()`
   snapshot is logged as `Formation attribution window`.
2. `collectFormationVerdict` harvests that line from the seed log into
   `formationVerdict.attribution`; the acceptance rule reads
   `unattributedPercent` from it.
3. With the same flag the seed samples its main thread through the
   inspector `Profiler` and writes the profile periodically (and on the
   deadline) into the report directory, rather than relying on `--cpu-prof`,
   which writes only on a clean exit a stalled process may never reach; if
   `--cpu-prof` is kept as a fallback, the deadline must guarantee a graceful
   exit. The profile is an immutable sibling of the report (bound by run id,
   HEAD, `SRC_FINGERPRINT`, digests); it corroborates the buckets, never
   replaces them.
4. Then `gate:preflight` with the exact question, and one fresh-container run
   on GCP through `npm run health:formation -- --gcp` with the flag set. The
   per-owner cost table is committed as text under
   `test/simulation/calibration/`, each figure citing its artifact; the probe
   counts formation-path owners the table does not cover.

Scope (decision, owner 2026-09-13): the epic's `authorizes` widens to
`examples/service-data-affinity` and to the probe's owner file
`scripts/checks/formation-health.js` - those files only.

**Wiring as built (first attempt, 2026-09-13, verified r1: rejected on two
blockers, both repaired in the same attempt).**
- Owners are nine plus unattributed: admin, bootstrap,
  membership_publication, raft_apply, raft_protocol, readiness, rebalancer,
  transport, worker_dispatch. Timers are not an owner: a timer armed inside
  an owner's turn inherits that owner through the seam's async context, and
  there is no single timer choke point (144 raw `setTimeout` sites), so
  charging timer dispatch would only hide who armed it.
- Each owner is tagged at its dispatch choke point through
  `src/diagnostics/formation-owner-attribution.js`: the inbound message
  router, the membership-publication reconcile queue, the startup pipeline's
  phase and step runs, the rebalancer's check queue and operation dispatch,
  the readiness planning queue, the admin websocket dispatch and schema
  provisioning jobs, the main-thread side of every worker pool call (the
  worker thread has its own seam instance and no window), and the replica
  dispatch queues (operation, node-state, node-ready retry to rebalancer;
  membership advance to membership_publication).
- The window (`src/diagnostics/formation-attribution-window.js`) starts in
  runtime startup right after the logger exists, before the join decision.
  The formed signal's listener stays for the life of the process (Node's
  default disposition would terminate the seed on a late signal); a seam
  invariant failure inside a snapshot or the end is logged once and never
  thrown into the seed; profile flushes are serialised.
- Only the seed is measured: the demo strips the flag from joiners, and the
  Docker harness forwards the three attribution keys to the seed container
  only (`FORWARDED_SEED_HOST_ENV_KEYS`). On GCP no signal reaches the seed,
  so the window ends on the deadline; the verdict prefers the last 10 s
  snapshot at or before the formed mark whenever the window completed later.
  The seed's profile chunks are written under the container's data
  directory and cross to the host as base64 text through the exec channel
  before the container stops (`materializeGcpSeedProfile`).
- Scope (owner decision, 2026-09-13): `authorizes` widened to the transport,
  admin, schema-provisioning and runtime-startup tag sites and to the tests
  under `test/diagnostics`, `test/runtime` and the formation-health test,
  rather than leaving those three owners unattributed.
- Verifier r2 found the GCP runtime image distroless: the seed's profile
  chunks now cross to the host through Docker's archive endpoint as one
  `formation-profile.tar` beside the node logs, only on a measured run; the
  replica-creation pool dispatches are charged to worker_dispatch on the
  main thread.

**The run (2026-09-13, head 8a6275a4d, verifier r4 approve).** One GCP
formation, formed and admitted. Over the seed's window from process start to
the formed mark (152 s) the unattributed bucket was 3.50 % (2.7-5.0 % in every
10 s snapshot), idle 8.1 %, and the owners ranked raft_protocol 32.8 %
(3.1 M turns at 14.5 µs), rebalancer 24.9 % (111 µs per turn),
membership_publication 15.5 %, bootstrap 5.9 %, raft_apply 5.2 % (the
heaviest segment, 318 µs), admin 2.1 %, transport 1.7 %, readiness 0.4 %,
worker_dispatch 0 (no pool call reaches the seed's main thread during
formation). The gap watchdog's 63.7 s "unexplained" inside the same window is
owner work by the seam's account, not idleness. Table and evidence:
`test/simulation/calibration/seed-owner-costs.md`. Simulator inputs: a
per-segment cost and a segment rate per owner; the fix targets the top three
owners' turn rates before their per-turn weight.

**Simulator design inputs carried from `formation-contracts-registration`.**
- The cross-operation re-entry cycle: the operation-workflow owner bounds
  deferred handoff re-entry per operation (step timeout, then the operation
  budget) and at the stop leaves the operation "for planner rearm / ready-node
  replay" - its own stop log - so a reconciled-but-unpublished node can be
  re-planned into a fresh operation with a fresh `createdAt` and no state
  change. The simulator must drive reconcile -> unpublished -> pending ->
  reconcile across operations under formation load and report recurrence and
  rate before anyone decides what happens at the bound.
- Ambient time on the handoff path: the handoff retry callback and the
  transition retry grace read `Date.now()` directly rather than the owner's
  `timeSource` (`rolling-restart-rebalancer-handoff-witness.test.js` records
  where). The deterministic-mode guard must throw on these, which means the
  seam lands there first.

## Formation-sim design note (2026-09-14): scheduler, cost model, ranking

Status: **approved with amendments, owner decision 2026-09-14.** The core
decision stands: the simulator runs the real production owners under
`VirtualNetwork` and charges calibrated exclusive owner-segment costs. Owner-
produced turn *rate* is authoritative, and the simulator reproduces no
planner, readiness or rebalancer decision logic. The ten amendments are
written into the sections below and are binding: `formation-sim` is not
sealed until its statement carries them, and no `seed-formation-decoupling`
fix starts before the acceptance results at the end of this section exist.

### Inputs

1. The single calibration run (`test/simulation/calibration/seed-owner-costs.md`,
   head 8a6275a4d, GCP, five nodes, unattributed 3.50 % of a 152 s window):

   | owner | share | turns | mean segment |
   | --- | ---: | ---: | ---: |
   | raft_protocol | 32.8 % | 3 123 519 | 14.5 us |
   | rebalancer | 24.9 % | 336 484 | 111.4 us |
   | membership_publication | 15.5 % | 413 850 | 56.9 us |
   | bootstrap | 5.9 % | 218 890 | 40.9 us |
   | raft_apply | 5.2 % | 24 680 handoffs | 317.8 us |
   | admin | 2.1 % | 45 363 | 69.6 us |
   | transport | 1.7 % | 104 199 | 19.4 us |
   | readiness | 0.4 % | 80 + 250 | 1 880 us |
   | worker_dispatch | 0.0 % | 0 | none measured |
   | idle | 8.1 % | | |
   | unattributed | 3.5 % | | residual, never priced |

   From 35 s to the formed mark the top three owners grow linearly
   (raft_protocol +3.9 s, rebalancer +2.4 s, membership_publication +1.0 s
   per 10 s); bootstrap is front-loaded into the first 23 s. Idle is 8.1 %:
   the seed is not starved of CPU by anything outside its own owners.

2. The cross-operation re-entry cycle (from `formation-contracts-registration`):
   the operation-workflow owner bounds deferred handoff re-entry per
   operation, and at the stop leaves the operation "for planner rearm /
   ready-node replay", so a reconciled-but-unpublished node is re-planned
   into a fresh operation with a fresh budget and no state change. Nothing
   marks the cycle terminal. Its recurrence rate under formation load is
   unknown; it is a candidate inflator of the rebalancer's 336 k turns.

3. Ambient time on the handoff path: the handoff retry callback and the
   transition retry grace read `Date.now()` directly rather than the owner's
   `timeSource` (recorded by `rolling-restart-rebalancer-handoff-witness.test.js`).
   The deterministic-mode guard cannot be armed while those reads exist.

### Owner vocabulary: calibrated-active and observed-inactive

The nine attribution owners replace the four work keys
(`raft_entries_applied`, `priority_planning_pass`, `control_snapshot_build`,
`membership_publication_reconcile`) as cost keys, because the calibration
measured owners and the seam already tags every segment with one. They are
not, however, nine of a kind:

- **Calibrated-active (eight).** raft_protocol, rebalancer,
  membership_publication, bootstrap, raft_apply, admin, transport, readiness.
  Each has a measured mean exclusive segment cost from the run above.
  `formation-sim-reproduces.js` refuses `calibration_missing`,
  `calibration_invalid` or `calibration_source_unbound` for any of them.
- **Observed-inactive (one).** worker_dispatch was measured at 0 turns and
  therefore has **no measured mean**. It is not a zero-cost calibrated owner,
  and zero is never substituted for an unmeasured cost. The baseline scenario
  admits it only while its dispatch count remains zero. If baseline formation
  activates it, the run fails closed with an explicit `uncalibrated_owner`
  error naming the owner; it does not proceed at zero.

Mechanism 3 (off-loop apply) is the mechanism that activates worker_dispatch
by construction. Before it can be compared against the others it must supply
a separately justified candidate cost or cost range for worker dispatch and
worker-side execution, with the justification recorded here. A comparison
that charges the pool nothing is not a comparison.

`raft_apply` stays a distinct key (317.8 us, the heaviest segment) because
mechanism 3 moves exactly that bucket; charging it inside raft_protocol would
make the mechanism unmeasurable.

### Scheduler: charge every exclusive segment, real owners throughout

The simulator is a discrete-event scheduler over the existing `VirtualNetwork`
with one virtual event loop per node. Every node runs the real owners
(control plane, readiness, publication, bootstrap, `UnifiedRebalancer`, real
LifeRaft groups); the scheduler owns only *when* a turn runs and *how much
virtual time it costs*. Segments are recognised through the same attribution
seam the calibration used (`formation-owner-attribution.js` choke points), so
the owner of every segment is known and the seam's segment count is the same
quantity the calibration measured.

**Charging unit.** The authoritative count is

```
turnSegmentCount = dispatchCount + handoffCount
```

Every exclusive attribution segment is charged, not only top-level async
dispatches. A synchronous `runFormationOwner()` handoff therefore incurs the
destination owner's segment cost exactly once, which is what made raft_apply
visible in the calibration as 24 680 handoffs rather than as dispatches. The
seam's existing exclusive nested-owner semantics are retained unchanged: a
handoff closes the enclosing segment before opening the next, so nested calls
never overlap and nothing is charged twice.

The segment *rate* is not a coefficient. It is produced by the real owners
reacting to the simulated topology, joins and links, exactly as the live seed
produced 3.1 M raft_protocol segments from 135 replicas times four peers.
This keeps the simulator honest about the two things that decide starvation,
the number of segments and their exclusive cost, without reproducing any
owner's decision logic (the epic's anti-goal).

### Scheduler causality invariant

Charging is only meaningful if occupancy actually blocks. The scheduler holds
this invariant, and it is a checked invariant with its own falsifier, not
informal behaviour:

1. Every node carries its own `busyUntil` virtual timestamp.
2. Dispatching an owner segment on node N advances N's `busyUntil` by that
   owner's charged cost; N is unavailable for the interval.
3. A timer or an inbound message may become *logically due* while N is busy.
   It does not execute then. It becomes runnable at
   `max(dueAt, busyUntil(N))`.
4. Global execution always selects the earliest **causally runnable** event
   across nodes, never merely the earliest due one.
5. A cross-node delivery cannot be runnable before the sender's segment
   completes plus the link delay `VirtualNetwork` declares for that link.

Falsifier (small, deterministic, red on revert): a node made busy for a long
segment while a timer falls due and a message arrives mid-segment must
execute neither before the segment ends, must execute them in causal order
afterwards, and a delivery must never appear at the receiver before the
sender's segment end plus link delay. A scheduler that merely stamps costs
onto a free-running event queue passes nothing in that list.

### Cost model: what the seed's window is made of

Per-segment weight is low everywhere except raft_apply and readiness; the
window is dominated by *volume* on three owners.

| owner | drives the rate | per-segment cost | what a mechanism can change |
| --- | --- | --- | --- |
| raft_protocol | groups with a replica on the seed x peers x heartbeat/append cadence | 14.5 us | the group count on the seed |
| rebalancer | planning passes and operation dispatch per membership or readiness event, inflated by re-entry | 111.4 us | passes per event; the re-entry bound |
| membership_publication | publication reconcile plus ready-node advance per node event | 56.9 us | events per node; batching |
| bootstrap | replica initialisation (135 replicas) | 40.9 us | the replica count created on the seed |
| raft_apply | committed entries applied on the seed | 317.8 us | where apply runs |

**The residual is preserved, not priced.** 3.50 % of the calibration window
is unattributed. The simulator carries it as an explicit uncertainty band on
every reported figure and invents no cost for it. A conclusion whose claimed
advantage falls inside that band is reported as not decision-grade, and the
report says so in those words rather than ranking on it.

### Sensitivity, not identity

The 0.5x-2x sweep over the per-segment costs is a **sensitivity test**, and
the acceptance rule differs by point:

- At 1.0x the baseline must reproduce the sealed quantitative signature.
- At every other point of every one-dimensional sweep, the run must preserve
  the relevant causal and failure classification, and preserve any mechanism
  conclusion the report claims. Identical wall-clock numbers are **not**
  required and must not be demanded of deliberately perturbed costs.

A sweep point that flips the classification is a finding about the model's
fragility, and it returns for review rather than being tuned away.

### Addressable owner surfaces, not promised savings

The share a mechanism *touches* is not the share it removes. Each mechanism
is described by the owner surface it can address and by what it costs back.

| mechanism | addressable surface | what it does not remove | what it adds |
| --- | --- | --- | --- |
| 1. early system-replica spread | raft_protocol volume from groups whose replicas sit on the seed, the seed's raft_apply, the seed's share of publication reconciles | at RF=3 the seed normally retains a replica of each group and may retain leadership, so the bucket is reduced, never emptied | earlier rebalancer operations and their planning passes |
| 2. formation-time admission control with a deadline | only the fraction of rebalancer and publication work demonstrated to arise from admission and re-entry amplification | planning and publication driven by joins themselves | deadline bookkeeping; deferred user-table work returning later |
| 3. system-partition apply on the replica-worker pool | raft_apply loop occupancy on the seed (5.2 % at 317.8 us per segment) | the apply work itself, which still executes | worker_dispatch and worker-side execution, currently uncalibrated (see the vocabulary section) |

Scenario 1 is the observed cold boot: 45 system tables, 135 replicas on the
seed, four joins. It must reproduce the sealed signature predicate at 1.0x
with the measured costs, then hold its classification across the sweep.

### Scenario 2: re-entry recurrence and lineage

Scenario 2 drives reconcile -> unpublished -> pending -> reconcile across
operations under formation load and reports recurrence and rate.

Generations of the same logical work are correlated through **observation
emitted by the operation-workflow owner**, which is the owner that already
decides them. A fresh operation ID must not erase lineage. Where the existing
observations are insufficient, add diagnostic metadata only, and only these:
the logical intent or work key, the rearmed-from or parent operation, and the
rearm reason. The simulator must not infer planner semantics, reconstruct
lineage by heuristic matching, or decide what counts as the same work.

Scenario 2's number is what settles the ordering below. It is not a fix and
decides nothing about the bound in `seed-formation-decoupling` by itself.

### Ranked mechanisms: 1 fixed, 2 versus 3 provisional

1. **Early spread of system-table replicas**, once three nodes are joined and
   before user-table admission opens. It attacks the rate of the top owner:
   raft_protocol volume scales with the groups whose replicas sit on the
   seed, and during formation every one of the 135 does. **Fixed as the first
   mechanism.** The simulator must also show the rebalancer's own bucket does
   not grow past what the spread removes.
2. **Formation-time admission control with an explicit deadline**, bounding
   rebalancer and publication rates by deferring user-table admission and
   planning fan-out until the ready leases complete.
3. **System-partition Raft apply on the replica-worker pool**, moving the
   heaviest segment off the seed loop.

**The order of 2 and 3 is provisional and scenario 2 decides it.** If the
re-entry measurement shows materially recurring logical rearm or admission
amplification, mechanism 2 goes next, because it bounds exactly that work
with a deadline rather than a re-plan. If amplification is negligible,
mechanism 3 may move ahead of it, subject to its candidate worker cost being
justified first. 1-2-3 stands as the current hypothesis and is labelled
provisional wherever it is quoted.

Turn *rates* before per-segment weight in every case: the three owners that
matter carry 14.5-111 us segments, and halving a rate is worth more than any
constant-factor trim.

### What must be true before `formation-sim` is sealed

- `formation-harness-model-from-contracts` landed (the harness model is
  derived, not hand-maintained).
- The two handoff-path ambient-time reads take the owning `timeSource`,
  landed with revert-red witnesses. This is a **seam repair only**: it
  changes no formation behaviour and is not a `seed-formation-decoupling`
  fix attempt. Deterministic simulation is not valid until it lands.
- The calibration table is the one committed here; a re-run is not
  authorised and is not needed for this model.
- The probe stays `formation-sim-reproduces.js`: exit 0 when the signature
  reproduces on `main` and two runs hash identical, under 60 s.
- The quest statement carries the amendments in this section, including the
  observed-inactive owner rule, the `dispatchCount + handoffCount` charging
  unit, the causality invariant and its falsifier, the residual band, the
  sensitivity semantics, and the provisional 2-versus-3 ordering.

### Acceptance order

`formation-sim-reproduces.js` accepts in this order, and each step gates the
next:

1. baseline deterministic reproduction of the sealed signature at 1.0x;
2. identical-run hash across two runs;
3. sensitivity across the 0.5x-2x sweep, classification preserved;
4. re-entry recurrence measurement (scenario 2);
5. mechanism-1 counterfactual.

No production fix starts until those results exist.

### Guard: a failed baseline is evidence, not a tuning task

If the fixed-mean-per-owner model cannot reproduce the baseline signature, do
**not** tune coefficients to make it pass, and do not add simulator logic to
close the gap. Treat the failure as evidence that an owner mean alone is
insufficient - most likely owner-internal workload composition or burst shape
- record what diverged, and return for review.
