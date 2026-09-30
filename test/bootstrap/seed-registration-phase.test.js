import {test} from '../../src/test-helpers/tap.js';
import {SeedRegistrationPhase} from '../../src/bootstrap/phases/seed-registration-phase.js';
import {
  META_SERVICE_ID,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';

function createWriterRecorder() {
  const calls = [];
  return {
    calls,
    async insertSystemTableRow(tableName, row) {
      calls.push({type: 'insert', tableName, row});
      return {success: true, partitionResult: {affectedRows: 1}};
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

test('SeedRegistrationPhase registers partition rows as stopped before activation',
  async (t) => {
    const writer = createWriterRecorder();
    const lifecycleActivations = [];
    const messageGroupServices = new Map([
      ['mg-1-r1', {
        groupId: 'mg-1',
        getUnifiedAddress() {
          return 'node-a/message-group/mg-1-r1';
        },
        isLeaderReplica() {
          return true;
        },
      }],
    ]);
    const partitionServices = new Map([
      ['p1-r1', {
        partitionId: 'p1',
        replicaId: 'p1-r1',
        initialized: true,
        transportHandler: () => ({acknowledged: true}),
        getUnifiedAddress() {
          return 'node-a/partition/p1-r1';
        },
        getRole() {
          return 'leader';
        },
      }],
    ]);
    const phase = new SeedRegistrationPhase({
      delegates: {
        getLogger: () => ({
          debug() {},
          error() {},
        }),
        getSystemTableWriter: () => writer,
        getReplicaStateMachine: () => ({
          async activateRegisteredReplica(options) {
            const row = {
              service_id: options.replicaId,
              service_type: 'partition',
              partition_id: options.partitionId,
              node_id: options.nodeId,
              raft_role: 'leader',
              status: SERVICE_STATUS.ACTIVE,
              updated_at: options.timestamp,
            };
            lifecycleActivations.push({options, row});
            return row;
          },
        }),
        getNodeId: () => 'node-a',
        getBootIncarnation: () => 1,
        getMessageRouter: () => ({
          isRegistered(address) {
            return address === 'node-a/partition/p1-r1';
          },
          getRegisteredHandler(address) {
            return address === 'node-a/partition/p1-r1' ?
              partitionServices.get('p1-r1').transportHandler : null;
          },
        }),
        getMessageGroupServices: () => messageGroupServices,
        getPartitionServices: () => partitionServices,
      },
    });

    await phase.registerServices(1234);

    const partitionInsert = writer.calls.find(
      (call) => call.type === 'insert' &&
        call.tableName === TABLES.SERVICES &&
        call.row?.service_id === 'p1-r1',
    );
    const serviceUpserts = writer.calls.filter(
      (call) => call.type === 'upsert' &&
        call.tableName === TABLES.SERVICES,
    );

    t.equal(
      partitionInsert?.row?.status,
      SERVICE_STATUS.STOPPED,
      'initial partition row should register as stopped',
    );
    t.equal(
      lifecycleActivations[0]?.row?.status,
      SERVICE_STATUS.ACTIVE,
      'partition row should activate only through the lifecycle owner',
    );
    t.equal(
      serviceUpserts.length,
      0,
      'partition registration should never use the old services upsert path',
    );
    t.match(
      phase.messageGroupRegistrationEvidenceByReplicaId.get('mg-1-r1'),
      {
        service_id: 'mg-1-r1',
        status: SERVICE_STATUS.STOPPED,
        created_at: 1234,
        updated_at: 1234,
      },
      'seed registration retains exact STOPPED authority for later activation',
    );
  });

test('SeedRegistrationPhase does not complete while partition activation is ' +
  'deferred and re-enters idempotently', async (t) => {
  let durableServiceRow = null;
  let activationAttempt = 0;
  const logEvents = [];
  const writer = {
    async insertSystemTableRow(_tableName, row) {
      if (durableServiceRow) {
        return {
          success: true,
          outcome: 'observed_state_changed',
          partitionResult: {affectedRows: 0},
        };
      }
      durableServiceRow = {...row};
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async readAuthoritativeRows() {
      return {success: true, rows: [{...durableServiceRow}]};
    },
    async updateSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 0}};
    },
  };
  const partitionServices = new Map([
    ['p1-r1', {
      partitionId: 'p1',
      initialized: true,
      transportHandler: () => ({acknowledged: true}),
      getUnifiedAddress: () => 'node-a/partition/p1-r1',
      getRole: () => 'follower',
    }],
  ]);
  const phase = new SeedRegistrationPhase({
    delegates: {
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
        async activateRegisteredReplica(options) {
          activationAttempt += 1;
          if (activationAttempt === 1) {
            const error = new Error('activation owner deferred');
            error.code = 'REPLICA_ACTIVATION_DURABILITY_DEFERRED';
            error.deferRetry = true;
            throw error;
          }
          durableServiceRow = {
            ...durableServiceRow,
            status: SERVICE_STATUS.ACTIVE,
            state_entered_at: options.registrationEvidence.updated_at + 1,
            updated_at: options.registrationEvidence.updated_at + 1,
          };
          return {...durableServiceRow};
        },
      }),
      getNodeId: () => 'node-a',
      getBootIncarnation: () => 1,
      getMessageRouter: () => ({isRegistered: () => true,
        getRegisteredHandler: (address) =>
          partitionServices.get(address.split('/').pop())?.transportHandler}),
      getMessageGroupServices: () => new Map(),
      getPartitionServices: () => partitionServices,
    },
  });

  await t.rejects(
    phase.registerServices(1234),
    {code: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED'},
    'seed registration must leave the phase incomplete while exact activation is debt',
  );
  t.equal(durableServiceRow.status, SERVICE_STATUS.STOPPED,
    'deferred activation must retain its durable STOPPED source generation');
  t.equal(logEvents.includes('Services registered'), false,
    'the seed phase must not report registration completion on defer');

  await phase.registerServices(5678);

  t.equal(activationAttempt, 2,
    'the existing workflow re-entry should retry the exact activation debt');
  t.equal(durableServiceRow.status, SERVICE_STATUS.ACTIVE,
    'workflow re-entry should complete the same registered incarnation');
  t.equal(durableServiceRow.created_at < 5678, true,
    're-entry must retain the original durable incarnation, not mint another');
});

test('SeedRegistrationPhase projects local meta service endpoints into cache during bootstrap registration',
  async (t) => {
    const writer = createWriterRecorder();
    const projected = [];
    const phase = new SeedRegistrationPhase({
      delegates: {
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
    const waitedForPartitionLeadership = [];
    const events = [];
    const writer = {
      enable() {
        events.push('enable');
      },
    };
    const phase = new SeedRegistrationPhase({
      delegates: {
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
    const phase = new SeedRegistrationPhase({
      delegates: {
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

    t.equal(writer.calls.length, 1,
      'bootstrap epoch should be written directly when no config leader exists yet');
    t.equal(writer.calls[0]?.type, 'upsert', 'bootstrap epoch should use direct upsert');
    t.equal(writer.calls[0]?.tableName, 'config',
      'bootstrap epoch should be written into the config table');
    t.equal(writer.calls[0]?.row?.config_key, 'current_epoch',
      'bootstrap epoch should write the authoritative epoch config row');
  });
