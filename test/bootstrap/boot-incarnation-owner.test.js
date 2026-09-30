/**
 * The boot incarnation owner (F1) and the monotonic NODES registration
 * (D-7): once a data directory issued boot incarnation N it never issues N
 * or anything smaller again, and a registration from an older incarnation
 * can never overwrite or lower a newer NODES row.
 *
 * B1-B5 are the owner decision's witnesses; B6 is the hints-writer census
 * plus one generic contract every census writer must satisfy.
 */
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {
  BOOT_INCARNATION_FILENAME,
  raiseBootIncarnationFloor,
  readIssuedBootIncarnation,
  reserveBootIncarnation,
} from '../../src/bootstrap/boot-incarnation-owner.js';
import {
  RejoinHintsPersistenceService,
  persistBootstrapRejoinHints,
} from '../../src/bootstrap/rejoin-hints.js';
import {REJOIN_HINTS_FILENAME} from
  '../../src/bootstrap/rejoin-hints-constants.js';
import {persistJoinSeedRejoinHints} from
  '../../src/entrypoint-runtime-join-decision.js';
import {resolveFailedJoinReattempt} from
  '../../src/entrypoint-runtime-join-startup-policy.js';
import {
  NODE_REGISTRATION_OUTCOME,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NODE_ID = 'node-f1';
const quietLogger = {info() {}, warn() {}, error() {}};

async function withDataDir(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'boot-incarnation-owner-'));
  try {
    return await run(dataDir);
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
}

// Every production writer of the rejoin hints document, driven with the
// most hostile incarnation it can carry (absent or 1 where the writer takes
// the snapshot as given; the persistence service refuses absent and 0 at
// construction, so 1 is its lowest).
const HINTS_WRITER_ADAPTERS = Object.freeze({
  'src/entrypoint-runtime-join-decision.js#persistJoinSeedRejoinHints':
    (dataDir) => persistJoinSeedRejoinHints({
      dataDir, nodeId: NODE_ID, nodeAddress: 'node-f1:8080',
      peerAddresses: ['peer:8080'], clusterId: null, logger: quietLogger,
    }),
  'src/bootstrap/rejoin-hints.js#persistBootstrapRejoinHints':
    (dataDir) => persistBootstrapRejoinHints({
      dataDir, nodeId: NODE_ID, nodeAddress: 'node-f1:8080',
      nodeRole: 'joiner', peerAddresses: ['peer:8080'], bootIncarnation: 1,
    }),
  'src/bootstrap/rejoin-hints.js#persistSnapshot':
    (dataDir) => new RejoinHintsPersistenceService({
      dataDir, nodeId: NODE_ID, nodeAddress: 'node-f1:8080',
      nodeRole: 'seed', bootIncarnation: 1, logger: quietLogger,
      getSystemTableCache: () => null,
    }).persistNow(),
});

test('B1: reservations continue above 4 across normal join/rejoin hints ' +
  'rewrites, never back to 1', async (t) => {
  await withDataDir(async (dataDir) => {
    // A data directory that issued incarnation 4 before the owner existed
    // (the counter lived in the hints document).
    await writeFile(join(dataDir, REJOIN_HINTS_FILENAME),
      JSON.stringify({localNodeId: NODE_ID, bootIncarnation: 4}));
    const first = await reserveBootIncarnation(dataDir);
    t.equal(first, 5, 'the next boot lifecycle reserves 5');
    for (const write of Object.values(HINTS_WRITER_ADAPTERS)) {
      await write(dataDir);
    }
    const second = await reserveBootIncarnation(dataDir);
    t.ok(second > 5, `a new boot lifecycle reserves ${second} > 5`);
    t.not(second, 1, 'never 1');
  });
});

test('B2: a crash after the durable reservation burns the number; the ' +
  'next boot never reuses it', async (t) => {
  await withDataDir(async (dataDir) => {
    const issued = await reserveBootIncarnation(dataDir);
    let crashedReservation = null;
    await t.rejects(reserveBootIncarnation(dataDir, {
      afterDirectorySync() {
        crashedReservation = issued + 1;
        throw new Error('crash after the durable reservation');
      },
    }), /crash/u, 'the process dies before registration');
    t.equal(await readIssuedBootIncarnation(dataDir), crashedReservation,
      'the crashed reservation is durable');
    const next = await reserveBootIncarnation(dataDir);
    t.ok(next > crashedReservation,
      `the restart reserves ${next} > ${crashedReservation}`);

    // A crash before the replacement is durable returns nothing to the
    // lifecycle, so the next reservation may take that number: it was
    // never issued.
    await t.rejects(reserveBootIncarnation(dataDir, {
      afterFileSync() {
        throw new Error('crash before the rename');
      },
    }), /crash/u);
    t.ok(await reserveBootIncarnation(dataDir) > next,
      'still strictly above every issued incarnation');
  });
});

