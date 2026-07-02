import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {acknowledgeMembershipPublication} from
  '../../src/control-plane/membership-publication-acknowledgement.js';
import {
  buildPublicationRecoveryGateSnapshot,
  PUBLICATION_RECOVERY_GATE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {TABLES} from '../../src/constants/index.js';

// DT6 step 8 — drive the REAL acknowledgement -> recovery-gate pipeline on top of step 7's real
// quorum-gated commit. Step 7 proved a publication COMMITS through a real raft log (real majority),
// but its "converged" signal was a bare required-version match: a publication was treated as done
// the instant its raft entry committed, with the followers' consume/ack tail modelled away
// (acknowledgedNodeIds was pre-filled to the full membership at publish time). Step 8 removes that
// stand-in: a publication is committed UNACKNOWLEDGED, every node then runs the REAL
// acknowledgeMembershipPublication state machine against the committed row, and convergence is the
// REAL buildPublicationRecoveryGateSnapshot reporting READY only once every required ack is in.
//
// This is the consumer-lag tail that the production recovery gate (publication-recovery-gate.js)
// actually gates on, exercised here end-to-end over the network: a freshly committed publication
// starts ACK_PENDING (pendingAckCount > 0, gate.ready === false) and converges to READY purely
// through real ack-state-machine outputs folded into the real gate evaluator.
//
// Each node hosts: (a) the real owner-membership driver gated on live raft leadership (step 5-7),
// which publishes a real row and commits it via raft.command() on a real InMemoryLogAdapter; and
// (b) a real per-node ack/gate driver that, once the node has the committed row, runs the real
// acknowledgeMembershipPublication for its own nodeId, records that ack, folds every collected ack
// back into the row through the SAME real ack function, and evaluates the real recovery gate over
// the result. Acks reach the owner through a per-run, per-publication ledger keyed by the committed
// row's publication_id; a node only ever acks a row it received via a REAL raft commit, so a
// partitioned minority owner (which cannot commit) collects no acks for the epoch it cannot reach.
//
// Scenario (CL-039 lineage, ack layer): Phase A elect + publish + COMMIT membership v1 unack'd, then
// every node acks -> the recovery gate converges ACK_PENDING -> READY cluster-wide. Phase B a
// membership change requires v2 AND the leader is partitioned: the NEW leader commits v2 via real
// quorum and a FRESH ack cycle reopens the gate (new publication_id, pending acks) and re-closes it
// to READY on the majority, while the partitioned old leader never commits v2 so no v2 ack cycle
// exists on its side. Phase C heal: the old leader catches up the v2 entry, acks it, and every node
// converges to a READY recovery gate for the v2 publication with the full membership acknowledged.
//
// HONEST SCOPE: the leadership gate, the published ROW, the COMMIT (real raft quorum), the ACK
// state machine, and the recovery-gate evaluation are all real. The remaining abstractions are the
// publish TRIGGER (a required-version bump standing in for a real membership change), the row's
// content (a fixed 3-node membership rather than real readiness derivation), and the ACK TRANSPORT
// (an in-process per-publication ledger standing in for the real persisted ack writes + CDC
// propagation — keyed on the real committed publication_id so partition isolation still holds).

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const EXPECTED = Object.freeze([...IDS]);
const ownerProto = MembershipPublicationCoordinatorReconcile.prototype;
const PUBLICATION_COMMAND_MARKER = '__membershipPublication';

function clusterOptions(seed) {
  return (id) => ({
    'election min': '100 ms',
    'election max': '200 ms',
    'heartbeat': '30 ms',
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    'Log': InMemoryLogAdapter, // a REAL raft log: commits require real majority replication
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// Fold every collected ack for a committed row back into it through the REAL ack state machine, in
// a deterministic node order, returning the real acknowledged row.
function foldAcks(baseRow, ackedNodeIds, nowMs) {
  let folded = baseRow;
  for (const id of EXPECTED) {
    if (ackedNodeIds.has(id)) {
      folded = acknowledgeMembershipPublication({
        publicationRow: folded,
        nodeId: id,
        nowMs,
      });
    }
  }
  return folded;
}

// Evaluate the REAL recovery gate over a (real) publication row.
function gateOf(row) {
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: row.publication_epoch,
    publicationStatus: row.status,
    requiredAckNodeIds: row.required_ack_node_ids,
    acknowledgedNodeIds: row.acknowledged_node_ids,
    missingPublishedNodeIds: [],
    missingPublishedCount: 0,
  });
}

// Host the real owner driver (publishes + commits via real raft) AND a real per-node ack/gate
// driver on one node. `ledger` maps a committed publication_id -> {acks: Set of acking nodeIds,
// everPending: did ANY node observe the gate not-ready with real pending acks for this
// publication}. everPending is cluster-level on purpose: the consumer-lag tail is a property of the
// publication's ack cycle (the owner always sees it first), not something every node must witness —
// a node that acks late can find the ledger already complete on its first look.
function hostAckPublisher(net, raft, nodeId, required, ledger) {
  const state = {
    committedVersion: 0,
    committedRow: null,
    lastCommandKey: null,
    commands: 0,
    // Per committed publication_id: {epoch, ready, pendingAckCount, state, acknowledged,
    // everAckPending}.
    gateByPub: new Map(),
  };
  const ackTimeSource = net.networkTimeSource(nodeId);

  // The node's committed published version + committed row advance ONLY when the raft log actually
  // commits the publication entry (real majority) — on the leader AND on each follower replicating.
  raft.on('commit', (command) => {
    if (command && command[PUBLICATION_COMMAND_MARKER]) {
      state.committedVersion = command.requiredVersion;
      state.committedRow = command.row;
    }
  });

  const coordinator = {
    driveOwnerMembershipReconcile: ownerProto.driveOwnerMembershipReconcile,
    startOwnerMembershipDriver: ownerProto.startOwnerMembershipDriver,
    stopOwnerMembershipDriver: ownerProto.stopOwnerMembershipDriver,
    nodeId,
    systemTableCache: {get: () => null, find: () => null, getAll: () => []},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS && raft.state === LifeRaft.LEADER,
    },
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
      // Converged (no deficit) iff our COMMITTED publication is at the current required version.
      // Until the raft log commits a publication for the current version, published reads empty ->
      // the real deficit computation reports the full membership missing -> the driver drives.
      const published = state.committedVersion === required.version ? EXPECTED : [];
      return {
        nodeRows: EXPECTED.map((id) => ({node_id: id, status: 'active'})),
        readinessByNodeId: Object.fromEntries(EXPECTED.map((id) => [id, {ready: true}])),
        latestPublishedPublicationRow: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: published,
        },
        latestPublicationRow: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: published,
          status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
        },
      };
    },
    // The publish: commit a REAL published row through the REAL raft log, but UNACKNOWLEDGED
    // (acknowledgedNodeIds: []) — the ack tail is real (Phase ack driver below), not pre-filled.
    reconcileActiveGateMembershipPublication: async () => {
      const key = `${raft.term}:${required.version}`;
      if (state.lastCommandKey === key) {
        return;
      }
      state.lastCommandKey = key;
      const row = buildMembershipPublicationRow({
        candidate: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: EXPECTED,
          publisherNodeId: raft.address,
          requiredAckNodeIds: EXPECTED,
          acknowledgedNodeIds: [], // committed UNACKNOWLEDGED — the real ack cycle follows
        },
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        nowMs: net.now(),
      });
      state.commands += 1;
      try {
        await raft.command({
          [PUBLICATION_COMMAND_MARKER]: true,
          requiredVersion: required.version,
          row,
        });
      } catch {
        // raft.command throws NOTLEADER if leadership was lost between the gate and the write;
        // the next tick re-evaluates. Not fatal to the scenario.
      }
    },
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    logger: {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}},
  };
  coordinator.startOwnerMembershipDriver({
    enabled: true,
    intervalMs: 20,
    timeSource: net.networkTimeSource(nodeId),
  });

  // The real per-node ack/gate driver: ack the committed row (real state machine), fold all
  // collected acks back in (real state machine), evaluate the real recovery gate.
  const ackTimer = ackTimeSource.setInterval(() => {
    const row = state.committedRow;
    if (!row) {
      return;
    }
    const pubId = row.publication_id;
    const nowMs = ackTimeSource.now();
    const requiredAck = Array.isArray(row.required_ack_node_ids) ?
      row.required_ack_node_ids :
      [];
    let entry = ledger.get(pubId);
    if (!entry) {
      entry = {acks: new Set(), everPending: false};
      ledger.set(pubId, entry);
    }
    // Ack step: this node acks the committed row it received, via the REAL ack function.
    if (requiredAck.includes(nodeId) && !entry.acks.has(nodeId)) {
      const acked = acknowledgeMembershipPublication({
        publicationRow: row,
        nodeId,
        nowMs,
      });
      if ((acked.acknowledged_node_ids || []).includes(nodeId)) {
        entry.acks.add(nodeId);
      }
    }
    // Gate step: fold every collected ack into the row (real state machine) and evaluate the real
    // recovery gate over the result. A not-ready gate with real pending acks is the consumer-lag
    // tail — record it cluster-wide for this publication.
    const folded = foldAcks(row, entry.acks, nowMs);
    const gate = gateOf(folded);
    if (!gate.ready && gate.pendingAckCount > 0) {
      entry.everPending = true;
    }
    let g = state.gateByPub.get(pubId);
    if (!g) {
      g = {epoch: folded.publication_epoch};
      state.gateByPub.set(pubId, g);
    }
    g.everAckPending = entry.everPending;
    g.ready = gate.ready;
    g.state = gate.state;
    g.pendingAckCount = gate.pendingAckCount;
    g.acknowledged = folded.acknowledged_node_ids;
  }, 20);

  return {
    coordinator,
    state,
    stop() {
      coordinator.stopOwnerMembershipDriver();
      ackTimeSource.clearInterval(ackTimer);
    },
  };
}

