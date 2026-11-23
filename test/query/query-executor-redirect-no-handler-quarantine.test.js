// Regression tests proving that when a healthy follower returns
// LEADER_REDIRECT to a dead/restarting target that fails with NO_HANDLER
// (either thrown or via transport NO_HANDLER outcome), QueryExecutor
// quarantines ONLY the dead redirect target and NEVER quarantines the healthy
// origin follower that issued the redirect.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ERRORS, SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {QUERY_RESPONSE_TYPE} from '../../src/query/query-constants.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

ConfigurationManager.getInstance().initialize();

const PARTITION_ID = 'services-p1';
const FOLLOWER_ONE = 'node-1/partition/services-p1-r1';
const FOLLOWER_TWO = 'node-2/partition/replace-replica-live';
const DEAD_LEADER = 'node-3/partition/replace-replica-dead';

function createFixture({redirectMode}) {
  const deliveries = [];
  let followerOneActsAsLeader = false;
  const services = [
    {
      service_id: 'services-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION_ID,
      node_id: 'node-1',
      raft_role: 'follower',
      address: FOLLOWER_ONE,
      status: SERVICE_STATUS.ACTIVE,
    },
    {
      service_id: 'replace-replica-live',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION_ID,
      node_id: 'node-2',
      raft_role: 'follower',
      address: FOLLOWER_TWO,
      status: SERVICE_STATUS.ACTIVE,
    },
    {
      service_id: 'replace-replica-dead',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION_ID,
      node_id: 'node-3',
      raft_role: 'follower',
      address: DEAD_LEADER,
      status: SERVICE_STATUS.ACTIVE,
    },
  ];
  const systemCache = {
    get(type, key) {
      if (type === 'partitions' && key === PARTITION_ID) {
        return {
          partition_id: PARTITION_ID,
          leader_node_id: followerOneActsAsLeader ? 'node-1' : null,
        };
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return services.filter(predicate);
      }
      return [];
    },
  };
  const routingMetadataOverlay = {
    getPartitionById: () => null,
    getServicesForPartition: () => [],
    refreshPartitionRouting: async () => false,
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === FOLLOWER_ONE) {
        if (followerOneActsAsLeader) {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [{served_by: 'node-1'}],
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
          leaderAddress: DEAD_LEADER,
          partitionId: PARTITION_ID,
        });
      }
      if (address === DEAD_LEADER) {
        const message = `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${DEAD_LEADER}`;
        if (redirectMode === 'throw') {
          throw new Error(message);
        }
        return buildDeliveryEnvelope({acknowledged: true, noHandler: true}, {
          success: false,
          error: message,
        });
      }
      if (address === FOLLOWER_TWO) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{served_by: 'node-2'}],
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: false,
        error: `unexpected address ${address}`,
      });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter,
    systemCache,
    routingMetadataOverlay,
    nodeId: 'local-node',
    noHandlerAddressQuarantineMs: 60000,
  });
  return {
    deliveries,
    executor,
    promoteFollowerOne() {
      followerOneActsAsLeader = true;
    },
  };
}

test('thrown NO_HANDLER on LEADER_REDIRECT quarantines redirect target ' +
  'and leaves healthy origin follower unquarantined', async (t) => {
  const {deliveries, executor, promoteFollowerOne} = createFixture({
    redirectMode: 'throw',
  });

  const first = await executor.executeOnPartition(
    PARTITION_ID,
    'SELECT 1',
    [],
    true,
  );
  t.equal(first.success, true, 'read falls through to healthy follower-2');
  t.same(deliveries, [FOLLOWER_ONE, DEAD_LEADER, FOLLOWER_TWO]);
  t.equal(
    executor.isTemporarilyUnroutableAddress(PARTITION_ID, FOLLOWER_ONE),
    false,
    'healthy origin follower must NOT be quarantined when redirect target has no handler',
  );
  t.equal(
    executor.isTemporarilyUnroutableAddress(PARTITION_ID, DEAD_LEADER),
    true,
    'dead LEADER_REDIRECT target MUST be quarantined after throwing NO_HANDLER',
  );

  // Subsequent query after follower-1 wins leadership must still route to it.
  promoteFollowerOne();
  deliveries.length = 0;
  const second = await executor.executeOnPartition(
    PARTITION_ID,
    'SELECT 2',
    [],
    true,
  );
  t.equal(second.success, true);
  t.same(deliveries, [FOLLOWER_ONE],
    'unquarantined healthy node-1 remains directly routable on next query');
});

test('transport NO_HANDLER envelope on LEADER_REDIRECT quarantines redirect ' +
  'target and leaves healthy origin follower unquarantined', async (t) => {
  const {deliveries, executor} = createFixture({
    redirectMode: 'transport-envelope',
  });

  const first = await executor.executeOnPartition(
    PARTITION_ID,
    'SELECT 1',
    [],
    true,
  );
  t.equal(first.success, true, 'read falls through to healthy follower-2');
  t.same(deliveries, [FOLLOWER_ONE, DEAD_LEADER, FOLLOWER_TWO]);
  t.equal(
    executor.isTemporarilyUnroutableAddress(PARTITION_ID, FOLLOWER_ONE),
    false,
    'healthy origin follower must NOT be quarantined on redirect transport NO_HANDLER',
  );
  t.equal(
    executor.isTemporarilyUnroutableAddress(PARTITION_ID, DEAD_LEADER),
    true,
    'dead LEADER_REDIRECT target MUST be quarantined on redirect transport NO_HANDLER',
  );
});
