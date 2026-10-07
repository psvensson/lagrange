/**
 * Supplemental L0 RED for the command-admission / committed-application pair.
 *
 * The production world is a file-backed, single-voter PartitionService using
 * raft-rs and SQLite. Ordinary writes traverse command admission and the
 * application transaction. The negative copies a valid committed record and
 * invokes the currently public application callback directly.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RaftRsDurableStore} from
  '../../src/raft/raft-rs-durable-store.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const TEST_TIMEOUT_MS = 30_000;
const PRIVATE_APPLICATION_REFUSAL_CODE =
  'PARTITION_COMMITTED_APPLICATION_PRIVATE';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'p2-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('scratch partition did not elect its single-voter leader');
}

function durableAppliedIndex(observerDb, partitionId) {
  return Number(RaftRsDurableStore.readAppliedIndexIn(
    observerDb,
    partitionId,
  ));
}

function readRow(observerDb, id) {
  return observerDb.prepare(
    'SELECT id, value FROM p2_rows WHERE id = ?',
  ).get(id) || null;
}

function classifyPrivateApplicationRefusal(error) {
  if (error?.code !== PRIVATE_APPLICATION_REFUSAL_CODE) throw error;
  return {
    kind: 'typed_private_application_refusal',
    code: error.code,
  };
}

async function invokePublicCommittedApplication(partition, copiedRecord) {
  if (typeof partition.applyCommittedEntry !== 'function') {
    return {kind: 'public_method_absent'};
  }
  try {
    return {
      kind: 'public_method_returned',
      outcome: await partition.applyCommittedEntry(copiedRecord),
    };
  } catch (error) {
    return classifyPrivateApplicationRefusal(error);
  }
}

test('ordinary admission commits while copied public committed application ' +
  'has zero durable effect', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'partition-p2-'));
  const dbPath = path.join(directory, 'p2-partition-r1.db');
  let observerDb = null;
  const partition = new PartitionService(withFoundingStamp({
    partitionId: 'p2-partition',
    tableId: 'p2_rows',
    tableName: 'p2_rows',
    replicaId: 'p2-partition-r1',
    replicaIds: ['p2-partition-r1'],
    nodeId: 'p2-node',
    dbPath,
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
  }));
  try {
    await partition.initialize();
    await waitForLeader(partition);
    observerDb = new Database(dbPath, {readonly: true, fileMustExist: true});

    const ordinary = await partition.insertData('p2_rows', {
      id: 'ordinary-before',
      value: 'committed-through-admission',
    });
    assert.equal(ordinary.success, true,
      'ordinary write commits through command admission');
    assert.deepEqual(readRow(observerDb, 'ordinary-before'), {
      id: 'ordinary-before',
      value: 'committed-through-admission',
    }, 'ordinary admitted write survives a local SQLite read');

    const appliedBeforeDirect = durableAppliedIndex(
      observerDb,
      partition.partitionId,
    );
    const copiedRecord = {
      command: {
        type: PARTITION_SERVICE_OPERATION.INSERT,
        entryId: 'copied-public-committed-entry',
        sql: 'INSERT INTO p2_rows (id, value) VALUES (?, ?)',
        params: ['direct-copy', 'must-not-apply-publicly'],
        timestamp: '1000-0-p2-node',
        proposedBy: partition.replicaId,
        proposedAt: 1000,
      },
      index: appliedBeforeDirect + 1,
      term: ordinary.durableCommitWitness.term,
      effects: {afterCommit: [], afterRollback: []},
    };
    const directOutcome = await invokePublicCommittedApplication(
      partition,
      copiedRecord,
    );
    const rowAfterDirect = readRow(observerDb, 'direct-copy');
    const appliedAfterDirect = durableAppliedIndex(
      observerDb,
      partition.partitionId,
    );

    const ordinaryAfter = await partition.insertData('p2_rows', {
      id: 'ordinary-after',
      value: 'owner-still-works',
    });
    const allowedBoundaryOutcome = new Set([
      'public_method_absent',
      'typed_private_application_refusal',
    ]).has(directOutcome.kind);

    assert.deepEqual({
      directOutcome,
      allowedBoundaryOutcome,
      rowAfterDirect,
      appliedBeforeDirect,
      appliedAfterDirect,
      ordinaryAfterSuccess: ordinaryAfter.success,
      ordinaryAfterRow: readRow(observerDb, 'ordinary-after'),
    }, {
      directOutcome: directOutcome.kind === 'public_method_absent' ?
        {kind: 'public_method_absent'} : {
          kind: 'typed_private_application_refusal',
          code: PRIVATE_APPLICATION_REFUSAL_CODE,
        },
      allowedBoundaryOutcome: true,
      rowAfterDirect: null,
      appliedBeforeDirect,
      appliedAfterDirect: appliedBeforeDirect,
      ordinaryAfterSuccess: true,
      ordinaryAfterRow: {
        id: 'ordinary-after',
        value: 'owner-still-works',
      },
    }, 'copied committed bytes cannot enter application outside the private ' +
      'transaction owner, while ordinary admission remains live');
  } finally {
    observerDb?.close();
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('removed method and sync/async exact typed refusal are valid outcomes',
  async () => {
    assert.deepEqual(
      await invokePublicCommittedApplication({}, Object.freeze({})),
      {kind: 'public_method_absent'},
    );
    const refusal = new Error('committed application is private');
    refusal.code = PRIVATE_APPLICATION_REFUSAL_CODE;
    assert.deepEqual(
      await invokePublicCommittedApplication({
        applyCommittedEntry() {
          throw refusal;
        },
      }, Object.freeze({})),
      {
        kind: 'typed_private_application_refusal',
        code: PRIVATE_APPLICATION_REFUSAL_CODE,
      },
    );
    assert.deepEqual(
      await invokePublicCommittedApplication({
        async applyCommittedEntry() {
          throw refusal;
        },
      }, Object.freeze({})),
      {
        kind: 'typed_private_application_refusal',
        code: PRIVATE_APPLICATION_REFUSAL_CODE,
      },
    );
  });

test('unrelated sync/async errors cannot count as private application refusal',
  async () => {
    const unrelated = new Error('SQLite unavailable');
    unrelated.code = 'SQLITE_IOERR';
    await assert.rejects(invokePublicCommittedApplication({
      applyCommittedEntry() {
        throw unrelated;
      },
    }, Object.freeze({})), (error) => error === unrelated);
    await assert.rejects(invokePublicCommittedApplication({
      async applyCommittedEntry() {
        throw unrelated;
      },
    }, Object.freeze({})), (error) => error === unrelated);
  });
