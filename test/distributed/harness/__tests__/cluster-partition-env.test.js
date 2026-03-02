import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {createCluster} from '../cluster.js';
import {NODE_ROLES, PARTITION_ENV_KEYS} from '../constants.js';

test('Cluster sets partition env overrides when configured', async (t) => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    partition: {
      splitThresholdQpm: 123,
      mergeThresholdQpm: 45,
      evaluationIntervalMs: 60000,
    },
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-partition-1',
      ip: '10.0.0.12',
      name: options.name,
    };
  };

  await cluster._startNode('partition-node-id', NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.equal(
    env[PARTITION_ENV_KEYS.SPLIT_THRESHOLD_QPM],
    '123',
  );
  assert.equal(
    env[PARTITION_ENV_KEYS.MERGE_THRESHOLD_QPM],
    '45',
  );
  assert.equal(
    env[PARTITION_ENV_KEYS.EVALUATION_INTERVAL_MS],
    '60000',
  );
  t.end();
});
