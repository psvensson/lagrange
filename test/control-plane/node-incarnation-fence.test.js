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
  CONTROL_PLANE_MESSAGE_COMPLETION_FIELD,
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  STATE,
} from '../../src/constants/index.js';

const TEST_NODE_ID = 'node-2';

function buildRegisteredNodeRow(options = {}) {
  const now = options.now || 1000;
  return {
    node_id: options.nodeId || TEST_NODE_ID,
    node_address: options.nodeAddress || 'localhost:8082',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: options.status || 'joining',
    connection_state: options.connectionState || STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: options.lastHeartbeat || now,
    boot_incarnation: options.bootIncarnation || 1,
    ready_lease_expires_at: options.readyLeaseExpiresAt ?? null,
    created_at: options.createdAt || now - 100,
  };
}

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
    service.publishNodeLifecycleMessage(stalePayload),
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

  // A writer cannot mint a newer incarnation through publication. The
  // registration owner must first acquire the canonical row for that boot.
  const freshPayload = buildPayload({bootIncarnation: 6});
  const freshError = await t.rejects(
    service.publishNodeLifecycleMessage(freshPayload),
  );
  t.equal(
    gateway.updates.length,
    0,
    'a publisher cannot replace the registered incarnation',
  );
  t.equal(
    freshError?.code,
    'NODE_STATE_UPDATE_SOURCE_CHANGED',
    'a newer but unregistered writer is a terminal source change',
  );

  service.stop();
});

test('unbranded activation evidence fails closed without mutating NODES',
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

    const error = await t.rejects(
      service.publishNodeLifecycleMessage(buildPayload({})),
    );
    t.equal(
      error?.code,
      'NODE_STATE_UPDATE_INCARNATION_REQUIRED',
      'absent incarnation evidence is refused',
    );
    t.equal(
      gateway.updates.length,
      0,
      'unbranded evidence performs no durable mutation',
    );

    service.stop();
  });

test('node-state publication never creates an absent registration row',
  async (t) => {
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

    const missingRowError = await t.rejects(
      service.publishNodeLifecycleMessage(stalePayload),
    );
    t.equal(
      missingRowError?.code,
      'NODE_ROW_MISSING',
      'absence remains the registration owner\'s concern',
    );

    t.equal(
      gateway.upserts.length,
      0,
      'the stale writer never reaches the missing-row upsert',
    );

    const freshMissingError = await t.rejects(
      service.publishNodeLifecycleMessage(buildPayload({
        nodeId: 'node-joiner',
        nodeAddress: 'localhost:8099',
        state: STATE.CONNECTED,
        bootIncarnation: 5,
        nodeRow: {
          [COLUMN.CPU_CORES]: 4,
          [COLUMN.MEMORY_MB]: 8192,
          [COLUMN.DISK_GB]: 250,
        },
      })),
    );
    t.equal(
      freshMissingError?.code,
      'NODE_ROW_MISSING',
      'even fresh evidence cannot create the row',
    );
    t.equal(
      gateway.upserts.length,
      0,
      'no compatibility UPSERT remains',
    );

    service.stop();
  });

