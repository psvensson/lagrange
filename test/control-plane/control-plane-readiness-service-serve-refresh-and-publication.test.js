import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/priority-recovery-snapshot.js';


test('ControlPlaneReadinessService refreshes cached ineligible snapshots ' +
  'in the background for serve decisions', async (t) => {
  const now = 529000;
  const nodeId = 'node-cached-ineligible-background';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let releaseAuthoritativeRead = null;
  const authoritativeReadGate = new Promise((resolve) => {
    releaseAuthoritativeRead = resolve;
  });
  let backgroundReadStartedResolve = null;
  const backgroundReadStarted = new Promise((resolve) => {
    backgroundReadStartedResolve = resolve;
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName) {
        authoritativeReads.push(tableName);
        backgroundReadStartedResolve?.();
        await authoritativeReadGate;
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const initial = await readinessService.getNodeReadiness(
    nodeId,
    {maxCachedAgeMs: 5000},
  );

  const repeated = await readinessService.getNodeReadiness(
    nodeId,
    {
      maxCachedAgeMs: 5000,
      allowAuthoritativeRefresh: true,
      preferBackgroundRefreshOnIneligible: true,
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    },
  );

  t.equal(initial.dimensions.serveEligible, false);
  t.equal(repeated.dimensions.serveEligible, false,
    'background-refresh mode should return the cached ineligible snapshot immediately');

  await backgroundReadStarted;
  t.equal(authoritativeReads.length, 2,
    'background-refresh mode should start the owner-path refresh without blocking the caller');

  releaseAuthoritativeRead();
  await new Promise((resolve) => setImmediate(resolve));

  const refreshed = await readinessService.getNodeReadiness(
    nodeId,
    {maxCachedAgeMs: 5000},
  );
  t.equal(refreshed.dimensions.serveEligible, true,
    'later callers should observe the asynchronously refreshed readiness snapshot');
  t.end();
});

test('ControlPlaneReadinessService refreshes cached ineligible snapshots ' +
  'synchronously for serve decisions', async (t) => {
  const now = 530000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-cached-ineligible-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService('node-cached-ineligible-refresh'),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-cached-ineligible-refresh': {
        nodeId: 'node-cached-ineligible-refresh',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, sql, params, options,
      ) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-cached-ineligible-refresh'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(
              'node-cached-ineligible-refresh',
            )],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const initial = await readinessService.getNodeReadiness(
    'node-cached-ineligible-refresh',
    {maxCachedAgeMs: 5000},
  );

  const refreshed = await readinessService.getNodeReadiness(
    'node-cached-ineligible-refresh',
    {
      maxCachedAgeMs: 5000,
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  t.equal(initial.dimensions.serveEligible, false);
  t.equal(refreshed.dimensions.serveEligible, true);
  t.equal(
    authoritativeReads.length,
    2,
    'serve-gating callers should bypass cached ineligible snapshots and ' +
      'refresh immediately',
  );
  t.end();
});

test('ControlPlaneReadinessService bypasses authoritative repair cooldown ' +
  'for fresh ineligible repair decisions', async (t) => {
  let now = 540000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-repair-cooldown-bypass'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService('node-repair-cooldown-bypass'),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let repairAttempt = 0;
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-repair-cooldown-bypass': {
        nodeId: 'node-repair-cooldown-bypass',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, sql, params, options,
      ) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          repairAttempt += 1;
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-repair-cooldown-bypass'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          if (repairAttempt <= 1) {
            return {
              success: true,
              rows: [{
                ...createMessageGroupService(
                  'node-repair-cooldown-bypass',
                ),
                [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
              }],
            };
          }
          return {
            success: true,
            rows: [createMessageGroupService(
              'node-repair-cooldown-bypass',
            )],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    authoritativeReadinessRepairCooldownMs: 30000,
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    'node-repair-cooldown-bypass',
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'repairEligible',
    },
  );

  now += 1000;

  const second = await readinessService.getNodeReadiness(
    'node-repair-cooldown-bypass',
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'repairEligible',
    },
  );

  t.equal(first.dimensions.repairEligible, false);
  t.equal(second.dimensions.repairEligible, true);
  t.equal(
    authoritativeReads.length,
    4,
    'repair-eligibility fresh decisions should bypass cooldown and re-read',
  );
  t.end();
});

