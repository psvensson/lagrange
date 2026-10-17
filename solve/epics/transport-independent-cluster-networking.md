---
id: transport-independent-cluster-networking
status: open
proof: certification
roadmapRow: null
graduatesTo: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/standalone-transport-certification.js --metric
quests: []
authorizes:
  - solve/epics/transport-independent-cluster-networking
  - test/raft/raft-rs-backend/n0-raft-timing-measurement.test.js
  - test/raft/raft-rs-backend/n0-multigroup-sender-only.test.js
  - test/transport/n0-router-socket-baseline.test.js
  - test/raft/raft-rs-backend/n0-connected-pump-attribution.test.js
  - test/distributed/harness/__tests__/n0-physical-network-baseline.test.js
  - test/distributed/scenarios/n0-physical-network-baseline.js
  - test/shards
---

# Transport-independent cluster networking

**Open research epic. N0 test-only instrumentation measured on lab hardware; transport-neutral production networking is NOT implemented or certified.**

The detailed, preserved research, decisions, implementation boundaries, and falsifiers are in
[research-and-plan.md](transport-independent-cluster-networking/research-and-plan.md).
This epic is the authoritative planning home for future NATS, Veilid and optional gRPC
node transports, including transport-aware Raft timing. Do not scatter separate
timing, Veilid, endpoint, retry, or transport fallback decisions across unrelated
epics.

## Operator decisions

1. **Standalone is mandatory.** Each supported node-to-node transport must independently
   carry the entire Lagrange cluster: cold formation/seed contact, membership and
   lifecycle, Raft, distributed queries and services, CDC, snapshots/bulk transfer,
   replica recovery, split/merge, rolling restart, replacement, and seed loss.
   In particular, a **Veilid-only** cluster must not depend on direct WebSockets,
   NATS, gRPC or another inter-node Lagrange networking path for any phase.
2. **NATS first, Veilid second.** Use NATS-only to prove the transport abstraction,
   then validate Veilid-only, including large messages and bandwidth/latency.
3. Multiple transports are optional optimization, never a prerequisite for operation.
   Do not let endpoint fallback mask a standalone backend's failed proof.
4. gRPC is a possible independent node transport, but its strongest near-term
   candidate is SDK/OCI ingress. External gRPC is a separately owned ingress
   concern and cannot define internal routing or authorization semantics.
5. The `ctx.call`, SQL, and runtime APIs do not expose the node networking mechanism.
   Compute still moves to the data; routing/replication authority stays with
   the existing owners.
6. **Do not merge or implement across the unfinished rs-raft certification.**
   This plan lives on its own branch until the rs-raft owner approves an exact
   stable integration baseline. No parallel edits to the current rs-raft lane.

"Veilid-only" describes **Lagrange inter-node communication**. Veilid itself uses
ordinary physical IP transports under its overlay. Local in-process operations
and separately authorized external client ingress are not covert inter-node
fallbacks, but must not be used to carry remote cluster messages.

## Architectural boundary

`MessageRouter` stays the sole owner of normalized delivery, correlation,
outbound admission/pressure, ACK meaning, retry/deadline outcomes and incoming
peer identity/admission decisions. One narrow physical **peer-link** contract
provides framing, send acceptance, inbound frames, link availability/pressure,
max frame size and close/cancellation. No adapter has application-level ACK,
Raft quorum, membership, placement, transaction or retry authority.

Reuse/reconcile `TransportProvider`, `TransportRegistry`, and the
`node_endpoints` schema rather than introducing a second registry or router.
The obsolete registry delivery path was intentionally removed; do not
resurrect it as an independent semantic route. Endpoint currentness and
boot-incarnation fencing are consumed from the existing control-plane owners.
Route/transport choice is not readiness, leader, or placement authorization.

**Bulk is mandatory for standalone operation.** A backend incapable of framing
an entire Raft Append or snapshot in one message must have a bounded,
cancelable, prioritized fragmentation/transfer implementation on **that
backend alone**. Do not silently use the current second WebSocket lane in
NATS-only/Veilid-only mode.

## Raft timing owner interaction

