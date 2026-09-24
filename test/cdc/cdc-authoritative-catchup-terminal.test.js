// The CDC authoritative catch-up does no work once its owner is terminal.
//
// Round-8 blocker: the catch-up (hydrateCdcPropagatedTablesFromAuthority, a
// CDCIntegrationService method) slept between deferred authoritative reads on
// a timer it armed itself, outside the owner's delayUntilShutdown. After
// markShuttingDown (the owner's terminal boundary) the timer stayed pending
// and the retried reads ran, one per CDC-propagated table. A catch-up that
// began after terminal also read every table.
//
// The owner's terminal answer: the catch-up's retry delay is the owner's
// delayUntilShutdown, which markShuttingDown releases at once. The attempt
// loop and the table loop end on isShuttingDown (at entry, after each sleep
// and after each read). Every table not caught up is reported failed, with
// the owner's typed SHUT_DOWN code, never as hydrated. No read is made after
// terminal.
//
// Composition: the real CDCIntegrationService on a virtual clock. The one
// seam is the authoritative row source (executeAuthoritativeSystemTableRead),
// which answers deferred, as under pressure, and records whether each read
// ran after terminal. Order is controlled by awaiting turns; the virtual
// clock never moves.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import * as CDC_CONSTANTS from '../../src/cdc/cdc-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TURNS = 30;
const CATCHUP_TABLES = Object.freeze([TABLES.NODES, TABLES.SERVICES]);
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

function composeCatchupOwner() {
  const timeSource = new VirtualTimeSource();
  const service = new CDCIntegrationService({
    nodeId: 'catchup-node', systemTableCache: new SystemTableCache(), timeSource,
  });
  service.logger = QUIET_LOGGER;
  const reads = [];
  service.executeAuthoritativeSystemTableRead = async (tableName) => {
    reads.push({tableName, afterTerminal: service.isShuttingDown === true});
    return {success: false, deferRetry: true, retryAfterMs: 500, rows: []};
  };
  return {service, timeSource, reads};
}

async function turns(count) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function track(operation) {
  const box = {summary: null};
  operation.then((summary) => {
    box.summary = summary;
  });
  return box;
}

function assertTerminalAnswer(composed, box) {
  assert.notEqual(box.summary, null,
    'the catch-up settles at terminal without the clock moving');
  assert.deepEqual(composed.reads.filter((read) => read.afterTerminal), [],
    'no authoritative read is made after terminal');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'no owner timer is pending after terminal');
  assert.equal(box.summary.tablesHydrated, 0, 'nothing is reported hydrated');
  assert.deepEqual(box.summary.tablesFailed, [...CATCHUP_TABLES],
    'every table not caught up is reported failed');
  assert.equal(box.summary.code,
    CDC_CONSTANTS.CDC_ERROR_CODE?.SHUT_DOWN ?? 'the typed terminal code',
    'the answer carries the owner\'s typed SHUT_DOWN code');
}

test('markShuttingDown while the catch-up sleeps between deferred reads: it ' +
  'settles at once, no read after terminal, no pending timer', async () => {
  const composed = composeCatchupOwner();
  const box = track(composed.service.hydrateCdcPropagatedTablesFromAuthority({
    tables: [...CATCHUP_TABLES],
  }));
  await turns(TURNS);
  assert.equal(composed.reads.length, 1, 'the first table\'s read deferred');
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the catch-up sleeps before its retry');

  composed.service.markShuttingDown();
  await turns(TURNS);

  assertTerminalAnswer(composed, box);
});

test('a catch-up started after terminal makes no read', async () => {
  const composed = composeCatchupOwner();
  composed.service.markShuttingDown();

  const box = track(composed.service.hydrateCdcPropagatedTablesFromAuthority({
    tables: [...CATCHUP_TABLES],
  }));
  await turns(TURNS);

  assert.equal(composed.reads.length, 0, 'no table is read');
  assertTerminalAnswer(composed, box);
});
