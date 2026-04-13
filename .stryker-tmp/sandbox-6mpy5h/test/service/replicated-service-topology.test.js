// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  buildReplicatedServiceBootstrapTopology,
  formatReplicatedServiceAddress,
} from '../../src/service/replicated-service-topology.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';

test('buildReplicatedServiceBootstrapTopology derives partition topology with exclusions',
  async (t) => {
    const topology = buildReplicatedServiceBootstrapTopology({
      serviceType: SERVICE_TYPE.PARTITION,
      serviceRows: [{
        service_id: 'nodes-p1-r1',
        node_id: 'seed-node',
        address: 'seed-node/partition/nodes-p1-r1',
      }, {
        service_id: 'nodes-p1-r2',
        node_id: 'seed-node',
        address: 'seed-node/partition/nodes-p1-r2',
      }, {
        service_id: 'nodes-p1-r3',
        node_id: 'seed-node',
        address: 'seed-node/partition/nodes-p1-r3',
      }],
      excludeReplicaIds: ['nodes-p1-r1'],
      targetReplicaId: 'nodes-p1-r4',
      targetNodeId: 'node-2',
    });

    t.same(
      topology,
      {
        replicaIds: ['nodes-p1-r2', 'nodes-p1-r3', 'nodes-p1-r4'],
        peerAddresses: [
          'seed-node/partition/nodes-p1-r2',
          'seed-node/partition/nodes-p1-r3',
          'node-2/partition/nodes-p1-r4',
        ],
      },
      'partition topology should exclude retired replicas and append the target replica',
    );
  });

test('formatReplicatedServiceAddress uses message-group addresses for message-group services',
  async (t) => {
    t.equal(
      formatReplicatedServiceAddress(
        SERVICE_TYPE.MESSAGE_GROUP,
        'node-7',
        'mg-1-r2',
      ),
      'node-7/message-group/mg-1-r2',
      'message-group topology should use message-group address formatting',
    );
  });

test('buildReplicatedServiceBootstrapTopology rejects unsupported service types',
  async (t) => {
    t.equal(
      buildReplicatedServiceBootstrapTopology({
        serviceType: 'runtime_service',
        serviceRows: [],
      }),
      null,
      'unsupported service types should not produce bootstrap topology',
    );
  });