// In-memory NODES authority for the registration write.
function createNodesTable(initialRow = null) {
  const rows = new Map(initialRow ? [[initialRow.node_id, {...initialRow}]] :
    []);
  const writes = [];
  const matches = (row, where) => Boolean(row) && Object.entries(where)
    .every(([field, value]) => (value === null ?
      row[field] === null || row[field] === undefined : row[field] === value));
  return {
    rows,
    writes,
    observe: async () => ({available: true,
      row: rows.has(NODE_ID) ? {...rows.get(NODE_ID)} : null}),
    insert: async (row) => {
      writes.push({op: 'insert', row});
      if (rows.has(row.node_id)) {
        return {success: false, error: 'UNIQUE constraint failed'};
      }
      rows.set(row.node_id, {...row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    advance: async (where, row) => {
      writes.push({op: 'advance', where, row});
      const current = rows.get(row.node_id);
      if (!matches(current, where)) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      rows.set(row.node_id, {...current, ...row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
}

function register(table, bootIncarnation, overrides = {}) {
  return writeNodeRegistrationAtIncarnation({
    row: {node_id: NODE_ID, status: 'joining'},
    bootIncarnation,
    observe: table.observe,
    insert: table.insert,
    advance: table.advance,
    ...overrides,
  });
}

test('B3: a failed join then a fresh boot lifecycle gets a larger ' +
  'incarnation; delayed G1 registration cannot touch G2', async (t) => {
  await withDataDir(async (dataDir) => {
    const g1 = await reserveBootIncarnation(dataDir);
    // G1's join fails and is abandoned; the joiner hints write runs.
    await HINTS_WRITER_ADAPTERS[
      'src/entrypoint-runtime-join-decision.js#persistJoinSeedRejoinHints'](
      dataDir);
    const g2 = await reserveBootIncarnation(dataDir);
    t.ok(g2 > g1, `the new lifecycle reserves ${g2} > ${g1}`);

    const table = createNodesTable();
    t.equal((await register(table, g2)).outcome,
      NODE_REGISTRATION_OUTCOME.ACCEPTED, 'G2 registers');
    const writesBefore = table.writes.length;
    t.equal((await register(table, g1)).outcome,
      NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
      'a delayed G1 registration is refused');
    t.equal(table.writes.length, writesBefore, 'and never written');
    t.equal(table.rows.get(NODE_ID).boot_incarnation, g2, 'G2 is untouched');
  });
});

test('B4: a durable node whose NODES row is ahead of the local owner is ' +
  'not stranded: the superseded lifecycle raises the floor and the next ' +
  'one registers above it', async (t) => {
  await withDataDir(async (dataDir) => {
    const local = await reserveBootIncarnation(dataDir);
    const table = createNodesTable({node_id: NODE_ID, status: 'active',
      boot_incarnation: 9});
    const refused = await register(table, local);
    t.equal(refused.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
      'the local incarnation is below the durable row');

    // The failed-join reattempt records the superseding incarnation.
    await t.rejects(resolveFailedJoinReattempt({
      dataDir,
      joinAttempt: 3,
      joinResult: {success: false, error: 'stale', retryable: true,
        supersededBootIncarnation: 9},
      logger: quietLogger,
      nodeId: NODE_ID,
      bootstrapAPI: {shutdown: async () => {}},
      nodeJoiningService: {cleanup: async () => {}},
      reattemptPolicy: {maxAttempts: 4, baseDelayMs: 0, maxDelayMs: 0,
        backoffCapExponent: 0},
    }), /stale/u, 'the attempt budget is spent, the floor still recorded');
    const next = await reserveBootIncarnation(dataDir);
    t.equal(next, 10, 'the next lifecycle reserves above the durable row');
    t.equal((await register(table, next)).outcome,
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      'and passes the monotonic registration rule');
    t.equal(table.rows.get(NODE_ID).boot_incarnation, 10);
    t.equal(await raiseBootIncarnationFloor(dataDir, 3), 10,
      'a floor never lowers the reservation');
  });
});

test('B5: a fresh node gets distinct, strictly increasing incarnations ' +
  'for successive boot lifecycles', async (t) => {
  await withDataDir(async (dataDir) => {
    const issued = [];
    for (let index = 0; index < 5; index += 1) {
      issued.push(await reserveBootIncarnation(dataDir));
    }
    t.same(issued, [1, 2, 3, 4, 5]);
  });
});

function listSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) listSourceFiles(path, files);
    else if (path.endsWith('.js')) files.push(path);
  }
  return files;
}

// Structural census: every src function that writes the hints document.
function censusHintsWriters() {
  const writers = [];
  for (const path of listSourceFiles(join(REPO_ROOT, 'src'))) {
    const source = readFileSync(path, 'utf8');
    const file = relative(REPO_ROOT, path);
    const patterns = [
      [/async function (persistJoinSeedRejoinHints)\b[\s\S]*?persistBootstrapRejoinHints\(/u, 1],
      [/async function (persistBootstrapRejoinHints)\b/u, 1],
      [/async (persistSnapshot)\(\)[\s\S]*?persistRejoinHintsSnapshot\(/u, 1],
    ];
    for (const [pattern, group] of patterns) {
      const match = pattern.exec(source);
      if (match) writers.push(`${file}#${match[group]}`);
    }
    if (/REJOIN_HINTS_FILENAME/u.test(source) &&
        /\b(writeFile|writeFileSync|rename|renameSync|appendFile)\(/u
          .test(source) &&
        !['src/bootstrap/rejoin-hints.js'].includes(file)) {
      writers.push(`${file}#<raw hints write>`);
    }
  }
  return writers.sort();
}

test('B6: every hints writer is censused, and none can lower, remove or ' +
  'reset the reservation', async (t) => {
  t.same(censusHintsWriters(), Object.keys(HINTS_WRITER_ADAPTERS).sort(),
    'the census equals the adapter set (a new writer needs an adapter)');

  const ownerStateWriters = listSourceFiles(join(REPO_ROOT, 'src'))
    .filter((path) => /BOOT_INCARNATION_FILENAME|boot-incarnation\.json/u
      .test(readFileSync(path, 'utf8')))
    .map((path) => relative(REPO_ROOT, path));
  t.same(ownerStateWriters, ['src/bootstrap/boot-incarnation-owner.js'],
    'only the owner names its state file');

  for (const [writer, write] of Object.entries(HINTS_WRITER_ADAPTERS)) {
    await withDataDir(async (dataDir) => {
      await reserveBootIncarnation(dataDir);
      const reserved = await reserveBootIncarnation(dataDir);
      await write(dataDir);
      t.equal(await readIssuedBootIncarnation(dataDir), reserved,
        `${writer} leaves the reservation intact`);
      t.ok(await reserveBootIncarnation(dataDir) > reserved,
        `${writer}: the next reservation is still above it`);
      const state = JSON.parse(await readFile(
        join(dataDir, BOOT_INCARNATION_FILENAME), 'utf8'));
      t.equal(state.version, 1, 'the owner state stays well formed');
    });
  }
});

test('D-7: the NODES registration write has four typed outcomes and never ' +
  'overwrites or lowers a newer row', async (t) => {
  const fresh = createNodesTable();
  t.equal((await register(fresh, 3)).outcome,
    NODE_REGISTRATION_OUTCOME.ACCEPTED, 'new incarnation: accepted (birth)');
  const older = createNodesTable({node_id: NODE_ID, status: 'stopped',
    boot_incarnation: 2});
  t.equal((await register(older, 3)).outcome,
    NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'new incarnation over an older row: accepted (CAS)');
  t.same(older.writes[0].where, {node_id: NODE_ID, boot_incarnation: 2},
    'the advance is fenced by the exact observed incarnation');

  const same = createNodesTable({node_id: NODE_ID, status: 'stopped',
    boot_incarnation: 3});
  t.equal((await register(same, 3)).outcome,
    NODE_REGISTRATION_OUTCOME.CURRENT, 'same incarnation: current');
  t.equal(same.writes.length, 0,
    'idempotent: no write, a terminal row of this incarnation stays terminal');

  const newer = createNodesTable({node_id: NODE_ID, status: 'active',
    boot_incarnation: 4});
  t.equal((await register(newer, 3)).outcome,
    NODE_REGISTRATION_OUTCOME.REFUSED_STALE, 'older incarnation: refused');
  t.equal(newer.rows.get(NODE_ID).boot_incarnation, 4, 'row untouched');

  // Race: the observation saw no row, G4 was born before G3's INSERT.
  const raced = createNodesTable();
  let observations = 0;
  const outcome = await register(raced, 3, {
    observe: async () => {
      observations += 1;
      if (observations === 1) {
        raced.rows.set(NODE_ID, {node_id: NODE_ID, boot_incarnation: 4});
        return {available: true, row: null};
      }
      return raced.observe();
    },
  });
  t.equal(outcome.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
    'a late birth cannot replace the newer row');
  t.equal(raced.rows.get(NODE_ID).boot_incarnation, 4);

  // Lost acknowledgement: the INSERT applied, its result was lost.
  const lost = createNodesTable();
  t.equal((await register(lost, 3, {
    insert: async (row) => {
      await lost.insert(row);
      throw new Error('acknowledgement lost');
    },
  })).outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
  'unknown outcome resolved by the authoritative reread');
  t.equal(lost.writes.length, 1, 'no retry loop: one write');

  const unavailable = createNodesTable();
  t.equal((await register(unavailable, 3, {
    observe: async () => ({available: false, row: null}),
    insert: async () => {
      throw new Error('timeout');
    },
  })).outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
  'no authority: unresolved, never assumed');
});

// B7: the legacy hints floor distinguishes ABSENT from DAMAGED. An absent
// hints file (or legacy hints that never carried a counter) is a real
// "issued nothing"; hints that are present but unreadable, unparseable or
// carry a counter the owner could not have issued fail closed with the
// owner's typed code, and nothing is reserved or persisted.
const STATE_UNREADABLE = 'BOOT_INCARNATION_STATE_UNREADABLE';
const LEGACY_HINTS_COUNTER = 4;
const DAMAGED_HINTS = Object.freeze({
  'truncated JSON': '{"localNodeId": "node-f1", "bootIncarn',
  'empty file': '',
  'JSON scalar': '42',
  'counter 0': JSON.stringify({localNodeId: NODE_ID, bootIncarnation: 0}),
  'counter -3': JSON.stringify({localNodeId: NODE_ID, bootIncarnation: -3}),
  'counter string': JSON.stringify({localNodeId: NODE_ID, bootIncarnation: '5'}),
  'counter 2.5': JSON.stringify({localNodeId: NODE_ID, bootIncarnation: 2.5}),
});

async function writeHints(dataDir, content) {
  await writeFile(join(dataDir, REJOIN_HINTS_FILENAME), content, 'utf8');
}

async function ownerStateExists(dataDir) {
  return readFile(join(dataDir, BOOT_INCARNATION_FILENAME), 'utf8')
    .then(() => true, () => false);
}

test('B7: a legacy directory continues above its hints counter', async (t) => {
  await withDataDir(async (dataDir) => {
    await writeHints(dataDir, JSON.stringify({
      localNodeId: NODE_ID, bootIncarnation: LEGACY_HINTS_COUNTER,
    }));
    t.equal(await reserveBootIncarnation(dataDir), LEGACY_HINTS_COUNTER + 1,
      'no owner file, hints counter N -> the next reservation is N+1');
  });
  await withDataDir(async (dataDir) => {
    await writeHints(dataDir, JSON.stringify({localNodeId: NODE_ID}));
    t.equal(await reserveBootIncarnation(dataDir), 1,
      'hints from before incarnations existed carry no counter: floor 0');
  });
  await withDataDir(async (dataDir) => {
    t.equal(await reserveBootIncarnation(dataDir), 1,
      'no owner file and no hints: a virgin directory issues 1');
  });
});

test('B7: damaged legacy hints fail closed: no reservation, nothing persisted',
  async (t) => {
    for (const [label, content] of Object.entries(DAMAGED_HINTS)) {
      await withDataDir(async (dataDir) => {
        await writeHints(dataDir, content);
        await t.rejects(reserveBootIncarnation(dataDir),
          {code: STATE_UNREADABLE}, `${label}: the reservation is refused`);
        await t.rejects(readIssuedBootIncarnation(dataDir),
          {code: STATE_UNREADABLE}, `${label}: the issued count is unknown`);
        t.equal(await ownerStateExists(dataDir), false,
          `${label}: no reservation was persisted`);
        t.equal(await readFile(join(dataDir, REJOIN_HINTS_FILENAME), 'utf8'),
          content, `${label}: the damaged hints are left for inspection`);
      });
    }
  });

test('B7: with the owner file present, legacy hints never lower it',
  async (t) => {
    await withDataDir(async (dataDir) => {
      await reserveBootIncarnation(dataDir);
      await reserveBootIncarnation(dataDir);
      const reserved = await reserveBootIncarnation(dataDir);
      await writeHints(dataDir, JSON.stringify({
        localNodeId: NODE_ID, bootIncarnation: 1,
      }));
      t.equal(await readIssuedBootIncarnation(dataDir), reserved,
        'a lower legacy counter does not lower the owner reservation');
      t.equal(await reserveBootIncarnation(dataDir), reserved + 1,
        'the next reservation continues above the owner file');
    });
  });
