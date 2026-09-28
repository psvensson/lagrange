/**
 * Partition SERVICES identity acquisition after authoritative absence.
 *
 * A missing live row is not healed by turning a zero-row lifecycle UPDATE
 * into an UPSERT. Creation instead contends on the canonical SERVICES primary
 * key through PartitionServiceRowOwner's INSERT-only admission. The losing
 * creator may accept the exact compatible row it authoritatively observes,
 * but cleanup ownership, a conflicting lifecycle, or an unavailable
 * observation all fail closed without replacing durable identity.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';

const REPLICA_OPTIONS = Object.freeze({
  partitionId: 'services-p1',
  replicaId: 'services-p1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
});

function cloneRow(row) {
  return row ? {...row} : null;
}

function createInsertOnlyHarness({initialRow = null, readAvailable = true} = {}) {
  let durableRow = cloneRow(initialRow);
  const inserts = [];
  const upserts = [];
  const writer = {
    async insertSystemTableRow(tableName, row, options) {
      inserts.push({tableName, row: cloneRow(row), options});
      if (durableRow) {
        return {
          success: true,
          outcome: 'observed_state_changed',
          partitionResult: {affectedRows: 0},
        };
      }
      durableRow = cloneRow(row);
      return {
        success: true,
        outcome: 'applied',
        partitionResult: {affectedRows: 1},
      };
    },
    async readAuthoritativeRows() {
      if (!readAvailable) {
        throw new Error('authoritative SERVICES owner unavailable');
      }
      return {
        success: true,
        rows: durableRow ? [cloneRow(durableRow)] : [],
      };
    },
    async upsertSystemTableRow(...args) {
      upserts.push(args);
      throw new Error('partition identity must never be acquired by UPSERT');
    },
  };
  return {
    get durableRow() {
      return cloneRow(durableRow);
    },
    inserts,
    upserts,
    writer,
  };
}

function createOwner(writer, now) {
  return new PartitionServiceRowOwner({
    now: () => now,
    systemTableWriter: writer,
  });
}

test('PartitionServiceRowOwner - concurrent rowless creation has one ' +
  'INSERT winner and no UPSERT healer', async (t) => {
  const harness = createInsertOnlyHarness();
  const firstOwner = createOwner(harness.writer, 100);
  const concurrentOwner = createOwner(harness.writer, 100);

  const [firstEvidence, concurrentEvidence] = await Promise.all([
    firstOwner.registerReplica(REPLICA_OPTIONS),
    concurrentOwner.registerReplica(REPLICA_OPTIONS),
  ]);

  t.equal(harness.inserts.length, 2,
    'both creators contend through the canonical INSERT boundary');
  t.equal(harness.upserts.length, 0,
    'the losing creator never replaces identity through an UPSERT');
  t.equal(firstEvidence.created_at, harness.durableRow.created_at,
    'the INSERT winner returns the durable incarnation it acquired');
  t.equal(concurrentEvidence.created_at, harness.durableRow.created_at,
    'the loser seals only the compatible authoritative incarnation');
  t.same(concurrentEvidence, firstEvidence,
    'both callers converge on the one durable live identity');
  t.equal(harness.durableRow.status, 'stopped',
    'creation does not manufacture activation as part of absence repair');
});

test('PartitionServiceRowOwner - cleanup marker blocks rowless creation ' +
  'without replacement', async (t) => {
  const cleanupMarker = {
    service_id: REPLICA_OPTIONS.replicaId,
    service_type: 'partition_cleanup',
    partition_id: REPLICA_OPTIONS.partitionId,
    node_id: REPLICA_OPTIONS.nodeId,
    status: 'cleanup_owned',
    cleanup_token: 'cleanup-token-1',
    created_at: 90,
    updated_at: 90,
  };
  const harness = createInsertOnlyHarness({initialRow: cleanupMarker});
  const owner = createOwner(harness.writer, 100);

  await t.rejects(
    owner.registerReplica(REPLICA_OPTIONS),
    {code: 'CLEANUP_IN_PROGRESS'},
    'cleanup ownership is authoritative over same-ID creation',
  );

  t.same(harness.durableRow, cleanupMarker,
    'the cleanup marker remains byte-for-byte authoritative');
  t.equal(harness.upserts.length, 0,
    'no generic UPSERT can replace cleanup ownership');
});

test('PartitionServiceRowOwner - conflicting newer live identity fails ' +
  'closed without replacement', async (t) => {
  const newerLifecycle = {
    service_id: REPLICA_OPTIONS.replicaId,
    service_type: 'partition',
    partition_id: REPLICA_OPTIONS.partitionId,
    node_id: REPLICA_OPTIONS.nodeId,
    replica_id: REPLICA_OPTIONS.replicaId,
    address: `node://${REPLICA_OPTIONS.nodeId}/partition/` +
      REPLICA_OPTIONS.replicaId,
    status: 'active',
    created_at: 200,
    updated_at: 250,
  };
  const harness = createInsertOnlyHarness({initialRow: newerLifecycle});
  const owner = createOwner(harness.writer, 100);

  await t.rejects(
    owner.registerReplica(REPLICA_OPTIONS),
    {code: 'REPLICA_IDENTITY_CONFLICT'},
    'a creator cannot reinterpret a newer lifecycle as its own registration',
  );

  t.same(harness.durableRow, newerLifecycle,
    'the newer durable lifecycle is not overwritten');
  t.equal(harness.upserts.length, 0,
    'identity conflict has no UPSERT escape hatch');
});

test('PartitionServiceRowOwner - failed INSERT without authoritative ' +
  'observation remains deferred', async (t) => {
  const occupiedRow = {
    service_id: REPLICA_OPTIONS.replicaId,
    service_type: 'partition_cleanup',
    status: 'cleanup_owned',
  };
  const harness = createInsertOnlyHarness({
    initialRow: occupiedRow,
    readAvailable: false,
  });
  const owner = createOwner(harness.writer, 100);

  await t.rejects(
    owner.registerReplica(REPLICA_OPTIONS),
    {code: 'CREATE_OWNER_DEFERRED'},
    'the fixture cannot force success when the canonical row is unobservable',
  );

  t.same(harness.durableRow, occupiedRow,
    'failed observation does not synthesize or replace durable state');
  t.equal(harness.upserts.length, 0,
    'unavailability is never translated into an UPSERT heal');
});
