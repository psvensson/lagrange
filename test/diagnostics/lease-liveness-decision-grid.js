/**
 * The decision surface of quest `lease-liveness-watermark-observed`, as data.
 *
 * Every decision the quest promises not to change is evaluated here on a
 * fixed input grid and returned as plain JSON: the control snapshot's stale
 * watermark and its ready-lease witness, the authoritative repair trigger and
 * the table set it selects, the snapshot observation state, the lease
 * sweeper's skip and disconnect decisions over a sequence of sweeps, and the
 * admission observer's classification and transition history.
 *
 * The golden file beside this module was produced by running this module
 * against main (f9d388499), BEFORE the quest's source changes existed, so the
 * neutrality test is a differential against main rather than a restatement of
 * the new code. Regenerate it on any commit with:
 *
 *   node -e "import('./test/diagnostics/lease-liveness-decision-grid.js')
 *     .then(async (m) => process.stdout.write(
 *       JSON.stringify(await m.buildLeaseLivenessDecisionGrid(), null, 2) +
 *       '\n'))" > test/diagnostics/lease-liveness-decision-grid.golden.json
 *
 * Nothing here reads an ambient clock: every time source is injected.
 */

import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {
  deriveAuthoritativeRepairTables,
} from '../../src/admin/admin-authoritative-repair-policy.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {
  LEASE_LOG_MSG,
} from '../../src/control-plane/lease-service-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  waitForAffinityDemoSchemaAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';

const CAPTURED_AT_MS = 1_000_000;
const SECOND_MS = 1_000;
const NODE_STATUS = Object.freeze({
  ACTIVE: 'active',
  JOINING: 'joining',
  STOPPED: 'stopped',
});
const CONNECTION_STATE = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  READY: 'ready',
});
const CDC_UPDATE = 'UPDATE';
const SEED_NODE_ID = 'node-0';
const VICTIM_NODE_ID = 'node-1';
const THIRD_NODE_ID = 'node-2';
const LOG_LEVEL_ERROR = 'error';
// The traced failure skipped the same node 33 times over 166 s, so the
// horizon has to reach past any grace a skip counter could be wired into.
const SWEEP_COUNT = 35;
const SWEEP_STEP_MS = 5_000;
const LEASE_NOW_MS = 100_000;
const OBSERVER_BASE_MS = 500_000;
const OBSERVER_TIMEOUT_MS = 40;
const OBSERVER_STABLE_WINDOW_MS = 1_000_000;
const OBSERVER_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const OBSERVER_QUERY_ERROR = 'Admin API query timed out';
const RATINGS_LEADER_PARTITION_ID = 'ratings-p1';
const BLOCKED_PARTITION_ID = 'replica_operations-p1';
const PRIORITY_PARTITION_COUNT = 6;
const WITNESS_SCHEMA_VERSION = 1;
const WITNESS_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const WITNESS_NO_STALE_ACTIVE_NODE = 'no_stale_active_node';
const OBSERVATION_STATE_AVAILABLE = 'available';
const OBSERVATION_SOURCE = 'control_snapshot_captured_rows';
const SWEEP_SKIPPED_MESSAGE = LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED;
const HOSTILE_LOGGER_ERROR = 'logger exploded';
const HOSTILE_LOGGER_STRING = 'not-a-logger';
const HOSTILE_LOGGER_NUMBER = 42;

function nodeRow(nodeId, overrides = {}) {
  return {
    node_id: nodeId,
    status: NODE_STATUS.ACTIVE,
    connection_state: CONNECTION_STATE.READY,
    last_heartbeat: CAPTURED_AT_MS - SECOND_MS,
    ready_lease_expires_at: CAPTURED_AT_MS + SECOND_MS * 3,
    updated_at_hlc: `${CAPTURED_AT_MS - SECOND_MS * 2}-4-${nodeId}`,
    ...overrides,
  };
}

