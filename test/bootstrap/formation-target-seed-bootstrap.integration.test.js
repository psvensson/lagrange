// Declared formation size at the production entry point of seed bootstrap
// (stage S1 of solve/epics/operation-integrity-and-reliable-formation/
// formation-admission-design-2026-11-11.md; owner ruling 2026-11-11).
// Every receipt enters startLagrangeRuntime as a seed in a new child process
// (test/test-helpers/formation-target-seed-child.js). Nothing in the startup
// path is replaced. The durable row is read back from the CONFIG partition's
// replica database after each child has exited.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {COLUMN} from '../../src/constants/index.js';
import {CONTROL_PLANE_READ_STRATEGY as STRATEGY} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {FORMATION_TARGET_CONFIG_ERROR_CODE, FORMATION_TARGET_NODE_COUNT_ENV} from
  '../../src/config/formation-target-node-count.js';
import {DECLARED_FORMATION_SIZE_STATE as STATE, FORMATION_TARGET_CONFIG_KEY,
  FORMATION_TARGET_RECORD_ERROR_CODE} from '../../src/bootstrap/formation-target-record.js';
import {CLUSTER_ID_CONFIG_KEY} from '../../src/bootstrap/cluster-identity-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME, getInitialReplicaIds} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {getPartitionDbPath} from '../../src/storage/data-directory-manager.js';
import {readIssuedDeclaration} from '../test-helpers/original-allocation-durable-reader.js';

const CHILD = new URL('../test-helpers/formation-target-seed-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449981';
const DECLARED = 3;
const RESTART_DECLARED = 5;
// One composed seed start and stop, three times at most (the declared start,
// its restart, and the refused start that never founds).
const TEST_TIMEOUT_MS = 240000;
const allocator = createPortAllocator(import.meta.url);

const retained = [];
after(() => {
  for (const {directory, passed} of retained) {
    if (passed()) fs.rmSync(directory, {recursive: true, force: true});
  }
});

function newDirectory(t) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'formation-target-seed-'));
  const entry = {directory, ok: false, passed: () => entry.ok};
  retained.push(entry);
  t.diagnostic(`data directory ${directory}`);
  return entry;
}

async function runChild(mode, directory, ports, declared) {
  const child = fork(CHILD, [mode, directory, NODE_ID, JSON.stringify(ports),
    String(declared)], {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  const output = fs.createWriteStream(path.join(directory, `${mode}-child-output.log`));
  child.stdout.on('data', (chunk) => output.write(chunk));
  child.stderr.on('data', (chunk) => output.write(chunk));
  const closed = new Promise((resolve) => child.once('close', (code, signal) =>
    output.end(() => resolve({code, signal}))));
  try {
    const report = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('message', resolve);
      child.once('close', () => reject(new Error(`child ${mode} exited before report`)));
    });
    child.send('exit-after-observation');
    return {report, exit: await closed};
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

// The CONFIG rows as the CONFIG partition's founder replica holds them.
function readDurableConfigRows(directory) {
  const groupId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONFIG];
  const [replicaId] = getInitialReplicaIds(SYSTEM_TABLE_NAME.CONFIG);
  const dbPath = getPartitionDbPath(directory, groupId, replicaId);
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return db.prepare('SELECT * FROM config WHERE config_key IN (?, ?)')
      .all(CLUSTER_ID_CONFIG_KEY, FORMATION_TARGET_CONFIG_KEY);
  } finally {
    db.close();
  }
}

function formationRowOf(rows) {
  return rows?.find((row) => row[COLUMN.CONFIG_KEY] === FORMATION_TARGET_CONFIG_KEY) ?? null;
}

test('(a) a fresh seed with no declared size refuses typed and founds nothing',
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
    const entry = newDirectory(t);
    const {report, exit} = await runChild('undeclared', entry.directory,
      allocator.getListenerPorts(), 'none');
    t.diagnostic(JSON.stringify(report));
    assert.deepEqual(exit, {code: 0, signal: null});
    assert.equal(report.returnedRuntime, false);
    assert.equal(report.startupError?.code, FORMATION_TARGET_CONFIG_ERROR_CODE.REQUIRED);
    assert.equal(report.startupError?.variable, FORMATION_TARGET_NODE_COUNT_ENV);
    assert.equal(readIssuedDeclaration(entry.directory), null,
      'no original allocation was prepared');
    assert.equal(readDurableConfigRows(entry.directory), null, 'no CONFIG replica exists');
    assert.equal(fs.existsSync(path.join(entry.directory, 'partitions')), false,
      'no founder replica directory was created');
    entry.ok = true;
  });

test('(b)(c) a declared fresh seed writes the row once beside cluster_id; the read ' +
  'contract answers DECLARED; a retained row is never rewritten or overwritten',
{timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
  const entry = newDirectory(t);
  const ports = allocator.getListenerPorts();
  const first = await runChild('declared', entry.directory, ports, DECLARED);
  t.diagnostic(JSON.stringify(first.report));
  assert.deepEqual(first.exit, {code: 0, signal: null});
  assert.equal(first.report.returnedRuntime, true,
    `declared seed must start: ${JSON.stringify(first.report.startupError)}`);
  assert.equal(first.report.cleanupError, null);

  // (b) the read contract, both strategies, and the operator facts.
  assert.deepEqual(first.report.cached, {state: STATE.DECLARED, count: DECLARED,
    reason: null, readStrategy: STRATEGY.CACHE});
  assert.equal(first.report.authoritative.error, null);
  assert.deepEqual(first.report.authoritative.value, {state: STATE.DECLARED,
    count: DECLARED, reason: null, readStrategy: STRATEGY.AUTHORITATIVE});
  assert.deepEqual(first.report.facts.declaredFormationSize, first.report.cached,
    'the cluster facts show the declared size beside the identity');
  assert.equal(typeof first.report.facts.identity, 'string');

  // (c) the founding publication over a retained row: same value is not
  // rewritten, a different value refuses typed, the row stays unchanged.
  const durable = readDurableConfigRows(entry.directory);
  const row = formationRowOf(durable);
  assert.ok(row, 'the formation row is durable in the CONFIG replica');
  assert.ok(durable.some((r) => r[COLUMN.CONFIG_KEY] === CLUSTER_ID_CONFIG_KEY),
    'beside cluster_id in the same replicated CONFIG group');
  assert.equal(row[COLUMN.CONFIG_VALUE], String(DECLARED));
  assert.equal(first.report.republishSame.error, null);
  assert.equal(first.report.republishSame.value[COLUMN.CREATED_AT], row[COLUMN.CREATED_AT],
    'the same value answers the retained row, not a rewrite');
  assert.equal(first.report.republishDifferent.error?.code,
    FORMATION_TARGET_RECORD_ERROR_CODE.MISMATCH);
  assert.deepEqual(first.report.authoritativeAfter.value?.count, DECLARED);
  assert.deepEqual(row, formationRowOf(readDurableConfigRows(entry.directory)));

  // A cold restart with a different declaration never changes the durable row.
  const second = await runChild('restart', entry.directory, ports, RESTART_DECLARED);
  t.diagnostic(JSON.stringify({restart: second.report.returnedRuntime ? 'served' : 'held',
    startupError: second.report.startupError, cached: second.report.cached ?? null}));
  assert.deepEqual(second.exit, {code: 0, signal: null});
  assert.deepEqual(formationRowOf(readDurableConfigRows(entry.directory)), row,
    'the durable row is the authority; a restart does not overwrite it');
  if (second.report.returnedRuntime) {
    assert.equal(second.report.cached.count, DECLARED);
  }
  entry.ok = true;
});
