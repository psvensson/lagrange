/**
 * Durable cluster identity mint: the first seed bootstrap persists a
 * randomUUID as the replicated CONFIG-row singleton `cluster_id` exactly
 * once — a later boot that finds the row present leaves the identity
 * untouched for the life of the cluster.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SeedRegistrationPhase,
} from '../../src/bootstrap/phases/seed-registration-phase.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {COLUMN} from '../../src/constants/index.js';
import {
  cleanupTestEnvironment,
  createOwnedVirginSeedBootstrapService,
  getUniquePort,
  initializeTestEnvironment,
} from '../integration/helpers/cluster-test-helpers.js';
import {readIssuedDeclaration} from '../test-helpers/original-allocation-durable-reader.js';
import {openOriginalSeedReplica} from '../test-helpers/open-original-seed-replica.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function createWriterRecorder() {
  const calls = [];
  const rows = new Map();
  return {
    calls,
    async insertSystemTableRow(tableName, row) {
      calls.push({type: 'insert', tableName, row});
      rows.set(`${tableName}:${row[COLUMN.CONFIG_KEY]}`, {...row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async readAuthoritativeRows(tableName, _sql, [key]) {
      calls.push({type: 'read', tableName, key});
      const row = rows.get(`${tableName}:${key}`);
      return {success: true, rows: row ? [{...row}] : []};
    },
  };
}

async function createPhase(t, {writer}) {
  initializeTestEnvironment({nodeId: 'node-a'});
  const service = await createOwnedVirginSeedBootstrapService(t, {
    nodeId: 'node-a',
    nodeAddress: 'http://127.0.0.1:18080',
    wsPort: getUniquePort(),
  });
  t.after(() => cleanupTestEnvironment());
  await service.prepareOriginalSeedAttempt();
  await service.seedInfrastructurePhase.phaseInfrastructure();
  service.systemTableCache = service.nodeService.getSystemTableCache();
  const declaration = readIssuedDeclaration(
    service.dataDirectoryManager.getDataDir(),
  );
  await openOriginalSeedReplica(
    service,
    declaration,
    declaration.anchorReplicaId,
  );
  let checks = 0;
  const phase = new SeedRegistrationPhase({
    delegates: {
      ...service.seedRegistrationPhase.delegates,
      assertOriginalSeedContinuation(replicaId) {
        checks += 1;
        service.assertOriginalSeedContinuation(replicaId);
      },
      getSystemTableWriter: () => writer,
      getNodeId: () => 'node-a',
    },
  });
  return {
    phase,
    declaration,
    continuation: {
      get checks() {
        return checks;
      },
    },
  };
}

test('persistClusterIdIfMissing mints a randomUUID CONFIG-row singleton at ' +
  'first bootstrap', async (t) => {
  const writer = createWriterRecorder();
  const {phase, declaration, continuation} = await createPhase(t, {writer});

  await phase.persistClusterIdIfMissing();
  t.equal(continuation.checks, 1,
    'the component consults the substituted continuation owner before writer access');

  const mint = writer.calls.find(
    (call) => call.type === 'insert' &&
      call.row[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY,
  );
  t.ok(mint, 'the cluster_id row is written through the system table writer');
  t.match(
    mint.row[COLUMN.CONFIG_VALUE],
    UUID_PATTERN,
    'the identity is a freshly minted randomUUID',
  );
  t.equal(
    mint.row[COLUMN.CONFIG_VALUE],
    declaration.clusterId,
    'the identity matches the prepared original allocation declaration',
  );
  t.equal(
    mint.row[COLUMN.UPDATED_BY],
    'node-a',
    'the mint is attributed to the bootstrapping node',
  );
  t.equal(
    mint.row[COLUMN.CONFIG_VALUE],
    mint.row[COLUMN.DEFAULT_VALUE],
    'the identity never changes after mint (default pins the minted value)',
  );
});

test('persistClusterIdIfMissing never re-mints over an existing identity',
  async (t) => {
    const writer = createWriterRecorder();
    const {phase, continuation} = await createPhase(t, {writer});

    await phase.persistClusterIdIfMissing();
    const checksAfterFirst = continuation.checks;
    const insertsAfterFirst = writer.calls.filter(
      (call) => call.type === 'insert' &&
        call.row[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY,
    );
    t.equal(insertsAfterFirst.length, 1,
      'the first bootstrap inserts the cluster_id row once');

    await phase.persistClusterIdIfMissing();
    t.equal(continuation.checks, checksAfterFirst + 1,
      're-entry still checks continuation authority before returning the retained identity');

    const insertsAfterSecond = writer.calls.filter(
      (call) => call.type === 'insert' &&
        call.row[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY,
    );
    t.equal(
      insertsAfterSecond.length,
      1,
      'an existing cluster_id row survives later calls untouched without re-minting',
    );
    t.equal(
      insertsAfterSecond[0].row[COLUMN.CONFIG_VALUE],
      insertsAfterFirst[0].row[COLUMN.CONFIG_VALUE],
      'the cluster_id value remains identical',
    );
  });
