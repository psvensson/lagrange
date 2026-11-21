import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {mintServiceRowCreatedAt} from '../../src/node/service-row-incarnation.js';
// Two actual file-backed PartitionService appliers. The controllable consensus
// port mirrors every actual commit from a shared initial prefix and emits role events;
// this measures owner routing/custody, not rs-raft election/quorum behavior.
import assert from 'node:assert/strict';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {withRepairLedger} from './placement-retained-row-repair-fixture.js';
import {resumeFixtureParticipantAdmission, send, settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

async function withRetainedLeadershipPair(measure) {
  await withRepairLedger(async (a) => withRepairLedger(async (b) => {
    const nodes = [a, b];
    for (const node of nodes) {
      node.serviceBirth = mintServiceRowCreatedAt(node.leader.timeSource.now());
      node.lastRolePublication = node.serviceBirth;
      node.coordinator.syncOwnerDependencies({systemTableCache: new SystemTableCache()});
    }
    const messages = [];
    let leader = a;
    let term = a.leader.controllablePort.term;
    const ownerReads = new Map(nodes.map((node) => [node,
      node.gateway.readAuthoritativeRows.bind(node.gateway)]));
    for (const node of nodes) {
      node.gateway.readAuthoritativeRows = (table, sql, params, options) =>
        ownerReads.get(options?.authoritativeReadMode === READ_MODE.OWNER_RPC_REQUIRED ?
          leader : node)(table, sql, params, options);
    }
    const commits = new Map(nodes.map((node) => [node,
      node.leader.controllablePort.commit.bind(node.leader.controllablePort)]));
    for (const node of nodes) {
      node.leader.controllablePort.commit = (command) => {
        commits.get(node)(command);
        if (node !== leader) return;
        const target = nodes.find((peer) => peer !== node);
        assert.equal(target.leader.controllablePort.committedIndex,
          node.leader.controllablePort.committedIndex - 1,
          'controlled transport preserves the same native log position, including control entries');
        assert.equal(target.leader.controllablePort.term, node.leader.controllablePort.term);
        commits.get(target)(command);
      };
    }
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
      if (leader !== next) term += 1;
      leader = next;
      for (const node of nodes) {
        node.leader.controllablePort.term = term;
        node.leader.controllablePort.setRole(node === next ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER);
      }
      await settleTicks();
      for (const node of nodes) assert.equal(node.leader.isLeader, node === next);
      if (resume) await resumeFixtureParticipantAdmission(next.leader);
      // Controlled SERVICES/CDC input from the actual role observation.
      // Publication transport is doubled; native receipt still checks real role.
      for (const receiver of nodes) {
        for (const peer of nodes) {
          peer.lastRolePublication = Math.max(peer.leader.timeSource.now(),
            peer.lastRolePublication + 1);
          const row = {service_id: peer.leader.replicaId, replica_id: peer.leader.replicaId,
            node_id: peer.leader.nodeId, partition_id: 'replica_operations-p1',
            service_type: 'partition', address: peer.address, group_id: null,
            status: 'active', raft_role: peer.leader.role, cleanup_token: null,
            create_attempt_token: null, created_at: peer.serviceBirth,
            updated_at: peer.lastRolePublication};
          const cache = receiver.coordinator.systemTableCache;
          cache.applySystemTableChange('services', CACHE_CDC_OPERATIONS.UPSERT, row);
          const published = cache.get('services', row.service_id);
          assert.equal(published.created_at, peer.serviceBirth);
          assert.equal(published.raft_role, peer === next ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER);
          assert.equal(cache.get('services', undefined), undefined);
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
      for (const node of nodes) node.leader.controllablePort.commit = commits.get(node);
    }
  }, {nodeId: 'node-b', serviceNodeId: 'node-b', replicaId: 'replica_operations-p1-b',
    partitionRows: [], releaseAdmission: false}),
  {nodeId: 'node-a', serviceNodeId: 'node-a', replicaId: 'replica_operations-p1-a', partitionRows: [], releaseAdmission: false});
}

export {withRetainedLeadershipPair};
