/**
 * D6 witness: the heartbeat endpoint writer versus a terminal NODES row.
 *
 * The lease reaper drives a stranded generation's NODES row to STOPPED and
 * reaps its node_endpoints row to INACTIVE at that exact incarnation. The
 * reaped process may still be running: the reaper only requires that it had
 * no live lease and no live transport at the moment of the sweep.
 *
 * N2 (node-lifecycle-publication.js) already refuses that terminal row as a
 * liveness publication source. The heartbeat's SECOND liveness leg — the
 * node_endpoints refresh — carries its own incarnation fence and no source
 * fence, so on a tick whose node-row write coalesces away it would CAS the
 * reaped endpoint row back to ACTIVE at the same incarnation G1, publishing
 * a routing target for a generation the cluster has already terminalized.
 *
 * The fence: a heartbeat endpoint refresh consumes the lifecycle owner's own
 * terminal-source predicate (isTerminalNodeLifecycleSource) and never
 * reactivates the endpoint of a terminal generation. Red on revert: delete
 * the check in sendHeartbeat and the reaped endpoint goes ACTIVE again.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HeartbeatService} from
  '../../src/control-plane/heartbeat-service.js';
import {NodeLifecyclePublication} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  SERVICE_STATUS,
  STATE,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  ENDPOINT_ID_PREFIX,
  ENDPOINT_ID_SUFFIX,
} from '../../src/control-plane/heartbeat-service-runtime-state.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'node-reaped-g1';
const NODE_ADDRESS = '10.0.0.41:8080';
const ENDPOINT_ID = `${ENDPOINT_ID_PREFIX}${NODE_ID}${ENDPOINT_ID_SUFFIX}`;
const FIRST_TICK = 500_000;
const SECOND_TICK = FIRST_TICK + 1_000;
const MIN_UPDATE_INTERVAL_MS = 30_000;
const MAX_STALENESS_MS = 600_000;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) config.initialize({});
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
}

function liveNodeRow() {
  return {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.LAST_HEARTBEAT]: FIRST_TICK - 5_000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: FIRST_TICK + 15_000,
    [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
    [COLUMN.CREATED_AT]: FIRST_TICK - 60_000,
    [COLUMN.CPU_CORES]: 4,
    [COLUMN.MEMORY_MB]: 8_192,
    [COLUMN.DISK_GB]: 100,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 20,
    [COLUMN.DISK_USAGE_PERCENT]: 30,
  };
}

function activeEndpointRow() {
  return {
    [COLUMN.ENDPOINT_ID]: ENDPOINT_ID,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: NODE_ADDRESS,
    [COLUMN.PRIORITY]: 0,
    [COLUMN.METADATA]: JSON.stringify({}),
    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
    [COLUMN.CREATED_AT]: FIRST_TICK - 60_000,
    [COLUMN.UPDATED_AT]: FIRST_TICK - 60_000,
  };
}

// One durable NODES row plus one durable node_endpoints row, both honoring
// their CAS predicates exactly, behind the gateway shape the control-plane
// owners use.
function createDurableWorld() {
  const rows = {
    [SYSTEM_TABLE_NAME.NODES]: liveNodeRow(),
    [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: activeEndpointRow(),
  };
  const endpointWrites = [];
  const matches = (row, whereClause) => Boolean(row) &&
    Object.entries(whereClause)
      .every(([column, value]) => (row[column] ?? null) === value);
  return {
    rows,
    endpointWrites,
    // The reaper's terminal transition of this exact generation.
    reap(now) {
      rows[SYSTEM_TABLE_NAME.NODES] = {
        ...rows[SYSTEM_TABLE_NAME.NODES],
        [COLUMN.STATUS]: NODE_STATE.STOPPED,
        [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
        [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        [COLUMN.UPDATED_AT]: now,
      };
      rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS] = {
        ...rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS],
        [COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE,
        [COLUMN.UPDATED_AT]: now,
      };
    },
    cache: {
      get(tableName, key) {
        const row = rows[tableName] || null;
        if (!row) return null;
        const identity = tableName === SYSTEM_TABLE_NAME.NODES ?
          row[COLUMN.NODE_ID] :
          row[COLUMN.ENDPOINT_ID];
        return identity === key ? {...row} : null;
      },
    },
    gateway: {
      async readAuthoritativeRows(tableName) {
        const row = rows[tableName] || null;
        return {success: true, rows: row ? [{...row}] : []};
      },
      async readRows(tableName) {
        const row = rows[tableName] || null;
        return {success: true, rows: row ? [{...row}] : []};
      },
      async insertSystemTableRow(tableName, row) {
        if (tableName === SYSTEM_TABLE_NAME.NODE_ENDPOINTS) {
          endpointWrites.push({kind: 'insert', row});
        }
        if (rows[tableName]) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
        rows[tableName] = {...row};
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === SYSTEM_TABLE_NAME.NODE_ENDPOINTS) {
          endpointWrites.push({kind: 'update', whereClause, data});
        }
        if (!matches(rows[tableName], whereClause)) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
        rows[tableName] = {...rows[tableName], ...data};
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
  };
}

function createHeartbeat(world, now) {
  return new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    bootIncarnation: TEST_BOOT_INCARNATION,
    systemTableCache: world.cache,
    controlPlaneSystemTableGateway: world.gateway,
    nodeLifecyclePublication: new NodeLifecyclePublication({
      gateway: world.gateway,
      leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: 15_000}),
      now,
    }),
    // The endpoint refresh is always due; the node-row write coalesces
    // inside the minimum interval. That is the ordinary steady state.
    endpointRefreshIntervalMs: 1,
    nodeMetadataMinUpdateIntervalMs: MIN_UPDATE_INTERVAL_MS,
    nodeMetadataMaxStalenessMs: MAX_STALENESS_MS,
    now,
  });
}

test('D6: a still-running reaped generation never reactivates its endpoint ' +
  'through the heartbeat endpoint refresh', async (t) => {
  initEnv();
  const world = createDurableWorld();
  let clock = FIRST_TICK;
  const service = createHeartbeat(world, () => clock);

  await service.sendHeartbeat(null, null);
  t.equal(world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS][COLUMN.STATUS],
    ENDPOINT_STATUS.ACTIVE, 'the live generation publishes an ACTIVE endpoint');

  world.reap(FIRST_TICK + 500);
  world.endpointWrites.length = 0;
  clock = SECOND_TICK;

  // The node-row leg coalesces (inside the minimum interval, nothing
  // structural changed), so nothing refuses this tick before the endpoint
  // leg is reached.
  await service.sendHeartbeat(null, null);
  t.equal(service.lastHeartbeatPublicationDecision.shouldWrite, false,
    'the node-row leg coalesced: the endpoint leg runs on its own');
  t.same(world.endpointWrites, [],
    'a terminal generation issues no endpoint mutation at all');
  t.equal(world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS][COLUMN.STATUS],
    ENDPOINT_STATUS.INACTIVE,
    'the reaped endpoint row stays INACTIVE');
});

test('D6: the endpoint refresh of a non-terminal generation is unchanged',
  async (t) => {
    initEnv();
    const world = createDurableWorld();
    let clock = FIRST_TICK;
    const service = createHeartbeat(world, () => clock);

    await service.sendHeartbeat(null, null);
    world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS] = {
      ...world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS],
      [COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE,
    };
    world.endpointWrites.length = 0;
    clock = SECOND_TICK;

    await service.sendHeartbeat(null, null);
    t.equal(service.lastHeartbeatPublicationDecision.shouldWrite, false,
      'the node-row leg coalesced here too');
    t.equal(world.endpointWrites.length, 1,
      'a live generation still refreshes its endpoint');
    t.equal(world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS][COLUMN.STATUS],
      ENDPOINT_STATUS.ACTIVE,
      'the live generation republishes its ACTIVE endpoint');
  });

test('D6: the terminal source fence is the node lifecycle owner\'s own ' +
  'predicate, fenced by the exact generation', async (t) => {
  const {isTerminalNodeLifecycleSource} =
    await import('../../src/control-plane/node-lifecycle-publication.js');
  const stopped = {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: NODE_STATE.STOPPED,
    [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
  };
  t.equal(isTerminalNodeLifecycleSource(stopped, TEST_BOOT_INCARNATION), true,
    'this generation\'s STOPPED row is terminal');
  t.equal(
    isTerminalNodeLifecycleSource(stopped, TEST_BOOT_INCARNATION + 1), false,
    'a successor generation is not fenced by its predecessor\'s terminal row',
  );
  t.equal(isTerminalNodeLifecycleSource(
    {...stopped, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE},
    TEST_BOOT_INCARNATION), false, 'a live row is not terminal');
  t.equal(isTerminalNodeLifecycleSource(null, TEST_BOOT_INCARNATION), false,
    'an unobserved row is not a terminal observation');
});

// V3a adoption (commit D, heartbeat-service-write-coalescing.js): before this
// process's first endpoint write, the first heartbeat ADOPTS the endpoint row
// this boot already published - same boot incarnation, same routing content,
// updated_at inside the refresh interval - instead of rewriting it. Each
// condition is load-bearing; the witnesses below pin them one by one.
const ADOPTION_REFRESH_INTERVAL_MS = 300_000;

function createAdoptionHeartbeat(world, now, bootIncarnation) {
  return new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    bootIncarnation,
    systemTableCache: world.cache,
    controlPlaneSystemTableGateway: world.gateway,
    nodeLifecyclePublication: new NodeLifecyclePublication({
      gateway: world.gateway,
      leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: 15_000}),
      now,
    }),
    endpointRefreshIntervalMs: ADOPTION_REFRESH_INTERVAL_MS,
    nodeMetadataMinUpdateIntervalMs: MIN_UPDATE_INTERVAL_MS,
    nodeMetadataMaxStalenessMs: MAX_STALENESS_MS,
    now,
  });
}

function createAdoptionWorld({endpointIncarnation, endpointUpdatedAt,
  nodeIncarnation = endpointIncarnation}) {
  const world = createDurableWorld();
  world.rows[SYSTEM_TABLE_NAME.NODES] = {
    ...world.rows[SYSTEM_TABLE_NAME.NODES],
    [COLUMN.BOOT_INCARNATION]: nodeIncarnation,
  };
  world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS] = {
    ...world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS],
    [COLUMN.BOOT_INCARNATION]: endpointIncarnation,
    [COLUMN.UPDATED_AT]: endpointUpdatedAt,
  };
  return world;
}

test('V3a adoption: the first heartbeat adopts the join-born endpoint row of ' +
  'this boot (same incarnation, same content, fresh)', async (t) => {
  initEnv();
  const world = createAdoptionWorld({
    endpointIncarnation: TEST_BOOT_INCARNATION,
    endpointUpdatedAt: FIRST_TICK - 1_000,
  });
  const service = createAdoptionHeartbeat(world, () => FIRST_TICK,
    TEST_BOOT_INCARNATION);
  await service.sendHeartbeat(null, null);
  t.same(world.endpointWrites, [], 'adopted: no endpoint rewrite');
});

test('V3a adoption: a restart with the same address and a NEW incarnation ' +
  'never adopts the previous incarnation\'s row - it writes its endpoint',
async (t) => {
  initEnv();
  const nextIncarnation = TEST_BOOT_INCARNATION + 1;
  const world = createAdoptionWorld({
    endpointIncarnation: TEST_BOOT_INCARNATION,
    endpointUpdatedAt: FIRST_TICK - 1_000,
    nodeIncarnation: nextIncarnation,
  });
  const service = createAdoptionHeartbeat(world, () => FIRST_TICK,
    nextIncarnation);
  await service.sendHeartbeat(null, null);
  t.ok(world.endpointWrites.length > 0,
    'the new incarnation writes its own endpoint row');
  t.equal(
    world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS][COLUMN.BOOT_INCARNATION],
    nextIncarnation,
    'the endpoint row now carries the new incarnation',
  );
});

test('V3a adoption: a row of this boot older than the refresh interval is ' +
  'not current - the first heartbeat refreshes it', async (t) => {
  initEnv();
  const world = createAdoptionWorld({
    endpointIncarnation: TEST_BOOT_INCARNATION,
    endpointUpdatedAt: FIRST_TICK - ADOPTION_REFRESH_INTERVAL_MS - 1,
  });
  const service = createAdoptionHeartbeat(world, () => FIRST_TICK,
    TEST_BOOT_INCARNATION);
  await service.sendHeartbeat(null, null);
  t.equal(world.endpointWrites.length, 1, 'the stale row is rewritten');
  t.equal(world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS][COLUMN.UPDATED_AT],
    FIRST_TICK, 'refreshed at this tick');
});

test('V3a adoption happens only before this process\'s first endpoint write: ' +
  'afterwards the refresh follows the process\'s own upsert record', async (t) => {
  initEnv();
  const world = createAdoptionWorld({
    endpointIncarnation: TEST_BOOT_INCARNATION,
    endpointUpdatedAt: FIRST_TICK - ADOPTION_REFRESH_INTERVAL_MS - 1,
  });
  let clock = FIRST_TICK;
  const service = createAdoptionHeartbeat(world, () => clock,
    TEST_BOOT_INCARNATION);
  await service.sendHeartbeat(null, null);
  t.equal(world.endpointWrites.length, 1, 'this process wrote once');
  // Another writer at this incarnation touches the row with identical
  // content; this process's own refresh falls due.
  clock = FIRST_TICK + ADOPTION_REFRESH_INTERVAL_MS;
  world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS] = {
    ...world.rows[SYSTEM_TABLE_NAME.NODE_ENDPOINTS],
    [COLUMN.UPDATED_AT]: clock - 1_000,
  };
  world.endpointWrites.length = 0;
  await service.sendHeartbeat(null, null);
  t.equal(world.endpointWrites.length, 1,
    'the due refresh is written, not adopted from the touched row');
});
