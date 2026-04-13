import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';

function createExecutor() {
  const executor = Object.create(QueryExecutor.prototype);
  executor.sessionPartitionAddresses = new Map();
  executor.isTemporarilyUnroutableAddress = () => false;
  return executor;
}

test('QueryExecutor exposes explicit session partition pin states',
  async (t) => {
    const executor = createExecutor();

    t.same(
      executor.getSessionPartitionAddressState('session-1', 'partition-1'),
      {state: 'unpinned'},
      'missing session pin should be represented explicitly',
    );

    executor.setSessionPartitionAddress(
      'session-1',
      'partition-1',
      'ws://node-1:8082',
    );

    t.same(
      executor.getSessionPartitionAddressState('session-1', 'partition-1'),
      {
        state: 'pinned',
        address: 'ws://node-1:8082',
      },
      'pinned session partition state should expose the address explicitly',
    );
  });

test('QueryExecutor can prioritize a pinned address from explicit pin state',
  async (t) => {
    const executor = createExecutor();
    executor.setSessionPartitionAddress(
      'session-1',
      'partition-1',
      'ws://node-1:8082',
    );

    const prioritized = executor.prioritizeSessionPartitionAddress(
      [
        {address: 'ws://node-2:8082'},
      ],
      {
        routableServices: [
          {address: 'ws://node-1:8082'},
        ],
      },
      'session-1',
      'partition-1',
    );

    t.equal(
      prioritized[0]?.address,
      'ws://node-1:8082',
      'explicit pin state should drive candidate prioritization',
    );
  });
