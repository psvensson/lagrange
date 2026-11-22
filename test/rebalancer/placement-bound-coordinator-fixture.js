// The production binding of a test coordinator. A coordinator creates every
// partition and runtime-service operation through placement admission
// (rebalance-coordinator-operation-creation.js, createOperationInternal), so
// a fixture that creates one binds the coordinator as ControlPlaneSetup.create
// does and is answered by the ledger that admits in production:
// - the production placement-owner factory
//   (ControlPlaneSetup.createReplicaPlacementOwnerFactory), bound;
// - the operation ledger: a real replica_operations-p1 PartitionService
//   leader (production schema, file-backed) registered as this node's local
//   ledger replica; its committed apply decides every PLACEMENT_ADMIT
//   (partition-placement-admission.js applyPlacementCommand ->
//   decidePlacementAdmission over its replica_operations table);
// - the coordinator's SQL store opens the SAME database file, so the rows the
//   ledger admits and the transitions the workflow writes afterwards are one
//   replica_operations table (the store mirrors each committed row into the
//   fixture cache, as CDC would);
// - the node authority answers a committed, latched formation (FORMED).
// Substituted (evidence ceiling): consensus is the controllable port (one
// voter; every proposal commits on the next microtask); the coordinator's own
// later ledger writes are executed on the shared table by its store, as in
// every coordinator fixture, not proposed. The placement owner is not
// attached: the ledger replica is not handed this coordinator, so its attach
// precondition holds (no autonomous pass runs); the subject of these fixtures
// is the coordinator's creation and the workflow after it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {SERVICE_STATUS} from '../../src/constants/service-status.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {LEDGER_PARTITION_ID} from
  '../../src/partition/partition-placement-admission-decision.js';
import {PLACEMENT_FORMATION_STATE} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {applyCommitted, shutdownAll, startLeader, temporaryDbPath} from
  '../test-helpers/participant-transaction-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {REPLICA_OPERATION_WRITE_CAPTURE, SQL_STORE_SCHEMAS,
  createTestCoordinator} from './test-helpers.js';
import {createTimeoutTestCoordinator} from './timeout-test-coordinator.js';

const DEFAULT_NODE_ID = 'test-node-1';
const FORMATION_LATCH_EPOCH = 1;
// The node authority's committed formation (placement reads state and latch).
const COMMITTED_FORMATION = Object.freeze({state: PLACEMENT_FORMATION_STATE.FORMED,
  latchEpoch: FORMATION_LATCH_EPOCH});
const STORE_CAPTURE_TABLE_SQL = 'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?';
const STORE_CAPTURE_TABLE = 'replica_operation_writes';

// The store's own tables beside the ledger's replica_operations, created once
// in the ledger's database file (a reopened store finds them).
function openSharedLedgerStore(databasePath) {
  const database = new Database(databasePath);
  if (database.prepare(STORE_CAPTURE_TABLE_SQL).get('table', STORE_CAPTURE_TABLE)) {
    return database;
  }
  for (const schema of SQL_STORE_SCHEMAS) {
    if (schema === REPLICA_OPERATIONS_SCHEMA) continue;
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) database.exec(indexSql);
  }
  for (const captureSql of REPLICA_OPERATION_WRITE_CAPTURE) database.exec(captureSql);
  return database;
}

/**
 * Start this node's operation-ledger replica: the real replica_operations-p1
 * leader, every proposal committed through its committed apply.
 * @param {Object} [options] - {nodeId, timeSource}.
 * @return {Promise<Object>} {leader, openDatabase, stop}.
 */
async function startPlacementLedger({nodeId = DEFAULT_NODE_ID, timeSource} = {}) {
  const temporary = temporaryDbPath();
  const removeDirectory = () => fs.rmSync(temporary.directory, {recursive: true, force: true});
  let started;
  try {
    started = await startLeader({tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      schema: REPLICA_OPERATIONS_SCHEMA, dbPath: temporary.dbPath, nodeId,
      ...(timeSource ? {timeSource} : {})}, LEDGER_PARTITION_ID);
  } catch (error) {
    removeDirectory();
    throw error;
  }
  const {leader} = started;
  leader.controllablePort.setProposeHandler(async (entry) => {
    queueMicrotask(() => assert.equal(applyCommitted(leader, entry), null));
  });
  let stopped = null;
  return {
    leader,
    openDatabase: () => openSharedLedgerStore(leader.db.name),
    stop: () => {
      stopped ??= shutdownAll(leader).finally(removeDirectory);
      return stopped;
    },
  };
}