const NODE_ROW_SCENARIOS = Object.freeze([
  {name: 'no rows at all', rows: []},
  {name: 'one active node inside its lease', rows: [nodeRow(SEED_NODE_ID)]},
  {
    name: 'one active node five seconds past expiry',
    rows: [nodeRow(VICTIM_NODE_ID, {
      ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 5,
    })],
  },
  {
    name: 'the traced case: active and ready, lease 166 s past expiry',
    rows: [
      nodeRow(SEED_NODE_ID),
      nodeRow(VICTIM_NODE_ID, {
        ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 166,
        last_heartbeat: CAPTURED_AT_MS - SECOND_MS * 178,
      }),
    ],
  },
  {
    name: 'ready but not active, lease past expiry',
    rows: [nodeRow(VICTIM_NODE_ID, {
      status: NODE_STATUS.JOINING,
      ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS,
    })],
  },
  {
    name: 'connected rather than ready, lease past expiry',
    rows: [nodeRow(VICTIM_NODE_ID, {
      status: NODE_STATUS.JOINING,
      connection_state: CONNECTION_STATE.CONNECTED,
      ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS,
    })],
  },
  {
    name: 'active node with no lease evidence at all',
    rows: [nodeRow(VICTIM_NODE_ID, {ready_lease_expires_at: null})],
  },
  {
    name: 'stopped and disconnected node past expiry is not considered',
    rows: [nodeRow(VICTIM_NODE_ID, {
      status: NODE_STATUS.STOPPED,
      connection_state: CONNECTION_STATE.DISCONNECTED,
      ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 90,
    })],
  },
  {
    name: 'two stale nodes: the first row decides',
    rows: [
      nodeRow(VICTIM_NODE_ID, {
        ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 20,
      }),
      nodeRow(THIRD_NODE_ID, {
        ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 40,
      }),
    ],
  },
  {
    name: 'the second row is the only stale one',
    rows: [
      nodeRow(SEED_NODE_ID),
      nodeRow(THIRD_NODE_ID, {
        ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 40,
      }),
    ],
  },
]);

function ensureSingletonsInitialized() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: LOG_LEVEL_ERROR});
  }
}

function buildLocalSnapshot() {
  return {
    capturedAt: CAPTURED_AT_MS,
    replicaOperations: {inFlightCount: 0, staleInFlightCount: 0},
    leaders: {},
    controlPlaneDiagnostics: {},
  };
}

function buildPopulatedCache(rows) {
  const cache = new SystemTableCache();
  for (const row of rows) {
    cache.applySystemTableChange(TABLES.NODES, CDC_UPDATE, row);
  }
  return cache;
}

// Counts how often the nodes rows are read, so the `one-evaluation`
// constraint is pinned by the differential rather than by inspection.
function buildNodeReadCountingCache(cache, counter) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        counter.nodesReads += 1;
      }
      return cache.getAll(tableName);
    },
    getLastCdcObservation(tableName, key) {
      return cache.getLastCdcObservation(tableName, key);
    },
    applySystemTableChange(tableName, operation, data, options) {
      return cache.applySystemTableChange(tableName, operation, data, options);
    },
  };
}

function buildControlSnapshot(cache, logger) {
  return new AdminControlSnapshot({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
    nowFn: () => CAPTURED_AT_MS,
    logger,
  });
}

