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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function createWriterRecorder() {
  const calls = [];
  return {
    calls,
    async upsertSystemTableRow(tableName, row) {
      calls.push({type: 'upsert', tableName, row});
      return {success: true};
    },
  };
}

function createConfigLeaderPartition(existingRows = []) {
  return {
    isLeader: true,
    async executeQuery(_sql, params) {
      const found = existingRows.some(
        (row) => row[COLUMN.CONFIG_KEY] === params[0],
      );
      return {success: true, rows: found ? [{config_key: params[0]}] : []};
    },
  };
}

function createPhase({writer, configPartition}) {
  const partitionServices = new Map(
    configPartition ? [['config-p1-r1', configPartition]] : [],
  );
  return new SeedRegistrationPhase({
    delegates: {
      getLogger: () => ({
        debug() {},
        info() {},
        warn() {},
        error() {},
      }),
      getSystemTableWriter: () => writer,
      getNodeId: () => 'node-a',
      getPartitionServices: () => partitionServices,
    },
  });
}

test('persistClusterIdIfMissing mints a randomUUID CONFIG-row singleton at ' +
  'first bootstrap', async (t) => {
  const writer = createWriterRecorder();
  const phase = createPhase({
    writer,
    configPartition: createConfigLeaderPartition(),
  });

  await phase.persistClusterIdIfMissing();

  const mint = writer.calls.find(
    (call) => call.row[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY,
  );
  t.ok(mint, 'the cluster_id row is written through the system table writer');
  t.match(
    mint.row[COLUMN.CONFIG_VALUE],
    UUID_PATTERN,
    'the identity is a freshly minted randomUUID',
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
    const phase = createPhase({
      writer,
      configPartition: createConfigLeaderPartition([
        {[COLUMN.CONFIG_KEY]: CLUSTER_ID_CONFIG_KEY},
      ]),
    });

    await phase.persistClusterIdIfMissing();

    t.equal(
      writer.calls.filter(
        (call) => call.row[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY,
      ).length,
      0,
      'an existing cluster_id row survives every later boot untouched',
    );
  });