/**
 * Bind a constructed coordinator as ControlPlaneSetup.create does, with the
 * ledger as its local ledger replica; its shutdown stops the ledger it owns.
 * @param {Object} coordinator - The RebalanceCoordinator.
 * @param {Object} ledger - From startPlacementLedger.
 * @param {boolean} [ownsLedger] - Whether the coordinator's shutdown stops it.
 */
function bindPlacementAdmission(coordinator, ledger, ownsLedger = true) {
  coordinator.bindReplicaPlacementOwnerFactory(
    ControlPlaneSetup.createReplicaPlacementOwnerFactory({
      nodeId: coordinator.nodeId,
      controlPlaneReadinessService: coordinator.controlPlaneReadinessService,
      rebalanceCoordinator: coordinator,
      systemTableCache: coordinator.systemTableCache,
      storageAccountingService: coordinator.storageAccountingService,
    }));
  coordinator.registerLedgerPartitionService(ledger.leader);
  if (!ownsLedger) return;
  const shutdown = coordinator.shutdown.bind(coordinator);
  coordinator.shutdown = async (...args) => {
    try {
      return await shutdown(...args);
    } finally {
      await ledger.stop();
    }
  };
}

function withCommittedFormation(options, ledger) {
  return {...options, openLedgerDatabase: ledger.openDatabase,
    readinessFixture: {formation: COMMITTED_FORMATION, ...options.readinessFixture}};
}

/**
 * The committed facts a production partition REMOVE is scoped by
 * (readPartitionVoterRemovalScope): the replica's SERVICES row as its row
 * owner registers it (a voter, with its creation time) and its node's
 * committed row with a boot incarnation.
 * @param {Object} replica - {partitionId, replicaId, nodeId, status}.
 * @return {Object} {services, nodes}: rows for the fixture world.
 */
function committedVoterWorld({partitionId, replicaId, nodeId,
  status = SERVICE_STATUS.ACTIVE}) {
  return {
    services: [PartitionServiceRowOwner.buildServiceRow({partitionId, replicaId, nodeId,
      status})],
    nodes: [{node_id: nodeId, status: NODE_STATE.ACTIVE, boot_incarnation: TEST_BOOT_INCARNATION,
      storage_incarnation: TEST_BOOT_INCARNATION}],
  };
}

/**
 * createTestCoordinator, bound to placement admission on a real ledger.
 * @param {Object} [options] - createTestCoordinator's options.
 * @return {Promise<Object>} The coordinator (its shutdown stops the ledger).
 */
async function createPlacementBoundTestCoordinator(options = {}) {
  const ledger = await startPlacementLedger({nodeId: options.nodeId,
    timeSource: options.timeSource});
  try {
    const coordinator = createTestCoordinator(withCommittedFormation(options, ledger));
    bindPlacementAdmission(coordinator, ledger);
    return coordinator;
  } catch (error) {
    await ledger.stop();
    throw error;
  }
}

/**
 * createTimeoutTestCoordinator, bound to placement admission on a real
 * ledger. Coordinators that share options.trackedOperations share one ledger
 * (options.placementLedger, owned and stopped by the caller).
 * @param {Object} [options] - createTimeoutTestCoordinator's options.
 * @return {Promise<Object>} The timeout fixture.
 */
async function createPlacementBoundTimeoutTestCoordinator(options = {}) {
  const shared = options.placementLedger ?? null;
  const ledger = shared ?? await startPlacementLedger({nodeId: options.nodeId,
    timeSource: options.timeSource});
  try {
    const fixture = createTimeoutTestCoordinator(withCommittedFormation(options, ledger));
    bindPlacementAdmission(fixture.coordinator, ledger, shared === null);
    return fixture;
  } catch (error) {
    if (shared === null) await ledger.stop();
    throw error;
  }
}

export {
  COMMITTED_FORMATION,
  committedVoterWorld,
  bindPlacementAdmission,
  createPlacementBoundTestCoordinator,
  createPlacementBoundTimeoutTestCoordinator,
  startPlacementLedger,
};
