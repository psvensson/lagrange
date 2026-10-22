/**
 * The retryable partition size_bytes write names its owner when its retry
 * budget is spent: one wait_bound_spent ERROR on the partition's own logger,
 * naming the bound, the partition and the table, and the write still
 * throws as before.
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionServiceSplitAccessorBase} from
  '../../src/partition/partition-service-split-accessor-base.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const PAST_SIZE_WRITE_BUDGET_MS = 5000;

test('a partition size write whose retry budget is spent names the ' +
  'partition in the wait_bound_spent ERROR', async (t) => {
  const capture = captureLogger();
  let clockMs = 1000;
  const partition = {
    partitionId: 'size-owner-p1',
    logger: capture.logger,
    rebalancer: null,
    controlPlaneSystemTableGateway: {
      submitMutation: async () =>
        ({success: false, deferRetry: true, error: 'busy'}),
    },
    // Each read lands past the 1 s size-persist budget.
    timeSource: {
      now: () => {
        clockMs += PAST_SIZE_WRITE_BUDGET_MS;
        return clockMs;
      },
      setTimeout: (fn) => fn(),
    },
  };

  await t.rejects(
    PartitionServiceSplitAccessorBase.prototype.submitPartitionSizeMutation
      .call(partition, 4096),
    /busy/, 'the spent write still throws as before');

  const spent = capture.spent();
  t.equal(spent.length, 1,
    'exactly one wait_bound_spent ERROR on the partition logger');
  t.equal(spent[0].context.wait,
    'PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS');
  t.same(spent[0].context.scope,
    {partitionId: 'size-owner-p1', tableName: 'partitions'},
    'scope names the partition and its table');
});
