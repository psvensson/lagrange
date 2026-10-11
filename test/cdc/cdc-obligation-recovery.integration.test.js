/**
 * Durable CDC recovery through the production file-backed PartitionService.
 * A committed user write is never re-executed to recreate its notification:
 * restart delivery reads the exact event retained with the write, and an
 * acknowledged event whose CDC_DELIVERED did not commit remains owed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {buildEventIdentity} from '../../src/partition/cdc-event-buffer.js';
import {
  countCdcObligations,
  readCdcObligation,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_CDC_OBLIGATION_BOUND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const PARTITION_ID = 'cdc-obligation-recovery';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'cdc_recovery_rows';
const ENTRY_ID = 'cdc-recovery-original-write';
const EVENT_KEY = `entry:${ENTRY_ID}`;
const ROW = Object.freeze({id: 'row-1', value: 'original-value'});
const POLL_MS = 10;
const WAIT_MS = 3000;

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'cdc-recovery-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
    },
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function options(dbPath) {
  return withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: 'cdc-recovery-node',
    dbPath,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  });
}

async function open(dbPath) {
  const service = new PartitionService(options(dbPath));
  await service.initialize();
  assert.equal(service.isLeader, true,
    'the production single-voter startup must establish leadership');
  return service;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(POLL_MS);
  }
  assert.fail(`timed out waiting for ${label}`);
}

function persistedFacts(dbPath) {
  const db = new Database(dbPath, {readonly: true});
  try {
    const row = db.prepare(`SELECT id, value FROM ${TABLE_NAME} WHERE id = ?`)
      .get(ROW.id);
    const obligation = readCdcObligation(db, EVENT_KEY);
    const commands = db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(PARTITION_ID)
      .filter(({entry_type: type, data}) =>
        Number(type) === RAFT_RS_ENTRY_TYPE.NORMAL &&
        typeof data === 'string' && data.length > 0)
      .map(({data}) => decodeCommittedProposal(Buffer.from(data, 'base64')));
    return {
      row,
      obligation: obligation === null ? null : {
        eventKey: obligation.eventKey,
        eventJson: obligation.eventJson,
        logIndex: obligation.logIndex,
        ordinal: obligation.ordinal,
        delivered: obligation.delivered,
      },
      originalCommandCount: commands.filter(({entryId}) => entryId === ENTRY_ID).length,
      acknowledgementCount: commands.filter(({type}) => type === 'CDC_DELIVERED').length,
    };
  } finally {
    db.close();
  }
}

function durableConsumer() {
  const applied = new Map();
  return {
    events: [],
    duplicates: 0,
    applied,
    async handleCDCEvent(event) {
      this.events.push(event);
      const identity = buildEventIdentity(event);
      if (applied.has(identity)) {
        this.duplicates += 1;
      } else {
        applied.set(identity, event);
      }
    },
  };
}

beforeEach(quietEnvironment);
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('production startup redelivers the original durable CDC event without ' +
  're-executing SQL, and restart after a lost acknowledgement keeps its identity',
{timeout: 30000}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cdc-obligation-recovery-'));
  const dbPath = path.join(directory, 'partition.db');
  const services = [];
  const consumer = durableConsumer();
  try {
    const writer = await open(dbPath);
    services.push(writer);
    const write = await writer.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      entryId: ENTRY_ID,
      sql: `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`,
      params: [ROW.id, ROW.value],
    });
    assert.equal(write.success, true, 'the user write commits');
    assert.deepEqual(countCdcObligations(writer.db), {owed: 1, delivered: 0},
      'the same commit retains one delivery obligation');
    await writer.shutdown();

    const afterInterruptedWrite = persistedFacts(dbPath);
    assert.deepEqual(afterInterruptedWrite.row, ROW,
      'the committed data survives the interruption before delivery');
    assert.equal(afterInterruptedWrite.obligation?.delivered, false,
      'the original event remains owed');
    assert.equal(afterInterruptedWrite.originalCommandCount, 1,
      'the user SQL command exists once before restart');

    const firstRestart = await open(dbPath);
    services.push(firstRestart);
    await firstRestart.subscribeToCDCWithHandshake(consumer, {
      subscriberId: 'durable-cache-consumer',
    });
    await waitFor(() => consumer.events.length === 1, 'first restart delivery');
    const firstEvent = consumer.events[0];
    assert.equal(firstEvent.eventKey, EVENT_KEY);
    assert.deepEqual(firstEvent.data, ROW,
      'startup delivers the payload captured by the original commit');

    // The consumer answered, but stop before the one-second CDC_DELIVERED
    // flush. The source obligation must remain the recovery authority.
    await firstRestart.shutdown();
    const afterLostAcknowledgement = persistedFacts(dbPath);
    assert.equal(afterLostAcknowledgement.obligation?.delivered, false,
      'an acknowledgement without committed CDC_DELIVERED remains owed');
    assert.equal(afterLostAcknowledgement.acknowledgementCount, 0,
      'the interruption occurs before CDC_DELIVERED enters the log');

    const secondRestart = await open(dbPath);
    services.push(secondRestart);
    await secondRestart.subscribeToCDCWithHandshake(consumer, {
      subscriberId: 'durable-cache-consumer',
    });
    await waitFor(() => consumer.events.length === 2, 'second restart redelivery');
    const duplicate = consumer.events[1];
    assert.equal(buildEventIdentity(duplicate), buildEventIdentity(firstEvent),
      'redelivery retains the exact consumer de-duplication identity');
    assert.equal(duplicate.eventKey, firstEvent.eventKey);
    assert.equal(duplicate.entryId, firstEvent.entryId);
    assert.equal(duplicate.logIndex, firstEvent.logIndex);
    assert.equal(duplicate.ordinal, firstEvent.ordinal);
    assert.deepEqual(duplicate.data, firstEvent.data);
    assert.equal(consumer.applied.size, 1,
      'the consumer applies the event once');
    assert.equal(consumer.duplicates, 1,
      'the existing consumer identity contract classifies the replay');

    await waitFor(() => countCdcObligations(secondRestart.db).delivered === 1,
      'committed CDC_DELIVERED');
    const final = persistedFacts(dbPath);
    assert.deepEqual(final.row, ROW);
    assert.equal(final.originalCommandCount, 1,
      'startup and redelivery never re-execute the user SQL command');
    assert.equal(final.acknowledgementCount, 1,
      'one committed CDC_DELIVERED settles the obligation');
    assert.equal(final.obligation?.eventJson,
      afterInterruptedWrite.obligation?.eventJson,
    'delivery preserves the originally captured event bytes');
    assert.equal(final.obligation?.delivered, true);
  } finally {
    for (const service of services.reverse()) {
      await service.shutdown().catch(() => undefined);
    }
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