test('a STALE_NODE_INCARNATION refusal is terminal, never a deferred ' +
  'completion', async (t) => {
  initEnv();

  const gateway = createRecordingGateway();
  const service = createService({
    cacheNode: buildRegisteredNodeRow({
      status: SERVICE_STATUS.ACTIVE,
      bootIncarnation: 5,
    }),
    cdcIntegrationService: gateway.cdcIntegrationService,
  });

  const staleError = await t.rejects(
    service.publishNodeLifecycleMessage(buildPayload({bootIncarnation: 1})),
  );
  t.equal(staleError?.code, STALE_NODE_INCARNATION_CODE,
    'a zombie writer is refused with the typed terminal error');
  t.notOk(staleError?.deferRetry,
    'the refusal never asks the sender to retry a zombie writer');
  t.equal(gateway.updates.length, 0, 'no write for a stale writer');

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
    row = service.nodeLifecyclePublication.buildUpdateRow(
      {
        nodeId: TEST_NODE_ID,
        nodeAddress: 'localhost:8082',
        capabilities: ['partition_replica'],
        telemetry: {
          [COLUMN.CPU_CORES]: 8,
          [COLUMN.MEMORY_MB]: 16384,
          [COLUMN.DISK_GB]: 500,
        },
      },
      buildRegisteredNodeRow({bootIncarnation: 7}),
      {
        nextState: STATE.CONNECTED,
        heartbeatAt: 10_000,
        readyLeaseExpiresAt: null,
        bootIncarnation: 7,
      },
    );
  } finally {
    Array.isArray = originals.arrayIsArray;
    Math.max = originals.mathMax;
    Number.isFinite = originals.numberIsFinite;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    String.prototype.trim = originals.stringTrim;
  }
  t.equal(row.boot_incarnation, 7);
  t.equal(row.capabilities, '["partition_replica"]');
  t.equal(row.cpu_cores, 8, 'telemetry projection ignores replaced intrinsics');
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
  const errors = [];
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
    for (const payload of [inheritedPayload, accessorPayload, objectPayload]) {
      errors.push(await t.rejects(service.publishNodeLifecycleMessage(payload)));
    }
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
  t.equal(
    errors.every((error) => {
      return error?.code === 'NODE_STATE_UPDATE_INCARNATION_REQUIRED';
    }),
    true,
    'every inherited, accessor, or coercive identity fails closed',
  );
  t.equal(gateway.updates.length, 0,
    'malformed identity never reaches the durable writer');
  service.stop();
  t.end();
});

test('R4 final CAS fences delayed G1 after registration replaces it with G2',
  async (t) => {
    initEnv();
    const gateway = createRecordingGateway();
    const g1 = buildRegisteredNodeRow({bootIncarnation: 1});
    const g2 = buildRegisteredNodeRow({
      bootIncarnation: 2,
      nodeAddress: 'localhost:8182',
      createdAt: 2000,
      lastHeartbeat: 2100,
    });
    const service = createService({
      cacheNode: g1,
      cdcIntegrationService: gateway.cdcIntegrationService,
      beforeNodeUpdate: ({durableRows}) => {
        durableRows.set(TEST_NODE_ID, structuredClone(g2));
      },
    });

    const error = await t.rejects(service.publishNodeLifecycleMessage(
      buildPayload({bootIncarnation: 1, heartbeatAt: 3000}),
    ));
    t.equal(error?.code, STALE_NODE_INCARNATION_CODE,
      'the zero-row readback classifies the superseded writer as stale');
    t.equal(gateway.updates.length, 0,
      'the full predicate prevents the stale durable mutation');
    service.stop();
  });

test('READY publication uses the complete observed registration predicate',
  async (t) => {
    initEnv();
    const gateway = createRecordingGateway();
    const source = buildRegisteredNodeRow({bootIncarnation: 8});
    const service = createService({
      cacheNode: source,
      cdcIntegrationService: gateway.cdcIntegrationService,
    });

    await service.publishNodeLifecycleMessage(
      buildPayload({bootIncarnation: 8, heartbeatAt: 3000}),
    );
    t.same(gateway.updates[0].whereClause, {
      node_id: TEST_NODE_ID,
      boot_incarnation: 8,
      status: 'joining',
      connection_state: STATE.CONNECTED,
      last_heartbeat: source.last_heartbeat,
      created_at: source.created_at,
    }, 'the gateway is only a persistence adapter for the exact source CAS');
    service.stop();
  });

test('R5 final CAS refuses a same-incarnation source regression', async (t) => {
  initEnv();
  const gateway = createRecordingGateway();
  const source = buildRegisteredNodeRow({bootIncarnation: 3});
  const service = createService({
    cacheNode: source,
    cdcIntegrationService: gateway.cdcIntegrationService,
    beforeNodeUpdate: ({durableRows}) => {
      durableRows.set(TEST_NODE_ID, {
        ...source,
        status: 'stopped',
        connection_state: 'disconnected',
        last_heartbeat: 2500,
      });
    },
  });

  const error = await t.rejects(service.publishNodeLifecycleMessage(
    buildPayload({bootIncarnation: 3, heartbeatAt: 3000}),
  ));
  t.equal(error?.code, 'NODE_STATE_UPDATE_SOURCE_CHANGED',
    'a prerequisite/source regression is terminal');
  t.equal(gateway.updates.length, 0,
    'the regressed source is never overwritten');
  service.stop();
});

