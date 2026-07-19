/**
 * Production-composition regression for retained runtime replica projection.
 *
 * The runtime lifecycle must hand state to the projection owner without
 * waiting behind a routed services-table write. The owner serializes one
 * replica's transitions, keeps the latest pending context, and delegates
 * authoritative mutations to ServicesOwner.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  RUNTIME_REPLICA_STATE_PROJECTION_EVENT,
  RuntimeReplicaStateProjectionOwner,
} from '../../src/query/runtime-replica-state-projection-owner.js';
import {
  RUNTIME_REPLICA_STATUS,
} from '../../src/constants/runtime.js';
import {
  createRuntimeStartupWiring,
} from '../../src/runtime/runtime-startup-wiring.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from '../query/sql-query-engine-test-support.js';

const HOST_NODE_ID = 'projection-retain-node';
const SERVICE_ID = 'projection-retain-service-r2';
const OTHER_SERVICE_ID = 'projection-retain-service-r3';
const RUNTIME_REF = 'projection-retain-runtime';
const RETRY_AFTER_MS = 60_000;
const SUPERSEDED_RETRY_AFTER_MS = 10;
const RETRY_SETTLE_WAIT_MS = 40;

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function waitForProjectionEvent(owner, eventName, predicate) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (!predicate(event)) {
        return;
      }
      owner.removeListener(eventName, listener);
      resolve(event);
    };
    owner.on(eventName, listener);
  });
}

function createRuntimeHarness(servicesOwner) {
  const {serviceRuntimeLifecycle} = createRuntimeStartupWiring();
  serviceRuntimeLifecycle.registerNativeJsHandler(RUNTIME_REF, {
    async prepare() {
      return {status: 'ready'};
    },
    async start() {
      return {status: 'running'};
    },
    async stop() {},
    async health() {
      return {status: 'healthy'};
    },
  });
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], null),
    messageRouter: createMockMessageRouter(),
    nodeId: HOST_NODE_ID,
    serviceRuntimeLifecycle,
    runtimeReplicaStateProjectionServicesOwner: servicesOwner,
  });
  return {
    engine,
    lifecycle: serviceRuntimeLifecycle,
    projectionOwner: engine.runtimeReplicaStateProjectionOwner,
  };
}

function runtimeDefinition() {
  return {
    serviceId: SERVICE_ID,
    serviceType: 'runtime_service',
    runtime_kind: 'native_js',
    runtime_ref: RUNTIME_REF,
    runtime_config: null,
  };
}

test('production lifecycle handoff does not await a blocked CREATED write ' +
  'and applies the newer ACTIVE state after retryable failure', async (t) => {
  const createdWriteStarted = createDeferred();
  const releaseCreatedWrite = createDeferred();
  const calls = [];
  const servicesOwner = {
    async updateService(serviceId, data) {
      calls.push({kind: 'update', serviceId, data});
      if (data.status === RUNTIME_REPLICA_STATUS.CREATED) {
        createdWriteStarted.resolve();
        await releaseCreatedWrite.promise;
        const error = new Error('distributed participant failure');
        error.deferRetry = true;
        error.retryAfterMs = RETRY_AFTER_MS;
        throw error;
      }
      return {
        success: true,
        partitionResult: {affectedRows: 0},
      };
    },
    async insertService(row) {
      calls.push({kind: 'insert', row});
      return {success: true};
    },
    async removeService(serviceId) {
      calls.push({kind: 'delete', serviceId});
      return {success: true};
    },
  };
  const {
    engine,
    lifecycle,
    projectionOwner,
  } = createRuntimeHarness(servicesOwner);
  const activeApplied = waitForProjectionEvent(
    projectionOwner,
    RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED,
    (event) => event.status === RUNTIME_REPLICA_STATUS.ACTIVE,
  );

  try {
    let prepareSettled = false;
    const preparePromise = lifecycle.prepare(
      runtimeDefinition(),
      {nodeId: HOST_NODE_ID},
    ).then((result) => {
      prepareSettled = true;
      return result;
    });

    await createdWriteStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      prepareSettled,
      true,
      'prepare completes after retained handoff while CREATED remains blocked',
    );

    let startSettled = false;
    const startPromise = lifecycle.start(runtimeDefinition()).then((result) => {
      startSettled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      startSettled,
      true,
      'start and its executor outcome are not held by the older projection',
    );

    releaseCreatedWrite.resolve();
    await Promise.all([preparePromise, startPromise, activeApplied]);

    t.same(
      calls.map((call) => [
        call.kind,
        call.data?.status ?? call.row?.status ?? null,
      ]),
      [
        ['update', RUNTIME_REPLICA_STATUS.CREATED],
        ['update', RUNTIME_REPLICA_STATUS.ACTIVE],
        ['insert', RUNTIME_REPLICA_STATUS.ACTIVE],
      ],
      'the retained CREATED retry is superseded and cannot overwrite ACTIVE',
    );
    t.same(
      projectionOwner.getDiagnostics().retryingKeys,
      [],
      'successful latest-state projection clears the older retained retry',
    );
  } finally {
    await engine.shutdown();
  }
});

test('a blocked replica projection does not stall a different replica key',
  async (t) => {
    const firstWriteStarted = createDeferred();
    const releaseFirstWrite = createDeferred();
    const calls = [];
    const owner = new RuntimeReplicaStateProjectionOwner({
      hostNodeId: HOST_NODE_ID,
      servicesOwner: {
        async updateService(serviceId) {
          calls.push(serviceId);
          if (serviceId === SERVICE_ID) {
            firstWriteStarted.resolve();
            await releaseFirstWrite.promise;
          }
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        async insertService() {},
        async removeService() {},
      },
    });

    try {
      owner.submit(SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.ACTIVE,
        service_type: 'runtime_service',
        node_id: HOST_NODE_ID,
        updated_at: 1,
      });
      await firstWriteStarted.promise;
      owner.submit(OTHER_SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.ACTIVE,
        service_type: 'runtime_service',
        node_id: HOST_NODE_ID,
        updated_at: 1,
      });
      await new Promise((resolve) => setImmediate(resolve));

      t.ok(
        calls.includes(OTHER_SERVICE_ID),
        'the second replica write starts before the first replica releases',
      );
    } finally {
      releaseFirstWrite.resolve();
      owner.shutdown();
    }
  });

test('a newer permanent failure supersedes an older retryable transition',
  async (t) => {
    const createdWriteStarted = createDeferred();
    const releaseCreatedWrite = createDeferred();
    const statuses = [];
    const owner = new RuntimeReplicaStateProjectionOwner({
      hostNodeId: HOST_NODE_ID,
      servicesOwner: {
        async updateService(_serviceId, data) {
          statuses.push(data.status);
          if (data.status === RUNTIME_REPLICA_STATUS.CREATED) {
            createdWriteStarted.resolve();
            await releaseCreatedWrite.promise;
            const error = new Error('superseded retryable failure');
            error.deferRetry = true;
            error.retryAfterMs = SUPERSEDED_RETRY_AFTER_MS;
            throw error;
          }
          throw new Error('newer permanent failure');
        },
        async insertService() {},
        async removeService() {},
      },
    });
    const activeFailed = waitForProjectionEvent(
      owner,
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.FAILED,
      (event) => event.status === RUNTIME_REPLICA_STATUS.ACTIVE,
    );

    try {
      owner.submit(SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.CREATED,
        service_type: 'runtime_service',
        node_id: HOST_NODE_ID,
        updated_at: 1,
      });
      await createdWriteStarted.promise;
      owner.submit(SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.ACTIVE,
        service_type: 'runtime_service',
        node_id: HOST_NODE_ID,
        updated_at: 2,
      });
      releaseCreatedWrite.resolve();
      await activeFailed;
      await new Promise((resolve) => {
        setTimeout(resolve, RETRY_SETTLE_WAIT_MS);
      });

      t.same(
        statuses,
        [
          RUNTIME_REPLICA_STATUS.CREATED,
          RUNTIME_REPLICA_STATUS.ACTIVE,
        ],
        'the superseded CREATED transition is never replayed',
      );
      t.same(
        owner.getDiagnostics().retryingKeys,
        [],
        'the newer terminal result clears older retry state',
      );
    } finally {
      owner.shutdown();
    }
  });

test('STOPPED queued behind an in-flight ACTIVE write deletes last and cannot ' +
  'be resurrected by stale completion', async (t) => {
  const activeWriteStarted = createDeferred();
  const releaseActiveWrite = createDeferred();
  const calls = [];
  const servicesOwner = {
    async updateService(serviceId, data) {
      calls.push({kind: 'update', serviceId, data});
      if (data.status === RUNTIME_REPLICA_STATUS.ACTIVE) {
        activeWriteStarted.resolve();
        await releaseActiveWrite.promise;
      }
      return {
        success: true,
        partitionResult: {affectedRows: 1},
      };
    },
    async insertService(row) {
      calls.push({kind: 'insert', row});
      return {success: true};
    },
    async removeService(serviceId) {
      calls.push({kind: 'delete', serviceId});
      return {success: true};
    },
  };
  const owner = new RuntimeReplicaStateProjectionOwner({
    hostNodeId: HOST_NODE_ID,
    servicesOwner,
  });
  const stoppedApplied = waitForProjectionEvent(
    owner,
    RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED,
    (event) => event.status === RUNTIME_REPLICA_STATUS.STOPPED,
  );

  try {
    owner.submit(SERVICE_ID, {
      status: RUNTIME_REPLICA_STATUS.ACTIVE,
      service_type: 'runtime_service',
      node_id: HOST_NODE_ID,
      updated_at: 1,
    });
    await activeWriteStarted.promise;
    owner.submit(SERVICE_ID, {
      status: RUNTIME_REPLICA_STATUS.STOPPED,
      service_type: 'runtime_service',
      node_id: HOST_NODE_ID,
      updated_at: 2,
    });
    releaseActiveWrite.resolve();
    await stoppedApplied;

    t.same(
      calls.map((call) => call.kind),
      ['update', 'delete'],
      'the serialized final mutation is DELETE with no stale ACTIVE replay',
    );
  } finally {
    owner.shutdown();
  }
});

test('non-retryable projection failure is surfaced once and not retained',
  async (t) => {
    let updateCount = 0;
    const owner = new RuntimeReplicaStateProjectionOwner({
      hostNodeId: HOST_NODE_ID,
      servicesOwner: {
        async updateService() {
          updateCount += 1;
          throw new Error('permanent projection contract failure');
        },
        async insertService() {
          t.fail('permanent update failure must not fall through to insert');
        },
        async removeService() {},
      },
    });
    const failed = waitForProjectionEvent(
      owner,
      RUNTIME_REPLICA_STATE_PROJECTION_EVENT.FAILED,
      (event) => event.serviceId === SERVICE_ID,
    );

    try {
      owner.submit(SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.ACTIVE,
        service_type: 'runtime_service',
        node_id: HOST_NODE_ID,
        updated_at: 1,
      });
      const failure = await failed;
      await Promise.resolve();

      t.equal(failure.retryable, false, 'failure classification is inspectable');
      t.equal(updateCount, 1, 'permanent failure is attempted exactly once');
      t.same(
        owner.getDiagnostics().retryingKeys,
        [],
        'permanent failure leaves no retry timer or retained work',
      );
    } finally {
      owner.shutdown();
    }
  });

test('shutdown clears retained retry work and its timer', async (t) => {
  const owner = new RuntimeReplicaStateProjectionOwner({
    hostNodeId: HOST_NODE_ID,
    servicesOwner: {
      async updateService() {
        const error = new Error('retry after shutdown boundary');
        error.deferRetry = true;
        error.retryAfterMs = RETRY_AFTER_MS;
        throw error;
      },
      async insertService() {},
      async removeService() {},
    },
  });
  const retrying = waitForProjectionEvent(
    owner,
    RUNTIME_REPLICA_STATE_PROJECTION_EVENT.RETRYING,
    (event) => event.serviceId === SERVICE_ID,
  );

  owner.submit(SERVICE_ID, {
    status: RUNTIME_REPLICA_STATUS.ACTIVE,
    service_type: 'runtime_service',
    node_id: HOST_NODE_ID,
    updated_at: 1,
  });
  await retrying;
  await new Promise((resolve) => setImmediate(resolve));

  t.same(
    owner.getDiagnostics().retryingKeys,
    [SERVICE_ID],
    'retryable failure is retained before shutdown',
  );
  owner.shutdown();
  const diagnostics = owner.getDiagnostics();
  t.equal(diagnostics.stopped, true, 'projection queue is stopped');
  t.same(diagnostics.retryingKeys, [], 'retained retry context is cleared');
  t.same(diagnostics.retryStates, {}, 'retry timer state is cleared');
});

test('shutdown cannot be undone by a later in-flight retryable failure',
  async (t) => {
    const writeStarted = createDeferred();
    const releaseWrite = createDeferred();
    const owner = new RuntimeReplicaStateProjectionOwner({
      hostNodeId: HOST_NODE_ID,
      servicesOwner: {
        async updateService() {
          writeStarted.resolve();
          await releaseWrite.promise;
          const error = new Error('late failure after shutdown');
          error.deferRetry = true;
          error.retryAfterMs = RETRY_AFTER_MS;
          throw error;
        },
        async insertService() {},
        async removeService() {},
      },
    });

    owner.submit(SERVICE_ID, {
      status: RUNTIME_REPLICA_STATUS.ACTIVE,
      service_type: 'runtime_service',
      node_id: HOST_NODE_ID,
      updated_at: 1,
    });
    await writeStarted.promise;
    owner.shutdown();
    releaseWrite.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    const diagnostics = owner.getDiagnostics();
    t.equal(diagnostics.stopped, true, 'projection queue remains stopped');
    t.same(
      diagnostics.retryingKeys,
      [],
      'late failure cannot retain work after shutdown',
    );
    t.same(
      diagnostics.retryStates,
      {},
      'late failure cannot recreate a retry timer after shutdown',
    );
  });