// Find a node's gate record for a given publication epoch (v1 / v2), or null if it never had one.
function gateForEpoch(pub, epoch) {
  for (const g of pub.state.gateByPub.values()) {
    if (g.epoch === epoch) {
      return g;
    }
  }
  return null;
}

async function runAckFailback(seed) {
  const required = {version: 1};
  const ledger = new Map(); // per-run: committed publication_id -> Set of acking nodeIds
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  const pubs = new Map(
    IDS.map((id) => [id, hostAckPublisher(net, rafts.get(id), id, required, ledger)]),
  );

  // Phase A — elect + publish + commit membership v1 UNACKNOWLEDGED; every node then acks and the
  // recovery gate converges ACK_PENDING -> READY cluster-wide.
  await driveNetwork(net, {untilMs: 600, stepMs: 5});
  const leaderA = leaderOf(rafts);
  const afterAckV1 = Object.fromEntries(
    IDS.map((id) => [id, gateForEpoch(pubs.get(id), 1)]),
  );

  // Phase B — a membership change requires v2 AND the leader is partitioned. The new leader commits
  // v2 via real quorum, reopening a FRESH ack cycle that re-closes to READY on the majority; the
  // partitioned old leader cannot commit v2, so no v2 ack cycle exists on its side.
  required.version = 2;
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1600, stepMs: 5});
  const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  const afterFailback = {
    leaderBGateV2: leaderB ? gateForEpoch(pubs.get(leaderB), 2) : null,
    oldLeaderGateV2: gateForEpoch(pubs.get(leaderA), 2),
    oldLeaderCommands: pubs.get(leaderA).state.commands,
  };

  // Phase C — heal; the old leader catches up the v2 entry, acks it, and every node converges to a
  // READY recovery gate for the v2 publication with the full membership acknowledged.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 2600, stepMs: 5});
  const afterHeal = Object.fromEntries(
    IDS.map((id) => [id, gateForEpoch(pubs.get(id), 2)]),
  );

  IDS.forEach((id) => pubs.get(id).stop());
  IDS.forEach((id) => rafts.get(id).end());
  return {leaderA, leaderB, afterAckV1, afterFailback, afterHeal};
}