test('ControlPlaneReadinessService bypasses authoritative repair cooldown ' +
  'for fresh ineligible serve decisions', async (t) => {
  let now = 640000;
  const nodeId = 'node-serve-cooldown-bypass';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
    }],
  });
  const authoritativeReads = [];
  let repairAttempt = 0;
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, sql, params, options,
      ) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          repairAttempt += 1;
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          if (repairAttempt <= 1) {
            return {
              success: true,
              rows: [{
                ...createMessageGroupService(nodeId),
                [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
              }],
            };
          }
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    authoritativeReadinessRepairCooldownMs: 30000,
    now: () => now,
  });

  const first = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  now += 1000;

  const second = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'serveEligible',
    },
  );

  t.equal(first.dimensions.serveEligible, false);
  t.equal(second.dimensions.serveEligible, true);
  t.equal(
    authoritativeReads.length,
    4,
    'serve-eligibility fresh decisions should bypass cooldown and re-read',
  );
  t.end();
});

test('ControlPlaneReadinessService refreshes a transport-connected stale ' +
  'stopped node row before denying repair routing', async (t) => {
  const now = 640000;
  const nodeId = 'node-restarted';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    }],
    services: [createMessageGroupService(nodeId)],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName, sql, params, options,
      ) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {
      allowAuthoritativeRefresh: true,
      requireFreshOnIneligible: true,
      decisionDimension: 'repairEligible',
    },
  );

  t.equal(readiness.dimensions.processAlive, true,
    'authoritative refresh should replace the stale stopped lifecycle state');
  t.equal(readiness.dimensions.repairEligible, true,
    'transport-connected restarted nodes should recover repair routing after authoritative refresh');
  t.equal(authoritativeReads.length, 2,
    'stale stopped transport-connected rows should trigger authoritative node and service refresh');
  t.equal(
    cache.get(TABLES.NODES, nodeId)?.[COLUMN.STATUS],
    SERVICE_STATUS.ACTIVE,
    'authoritative refresh should update the cached node row back to active',
  );
  t.end();
});

test('ControlPlaneReadinessService authoritative repair can route to the ' +
  'leader path through repair-eligible SQL fallback instead of trusting ' +
  'local replica fallback rows',
async (t) => {
  const now = 390000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-routed-refresh'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-routed-refresh')],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-routed-refresh': {
        nodeId: 'node-routed-refresh',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-routed-refresh'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-routed-refresh')],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    'node-routed-refresh',
    {allowAuthoritativeRefresh: true},
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(authoritativeReads.length, 2,
    'repair should perform bounded authoritative node and service reads');
  for (const read of authoritativeReads) {
    t.equal(
      read.options.readAuthority.localReadConsistency,
      'local_leader',
    );
    t.equal(
      read.options.readAuthority.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
    );
    t.equal(
      read.options.readAuthority.replicaFallbackConsistency,
      'any_replica',
      'readiness repair should prefer a local replica repair read before routed SQL',
    );
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'readiness repair fallback must stay on control-plane recovery routing',
    );
    t.equal(
      read.options?.queryOptions?.allowReadinessAuthoritativeRefresh,
      false,
      'readiness repair fallback must not recurse into readiness refresh',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'readiness repair fallback should isolate the SQL session',
    );
  }
  t.end();
});

test('ControlPlaneReadinessService keeps self-node hot-path readiness off the ' +
  'authoritative owner path when local service evidence is available',
async (t) => {
  const now = 395000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-self-fallback'),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-self-fallback')],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-self-fallback',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-self-fallback': {
        nodeId: 'node-self-fallback',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode('node-self-fallback'),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService('node-self-fallback')],
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    'node-self-fallback',
    {
      allowAuthoritativeRefresh: true,
    },
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true);
  t.equal(authoritativeReads.length, 0,
    'self readiness should rely on local active service evidence instead of synchronous authoritative self repair');
  t.end();
});

