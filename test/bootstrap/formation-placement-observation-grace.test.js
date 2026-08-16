/**
 * Formation-barrier placement-observation grace.
 *
 * The joiner barrier's authoritative placement read rides the owner-RPC
 * lane; during the post-REPLACE raft leadership transition that read goes
 * transiently unavailable, and the barrier REGRESSED to
 * waiting_for_ledger_observation, discarding already-settled spread
 * evidence — an effectively unbounded tail that held all joiners inside
 * the barrier past every window (archived runs 23-32-47 at T+105 and the
 * 90s-window profiled run 06-11-02, where all three stuck joiners carried
 * the signature). A transient read failure is evidence-absent, not
 * evidence of regression: the last COMPLETE observation is retained for a
 * bounded grace window; any fresh available read replaces it immediately.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningOperationLedgerFormationReadiness,
} from '../../src/bootstrap/node-joining-operation-ledger-formation-readiness.js';

const PARTITION_ID = 'replica_operations-p1';
const TARGET_REPLICAS = 3;

function serviceRow(nodeId, replicaId) {
  return {
    partition_id: PARTITION_ID,
    node_id: nodeId,
    replica_id: replicaId,
    service_type: 'partition',
    raft_role: 'follower',
    status: 'active',
    state: 'active',
  };
}

function buildHost({readResults, clock}) {
  let readIndex = 0;
  const host = Object.create(
    NodeJoiningOperationLedgerFormationReadiness.prototype,
  );
  host.now = () => clock.value;
  host.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getAuthoritativeControlPlaneView: () => ({
        canRead: () => true,
        readRows: async () => {
          const result = readResults[
            Math.min(readIndex, readResults.length - 1)];
          readIndex += 1;
          return result;
        },
      }),
    },
  };
  return host;
}

test('a transient authoritative-read failure retains the last complete ' +
  'placement observation within the grace window', async (t) => {
  const clock = {value: 1000};
  const completeRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n2', 'r2'),
    serviceRow('n3', 'r3'),
  ];
  const host = buildHost({
    clock,
    readResults: [
      {success: true, rows: completeRows, source: 'owner_rpc_lane'},
      {success: false, rows: []},
      {success: false, rows: []},
    ],
  });
  const first = await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  t.equal(first.complete, true, 'the settled read is complete');

  clock.value = 6000;
  const duringTransition =
    await host.getOperationLedgerFormationPlacementObservation(
      PARTITION_ID, TARGET_REPLICAS);
  t.equal(duringTransition.complete, true,
    'a transient read failure within the grace window keeps the settled ' +
      'observation instead of regressing the barrier');

  clock.value = 60000;
  const pastGrace =
    await host.getOperationLedgerFormationPlacementObservation(
      PARTITION_ID, TARGET_REPLICAS);
  t.equal(pastGrace.complete, false,
    'a read failure past the grace window honestly reports unavailable');
  t.end();
});

test('a fresh available read always replaces the retained observation', async (t) => {
  const clock = {value: 1000};
  const completeRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n2', 'r2'),
    serviceRow('n3', 'r3'),
  ];
  const concentratedRows = [
    serviceRow('n1', 'r1'),
    serviceRow('n1', 'r2'),
    serviceRow('n1', 'r3'),
  ];
  const host = buildHost({
    clock,
    readResults: [
      {success: true, rows: completeRows, source: 'owner_rpc_lane'},
      {success: true, rows: concentratedRows, source: 'owner_rpc_lane'},
    ],
  });
  await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  clock.value = 2000;
  const fresh = await host.getOperationLedgerFormationPlacementObservation(
    PARTITION_ID, TARGET_REPLICAS);
  t.equal(fresh.distinctNodeCount, 1,
    'a fresh available read wins over the retained observation');
  t.end();
});
