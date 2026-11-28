import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyUserTableLeaderPlacementCure} from '../../../src/rebalancer/user-table-leader-placement-cure.js';
import {assignReplicaHandlerLeaderHandoffMethods} from '../../../src/node/replica-handler-leader-handoff-methods.js';
import {createPartitionServiceLeadershipTransferMethods} from '../../../src/partition/partition-service-leadership-transfer.js';
import {TransferLeadershipDriver} from './transfer-leadership-driver.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

test('placement cure hands leadership directly to its lagging selected voter', async (t) => {
  const partitionId = 'orders-p2';
  const [source, selected, other] = ['orders-r1', 'orders-r2', 'orders-r3'];
  const ids = [source, selected, other];
  const driver = new TransferLeadershipDriver({partitionId, replicaIds: ids});
  t.after(() => driver.dispose());
  driver.form();
  driver.lagBehind(source, selected);
  assert.ok(driver.status(selected).appliedIndex < driver.status(other).appliedIndex);
  driver.heal(selected);
  driver.watchLeaderEvents(other);
  const transfers = [];
  const issuer = createPartitionServiceLeadershipTransferMethods();
  const services = new Map(ids.map((replicaId) => [replicaId, {partitionId, replicaId,
    raft: driver.port(replicaId),
    requestLeadershipTransfer(request, admit) {
      transfers.push({from: replicaId, successor: request.successor, to: request.replicaIdentity});
      return issuer.requestLeadershipTransfer.call(this, request, admit);
    }}]));
  // The predecessor uses the routed STEP_DOWN owner. Drive that real handler's
  // tracked-role decision too so the same file can discriminate both builds.
  class Handler {
    getTrackedService(id) {
      return services.get(id);
    }
    getTrackedReplicaRole(id) {
      return driver.status(id).role;
    }
  }
  assignReplicaHandlerLeaderHandoffMethods(Handler);
  const handler = new Handler();
  const rows = ['orders-p1', partitionId].map((id) => ({partition_id: id, table_id: 'orders',
    state: 'normal', leader_node_id: 'node-1', replica_count: 3}));
  const voters = rows.flatMap((row) => ids.map((id, i) => ({partition_id: row.partition_id,
    service_id: row.partition_id === partitionId ? id : row.partition_id + '-' + id,
    node_id: 'node-' + (i + 1), status: 'active', service_type: 'partition',
    raft_role: i === 0 ? 'leader' : 'follower'})));
  const routes = [];
  const byPartition = (id) => voters.filter((row) => row.partition_id === id);
  const placement = {entityId: partitionId, entityType: 'partition', nodeId: 'node-1',
    replicaId: source, isLeader: true, isStabilized: () => true,
    cdcIntegrationService: {partitionServicesProvider: () => services},
    logger: {info() {}, warn() {}}, getCurrentReplicas: () => byPartition(partitionId),
    systemTableCache: {get: (_, id) => rows.find((row) => row.partition_id === id),
      servicesForPartition: byPartition,
      filter: (table, predicate) => (table === 'partitions' ? rows : table === 'services' ? voters : []).filter(predicate)},
    messageRouter: {async deliver(address, request) {
      routes.push(address);
      const result = await handler.requestTrackedPartitionLeaderHandoff(request.replicaId,
        request.reason);
      driver.deliver();
      return {answer: {status: result.state, handoffBranch: result.branch}};
    }}};
  const before = driver.status(source).term;
  await applyUserTableLeaderPlacementCure(placement);
  const decision = await applyUserTableLeaderPlacementCure(placement);
  assert.equal(decision.target.replicaId, selected);
  driver.deliver();
  const elapsed = driver.roundsUntil(() => driver.leads(selected), driver.electionTick());
  const result = {transfers, routes, elapsed, otherLeaderEvents: driver.leaderEventCount(other),
    term: driver.status(selected).term};
  t.diagnostic(JSON.stringify(result));
  assert.deepEqual(transfers, [{from: source, successor: 'source-named', to: selected}]);
  assert.deepEqual(routes, []);
  assert.notEqual(elapsed, null);
  assert.equal(result.otherLeaderEvents, 0);
  assert.equal(result.term, before + 1);
  const command = {after: 'placement-transfer'};
  assert.equal(turnChainValue(driver.propose(selected, command)).outcome, 'CORE_OK');
  assert.ok(ids.every((id) => driver.applied(id, command)));
});
