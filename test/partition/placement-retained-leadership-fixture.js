// Two actual file-backed PartitionService appliers. The controllable consensus
// port mirrors committed commands and produces real role/lifecycle events;
// this measures owner routing/custody, not rs-raft election/quorum behavior.
import assert from 'node:assert/strict';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {withRepairLedger} from './placement-retained-row-repair-fixture.js';
import {applyCommitted, resumeFixtureParticipantAdmission, send, settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

async function withRetainedLeadershipPair(measure) {
  await withRepairLedger(async (a) => withRepairLedger(async (b) => {
    const nodes = [a, b];
    const messages = [];
    let leader = a;
    const ownerReads = new Map(nodes.map((node) => [node,
      node.gateway.readAuthoritativeRows.bind(node.gateway)]));
    for (const node of nodes) {
      node.gateway.readAuthoritativeRows = (table, sql, params, options) =>
        ownerReads.get(options?.authoritativeReadMode === READ_MODE.OWNER_RPC_REQUIRED ?
          leader : node)(table, sql, params, options);
    }
    const replicate = (source, target) => ({command}) => {
      if (source === leader) assert.equal(applyCommitted(target.leader, command), null);
    };
    const fromA = replicate(a, b);
    const fromB = replicate(b, a);
    a.leader.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, fromA);
    b.leader.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, fromB);
    for (const node of nodes) {
      const original = node.coordinator.messageRouter;
      const router = Object.create(original);
      router.deliver = async (address, payload) => {
        const recipient = nodes.find((peer) => peer.address === address);
        assert.ok(recipient, `the authority route names a real ledger replica: ${address}`);
        messages.push({from: node, to: recipient, payload});
        return buildDeliveryEnvelope({acknowledged: true}, await send(recipient.leader, payload));
      };
      node.coordinator.syncOwnerDependencies({messageRouter: router});
    }
    async function elect(next, {resume = true} = {}) {
      leader = next;
      for (const node of nodes) {
        node.leader.controllablePort.setRole(node === next ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER);
      }
      await settleTicks();
      for (const node of nodes) assert.equal(node.leader.isLeader, node === next);
      if (resume) await resumeFixtureParticipantAdmission(next.leader);
      // Controlled SERVICES/CDC input from the actual role observation.
      // Publication transport is doubled; native receipt still checks real role.
      for (const receiver of nodes) {
        for (const peer of nodes) {
          const row = {replica_id: peer.leader.replicaId, node_id: peer.leader.nodeId,
            partition_id: 'replica_operations-p1', service_address: peer.address,
            status: 'active', raft_role: peer === next ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER};
          receiver.coordinator.systemTableCache.upsert('services', row);
          receiver.coordinator.repository.observeRetainedPlacementRepairCommit('services', row);
        }
      }
      await settleTicks();
    }
    a.address = 'node-a/partition/replica_operations-p1-a';
    b.address = 'node-b/partition/replica_operations-p1-b';
    try {
      await elect(a);
      await measure({a, b, messages, elect});
    } finally {
      a.leader.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, fromA);
      b.leader.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, fromB);
    }
  }, {nodeId: 'node-b', serviceNodeId: 'node-b', replicaId: 'replica_operations-p1-b',
    partitionRows: []}),
  {nodeId: 'node-a', serviceNodeId: 'node-a', replicaId: 'replica_operations-p1-a', partitionRows: []});
}

export {withRetainedLeadershipPair};
