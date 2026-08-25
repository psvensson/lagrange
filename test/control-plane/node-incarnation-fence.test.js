/**
 * Receiver-side boot-incarnation fencing (node-incarnation-fencing-v2,
 * frontier 2), control-plane half: a NODE_STATE_UPDATE writer whose
 * bootIncarnation is LOWER than the receiver's best-known incarnation for
 * that nodeId is fenced with the typed terminal STALE_NODE_INCARNATION
 * refusal — before the heartbeat clamp can lift the stale writer's
 * heartbeat, on both the existing-row path and the missing-row upsert path.
 * UNKNOWN incarnation (0 / pre-incarnation) never fences (clusterId UNKNOWN
 * compat policy).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  STALE_NODE_INCARNATION_CODE,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  STATE,
} from '../../src/constants/index.js';

const TEST_NODE_ID = 'node-2';

function buildPayload(options = {}) {
  return {
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: options.nodeId || TEST_NODE_ID,
    [ControlPlaneField.NODE_ADDRESS]: options.nodeAddress || 'localhost:8082',
    [ControlPlaneField.STATE]: options.state || STATE.READY,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.HEARTBEAT_AT]: options.heartbeatAt || Date.now(),
    ...(options.bootIncarnation !== undefined ? {
      [ControlPlaneField.BOOT_INCARNATION]: options.bootIncarnation,
    } : {}),
    ...(options.nodeRow ? {[ControlPlaneField.NODE_ROW]: options.nodeRow} : {}),
  };
}

function createRecordingGateway(options = {}) {
  const updates = [];
  const upserts = [];
  return {
    updates,
    upserts,
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, opts) => {
        updates.push({tableName, whereClause, row, options: opts});
        return {
          success: true,
          partitionResult: {
            affectedRows: options.updateAffectedRows ?? 1,
          },
        };
      },
      upsertSystemTableRow: async (tableName, row, opts) => {
        upserts.push({tableName, row, options: opts});
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
  };
}

test('a stale-incarnation NODE_STATE_UPDATE is refused terminally and the ' +
  'stored heartbeat is NOT advanced to receiver time', async (t) => {
  initEnv();

  const storedHeartbeatAt = Date.now() - 60_000;
  const gateway = createRecordingGateway();
  const service = createService({
    cacheNode: {
      node_id: TEST_NODE_ID,
      node_address: 'localhost:8082',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: storedHeartbeatAt,
      boot_incarnation: 5,
      created_at: storedHeartbeatAt - 5000,
    },
    cdcIntegrationService: gateway.cdcIntegrationService,
  });

  const stalePayload = buildPayload({bootIncarnation: 3});
  const staleError = await t.rejects(
    service.handleNodeStateUpdate(stalePayload),
  );
  t.equal(
    staleError?.code,
    STALE_NODE_INCARNATION_CODE,
    'a writer with a lower incarnation than the stored row is fenced with ' +
      'the typed STALE_NODE_INCARNATION error',
  );
  t.equal(
    staleError?.nodeId,
    TEST_NODE_ID,
    'carries the fenced node id',
  );
  t.equal(
    staleError?.receivedIncarnation,
    3,
    'carries the writer incarnation',
  );
  t.equal(
    staleError?.knownIncarnation,
    5,
    'carries the receiver best-known incarnation',
  );

  t.equal(
    gateway.updates.length,
    0,
    'no update write happens for a fenced stale writer (the heartbeat ' +
      'clamp must not lift its heartbeat to receiver time)',
  );
  t.equal(gateway.upserts.length, 0, 'no upsert happens for a stale writer');

  // A fresh-incarnation writer against the same stored row is accepted and
  // lifts the retained high-water.
  const freshPayload = buildPayload({bootIncarnation: 6});
  await service.handleNodeStateUpdate(freshPayload);
  t.equal(
    gateway.updates.length,
    1,
    'a fresher incarnation is accepted',
  );
  t.equal(
    service.nodeBootIncarnationWatermarks.get(TEST_NODE_ID),
    6,
    'the accepted update retains the freshest incarnation',
  );
  t.equal(
    gateway.updates[0].row.boot_incarnation,
    6,
    'the canonical full-row writer durably projects the accepted incarnation',
  );

  service.stop();
});

test('an UNKNOWN incarnation on either side never fences (compat policy)',
  async (t) => {
    initEnv();

    const gateway = createRecordingGateway();
    const service = createService({
      cacheNode: {
        node_id: TEST_NODE_ID,
        node_address: 'localhost:8082',
        cpu_cores: 8,
        memory_mb: 16384,
        disk_gb: 500,
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        last_heartbeat: Date.now() - 60_000,
        boot_incarnation: 0,
        created_at: Date.now() - 65_000,
      },
      cdcIntegrationService: gateway.cdcIntegrationService,
    });

    // Pre-incarnation writer (no field) against a known stored incarnation.
    service.nodeBootIncarnationWatermarks.set(TEST_NODE_ID, 9);
    await service.handleNodeStateUpdate(buildPayload({}));
    t.equal(
      gateway.updates.length,
      1,
      'an absent payload incarnation is UNKNOWN and never fences',
    );
    t.equal(
      gateway.updates[0].row.boot_incarnation,
      9,
      'an UNKNOWN writer preserves the receiver high-water instead of ' +
        'downgrading durable identity',
    );

    // Known writer against an UNKNOWN stored incarnation.
    service.nodeBootIncarnationWatermarks.clear();
    await service.handleNodeStateUpdate(buildPayload({bootIncarnation: 2}));
    t.equal(
      gateway.updates.length,
      2,
      'an unknown receiver-side incarnation (0) never fences',
    );
    t.equal(gateway.updates[1].row.boot_incarnation, 2);

    const heartbeatOnlyPayload = buildPayload({bootIncarnation: 3});
    heartbeatOnlyPayload[ControlPlaneField.HEARTBEAT_ONLY] = true;
    await service.handleNodeStateUpdate(heartbeatOnlyPayload);
    t.equal(
      gateway.updates[2].row.boot_incarnation,
      3,
      'heartbeat-only publication projects the accepted incarnation too',
    );

    service.stop();
  });

test('a stale-incarnation writer on the missing-row upsert path is refused ' +
  'terminally even though the row is absent', async (t) => {
  initEnv();

  const gateway = createRecordingGateway({updateAffectedRows: 0});
  const service = createService({
    cdcIntegrationService: gateway.cdcIntegrationService,
  });

  const stalePayload = buildPayload({
    nodeId: 'node-joiner',
    nodeAddress: 'localhost:8099',
    state: STATE.CONNECTED,
    bootIncarnation: 2,
    nodeRow: {
      [COLUMN.CPU_CORES]: 4,
      [COLUMN.MEMORY_MB]: 8192,
      [COLUMN.DISK_GB]: 250,
    },
  });

  // The retained high-water (not the absent durable row) is what fences the
  // missing-row path.
  service.nodeBootIncarnationWatermarks.set('node-joiner', 4);

  const missingRowError = await t.rejects(
    service.handleNodeStateUpdate(stalePayload),
  );
  t.equal(
    missingRowError?.code,
    STALE_NODE_INCARNATION_CODE,
    'the missing-row path refuses with STALE_NODE_INCARNATION — a ' +
      'stale-incarnation writer must not resurrect itself through an upsert',
  );
  t.equal(
    missingRowError?.knownIncarnation,
    4,
    'fenced against the retained high-water incarnation',
  );

  t.equal(
    gateway.upserts.length,
    0,
    'the stale writer never reaches the missing-row upsert',
  );

  // A fresh-incarnation writer on the same path upserts and lifts the
  // retained high-water.
  await service.handleNodeStateUpdate(buildPayload({
    nodeId: 'node-joiner',
    nodeAddress: 'localhost:8099',
    state: STATE.CONNECTED,
    bootIncarnation: 5,
    nodeRow: {
      [COLUMN.CPU_CORES]: 4,
      [COLUMN.MEMORY_MB]: 8192,
      [COLUMN.DISK_GB]: 250,
    },
  }));
  t.equal(
    gateway.upserts.length,
    1,
    'a fresh incarnation upserts the missing row',
  );
  t.equal(
    service.nodeBootIncarnationWatermarks.get('node-joiner'),
    5,
    'the accepted upsert retains the freshest incarnation',
  );
  t.equal(
    gateway.upserts[0].row.boot_incarnation,
    5,
    'the missing-row path persists the same fenced incarnation it accepted',
  );

  service.stop();
});

test('a STALE_NODE_INCARNATION error is never deferred (terminal refusal)',
  async (t) => {
    initEnv();

    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({
          success: true,
          partitionResult: {affectedRows: 1},
        }),
        upsertSystemTableRow: async () => ({success: true}),
      },
    });

    const staleError = new Error('stale incarnation');
    staleError.code = STALE_NODE_INCARNATION_CODE;
    t.equal(
      service.shouldDeferNodeStateUpdateRetry(
        staleError,
        buildPayload({bootIncarnation: 1}),
      ),
      false,
      'shouldDeferNodeStateUpdateRetry returns false so the publisher-side ' +
        'retry loop rethrows instead of retrying a zombie writer forever',
    );

    const retryableError = new Error('Message timeout');
    t.equal(
      service.shouldDeferNodeStateUpdateRetry(
        retryableError,
        buildPayload({bootIncarnation: 1}),
      ),
      true,
      'ordinary transient failures still defer (the terminal carve-out is ' +
        'narrow)',
    );

    service.stop();
  });

test('durable incarnation projection is stable under post-import mutable ' +
  'intrinsic replacement', (t) => {
  initEnv();
  const service = createService({
    cdcIntegrationService: createRecordingGateway().cdcIntegrationService,
  });
  const originals = {
    arrayIsArray: Array.isArray,
    mathMax: Math.max,
    numberIsFinite: Number.isFinite,
    stringTrim: String.prototype.trim,
  };
  let row;
  try {
    Array.isArray = () => false;
    Math.max = () => 0;
    Number.isFinite = () => false;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    String.prototype.trim = () => '';
    row = service.buildNodeStateUpdateRow({
      existing: null,
      nodeRow: {
        [COLUMN.NODE_ID]: TEST_NODE_ID,
        [COLUMN.NODE_ADDRESS]: 'localhost:8082',
        [COLUMN.CPU_CORES]: 8,
        [COLUMN.MEMORY_MB]: 16384,
        [COLUMN.DISK_GB]: 500,
      },
      nextState: STATE.CONNECTED,
      heartbeatAt: 10_000,
      readyLeaseExpiresAt: null,
      payloadNodeAddress: 'localhost:8082',
      payload: buildPayload({bootIncarnation: 7}),
      isHeartbeatOnly: false,
      incarnationFence: {
        payloadBootIncarnation: 7,
        knownBootIncarnation: 5,
      },
    });
  } finally {
    Array.isArray = originals.arrayIsArray;
    Math.max = originals.mathMax;
    Number.isFinite = originals.numberIsFinite;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    String.prototype.trim = originals.stringTrim;
  }
  t.equal(row.boot_incarnation, 7);
  t.equal(row.capabilities, '["partition_replica"]');
  service.stop();
  t.end();
});

test('durable incarnation ingress rejects inherited, accessor, and coercive ' +
  'identity under prototype pollution', async (t) => {
  initEnv();
  const gateway = createRecordingGateway();
  const cacheNode = {
    node_id: TEST_NODE_ID,
    node_address: 'localhost:8082',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: Date.now() - 60_000,
    boot_incarnation: 9,
    created_at: Date.now() - 65_000,
  };
  const service = createService({
    cacheNode,
    cdcIntegrationService: gateway.cdcIntegrationService,
  });
  service.nodeBootIncarnationWatermarks.set(TEST_NODE_ID, 9);
  const inheritedPayload = buildPayload({});
  const accessorPayload = buildPayload({});
  const objectPayload = buildPayload({bootIncarnation: {}});
  let getterCalls = 0;
  Object.defineProperty(
    accessorPayload,
    ControlPlaneField.BOOT_INCARNATION,
    {
      configurable: true,
      get() {
        getterCalls += 1;
        return 10;
      },
    },
  );
  const originals = {
    bootIncarnation: Object.getOwnPropertyDescriptor(
      Object.prototype,
      ControlPlaneField.BOOT_INCARNATION,
    ),
    valueOf: Object.getOwnPropertyDescriptor(Object.prototype, 'valueOf'),
    toString: Object.getOwnPropertyDescriptor(Object.prototype, 'toString'),
  };
  try {
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(
      Object.prototype,
      ControlPlaneField.BOOT_INCARNATION,
      {configurable: true, value: 7},
    );
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Object.prototype, 'valueOf', {
      configurable: true,
      value: () => 7,
      writable: true,
    });
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Object.prototype, 'toString', {
      configurable: true,
      value: () => '7',
      writable: true,
    });
    await service.handleNodeStateUpdate(inheritedPayload);
    await service.handleNodeStateUpdate(accessorPayload);
    await service.handleNodeStateUpdate(objectPayload);
  } finally {
    if (originals.bootIncarnation) {
      // eslint-disable-next-line no-extend-native -- adversarial fixture
      Object.defineProperty(
        Object.prototype,
        ControlPlaneField.BOOT_INCARNATION,
        originals.bootIncarnation,
      );
    } else {
      delete Object.prototype[ControlPlaneField.BOOT_INCARNATION];
    }
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Object.prototype, 'valueOf', originals.valueOf);
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Object.prototype, 'toString', originals.toString);
  }
  t.equal(getterCalls, 0, 'durable identity ingress never invokes accessors');
  t.equal(gateway.updates.length, 3);
  for (let index = 0; index < gateway.updates.length; index += 1) {
    t.equal(gateway.updates[index].row.boot_incarnation, 9,
      'malformed identity preserves the known durable fence without minting');
  }
  service.stop();
  t.end();
});