test('a same-incarnation JOINING heartbeat advance remains a compatible ' +
  'level-triggered source', async (t) => {
  initEnv();
  const gateway = createRecordingGateway();
  const source = buildRegisteredNodeRow({
    bootIncarnation: 9,
    lastHeartbeat: 1000,
  });
  let advanceSourceHeartbeat = true;
  const service = createService({
    cacheNode: source,
    cdcIntegrationService: gateway.cdcIntegrationService,
    beforeNodeUpdate: ({durableRows}) => {
      if (!advanceSourceHeartbeat) return;
      advanceSourceHeartbeat = false;
      durableRows.set(TEST_NODE_ID, {
        ...source,
        last_heartbeat: 1500,
      });
    },
  });
  const payload = buildPayload({
    bootIncarnation: 9,
    heartbeatAt: 3000,
  });

  const first = await service.publishNodeLifecycleMessage(payload);
  t.match(first, {
    completionCompleted: false,
    deferRetry: true,
    publicationOutcome: 'not_applied_source_unchanged',
  }, 'a JOINING liveness advance requests re-drive instead of terminalizing');
  const result = await service.publishNodeLifecycleMessage(payload);
  t.match(result[CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW], {
    node_id: TEST_NODE_ID,
    boot_incarnation: 9,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
  }, 'the re-drive observes the new heartbeat fence and reaches READY');
  t.equal(gateway.updates.length, 1,
    'only the re-drive that owns the refreshed source predicate mutates');
  service.stop();
});

test('lost acknowledgement observes the exact destination and duplicate ' +
  'evidence remains idempotent', async (t) => {
  initEnv();
  const gateway = createRecordingGateway();
  const source = buildRegisteredNodeRow({bootIncarnation: 4});
  let loseFirstOutcome = true;
  const service = createService({
    cacheNode: source,
    cdcIntegrationService: gateway.cdcIntegrationService,
    beforeNodeUpdate: ({durableRows, data}) => {
      if (!loseFirstOutcome) return;
      loseFirstOutcome = false;
      durableRows.set(TEST_NODE_ID, {...source, ...data});
      throw new Error('lost acknowledgement');
    },
  });
  const payload = buildPayload({
    bootIncarnation: 4,
    heartbeatAt: Number.MAX_SAFE_INTEGER - 1000,
  });

  const first = await service.publishNodeLifecycleMessage(payload);
  const second = await service.publishNodeLifecycleMessage(payload);
  t.equal(first.publicationOutcome, 'resolved_by_readback',
    'a lost acknowledgement is classified by authoritative readback');
  t.equal(second.publicationOutcome, 'already_current',
    'duplicate evidence against the durable destination writes nothing');
  t.match(first[CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW], {
    node_id: TEST_NODE_ID,
    boot_incarnation: 4,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
  }, 'lost outcome is resolved only by exact authoritative destination');
  const authoritativeRowField =
    CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW;
  t.same(second[authoritativeRowField], first[authoritativeRowField],
    'duplicate valid evidence is idempotent');
  t.equal(gateway.updates.length, 0,
    'the observed destination prevents a replay write storm');
  service.stop();
});

test('correct incarnation for the wrong node identity cannot mutate a row',
  async (t) => {
    initEnv();
    const gateway = createRecordingGateway();
    const service = createService({
      cacheNode: buildRegisteredNodeRow({bootIncarnation: 5}),
      cdcIntegrationService: gateway.cdcIntegrationService,
    });
    const error = await t.rejects(service.publishNodeLifecycleMessage(
      buildPayload({
        nodeId: 'node-other',
        bootIncarnation: 5,
        heartbeatAt: 3000,
      }),
    ));
    t.equal(error?.code, 'NODE_ROW_MISSING',
      'identity mismatch is delegated back to registration, not inferred');
    t.equal(gateway.updates.length, 0, 'no other node row is touched');
    service.stop();
  });