test('ControlPlaneReadinessService repairs self readiness through the ' +
  'authoritative owner using repair-eligible SQL fallback when local ' +
  'leader reads are unavailable', async (t) => {
  const now = 396000;
  const nodeId = 'node-self-routed-refresh';
  const cache = createCache({
    nodes: [{
      ...createActiveNode(nodeId),
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [{
      ...createMessageGroupService(nodeId),
      [COLUMN.STATUS]: 'syncing',
    }],
  });
  const authoritativeReads = [];
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    messageRouter: {
      getConnectionState(targetNodeId) {
        return targetNodeId === nodeId ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      [nodeId]: {
        nodeId,
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        const queryOptions = options?.queryOptions || {};
        if (options?.readAuthority?.authoritativeReadMode !==
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE
                .OWNER_RPC_PREFERRED_SQL_FALLBACK ||
            queryOptions?.routingReadinessDimension !==
              CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE ||
            typeof queryOptions?.sessionId !== 'string' ||
            queryOptions.sessionId.length === 0) {
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        }
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              ...createActiveNode(nodeId),
              [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
              [COLUMN.LAST_HEARTBEAT]: now - 100,
              [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60000,
            }],
            source: 'sql_query_engine',
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [createMessageGroupService(nodeId)],
            source: 'sql_query_engine',
          };
        }
        return {success: false, rows: []};
      },
    },
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness = await readinessService.getNodeReadiness(
    nodeId,
    {allowAuthoritativeRefresh: true},
  );

  t.equal(readiness.dimensions.clusterMemberHealthy, true,
    'authoritative refresh should repair the stale heartbeat evidence');
  t.equal(readiness.dimensions.routingReady, true,
    'authoritative refresh should repair inactive self service evidence');
  t.equal(readiness.dimensions.serveEligible, true,
    'load-lane callers should admit once the owner path repairs self evidence');
  t.equal(authoritativeReads.length, 2,
    'repair should read both node and service evidence');
  for (const read of authoritativeReads) {
    t.equal(
      read.options?.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'one repair mode allows canonical SQL fallback',
    );
    t.equal(
      read.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'repair fallback must stay on control-plane recovery routing',
    );
    t.match(
      String(read.options?.queryOptions?.sessionId || ''),
      /^authoritative-control-plane-read:/,
      'repair fallback should isolate the SQL session',
    );
  }
  t.end();
});

test('ControlPlaneReadinessService classifies degraded publication separately',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-2')],
      services: [createMessageGroupService('node-2')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-2',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-2': {
          nodeId: 'node-2',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
        reasonCode: 'grouped_delivery_failure',
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-2');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.metadataPublicationHealthy, false);
    t.equal(readiness.dimensions.controlPlaneWritable, false);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
      ),
    );
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService treats config-safe publication as writable',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-safe')],
      services: [createMessageGroupService('node-safe')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-safe',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-safe': {
          nodeId: 'node-safe',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
        reasonCode: 'config_safe_mode',
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-safe');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.metadataPublicationHealthy, true);
    t.equal(readiness.dimensions.controlPlaneWritable, true);
    t.equal(readiness.dimensions.placementEligible, true);
    t.notOk(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
      ),
    );
    t.notOk(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService exposes active priority control-plane recovery mode while publication is pending',
  async (t) => {
    const nodeId = 'node-priority-recovery';
    const publicationReadOptions = [];
    const cache = createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        [nodeId]: {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode(_nodeId, options = null) {
          publicationReadOptions.push(options);
          return {
            publicationEpoch: 14,
            status: 'ACK_PENDING',
            createdAt: 1200,
            requiredAckNodeIds: [nodeId],
            acknowledgedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      nodeId,
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'priority recovery mode should remain active until the membership publication is closed and priority partitions satisfy spread',
    );
    t.equal(readiness.priorityControlPlaneRecovery.publicationEpoch, 14);
    t.equal(readiness.priorityControlPlaneRecovery.publicationStatus, 'ACK_PENDING');
    const diagnosticsReadOptions = publicationReadOptions.find(
      (options) => options?.readProfile === 'diagnostics',
    );
    const planningReadOptions = publicationReadOptions.find(
      (options) => options?.readProfile === 'planning',
    );
    t.equal(
      diagnosticsReadOptions?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'membership publication diagnostics should use the strict owner-RPC authoritative mode',
    );
    t.equal(
      diagnosticsReadOptions?.localReadConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'membership publication diagnostics should read from local leaders only',
    );
    t.equal(
      diagnosticsReadOptions?.replicaFallbackConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'membership publication diagnostics should avoid any-replica fallback',
    );
    t.equal(
      diagnosticsReadOptions?.queryTimeoutMs,
      NUM.THOUSAND,
      'membership publication diagnostics should bound owner reads to the readiness timeout budget',
    );
    t.equal(
      planningReadOptions?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'planning publication reads should remain best-effort instead of requiring owner-RPC',
    );
    t.equal(
      planningReadOptions?.replicaFallbackConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      'planning publication reads may fall back to any replica for recovery planning',
    );
    t.end();
  });

test('ControlPlaneReadinessService clears priority control-plane recovery mode after publication and spread converge',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-steady')],
      services: [createMessageGroupService('node-priority-steady')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-steady',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-steady': {
          nodeId: 'node-priority-steady',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode() {
          return {
            publicationEpoch: 15,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-priority-steady'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-steady',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, false);
    t.same(readiness.priorityControlPlaneRecovery.reasonCodes, []);
    t.equal(readiness.priorityControlPlaneRecovery.publicationStatus, 'PUBLISHED');
    t.end();
  });

test('ControlPlaneReadinessService exposes a normalized membership publication planning snapshot',
  (t) => {
    let planningPublicationReadOptions = null;
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-planning-snapshot',
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync(_nodeId, options = {}) {
          planningPublicationReadOptions = options;
          return {
            publicationEpoch: 21,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-planning-snapshot'],
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          };
        },
      },
      now: () => 1500,
    });

    const snapshot = readinessService.getMembershipPublicationPlanningSnapshotSync(
      'node-planning-snapshot',
      1500,
    );

    t.equal(snapshot?.publicationEpoch, 21);
    t.equal(snapshot?.publicationStatus, 'PUBLISHED');
    t.equal(snapshot?.publicationPending, false);
    t.equal(snapshot?.publicationExcludesTargetNode, false);
    t.equal(snapshot?.publishedMembershipIncludesTargetNode, true);
    t.equal(snapshot?.publishedPlanningEpoch, 21);
    t.equal(
      snapshot?.recoveryProtocolState,
      'priority_spread_pending',
      'planning snapshots should surface the shared recovery protocol phase',
    );
    t.match(
      snapshot?.targetParticipation,
      {
        nodeId: 'node-planning-snapshot',
        state: 'published_active',
      },
      'planning snapshots should expose the target node participation state',
    );
    t.equal(
      planningPublicationReadOptions?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'planning snapshots should use the best-effort owner-RPC publication mode',
    );
    t.equal(
      planningPublicationReadOptions?.localReadConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'planning snapshots should keep local leader for the baseline read',
    );
    t.equal(
      planningPublicationReadOptions?.replicaFallbackConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      'planning snapshots should fallback to any replica when needed',
    );
    t.equal(
      planningPublicationReadOptions?.workClass,
      'control-plane-planning',
      'planning snapshot reads should be tagged for planning work class',
    );
    t.equal(
      planningPublicationReadOptions?.queryTimeoutMs,
      NUM.THOUSAND,
      'planning snapshots should use the readiness-bound membership read timeout',
    );
    t.same(
      snapshot?.priorityRecoveryReasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD],
      'planning snapshot should preserve shared publication-recovery reasons',
    );
    t.end();
  });
