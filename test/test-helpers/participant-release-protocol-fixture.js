// Native release owners with an in-process transport, empty system-cache double,
// optional remote-route hint double and optional injected handler clock.
// PartitionService, Raft, SQLite, release facts and lifecycle owners are real;
// this fixture does not prove full bootstrap or remote topology availability.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {createInProcessMockTransport} from './replica-handler-identity-fixture.js';
import {cleanOwnedParticipantFixture as cleanOwnedFixture} from
  './participant-transaction-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const NODE = 'test-node';
const CONTROL_NODE = 'control-node';
const REPLICA = 'release-r1';
const PARTITION = 'release-partition';
const TABLE = 'release_table';
const CONTROL_PARTITION = 'sql_transactions-p1';
const CONTROL_REPLICA = 'release-sql-transactions-r1';
const SQL = `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`;
const cache = {getAll: () => [], get: () => null, filter: () => []};

function createControlService(directory, remoteControl, overrides) {
  return new PartitionService(withFoundingStamp({
    nodeId: remoteControl ? CONTROL_NODE : NODE, partitionId: CONTROL_PARTITION,
    replicaId: CONTROL_REPLICA, replicaIds: [CONTROL_REPLICA],
    tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA,
    dbPath: path.join(directory, 'sql-transactions.db'), systemTableCache: cache,
    deferElection: true, ...overrides,
  }));
}

async function withParticipantReleaseProtocol(measure, table = {tableId: TABLE, tableName: TABLE,
  schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'TEXT'}]}}, fixtureOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-protocol-'));
  const transport = createInProcessMockTransport();
  const options = {nodeId: NODE, partitionId: PARTITION, replicaId: REPLICA,
    replicaIds: [REPLICA], ...table, dbPath: path.join(directory, 'partition.db'),
    systemTableCache: cache, deferElection: true};
  const create = (overrides) => new PartitionService(withFoundingStamp({...options, ...overrides}));
  const createControl = (overrides) =>
    createControlService(directory, fixtureOptions.remoteControl === true, overrides);
  const topologyOwner = fixtureOptions.remoteControl === true ? {
    resolveCanonicalPartitionLeaderNodeId(partitionId) {
      return partitionId === CONTROL_PARTITION ? CONTROL_NODE : null;
    },
  } : null;
  const cdcIntegrationService = topologyOwner === null ? {} :
    {sqlQueryEngine: {queryExecutor: {bootstrapTopologySnapshotOwner: topologyOwner}}};
  let handler = null;
  let service = null;
  let controlService = null;
  let controlHandler = null;
  let failure = null;
  try {
    handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
      systemTableCache: cache, cdcIntegrationService, createPartitionService: create,
      messageRouter: transport, dataDir: directory,
      timeSource: fixtureOptions.timeSource});
    handler.registerWithRouter(transport);
    service = create();
    if (table.tableName !== SQL_TRANSACTIONS_SCHEMA.tableName &&
        fixtureOptions.includeControl !== false) {
      controlService = createControl();
      await controlService.initialize();
      if (fixtureOptions.remoteControl === true) {
        controlHandler = new ReplicaHandler({nodeId: CONTROL_NODE,
          ownerIncarnation: 2, systemTableCache: cache,
          cdcIntegrationService: {}, createPartitionService: create,
          messageRouter: transport, dataDir: directory});
        controlHandler.registerWithRouter(transport);
        controlHandler.localServices.set(CONTROL_REPLICA, controlService);
      } else {
        handler.localServices.set(CONTROL_REPLICA, controlService);
      }
      await controlService.raft.campaign();
      assert.equal(controlService.raft.readStatus().role, 'leader');
    }
    await service.initialize();
    handler.localServices.set(REPLICA, service);
    await service.raft.campaign();
    assert.equal(service.raft.readStatus().role, 'leader');
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    if (controlHandler !== null) {
      const controlRelease = await controlHandler.participantReleaseRecovery
        .releaseOperator({partitionId: CONTROL_PARTITION,
          targetBuildDigest: build.digest,
          deadlineAtMs: controlHandler.timeSource.now() + 30000});
      assert.equal(controlRelease.outcome, OUTCOME.CUT_OVER,
        JSON.stringify(controlRelease));
    }
    const release = (targetBuildDigest = build.digest) =>
      handler.participantReleaseRecovery.releaseOperator({
        partitionId: options.partitionId, targetBuildDigest,
        deadlineAtMs: handler.timeSource.now() + 30000,
      });
    await measure({handler, service, controlService, controlHandler, transport, release, create,
      build, timeSource: handler.timeSource, createControl,
      replace: (next) => {
        service = next;
        handler.replaceLocalReplicaService(REPLICA, next);
      },
      replaceControl: (next) => {
        controlService = next;
        (controlHandler ?? handler).replaceLocalReplicaService(CONTROL_REPLICA, next);
      }});
  } catch (error) {
    failure = error;
  }
  failure = await cleanOwnedFixture({directory, failure,
    label: 'participant release', operations: [
      ['local release recovery', () => handler?.participantReleaseRecovery.shutdown()],
      ['control release recovery', () => controlHandler?.participantReleaseRecovery.shutdown()],
      ['dependent service', () => service?.shutdown()],
      ['control service', () => controlService?.shutdown()],
    ]});
  if (failure !== null) throw failure;
}

export {CONTROL_PARTITION, CONTROL_REPLICA, NODE, PARTITION, REPLICA, SQL, cache,
  withParticipantReleaseProtocol};
