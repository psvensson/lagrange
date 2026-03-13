import {test} from '../../src/test-helpers/tap.js';
import {SeedRegistrationPhase} from '../../src/bootstrap/phases/seed-registration-phase.js';
import {
  SERVICE_STATUS,
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
