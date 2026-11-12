// Native service composition. Cached rows below place WASM peers for transport;
// only the native configuration owns membership. No role events are injected.
import path from 'node:path';
import {createFixture} from './raft-rs-backend/startup-cleanup-native-fixture.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {WasmServiceReplica} from '../../src/wasm-service/wasm-service-replica.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';

const TYPES = {'partition': PartitionService, 'message-group': MessageGroupService,
  'wasm-service': WasmServiceReplica};

async function nativeServiceGroup(t, kind) {
  const fixture = await createFixture({after: (cleanup) => t.teardown(cleanup)});
  const groupId = `role-recovery-${kind}`;
  const ids = ['a', 'b', 'c'].map((suffix) => `${groupId}-${suffix}`);
  const nodeId = 'opening-refusal-node';
  const placements = Object.fromEntries(ids.map((id) => [id, nodeId]));
  const cache = new SystemTableCache();
  for (const id of ids) {
    cache.applySystemTableChange('services', 'INSERT', {
      service_id: id, replica_id: id, node_id: nodeId, service_type: kind,
      status: 'active', raft_role: 'follower'});
  }
  const services = ids.map((replicaId) => new TYPES[kind]({
    nodeId, replicaId, replicaIds: ids, partitionId: groupId, groupId,
    tableId: `${groupId}-table`, tableName: 'role_recovery_rows',
    serviceDefinitionId: groupId, dbPath: path.join(fixture.directory, `${replicaId}.db`),
    transport: fixture.router, timeSource: fixture.clock, deferElection: true,
    systemTableCache: cache, founderNodeIds: placements,
    bootstrapMembership: genesisStamp(ids, placements),
  }));
  fixture.services.push(...services);
  for (const service of services) {
    await service.initialize();
    if (kind === 'message-group') {
      fixture.router.register(service.unifiedAddress, (message) => service.receiveMessage(message));
    }
  }
  await turnChainValue(services[0].raft.campaign());
  // A fixed number of native delivery turns, not elapsed-time polling.
  for (let round = 0; round < 12; round++) {
    for (const service of services) service.raft.readStatus();
    await turnChainValue(services[0].raft.tick());
  }
  return {fixture, services};
}

async function nativeAuthorityPartition(t) {
  const fixture = await createFixture({after: (cleanup) => t.teardown(cleanup)});
  const replicaId = 'role-authority-partition';
  const nodeId = 'opening-refusal-node';
  const service = new PartitionService({nodeId, replicaId, replicaIds: [replicaId],
    partitionId: INITIAL_PARTITION_IDS.replica_operations,
    tableId: 'replica_operations', tableName: 'replica_operations',
    dbPath: path.join(fixture.directory, 'authority.db'), transport: fixture.router,
    timeSource: fixture.clock, deferElection: true, systemTableCache: new SystemTableCache(),
    bootstrapMembership: genesisStamp([replicaId], {[replicaId]: nodeId})});
  fixture.services.push(service);
  await service.initialize();
  return {fixture, service};
}

export {nativeServiceGroup, nativeAuthorityPartition};