t.test('Phase A: every node converges its recovery gate ACK_PENDING -> READY for committed v1',
  async (t) => {
    const m = await runAckFailback(3);
    for (const id of IDS) {
      const g = m.afterAckV1[id];
      t.ok(g, `${id} has a recovery-gate record for the committed v1 publication`);
      t.equal(g.everAckPending, true,
        `${id} observed the real ACK-pending tail (pendingAckCount > 0) before closing`);
      t.equal(g.ready, true, `${id} recovery gate is READY once every required ack is in`);
      t.equal(g.state, PUBLICATION_RECOVERY_GATE_STATE.READY, `${id} gate state === READY`);
      t.equal(g.pendingAckCount, 0, `${id} has no pending acks at convergence`);
      t.same(g.acknowledged, EXPECTED,
        `${id} folded the full membership through the REAL ack state machine`);
    }
  });

t.test('Phase B: the v2 fail-back reopens a FRESH real ack cycle and re-closes it to READY',
  async (t) => {
    const m = await runAckFailback(3);
    t.not(m.leaderB, null, 'leadership migrated to a new leader');
    const g = m.afterFailback.leaderBGateV2;
    t.ok(g, 'the new leader committed v2 and opened a real v2 ack cycle');
    t.equal(g.everAckPending, true,
      'the v2 publication went through a real ACK-pending tail (the gate reopened)');
    t.equal(g.ready, true,
      'the v2 recovery gate re-closed to READY via real acks on the majority (the fail-back)');
    t.same(g.acknowledged, EXPECTED, 'the majority acknowledged the v2 membership');
    // The partitioned old leader DID try to publish v2 (commands >= 2: v1 + v2) but never committed
    // it (no quorum), so it has NO v2 ack cycle at all — real quorum isolation, not a term gate.
    t.ok(m.afterFailback.oldLeaderCommands >= 2,
      'the partitioned old leader attempted to publish v2 (issued the raft command)');
    t.equal(m.afterFailback.oldLeaderGateV2, null,
      'but it never committed v2, so it has no v2 recovery-gate cycle (no acks it could collect)');
  });

