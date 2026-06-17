import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  buildPublicationRecoveryGateSnapshot,
  PUBLICATION_RECOVERY_GATE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';

// DT6 item 2 — drive the REAL publication PERSIST + ACK pipeline on the virtual clock, replacing
// step 8's in-process ack-ledger stand-in. Step 8 stored acks in a bespoke Map and called the ack
// state machine directly; this guard routes publish + ack through the real persist coordinator:
//
//  - persistPublicationRow (membership-publication-coordinator-persist.js) — the real persist
//    orchestration: serialize -> owner.getPublication read-back -> mergePublicationRows ->
//    owner.upsertPublication -> verify via publicationRowSatisfiesDesiredState.
//  - acknowledgePublication (same file) — the real ack round-trip: getPublication ->
//    mergePublicationRows -> acknowledgeMembershipPublication (the real ack state machine) ->
//    re-persist if the ack changed the row.
//
// Only the durable boundary is stubbed: an in-memory controlPlanePublicationsOwner (a Map keyed by
// publication_id) standing in for the owner -> CDC -> SQL/raft system-table write, and an inline
// acknowledgement lane (no contention in a deterministic single-owner run). buildMembershipPublicationRow,
// serializeMembershipPublicationRow, mergePublicationRows, the ack state machine, and the recovery
// gate are all real production code.
//
// An owner tick on the network TimeSource: first tick publishes membership v1 UNACKNOWLEDGED through
// the real persist path; subsequent ticks acknowledge one required node at a time through the real
// acknowledgePublication path; each tick evaluates the real recovery gate over the *persisted* row.
// The gate converges ACK_PENDING -> READY as the real persisted acknowledged set fills, on the
// virtual clock, deterministically.
//
// HONEST SCOPE: the persist orchestration + ack state machine + recovery gate are real; the durable
// store (owner upsert -> CDC -> SQL/raft replication) is the in-memory boundary. The real
// quorum-replicated commit of the publication row is covered separately (step 7/8 via raft.command);
// this item covers the row PERSIST + ACK convergence pipeline.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const EXPECTED = Object.freeze([...IDS]);
const reconcileProto = MembershipPublicationCoordinatorReconcile.prototype;
const START_MS = 1_000_000;
const INTERVAL_MS = 20;

// Host the real persist coordinator on one network node with an in-memory owner store.
function hostPersistPipeline(net, nodeId) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const store = new Map(); // publication_id -> persisted row (the durable boundary)
  const coordinator = {
    now: () => ts.now(),
    buildOwnerKey: () => 'membership-owner',
    persistPublicationRow: reconcileProto.persistPublicationRow,
    acknowledgePublication: reconcileProto.acknowledgePublication,
    controlPlanePublicationsOwner: {
      upsertPublication: async (row) => {
        store.set(row.publication_id, {...row});
      },
      getPublication: async (publicationId) => {
        const row = store.get(publicationId);
        return row ? {...row} : null;
      },
    },
    publicationAcknowledgementLane: {run: async (_opts, fn) => fn()},
  };

  const state = {pubId: null, inFlight: false, gateSamples: []};

  async function tick() {
    if (state.inFlight) {
      return;
    }
    state.inFlight = true;
    try {
      if (!state.pubId) {
        // Publish v1 UNACKNOWLEDGED through the real persist orchestration.
        const row = buildMembershipPublicationRow({
          candidate: {
            publicationEpoch: 1,
            publishedActiveNodeIds: EXPECTED,
            publisherNodeId: nodeId,
            requiredAckNodeIds: EXPECTED,
            acknowledgedNodeIds: [],
          },
          // Seed OPEN so the transition to PUBLISHED is genuinely driven by the real ack state
          // machine reaching the full acked set (OPEN -> ACK_PENDING -> PUBLISHED), not seeded.
          status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
          nowMs: ts.now(),
        });
        const persisted = await coordinator.persistPublicationRow(row, {
          skipPublicationWriteReadback: false,
        });
        state.pubId = persisted.publication_id;
      } else {
        // Acknowledge the next still-pending required node through the real ack round-trip.
        const current = store.get(state.pubId);
        const acked = current?.acknowledged_node_ids || [];
        const next = EXPECTED.find((id) => !acked.includes(id));
        if (next) {
          await coordinator.acknowledgePublication(state.pubId, next);
        }
      }
      const row = store.get(state.pubId);
      if (row) {
        const gate = buildPublicationRecoveryGateSnapshot({
          publicationEpoch: row.publication_epoch,
          publicationStatus: row.status,
          requiredAckNodeIds: row.required_ack_node_ids,
          acknowledgedNodeIds: row.acknowledged_node_ids,
          missingPublishedNodeIds: [],
          missingPublishedCount: 0,
        });
        state.gateSamples.push({
          now: ts.now(),
          ready: gate.ready,
          state: gate.state,
          pendingAckCount: gate.pendingAckCount,
          acknowledged: [...(row.acknowledged_node_ids || [])],
        });
      }
    } finally {
      state.inFlight = false;
    }
  }

  const timer = ts.setInterval(() => {
    tick().catch(() => {});
  }, INTERVAL_MS);
  return {state, store, stop: () => ts.clearInterval(timer)};
}

async function runPersistPipeline() {
  const net = createVirtualNetwork({startMs: START_MS});
  const owner = hostPersistPipeline(net, 'OWNER');
  await driveNetwork(net, {untilMs: START_MS + 400, stepMs: 5});
  owner.stop();
  const finalRow = owner.store.get(owner.state.pubId) || null;
  return {samples: owner.state.gateSamples, finalRow};
}

t.test('publish + ack converge through the REAL persist coordinator to a fully-acked PUBLISHED row',
  async (t) => {
    const m = await runPersistPipeline();
    t.ok(m.finalRow, 'a publication row was persisted through the real persistPublicationRow path');
    t.same(m.finalRow.acknowledged_node_ids, EXPECTED,
      'every required node acknowledged through the real acknowledgePublication round-trip');
    t.equal(m.finalRow.status, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      'the real ack state machine drove the persisted row OPEN -> PUBLISHED once all acks landed');
  });

t.test('the real recovery gate converges ACK_PENDING -> READY over the persisted row', async (t) => {
  const m = await runPersistPipeline();
  t.ok(m.samples.some((s) => !s.ready && s.pendingAckCount > 0),
    'the gate was ACK-pending while the real persisted acknowledged set was incomplete');
  const last = m.samples[m.samples.length - 1];
  t.equal(last.ready, true, 'the gate is READY once the real persisted row is fully acknowledged');
  t.equal(last.state, PUBLICATION_RECOVERY_GATE_STATE.READY, 'final gate state === READY');
  t.same(last.acknowledged, EXPECTED, 'the READY gate reflects the real fully-acked persisted row');
});

t.test('the persist+ack pipeline is deterministic across runs', async (t) => {
  const a = await runPersistPipeline();
  const b = await runPersistPipeline();
  t.same(
    {acked: a.finalRow.acknowledged_node_ids, status: a.finalRow.status,
      readyAt: a.samples.find((s) => s.ready)?.now},
    {acked: b.finalRow.acknowledged_node_ids, status: b.finalRow.status,
      readyAt: b.samples.find((s) => s.ready)?.now},
    'identical virtual drive -> identical persisted convergence',
  );
});