The transport measures physical delivery and pressure; a single Raft timing
policy owner derives allowed settings from agreed group topology, measured
latency, and explicit operator bounds. Each consensus group consumes the
published/validated timing contract. The adapter never changes Raft election
or heartbeat timers and the placement planner does not rederive Raft policy.

**Known current defect/gap:** the live `configureTiming` handler in
`src/raft/raft-rs-runtime-owner.js` changes stored timing metadata without
reconfiguring its already-created core's heartbeat and election tick
counts. A live timer interval update can change wall-time cadence, but
updating the heartbeat/election configuration values alone does not
constitute proof of live rs-raft reconfiguration. The configured election
maximum is not currently translated into the core's min/max election tick
range. No adaptive-timing readiness claim until this is falsified or fixed
against on-wire and election evidence.

Static, validated profiles for whole-cluster standalone operation come first;
per-group adaptive timing is a subsequent, explicitly gated capability.
Increasing election windows trades recovery time for stability, not safety,
and does not extend `ctx.call`, transaction or caller deadlines.

## Ordered frontiers (planned, not sealed Quests)

| Frontier | Scope | Must demonstrate before advancing |
| --- | --- | --- |
| N0: audit and instrumentation | Freeze rs-raft baseline; separate advertised timing, actual ticks and on-wire messages; record link size/latency distributions | Exact, independently reviewable timing and traffic baseline; no production behavior change |
| N1: one peer-link authority | Factor physical WebSocket/in-process operations below `MessageRouter`; retain service/ACK/queue semantics and bulk isolation | Existing all-WebSocket and in-process cluster tests unchanged; no semantic second path |
| N2: NATS standalone | Core NATS adapter, explicit bootstrap, endpoint publication, identity, bounded bulk and delivery outcomes | NATS-only cluster forms and recovers with all direct node WebSocket ports disabled; broker-loss evidence |
| N3: timing correctness and static profiles | Correct rs-raft creation/timing semantics; validate static LAN/broker/overlay profiles and cross-owner deadlines | Measured actual heartbeat/election behavior matches selected settings; safe restart and failure tests |
| N4: Veilid standalone | Private-route discovery/renewal, authorized peer frames, bounded fragment/bulk transfers, priority fairness, route failure handling | Veilid-only three-node, then larger cluster proofs; no non-Veilid inter-node fallback |
| N5: scale and adaptive timing | 10/30/100-node characterization; optional per-group profile selection, hysteresis, guarded transitions | Bandwidth, p99 tail, election stability, recovery and SLA are measured against frozen budgets |
| N6: optional multi-transport/gRPC | Only after standalone proofs | Mixed-network tests add value without changing semantics or becoming required |

NATS-only and Veilid-only each have **independent** red/green acceptance. A
hybrid passing while either standalone backend fails is not completion.

## Terminal acceptance intent

The `doneWhen` probe names a **planned, currently absent** read-only
certification projector. Its mere declaration is not a functioning test and
this epic is **not sealed**. Before implementation Quests are authored:

- build the projector over exact-SHA test receipts, without starting
  clusters or accessing the network when running as a probe;
- prove that it is initially red and that deleting or modifying one
  source-backed backend witness keeps it red;
- explicitly authorize bounded source/test scopes per Quest, and freeze
  meaningful measured budgets rather than guessing numbers;
- certify both independent transports with cold formation, normal
  replication/queries, CDC, bulk, restart/seed loss and recovery;
- include evidence that all alternative inter-node backends were disabled
  throughout each standalone run;
- reject any acknowledged-write loss, stale-incarnation admission,
  unbounded resource use, or unsafe membership/activation outcome;
- retain 100-node Veilid capacity and message-rate characterization as an
  explicit independent result, even if the supported scale envelope is
  smaller until proven.

Only completed, externally reviewed exact-candidate results permit
graduating the epic. Until then this file is a preserved research/planning
record, not an implementation ticket or permission to change production
semantics.

## Related owner programs

- `solve/epics/raft-rs-full-cutover.md`: consensus correctness and
  zero-legacy-backend certification; **predecessor**, not re-owned here.