async function buildControlSnapshotDecisions(scenario, logger) {
  const counter = {nodesReads: 0};
  const cache = buildNodeReadCountingCache(
    buildPopulatedCache(scenario.rows),
    counter,
  );
  const controlSnapshot = buildControlSnapshot(cache, logger);
  const nodeRows = cache.getAll(TABLES.NODES);
  counter.nodesReads = 0;
  const watermark = controlSnapshot.resolveControlSnapshotCacheStaleWatermark(
    nodeRows,
    CAPTURED_AT_MS,
  );
  const watermarkNodesReads = counter.nodesReads;
  counter.nodesReads = 0;
  const repair = controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
    buildLocalSnapshot(),
    {},
  );
  const repairEvaluationNodesReads = counter.nodesReads;
  const owner = new ControlPlaneSnapshotOwner({controlSnapshot});
  counter.nodesReads = 0;
  const resolved = await owner.resolveControlSnapshot(
    buildLocalSnapshot(),
    {allowAuthoritativeRepair: false},
  );
  return {
    name: scenario.name,
    cacheStaleWatermark: watermark.cacheStaleWatermark,
    readyLeaseAgeWitness: watermark.readyLeaseAgeWitness,
    shouldRepair: repair.shouldRepair,
    triggerCodes: repair.triggerCodes,
    // The unnarrowed table set is deliberately NOT recorded: over this grid's
    // trigger sets it is the default nine on every row, so it would witness
    // nothing. The narrowing path the preflight snapshot uses does witness the
    // trigger set - one table for a lone stale-watermark repair, the default
    // nine for anything else - so that is the column the differential holds.
    repairTablesNarrowedToNodes: deriveAuthoritativeRepairTables({
      triggerCodes: repair.triggerCodes,
      cacheStaleWatermarkTableName: TABLES.NODES,
    }),
    snapshotObservationState: resolved.snapshotObservation.state,
    snapshotObservationReasonCodes: resolved.snapshotObservation.reasonCodes,
    watermarkNodesReads,
    repairEvaluationNodesReads,
    resolveSnapshotNodesReads: counter.nodesReads,
  };
}

const SWEEP_SCENARIOS = Object.freeze([
  {
    name: 'expired lease, transport connected: skipped on every sweep',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
      last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
    }],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
  },
  {
    name: 'expired lease, transport disconnected: swept',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
      last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
    }],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.DISCONNECTED},
  },
  {
    name: 'expired lease, no transport evidence: swept',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
      last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
    }],
    connectionStates: {},
  },
  {
    name: 'live lease, transport connected: untouched',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS + SECOND_MS * 30,
      last_heartbeat: LEASE_NOW_MS,
    }],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
  },
  {
    name: 'one skipped, one swept, one stranded joining row',
    rows: [
      {
        node_id: VICTIM_NODE_ID,
        status: NODE_STATUS.ACTIVE,
        ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS * 166,
        last_heartbeat: LEASE_NOW_MS - SECOND_MS * 178,
      },
      {
        node_id: THIRD_NODE_ID,
        status: NODE_STATUS.ACTIVE,
        ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
        last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
      },
      {
        node_id: SEED_NODE_ID,
        status: NODE_STATUS.JOINING,
        ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
        last_heartbeat: LEASE_NOW_MS - SECOND_MS,
      },
    ],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
  },
  {
    name: 'the node renews its lease between sweeps',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
      last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
    }],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
    renewAfterSweep: 1,
  },
  {
    name: 'transport drops on the third sweep and returns on the fourth',
    rows: [{
      node_id: VICTIM_NODE_ID,
      status: NODE_STATUS.ACTIVE,
      ready_lease_expires_at: LEASE_NOW_MS - SECOND_MS,
      last_heartbeat: LEASE_NOW_MS - SECOND_MS * 2,
    }],
    connectionStates: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
    connectionStatesBySweep: {
      2: {[VICTIM_NODE_ID]: CONNECTION_STATE.DISCONNECTED},
      3: {[VICTIM_NODE_ID]: CONNECTION_STATE.CONNECTED},
    },
  },
]);

function buildSweepMessageRouter(state) {
  return {
    getConnectionState(nodeId) {
      const connectionState = state.connectionStates[nodeId];
      return connectionState !== undefined ? connectionState : null;
    },
  };
}

function buildSweepGateway(state) {
  return {
    async readRows() {
      return {success: true, rows: state.rows.map((row) => ({...row}))};
    },
    async updateSystemTableRow(tableName, key, data) {
      state.updates.push({tableName, key, data});
      return {success: true};
    },
  };
}

function renewSweptRows(state, renewAtMs) {
  state.rows = state.rows.map((row) => (
    row.status === NODE_STATUS.ACTIVE ?
      {...row, ready_lease_expires_at: renewAtMs} :
      row
  ));
}