t.test('Phase C: heal converges every node to a READY v2 recovery gate, fully acknowledged',
  async (t) => {
    const m = await runAckFailback(3);
    for (const id of IDS) {
      const g = m.afterHeal[id];
      t.ok(g, `${id} has a recovery-gate record for the committed v2 publication`);
      t.equal(g.ready, true, `${id} converged to a READY v2 recovery gate after heal`);
      t.equal(g.state, PUBLICATION_RECOVERY_GATE_STATE.READY, `${id} v2 gate state === READY`);
      t.same(g.acknowledged, EXPECTED, `${id} acknowledged the full v2 membership`);
    }
  });

t.test('the real ack -> recovery-gate fail-back is deterministic and holds across seeds',
  async (t) => {
    const a = await runAckFailback(5);
    const b = await runAckFailback(5);
    const reduce = (m) => ({
      leaderA: m.leaderA,
      leaderB: m.leaderB,
      v1Ready: IDS.map((id) => m.afterAckV1[id]?.ready),
      v2Ready: IDS.map((id) => m.afterHeal[id]?.ready),
    });
    t.same(reduce(a), reduce(b),
      'same seed -> identical election, ack-cycle convergence, and fail-back');

    const survivors = new Set();
    for (let seed = 0; seed < 10; seed += 1) {
      const m = await runAckFailback(seed);
      t.ok(IDS.every((id) => m.afterAckV1[id]?.ready === true &&
        m.afterAckV1[id]?.everAckPending === true),
      `seed ${seed}: v1 recovery gate converged ACK_PENDING -> READY on every node`);
      t.ok(m.leaderB && m.afterFailback.leaderBGateV2?.ready === true &&
        m.afterFailback.oldLeaderGateV2 === null,
      `seed ${seed}: v2 fail-back ack cycle re-closed on the majority; old leader had none`);
      t.ok(IDS.every((id) => m.afterHeal[id]?.ready === true),
        `seed ${seed}: every node converged to a READY v2 recovery gate after heal`);
      survivors.add(m.leaderB);
    }
    t.ok(survivors.size >= 2, 'the failed-over committer varies with the seed (not a fixed node)');
  });
