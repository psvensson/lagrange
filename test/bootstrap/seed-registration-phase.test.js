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
    const partitionServices = new Map([
      ['p1-r1', {
        partitionId: 'p1',
        replicaId: 'p1-r1',
        initialized: true,
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
        getNodeId: () => 'node-a',
        getMessageRouter: () => ({
          isRegistered(address) {
            return address === 'node-a/partition/p1-r1';
          },
        }),
        getMessageGroupServices: () => new Map(),
        getPartitionServices: () => partitionServices,
      },
    });

    await phase.registerServices(1234);

    const partitionInsert = writer.calls.find(
      (call) => call.type === 'upsert' &&
        call.tableName === 'services' &&
        call.row?.service_id === 'p1-r1',
    );
    const partitionActivation = writer.calls.find(
      (call) => call.type === 'update' &&
        call.tableName === 'services' &&
        call.whereClause?.service_id === 'p1-r1',
    );

    t.equal(
      partitionInsert?.row?.status,
      SERVICE_STATUS.STOPPED,
      'initial partition row should register as stopped',
    );
    t.equal(
      partitionActivation?.row?.status,
      SERVICE_STATUS.ACTIVE,
      'partition row should activate only through the activation update path',
    );
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
        getNodeAddress: () => 'ws://127.0.0.1:18080',
        getAdvertisedNodeWsAddress: () => null,
        getWsPort: () => 18080,
      },
    });

    await phase.registerMetaServiceDefinitions();

    const projectedEndpoints = projected.filter((entry) =>
      entry.tableName === TABLES.SERVICE_ENDPOINTS,
    );
    t.equal(projectedEndpoints.length, 3,
      'bootstrap registration should project each built-in meta endpoint into cache');
    t.ok(projectedEndpoints.some((entry) =>
      entry.operation === 'INSERT' &&
      entry.row?.service_id === META_SERVICE_ID.POSTGRES_WIRE &&
      entry.row?.node_id === 'node-a',
    ), 'bootstrap registration should project the local postgres-wire endpoint');
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