- `src/transport/README.md`: active router, queue, response and bulk owners.
- `architecture/peer-address-resolution.md`: current single-WebSocket
  endpoint/bootstrap authority, to be generalized by an owned interaction.
- `src/config/raft-adaptive-timing-controller.js`: current load-driven,
  cluster configuration mechanism; do not add a competing timer controller.
- `docs/security.md`: current plain WebSocket node transport is not
  zero-trust hardened; node authentication is a separate acceptance gate.

## Current state — N0 instrumented and twice verified; live three-host gate open

- **Frozen five-file N0 test proof** at
  [`ff50557a77749c9a5f59fc4d3c95f7b3cd5e93f0`](https://github.com/psvensson/lagrange/commit/ff50557a77749c9a5f59fc4d3c95f7b3cd5e93f0):
  `lenovo-laptop` [#136](https://github.com/psvensson/lagrange-lab/issues/136)
  and `tv-dator` [#137](https://github.com/psvensson/lagrange-lab/issues/137)
  both report **COMPLETE PASS, 5 files, 14 cases, 0 failures** at the exact
  same SHA. The source contains three-voter native heartbeat/election/proposal
  timing, loopback WebSocket/TCP frame accounting, 1/8/16-group sender-only
  observation, connected Raft response-pump attribution, and six fail-closed
  contract tests for the physical-host network scenario.
- **Connected short-window latency is a measured finding, not a closed
  performance guarantee:** connected 1/8/16-group tests pass with a 1250 ms
  window on both physical machines [#123](https://github.com/psvensson/lagrange-lab/issues/123),
  [#124](https://github.com/psvensson/lagrange-lab/issues/124).
  At the original **750 ms** window, 16 groups still fail because a single
  shared synchronous response-delivery pump turn consumed **676.83 ms**
  (see the exact [#125](https://github.com/psvensson/lagrange-lab/issues/125)
  lab diagnostic). This is in-process fixture wall time, not measured network
  RTT or proof of production safety at 16 groups; treat it as an N3/N5
  latency and scaling falsifier, not grounds for arbitrary timeout extension.
- **Three-host scenario exists but has NOT been physically executed.**
  `test/distributed/scenarios/n0-physical-network-baseline.js`
  requires three independently identified real hosts in Docker host-network
  mode and reads source-backed, routed host-interface RX/TX counters after
  convergence. It explicitly includes unrelated host traffic and excludes
  per-peer RTT or Veilid relay claims. Its six-case preflight/negative-control
  test passes on both machines at the same SHA
  ([#133](https://github.com/psvensson/lagrange-lab/issues/133),
  [#135](https://github.com/psvensson/lagrange-lab/issues/135)).
- **Operator execution** is prepared in the
  [pinned N0 physical lab procedure](transport-independent-cluster-networking/n0-physical-lab-operator.md):
  a separate detached clone of the proven SHA, the existing
  `lab harness run n0-physical-network-baseline` owner, and three locally
  authorized Linux Docker hosts. The cloud bridge currently has no locally
  enabled N0 three-host profile; do not evade this with `test-files`,
  arbitrary SSH or a relabeled rolling-restart scenario.
- All evidence and negative runs are preserved in the
  [N0 evidence report](transport-independent-cluster-networking/n0-baseline-2026-10-17.md).
  All six N0 test/scenario source files on the planning branch are
  byte-identical to those at the exact lab-tested proof SHA.
  The **planning branch itself was not lab-executed**: it inherits a
  different `package-lock.json` and an older rs-raft runtime from
  `main`. Never transfer the green result to an untested new base.
- **Zero production source changes** and no merges, timer changes,
  secondary retry/transport owner, lab grant changes, or certification
  claims. The separate rs-raft cutover remains the prerequisite for
  integrating N0 into production.
- **N0 completion gate** remains open pending genuine three-host
  report/evidence, appropriate independent inspection, and the
  exact-accepted rs-raft baseline. The parent transport networking
  epic necessarily stays open through NATS-only and Veilid-only
  acceptance. The `doneWhen` projector above is still only a planned
  parent-epic gate, not an executable certification tool.
