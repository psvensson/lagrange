import {test} from '../../src/test-helpers/tap.js';
import {
  OPERATION_LIFECYCLE_EVENT_TYPE,
  OPERATION_LIFECYCLE_STATE,
  advanceOperationLifecycle,
  createInitialOperationProgress,
} from '../../src/rebalancer/operation-lifecycle.js';
import {
  OPERATION_PROGRESS_STORE_WRITE_STATE,
  createOperationProgressStore,
} from '../../src/rebalancer/operation-progress-store.js';
import {
  projectOperationProgressRecords,
} from '../../src/rebalancer/operation-progress-events.js';

const TEST_OPERATION_ID = 'store-operation';
const TEST_OWNER_ID = 'operation_workflow_owner';
const TEST_EVENT_ID = 'store-event-1';
const TEST_SOURCE_REVISION = 'store-source-revision';

function buildDispatchEvent() {
  return Object.freeze({
    eventId: TEST_EVENT_ID,
    type: OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_REQUESTED,
    operationId: TEST_OPERATION_ID,
    ownerId: TEST_OWNER_ID,
    sourceRevision: TEST_SOURCE_REVISION,
    payload: Object.freeze({}),
    evidence: Object.freeze({
      operationKey: TEST_OPERATION_ID,
      owner: TEST_OWNER_ID,
      sourceRevision: TEST_SOURCE_REVISION,
    }),
  });
}

function collectNullishPaths(value, path = 'root', paths = []) {
  if (value === null || value === undefined) {
    paths.push(path);
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectNullishPaths(entry, `${path}[${index}]`, paths),
    );
    return paths;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      collectNullishPaths(entry, `${path}.${key}`, paths),
    );
  }
  return paths;
}

test('operation progress store loads explicit initial resource records', (t) => {
  const store = createOperationProgressStore();
  const progress = store.loadOperationProgress(TEST_OPERATION_ID);

  t.equal(progress.operationId, TEST_OPERATION_ID);
  t.equal(progress.state, OPERATION_LIFECYCLE_STATE.PLANNED);
  t.equal(progress.version, 0);
  t.same(collectNullishPaths(progress), []);
  t.end();
});

test('operation progress store applies compare-and-swap writes', (t) => {
  const store = createOperationProgressStore();
  const currentProgress = store.loadOperationProgress(TEST_OPERATION_ID);
  const advanced = advanceOperationLifecycle(
    currentProgress,
    buildDispatchEvent(),
  );
  const write = store.compareAndSwapOperationProgress({
    expectedVersion: currentProgress.version,
    progress: advanced.operationProgress,
  });

  t.equal(write.state, OPERATION_PROGRESS_STORE_WRITE_STATE.APPLIED);
  t.equal(write.applied, true);
  t.equal(write.progress.version, currentProgress.version + 1);
  t.equal(write.progress.state, OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING);
  t.same(collectNullishPaths(write.progress), []);
  t.end();
});

test('operation progress store rejects stale compare-and-swap writes',
  (t) => {
    const store = createOperationProgressStore();
    const currentProgress = store.loadOperationProgress(TEST_OPERATION_ID);
    const advanced = advanceOperationLifecycle(
      currentProgress,
      buildDispatchEvent(),
    );
    store.compareAndSwapOperationProgress({
      expectedVersion: currentProgress.version,
      progress: advanced.operationProgress,
    });
    const staleWrite = store.compareAndSwapOperationProgress({
      expectedVersion: currentProgress.version,
      progress: advanced.operationProgress,
    });

    t.equal(
      staleWrite.state,
      OPERATION_PROGRESS_STORE_WRITE_STATE.VERSION_CONFLICT,
    );
    t.equal(staleWrite.applied, false);
    t.equal(staleWrite.actualVersion, advanced.operationProgress.version);
    t.end();
  });

test('operation progress events project the latest persisted record', (t) => {
  const store = createOperationProgressStore();
  const currentProgress = createInitialOperationProgress({
    operationId: TEST_OPERATION_ID,
  });
  const advanced = advanceOperationLifecycle(
    currentProgress,
    buildDispatchEvent(),
  );
  const [event] = advanced.emittedEvents;
  store.appendEvent(event);
  const projected = projectOperationProgressRecords(
    store.listOperationProgressEvents(),
  );

  t.equal(projected.length, 1);
  t.equal(projected[0].operationId, TEST_OPERATION_ID);
  t.equal(projected[0].state, OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING);
  t.end();
});
