import {test} from '../../src/test-helpers/tap.js';
import {SeedRegistrationPhase} from '../../src/bootstrap/phases/seed-registration-phase.js';
import {
  META_SERVICE_ID,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {ORIGINAL_ALLOCATION_REASON, originalAllocationError} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {createSeedPhaseContinuationFixture} from './seed-phase-continuation-fixture.js';
import {INITIAL_REPLICA_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createOwnedVirginSeedBootstrapService, cleanupTestEnvironment,
  initializeTestEnvironment, getUniquePort} from '../integration/helpers/cluster-test-helpers.js';
import {readIssuedDeclaration} from '../test-helpers/original-allocation-durable-reader.js';
import {openOriginalSeedReplica} from '../test-helpers/open-original-seed-replica.js';

function createWriterRecorder() {
  const calls = [];
  const rows = new Map();
  return {
    calls,
    async insertSystemTableRow(tableName, row) {
      calls.push({type: 'insert', tableName, row});
      rows.set(`${tableName}:${row.service_id}`, {...row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async readAuthoritativeRows(tableName, _sql, [key]) {
      calls.push({type: 'read', tableName, key});
      const row = rows.get(`${tableName}:${key}`);
      return {success: true, rows: row ? [{...row}] : []};
    },
    async upsertSystemTableRow(tableName, row) {
      calls.push({type: 'upsert', tableName, row});
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, row) {
      calls.push({type: 'update', tableName, whereClause, row});
      return {success: true};
    },
  };
}

// Canonical owned seed setup is shared with the other seed component tests.
// Only SQL effect/readback and the activation collaborator are substituted;
// preparation, exact original opening and original publication are real owners.
async function registrationFixture(t, {withMessageGroup = false} = {}) {
  initializeTestEnvironment({nodeId: 'node-a'});
  const service = await createOwnedVirginSeedBootstrapService(t, {nodeId: 'node-a',
    nodeAddress: 'http://127.0.0.1:18080', wsPort: getUniquePort()});
  t.after(() => cleanupTestEnvironment());
  await service.prepareOriginalSeedAttempt();
  await service.seedInfrastructurePhase.phaseInfrastructure();
  service.systemTableCache = service.nodeService.getSystemTableCache();
  const declaration = readIssuedDeclaration(service.dataDirectoryManager.getDataDir());
  const partition = await openOriginalSeedReplica(service, declaration,
    declaration.anchorReplicaId);
  let messageGroup;
  if (withMessageGroup) {
    const member = declaration.members.find((entry) => entry.serviceType === 'message_group');
    messageGroup = await openOriginalSeedReplica(service, declaration, member.replicaId);
  }
  let checks = 0;
  return {service, partition, messageGroup,
    delegates: {...service.seedRegistrationPhase.delegates,
      assertOriginalSeedContinuation(replicaId) {
        checks += 1;
        service.assertOriginalSeedContinuation(replicaId);
      }},
    get checks() {
      return checks;
    }};
}

test('SeedRegistrationPhase registers partition rows as stopped before activation',
  async (t) => {
    const fixture = await registrationFixture(t, {withMessageGroup: true});
    const writer = createWriterRecorder();
    const lifecycleActivations = [];
    const phase = new SeedRegistrationPhase({
      delegates: {
        ...fixture.delegates,
        getSystemTableWriter: () => writer,
        getReplicaStateMachine: () => ({
          async activateRegisteredReplica(options) {
            const row = {service_id: options.replicaId, service_type: 'partition',
              partition_id: options.partitionId, node_id: options.nodeId,
              raft_role: 'leader', status: SERVICE_STATUS.ACTIVE, updated_at: options.timestamp};
            lifecycleActivations.push({options, row});
            return row;
          },
        }),
      },
    });

    await phase.registerServices(1234);
    t.equal(fixture.checks, 1, 'service registration consults the real continuation authority');
    const partitionInsert = writer.calls.find((call) => call.type === 'insert' &&
      call.tableName === TABLES.SERVICES &&
      call.row?.service_id === fixture.partition.member.replicaId);
    t.equal(partitionInsert?.row?.status, SERVICE_STATUS.STOPPED,
      'initial partition row registers as stopped');
    t.equal(lifecycleActivations[0]?.row?.status, SERVICE_STATUS.ACTIVE,
      'partition row activates only through the lifecycle owner');
    t.equal(writer.calls.filter((call) => call.type === 'upsert' &&
      call.tableName === TABLES.SERVICES).length, 0,
    'partition registration never uses the old services upsert path');
    t.match(phase.messageGroupRegistrationEvidenceByReplicaId.get(
      fixture.messageGroup.member.replicaId), {
      service_id: fixture.messageGroup.member.replicaId,
      status: SERVICE_STATUS.STOPPED,
      created_at: fixture.messageGroup.member.createdAt,
      updated_at: fixture.messageGroup.member.createdAt,
      create_attempt_token: fixture.messageGroup.member.createAttemptToken,
    }, 'seed registration retains the declared STOPPED birth for later activation');
    const originalEvidence = phase.messageGroupRegistrationEvidenceByReplicaId.get(
      fixture.messageGroup.member.replicaId);
    const isLeaderReplica = fixture.messageGroup.replica.isLeaderReplica;
    fixture.messageGroup.replica.isLeaderReplica = () => true;
    try {
      await phase.registerServices(5678);
    } finally {
      fixture.messageGroup.replica.isLeaderReplica = isLeaderReplica;
    }
    t.same(phase.messageGroupRegistrationEvidenceByReplicaId.get(
      fixture.messageGroup.member.replicaId), originalEvidence,
    'message-group role change retains its original publication evidence');
    t.equal(writer.calls.filter((call) => call.type === 'insert').length, 2,
      'neither original replica registers a second birth');
  });

test('SeedRegistrationPhase retains deferred STOPPED birth across same-live phase re-entry',
  async (t) => {
    const fixture = await registrationFixture(t);
    const writer = createWriterRecorder();
    let activationAttempt = 0;
    const logEvents = [];
    const phase = new SeedRegistrationPhase({
      delegates: {
        ...fixture.delegates,
        getLogger: () => ({
          debug(message) {
            logEvents.push(message);
          },
          error() {},
          warn(message) {
            logEvents.push(message);
          },
        }),
        getSystemTableWriter: () => writer,
        getReplicaStateMachine: () => ({
          async activateRegisteredReplica() {
            activationAttempt += 1;
            throw Object.assign(new Error('activation owner deferred'), {
              code: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED', deferRetry: true,
            });
          },
        }),
      },
    });
    const deferred = {code: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED', deferRetry: true};
    await t.rejects(phase.registerServices(1234), deferred,
      'the phase stays incomplete while exact activation is debt');
    const insertedRows = writer.calls.filter((call) => call.type === 'insert');
    t.equal(insertedRows.length, 1, 'the original STOPPED birth is inserted once');
    const originalRow = {...insertedRows[0].row};
    t.equal(originalRow.status, SERVICE_STATUS.STOPPED);
    t.equal(originalRow.created_at, fixture.partition.member.createdAt);
    t.equal(originalRow.create_attempt_token, fixture.partition.member.createAttemptToken);
    t.equal(logEvents.includes('Services registered'), false,
      'deferred activation does not report completion');

    // Original publication retains its declared value, unlike ordinary row
    // birth. Re-entry may revisit the activation owner but never remints or
    // resubmits the already transferred original registration.
    await t.rejects(phase.registerServices(5678), deferred);
    t.equal(fixture.checks, 2, 'each phase invocation rechecks continuation authority');
    t.same(writer.calls.filter((call) => call.type === 'insert').map(({row}) => row),
      [originalRow], 're-entry leaves the exact original row and single INSERT intact');
    t.equal(writer.calls.filter((call) => call.type === 'read').length, 1,
      'the original transfer used one authoritative readback');
    t.equal(activationAttempt, 2, 'activation debt remains with its existing owner');
    t.equal(logEvents.includes('Services registered'), false);
  });

test('SeedRegistrationPhase projects local meta service endpoints into cache during bootstrap registration',
  async (t) => {
    const writer = createWriterRecorder();
    const continuation = createSeedPhaseContinuationFixture();
    const projected = [];
    const phase = new SeedRegistrationPhase({
      delegates: {
        ...continuation.delegates,
        getLogger: () => ({
          debug() {},
          error() {},
        }),
        getSystemTableWriter: () => writer,
        getSystemTableCache: () => ({
          applySystemTableChange(tableName, operation, row) {
            projected.push({tableName, operation, row});
          },
        }),
        getNodeId: () => 'node-a',
        getBootIncarnation: () => 1,
        getNodeAddress: () => 'ws://127.0.0.1:18080',
        getAdvertisedNodeWsAddress: () => null,
        getWsPort: () => 18080,
      },
    });

    await phase.registerMetaServiceDefinitions();
    t.equal(continuation.checks, 1, 'meta registration consults continuation authority');

    const projectedEndpoints = projected.filter((entry) =>
      entry.tableName === TABLES.SERVICE_ENDPOINTS,
    );
    t.equal(projectedEndpoints.length, 2,
      'bootstrap registration should project each boot-owned meta endpoint into cache');
    t.equal(projectedEndpoints.some((entry) =>
      entry.row?.service_id === META_SERVICE_ID.POSTGRES_WIRE,
    ), false,
    'bootstrap registration never projects a postgres-wire endpoint: ' +
    'the runtime lifecycle publishes it after the listener binds');
  });

test('SeedRegistrationPhase waits only for cache-hydration leader partitions before bootstrap-direct registration',
  async (t) => {
    const continuation = createSeedPhaseContinuationFixture();
    const waitedForPartitionLeadership = [];
    const events = [];
    const writer = {
      enable() {
        events.push('enable');
      },
    };
    const phase = new SeedRegistrationPhase({
      delegates: {
        ...continuation.delegates,
        getLogger: () => ({
          debug() {},
          error() {},
        }),
        waitForPartitionLeadership: async (options) => {
          waitedForPartitionLeadership.push(options);
        },
        getSystemTableWriter: () => writer,
        getNodeId: () => 'node-a',
        getBootIncarnation: () => 1,
        getPartitionServices: () => new Map(),
        getServicesCreated: () => 0,
      },
    });

    phase.registerMessageGroup = async () => {
      events.push('registerMessageGroup');
    };
    phase.registerServices = async () => {
      events.push('registerServices');
    };
    phase.registerMetaServiceDefinitions = async () => {
      events.push('registerMetaServiceDefinitions');
    };
    phase.registerSystemTables = async () => {
      events.push('registerSystemTables');
    };
    phase.updatePartitionSizes = async () => {
      events.push('updatePartitionSizes');
    };
    phase.seedDynamicConfiguration = async () => {
      events.push('seedDynamicConfiguration');
    };
    phase.persistCurrentEpochIfMissing = async () => {
      events.push('persistCurrentEpochIfMissing');
    };
    phase.persistClusterIdIfMissing = async () => {
      events.push('persistClusterIdIfMissing');
    };

    await phase.phaseRegistration();
    t.equal(continuation.checks, 2, 'both the phase and writer acquisition retain their gates');

    t.same(waitedForPartitionLeadership, [{
      partitionIds: [
        'partitions-p1',
        'services-p1',
        'tables-p1',
        'message_groups-p1',
      ],
    }], 'bootstrap-direct registration should wait only for cache-hydration leader partitions');
    t.same(events, [
      'enable',
      'registerMessageGroup',
      'registerServices',
      'registerMetaServiceDefinitions',
      'registerSystemTables',
      'updatePartitionSizes',
      'seedDynamicConfiguration',
      'persistCurrentEpochIfMissing',
      'persistClusterIdIfMissing',
    ], 'bootstrap-direct writer should be enabled before registration steps run');
  });

test('SeedRegistrationPhase persists bootstrap epoch directly when config leader is not yet elected',
  async (t) => {
    const writer = createWriterRecorder();
    const continuation = createSeedPhaseContinuationFixture();
    const phase = new SeedRegistrationPhase({
      delegates: {
        ...continuation.delegates,
        getSystemTableWriter: () => writer,
        getEpochManager: () => ({
          getCurrentEpoch() {
            return {
              toJSON() {
                return '{"epoch":1}';
              },
            };
          },
        }),
        getNodeId: () => 'node-a',
        getBootIncarnation: () => 1,
        getPartitionServices: () => new Map(),
      },
    });

    await phase.persistCurrentEpochIfMissing();
    t.equal(continuation.checks, 1, 'epoch persistence consults continuation authority');

    t.equal(writer.calls.length, 1,
      'bootstrap epoch should be written directly when no config leader exists yet');
    t.equal(writer.calls[0]?.type, 'upsert', 'bootstrap epoch should use direct upsert');
    t.equal(writer.calls[0]?.tableName, 'config',
      'bootstrap epoch should be written into the config table');
    t.equal(writer.calls[0]?.row?.config_key, 'current_epoch',
      'bootstrap epoch should write the authoritative epoch config row');
  });

test('continuation refusal precedes registration, writer access and activation effects', async (t) => {
  const cases = [
    ['phaseRegistration', []],
    ['ensureSystemTableWriter', []],
    ['registerServices', ['logger']],
    ['registerMetaServiceDefinitions', ['logger']],
    ['persistCurrentEpochIfMissing', ['epoch-manager', 'partition-services', 'epoch-query',
      'current-epoch', 'serialize-epoch', 'clock-owner', 'clock-now']],
  ];
  for (const [method, expectedReads] of cases) {
    await t.test(method, async (t) => {
      const refusal = originalAllocationError(ORIGINAL_ALLOCATION_REASON.CONTINUATION_UNAVAILABLE);
      const continuation = createSeedPhaseContinuationFixture({refusal});
      const effects = [];
      const record = (effect) => () => effects.push(effect);
      const reads = [];
      const observe = (name, value) => () => {
        reads.push(name);
        return value;
      };
      // The real epoch path observes the existing leader and epoch before
      // reaching the writer guard. These are reads, not registration effects.
      const epoch = {toJSON: observe('serialize-epoch', {epoch: 1})};
      const configPartition = {isLeader: true, async executeQuery() {
        reads.push('epoch-query');
        return {success: true, rows: []};
      }};
      const partitions = new Map([[INITIAL_REPLICA_IDS[TABLES.CONFIG][0], configPartition]]);
      const phase = new SeedRegistrationPhase({delegates: {
        ...continuation.delegates,
        getLogger: observe('logger', {debug: record('log'), error: record('log-error')}),
        getEpochManager: observe('epoch-manager', {getCurrentEpoch: observe('current-epoch', epoch)}),
        getPartitionServices: observe('partition-services', partitions),
        getSystemTableWriter: record('read-writer'),
        ensureBootstrapCdcIntegrationService: record('acquire-cdc'),
        setSystemTableWriter: record('publish-writer'),
        getReplicaStateMachine: record('activation'),
        getTimeSource: observe('clock-owner', {now: observe('clock-now', 1234)}),
        waitForPartitionLeadership: record('leadership'),
      }});
      const failure = await Promise.resolve().then(() => phase[method]()).then(
        () => null, (error) => error);
      t.equal(failure, refusal, 'the real delegate preserves the exact continuation refusal');
      t.equal(continuation.checks, 1, 'the guarded boundary consults its owner exactly once');
      t.same(reads, expectedReads, 'only the real entry path\'s declared pre-guard reads occur');
      t.same(effects, [], 'no writer acquisition, publication, mutation, leadership or activation escapes');
    });
  }
});