function buildCapturingLogger(lines) {
  const record = (level) => (message, fields) => {
    lines.push({level, message, fields: fields ?? null});
  };
  return {
    trace: record('trace'),
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

async function runSweepScenario(scenario) {
  const state = {
    rows: scenario.rows.map((row) => ({...row})),
    updates: [],
    connectionStates: {...scenario.connectionStates},
  };
  const disconnected = [];
  const lines = [];
  let nowMs = LEASE_NOW_MS;
  const service = new LeaseService({
    nodeId: SEED_NODE_ID,
    now: () => nowMs,
    nodeLeaseOwner: {
      async disconnectNodeDueToLeaseExpiry(node, atMs) {
        disconnected.push({nodeId: node.node_id, atMs});
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: buildSweepGateway(state),
    messageGroupServices: new Set([{isLeaderReplica: () => true}]),
    messageRouter: buildSweepMessageRouter(state),
  });
  service.initialize();
  service.logger = buildCapturingLogger(lines);
  const sweeps = [];
  try {
    for (let index = 0; index < SWEEP_COUNT; index += 1) {
      const scriptedStates = scenario.connectionStatesBySweep?.[index];
      if (scriptedStates) {
        state.connectionStates = {...scriptedStates};
      }
      lines.length = 0;
      const expiredIds = await service.sweepExpiredLeases();
      sweeps.push({
        atMs: nowMs,
        expiredIds,
        disconnectedThisSweep: disconnected.splice(0).map(
          (entry) => entry.nodeId,
        ),
        updateTables: state.updates.splice(0).map((entry) => entry.tableName),
        skipLines: lines.filter(
          (line) => line.message === SWEEP_SKIPPED_MESSAGE,
        ),
        otherLineMessages: lines
          .filter((line) => line.message !== SWEEP_SKIPPED_MESSAGE)
          .map((line) => line.message),
      });
      if (scenario.renewAfterSweep === index) {
        renewSweptRows(state, nowMs + SWEEP_STEP_MS * SWEEP_COUNT);
      }
      nowMs += SWEEP_STEP_MS;
    }
  } finally {
    service.stop();
  }
  return {name: scenario.name, sweeps};
}

function buildReadyLeaseAgeWitness(nodeId, leaseExpiredForMs) {
  return {
    schemaVersion: WITNESS_SCHEMA_VERSION,
    state: WITNESS_STATE.AVAILABLE,
    nodeId,
    status: NODE_STATUS.ACTIVE,
    connectionState: CONNECTION_STATE.READY,
    snapshotObservedAtMs: OBSERVER_BASE_MS,
    readyLease: {
      state: WITNESS_STATE.AVAILABLE,
      expiresAtMs: OBSERVER_BASE_MS - leaseExpiredForMs,
      ageMs: leaseExpiredForMs,
    },
  };
}

const UNAVAILABLE_WITNESS = Object.freeze({
  schemaVersion: WITNESS_SCHEMA_VERSION,
  state: WITNESS_STATE.UNAVAILABLE,
  reason: WITNESS_NO_STALE_ACTIVE_NODE,
});

function buildPriorityPlacementObservation(totalSpreadGap) {
  const satisfied = totalSpreadGap === 0;
  return {
    state: OBSERVATION_STATE_AVAILABLE,
    source: OBSERVATION_SOURCE,
    capturedAt: OBSERVER_BASE_MS,
    satisfied,
    priorityPartitionSummary: {
      satisfied,
      blockedPartitionCount: satisfied ? 0 : 1,
      largestSpreadGap: totalSpreadGap,
      totalSpreadGap,
      missingPartitionIds: satisfied ? [] : [BLOCKED_PARTITION_ID],
      blockedPartitions: satisfied ?
        [] :
        [{partitionId: BLOCKED_PARTITION_ID, spreadGap: totalSpreadGap}],
    },
    leaderCoverage: {
      satisfied: true,
      requiredPartitionCount: PRIORITY_PARTITION_COUNT,
      observedLeaderPartitionCount: PRIORITY_PARTITION_COUNT,
      missingLeaderPartitionCount: 0,
      missingLeaderPartitionIds: [],
    },
  };
}

function buildObserverSnapshotRow(totalSpreadGap, readyLeaseAgeWitness) {
  return {
    capturedAt: OBSERVER_BASE_MS,
    snapshotObservation: {state: 'fresh', reasonCodes: []},
    replicaOperations: {inFlightCount: 0, staleInFlightCount: 0, rows: []},
    leaders: {[RATINGS_LEADER_PARTITION_ID]: SEED_NODE_ID},
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation:
        buildPriorityPlacementObservation(totalSpreadGap),
      readyLeaseAgeWitness,
    },
  };
}

// usable -> unavailable -> usable with a different reason -> unavailable
// again, each poll carrying a different ready-lease witness. Polls 4 to 6
// share every classification input, so they MERGE into one transition on
// main while their witness differs and the named node changes inside the
// merged run: the case that tells a witness carried for diagnosis apart from
// one that has entered the merge decision.
const OBSERVER_POLL_SCRIPT = Object.freeze([
  {spreadGap: 0, witness: UNAVAILABLE_WITNESS},
  {throws: true},
  {spreadGap: 2, witness: buildReadyLeaseAgeWitness(VICTIM_NODE_ID, 41_000)},
  {spreadGap: 2, witness: buildReadyLeaseAgeWitness(VICTIM_NODE_ID, 43_000)},
  {spreadGap: 2, witness: buildReadyLeaseAgeWitness(THIRD_NODE_ID, 90_000)},
  {spreadGap: 2, witness: buildReadyLeaseAgeWitness(THIRD_NODE_ID, 91_000)},
  {spreadGap: 1, witness: buildReadyLeaseAgeWitness(VICTIM_NODE_ID, 45_000)},
  {throws: true},
  {spreadGap: 0, witness: buildReadyLeaseAgeWitness(THIRD_NODE_ID, 166_000)},
  {spreadGap: 0, witness: UNAVAILABLE_WITNESS},
]);

async function runObserverScenario() {
  let pollIndex = 0;
  let nowMs = OBSERVER_BASE_MS;
  const observed = [];
  const options = {
    target: OBSERVER_TARGET,
    now: () => nowMs,
    sleep: async () => {
      nowMs += 1;
    },
    timeoutMs: OBSERVER_TIMEOUT_MS,
    pollIntervalMs: 0,
    stableWindowMs: OBSERVER_STABLE_WINDOW_MS,
    query: async () => {
      const step = OBSERVER_POLL_SCRIPT[
        pollIndex % OBSERVER_POLL_SCRIPT.length
      ];
      pollIndex += 1;
      if (step.throws) {
        throw new Error(OBSERVER_QUERY_ERROR);
      }
      return {rows: [buildObserverSnapshotRow(step.spreadGap, step.witness)]};
    },
  };
  let evidence = null;
  try {
    evidence = await waitForAffinityDemoSchemaAdmission(options);
  } catch (error) {
    evidence = error.schemaAdmission;
  }
  observed.push({
    admitted: evidence.admitted,
    state: evidence.state,
    finalSnapshotState: evidence.snapshot.state,
    finalSnapshotReasonCodes: evidence.snapshot.reasonCodes,
    finalReadyLeaseAgeWitness: evidence.snapshot.readyLeaseAgeWitness,
    droppedTransitionCount: evidence.transitionHistory.droppedTransitionCount,
    transitions: evidence.transitionHistory.transitions,
  });
  return observed[0];
}

// Shapes a logger reference can really have, including ones that throw when
// read or when called. Main's control snapshot owner has no logger at all, so
// every one of these must leave both call paths exactly as main leaves them.
const HOSTILE_LOGGER_KINDS = Object.freeze([
  ['no logger at all', () => null],
  ['info throws', () => ({info() {
    throw new Error(HOSTILE_LOGGER_ERROR);
  }})],
  ['info getter throws', () => ({get info() {
    throw new Error(HOSTILE_LOGGER_ERROR);
  }})],
  ['logger is a string', () => HOSTILE_LOGGER_STRING],
  ['logger is a function', () => () => undefined],
  ['info is not a function', () => ({info: HOSTILE_LOGGER_NUMBER})],
  ['every get throws', () => new Proxy({}, {get() {
    throw new Error(HOSTILE_LOGGER_ERROR);
  }})],
]);

const HOSTILE_LOGGER_ROWS = Object.freeze([
  nodeRow(VICTIM_NODE_ID, {
    ready_lease_expires_at: CAPTURED_AT_MS - SECOND_MS * 166,
  }),
]);

async function buildHostileLoggerDecisions() {
  const decisions = [];
  for (const [name, buildLogger] of HOSTILE_LOGGER_KINDS) {
    const cache = buildPopulatedCache(HOSTILE_LOGGER_ROWS);
    const controlSnapshot = buildControlSnapshot(cache, buildLogger());
    const owner = new ControlPlaneSnapshotOwner({controlSnapshot});
    const record = {name, thrown: null};
    try {
      const repair = controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
        buildLocalSnapshot(),
        {},
      );
      const resolved = await owner.resolveControlSnapshot(
        buildLocalSnapshot(),
        {allowAuthoritativeRepair: false},
      );
      record.shouldRepair = repair.shouldRepair;
      record.triggerCodes = repair.triggerCodes;
      record.snapshotObservationState = resolved.snapshotObservation.state;
    } catch (error) {
      record.thrown = String(error?.message || error);
    }
    decisions.push(record);
  }
  return decisions;
}

// `buildLocalControlSnapshot` stamps `capturedAt` before it awaits the
// diagnostics and requests are not single-flight, so an evaluation of an
// OLDER cluster can commit after a newer one. Every decision below must be
// the one main takes for that evaluation's own observation time.
const OUT_OF_ORDER_CAPTURED_AT_OFFSETS = Object.freeze([
  0, 5_000, -4_000, 9_000, -9_000, 1_000, 20_000, -1, 20_000,
]);

async function buildOutOfOrderDecisions(logger) {
  const cache = buildPopulatedCache([
    nodeRow(VICTIM_NODE_ID, {
      ready_lease_expires_at: CAPTURED_AT_MS + SECOND_MS * 2,
    }),
  ]);
  const controlSnapshot = buildControlSnapshot(cache, logger);
  const decisions = [];
  for (const offset of OUT_OF_ORDER_CAPTURED_AT_OFFSETS) {
    const capturedAt = CAPTURED_AT_MS + offset;
    const repair = controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
      {...buildLocalSnapshot(), capturedAt},
      {},
    );
    decisions.push({
      capturedAt,
      shouldRepair: repair.shouldRepair,
      triggerCodes: repair.triggerCodes,
    });
  }
  return decisions;
}

/**
 * Evaluate the quest's whole decision surface on the fixed input grid.
 * @param {Object} [options={}]
 * @param {Object|null} [options.logger] logger injected into the control
 *   snapshot owner; absent on main, where the owner has no logger at all.
 * @return {Promise<Object>} plain JSON decision record
 */
async function buildLeaseLivenessDecisionGrid(options = {}) {
  ensureSingletonsInitialized();
  const logger = options.logger || null;
  const controlSnapshot = [];
  for (const scenario of NODE_ROW_SCENARIOS) {
    controlSnapshot.push(
      await buildControlSnapshotDecisions(scenario, logger),
    );
  }
  const leaseSweeps = [];
  for (const scenario of SWEEP_SCENARIOS) {
    leaseSweeps.push(await runSweepScenario(scenario));
  }
  const observer = await runObserverScenario();
  const hostileLoggers = await buildHostileLoggerDecisions();
  const outOfOrder = await buildOutOfOrderDecisions(logger);
  return JSON.parse(JSON.stringify({
    controlSnapshot,
    leaseSweeps,
    observer,
    hostileLoggers,
    outOfOrder,
  }));
}

export {buildLeaseLivenessDecisionGrid};
