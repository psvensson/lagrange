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
  - test/shards
---

# Transport-independent cluster networking

**Planning epic — research and owner proposal, 2026-10-17. NOT IMPLEMENTED OR CERTIFIED.**

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

## Current state — measured N0 slice, not terminal certification

- The N0 test-only observation fixture has been **implemented and measured**
  on two physical lab machines, `lenovo-laptop` and `tv-dator`, at the
  exact same source SHA `ed63060f0ed781be35cd12fe9a12fe9b390785d7`.
  Both were **COMPLETE PASS (5/5 tests)** with source placement confirmed.
- [N0 exact-head measurement report](transport-independent-cluster-networking/n0-baseline-2026-10-17.md)
  preserves source/base identity, the first red and diagnostic evidence,
  numeric native heartbeat/election observations, the corrected steady-state
  Append witness, two green lab receipts and outstanding acceptance gaps.
- The three Raft voters ran within one host per lab execution; **no
  multi-host network packet trace** or 100-node bandwidth proof exists yet.
  Native outgoing envelope byte counts do not measure physical wire traffic.
- Source changes consist solely of this bounded test, the two generated test
  classifications, and planning/evidence documentation. **No production
  Raft, networking, timeouts, placement or controller configuration changed.**
- The original `main`-derived N0 planning branch was refused by the lab's
  dependency-lock guard; a distinct lab-aligned proof branch based on a
  previously lab-tested rs-raft source SHA was used instead. This is not a
  merge-approved rs-raft baseline. The branches remain unmerged.
- An independently sealed N0 Quest and the declared `doneWhen` projector are
  **not implemented or certified**. N0 still needs a real physical network
  boundary and telemetry provenance before advancing to transport-integration
  frontiers. Nothing here certifies NATS-only or Veilid-only operation.
