import {test} from '../../src/test-helpers/tap.js';
import {OperationWorkflowOwnerRetryRegistry} from '../../src/rebalancer/operation-workflow-owner-retry-registry.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';

const {
  DISPATCH_RETRY_DELAY_MS,
  DISPATCH_RETRY_MAX_DELAY_MS,
  DISPATCH_RETRY_BACKOFF_MULTIPLIER,
  COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const TEST_OPERATION_ID = 'operation-handoff-retry-1';
const TEST_TARGET_NODE_ID = 'target-node-a';
const TEST_OTHER_TARGET_NODE_ID = 'target-node-b';

function buildOwnerSegment(overrides = {}) {
  return new OperationWorkflowOwnerRetryRegistry({
    operationLane: {run: (fn) => fn()},
    getActualReplicaStatus: () => null,
    // Deterministic: zero jitter so delays are exactly the capped exponential.
    randomFn: () => 0,
    ...overrides,
  });
}

test('handoff retry delay grows geometrically and is capped', async (t) => {
  const owner = buildOwnerSegment();
  let expected = DISPATCH_RETRY_DELAY_MS;
  for (let attempt = 0; attempt < 8; attempt++) {
    const delay = owner.resolveCreatedOperationHandoffRetryDelayMs(
      TEST_OPERATION_ID,
    );
    const cappedExpected = Math.min(expected, DISPATCH_RETRY_MAX_DELAY_MS);
    t.equal(
      delay,
      cappedExpected,
      `attempt ${attempt} backs off to the capped exponential delay`,
    );
    t.ok(
      delay <= DISPATCH_RETRY_MAX_DELAY_MS,
      `attempt ${attempt} never exceeds the maximum delay`,
    );
    expected *= DISPATCH_RETRY_BACKOFF_MULTIPLIER;
  }
  t.end();
});

test('handoff retry delay honors a retry-after floor', async (t) => {
  const owner = buildOwnerSegment();
  const floorMs = DISPATCH_RETRY_DELAY_MS * 3;
  const delay = owner.resolveCreatedOperationHandoffRetryDelayMs(
    TEST_OPERATION_ID,
    floorMs,
  );
  t.equal(
    delay,
    floorMs,
    'a retry-after floor above the base exponential is respected',
  );
  t.end();
});

test('resetting attempts restarts the backoff at the base delay', async (t) => {
  const owner = buildOwnerSegment();
  owner.resolveCreatedOperationHandoffRetryDelayMs(TEST_OPERATION_ID);
  owner.resolveCreatedOperationHandoffRetryDelayMs(TEST_OPERATION_ID);
  owner.resetCreatedOperationHandoffRetryAttempts(TEST_OPERATION_ID);
  const delay = owner.resolveCreatedOperationHandoffRetryDelayMs(
    TEST_OPERATION_ID,
  );
  t.equal(
    delay,
    DISPATCH_RETRY_DELAY_MS,
    'a reset operation backs off from the base delay again',
  );
  t.end();
});

test('per-target active retry count only includes armed timers', async (t) => {
  const owner = buildOwnerSegment();
  // Three operations target node A, but only two have an armed timer.
  for (let index = 0; index < 3; index++) {
    const operationId = `${TEST_OPERATION_ID}-a-${index}`;
    owner.createdOperationHandoffRetryTargetNodeByOperationId.set(
      operationId,
      TEST_TARGET_NODE_ID,
    );
    if (index < 2) {
      owner.createdOperationHandoffRetryTimerByOperationId.set(
        operationId,
        {},
      );
    }
  }
  // A different target node has its own armed retry.
  owner.createdOperationHandoffRetryTargetNodeByOperationId.set(
    `${TEST_OPERATION_ID}-b`,
    TEST_OTHER_TARGET_NODE_ID,
  );
  owner.createdOperationHandoffRetryTimerByOperationId.set(
    `${TEST_OPERATION_ID}-b`,
    {},
  );

  t.equal(
    owner.countActiveCreatedOperationHandoffRetriesByTargetNode(
      TEST_TARGET_NODE_ID,
    ),
    2,
    'only operations with an armed timer count toward the target retry fan-out',
  );
  t.equal(
    owner.countActiveCreatedOperationHandoffRetriesByTargetNode(
      TEST_OTHER_TARGET_NODE_ID,
    ),
    1,
    'retries are counted independently per target node',
  );
  t.equal(
    owner.countActiveCreatedOperationHandoffRetriesByTargetNode(null),
    0,
    'a missing target node yields no active retries',
  );
  t.end();
});

test('per-target retry cap is a small positive shedding bound', async (t) => {
  t.ok(
    Number.isInteger(
      COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET,
    ) && COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET > 0,
    'the per-target shedding cap is a positive integer bound',
  );
  t.end();
});
