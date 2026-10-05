/**
 * Writes after a managed split, on the real path (one embedded runtime,
 * real SQL engine and partitions, the public application-database
 * facade). RED REPRODUCTION WITNESS - committed red on purpose: the
 * repair belongs to the split-workflow record/claim owner (see the
 * finding on quest zero-liferaft-active-runtime, 2026-10-05).
 *
 * Mechanism the witness pins (observed at cabd5f3f5, 3626bdf43 and
 * origin/main 60fe53f69 alike):
 *  1. executeManagedSplit releases the in-memory workflow when the
 *     prepare call returns (managed-split-workflow.js `finally`).
 *  2. The next source acknowledgement recovers the workflow from the
 *     durable tables transition row (recoverWorkflowState), which drops
 *     the ownership claim triple (workflowFenceToken / owner / lease) the
 *     row carries, while the restored source participant keeps fence 1.
 *  3. The owner-recorded SOURCE_DISSOLVED ack is stamped with the
 *     regressed workflow fence 0 and rejected STALE_FENCE; the rejection
 *     is not checked, so the terminal transition clear never runs.
 *  4. The tables row stays split_cutover_active forever with a dissolved
 *     source, and every write enlists the source as a post-cutover mirror
 *     participant: "Partition service not found" (no partitions row, no
 *     routable service) - while SELECT, which plans only the children,
 *     keeps working.
 *
 * Oracles that do not come from the write path: the durable tables row
 * (transition state), the router's partition list, and reads of the
 * written keys.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  managedSleep,
  reportOpenHandlesOnTeardown,
} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {
  splitTableOnce,
  startSeamRuntime,
  useSingleNodeReplicaShape,
} from './helpers/public-binding-seam-harness.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const TEST_TIMEOUT_MS = 240_000;
const SPLIT_WAIT_MS = scaleByMachineFactor(60_000);
const TERMINAL_WAIT_MS = scaleByMachineFactor(30_000);
const POLL_MS = 100;
const ports = createPortAllocator(import.meta.url);
const PROBE_GUARD_SUBJECT =
  'managed-split-writes-after-cutover starts an embedded runtime';
const TEMPORARY_PREFIX = 'lagrange-split-writes-';
const APPLICATION_ID = 'split-writes';
const NODE_ID = 'split-writes-node';
const CREDENTIALS = Object.freeze({
  database: 'split_writes',
  password: 'split-writes-password',
  user: 'split_writes_app',
});
const TABLE = 'split_writes';
const SEED_ROWS = Object.freeze([
  [-5, 1], [1, 1], [500, 1], [900, 1],
]);
const SEED_SQL =
  `INSERT INTO ${TABLE} (id, n) VALUES ${SEED_ROWS.map(() => '(?, ?)').join(', ')}`;
const PARTITION_SERVICE_NOT_FOUND = 'Partition service not found';

async function attempt(db, sql, params) {
  try {
    return {result: await db.query(sql, params)};
  } catch (error) {
    return {error: {code: error?.code, message: error?.message}};
  }
}

function transitionState(engine) {
  const tableInfo = engine.getTableInfo(TABLE);
  return tableInfo?.partition_transition_state ??
    tableInfo?.partitionTransitionState ?? null;
}

async function waitForTerminal(t, engine) {
  const deadlineMs = Date.now() + TERMINAL_WAIT_MS;
  for (;;) {
    const state = transitionState(engine);
    if (state === null) return null;
    if (Date.now() >= deadlineMs) return state;
    await managedSleep(t, POLL_MS);
  }
}

test('managed split on one node: the split reaches its terminal and ' +
  'writes to both children succeed and are readable',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  refuseUnderProbe(PROBE_GUARD_SUBJECT);
  reportOpenHandlesOnTeardown(t);
  const root = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  t.teardown(() => rm(root, {force: true, recursive: true}));
  const {restApiPort: restPort} = ports.getListenerPorts();
  const runtime = await startSeamRuntime({
    credentials: CREDENTIALS,
    dataDir: path.join(root, 'node-data'),
    nodeId: NODE_ID,
    restPort,
  });
  t.teardown(async () => {
    await runtime.handle.stop();
    runtime.restoreEnvironment();
  });
  const db = runtime.handle.openApplicationDatabase({
    applicationId: APPLICATION_ID,
  });
  useSingleNodeReplicaShape(runtime.engine);

  await db.query(`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, n INTEGER)`);
  await db.query(SEED_SQL, SEED_ROWS.flat());
  const partitions = await splitTableOnce(runtime.engine, TABLE, {
    deadlineMs: Date.now() + SPLIT_WAIT_MS,
    pause: () => managedSleep(t, POLL_MS),
  });
  t.equal(partitions.length, 2, 'the router sees the two split children');

  const lingering = await waitForTerminal(t, runtime.engine);
  t.equal(lingering, null,
    'the durable split transition clears (terminal reached); a row stuck ' +
    'in split_cutover_active keeps the dissolved source as a write mirror');

  const writes = [
    ['UPDATE low child', `UPDATE ${TABLE} SET n = ? WHERE id = ?`, [10, 1]],
    ['UPDATE high child', `UPDATE ${TABLE} SET n = ? WHERE id = ?`, [10, 900]],
    ['INSERT low child', `INSERT INTO ${TABLE} (id, n) VALUES (?, ?)`, [2, 20]],
    ['INSERT high child', `INSERT INTO ${TABLE} (id, n) VALUES (?, ?)`, [901, 20]],
    ['DELETE low child', `DELETE FROM ${TABLE} WHERE id = ?`, [-5]],
    ['DELETE high child', `DELETE FROM ${TABLE} WHERE id = ?`, [500]],
  ];
  const failures = [];
  for (const [label, sql, params] of writes) {
    const outcome = await attempt(db, sql, params);
    if (outcome.error) failures.push({label, ...outcome.error});
    else {
      t.equal(outcome.result.affectedRows, 1, `${label} affects one row`);
    }
  }
  t.same(failures, [], 'every write to either child is acknowledged');
  t.notOk(failures.some((failure) =>
    String(failure.message).includes(PARTITION_SERVICE_NOT_FOUND)),
  'no write answers the generic "Partition service not found"');

  const {rows} = await db.query(`SELECT id, n FROM ${TABLE} ORDER BY id`);
  t.same(rows.map((row) => [Number(row.id), Number(row.n)]),
    [[1, 10], [2, 20], [900, 10], [901, 20]],
    'reads agree with every acknowledged write in both children');
});
